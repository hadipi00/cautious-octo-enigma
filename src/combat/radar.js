// ============================================================
// سیستم رادار — جستجو / TWS / قفل تک‌هدف (STT)
// اسکن با هسته WASM (معادله رادار: SNR با RCS، کون آنتن، ناتچینگ)
// برای بازیکن و خلبان‌های AI راداردار
// ============================================================
import * as THREE from 'three';
import { WEAPONS } from '../config.js';
import { simcore, MAX_CONTACTS } from '../wasm/simcore.js';

const _fwd = new THREE.Vector3(), _los = new THREE.Vector3(), _tv = new THREE.Vector3();

export class RadarSystem {
  // cfg از JSON جنگنده: { range: متر, gimbal: درجه }
  constructor(aircraft, cfg) {
    this.ac = aircraft;
    this.range = cfg.range || 70000;
    this.gimbal = (cfg.gimbal || 60) * Math.PI / 180;
    this.mode = 'srch';               // srch | tws | stt
    this.tracks = [];                 // { ac, snr, age, detected, closure }
    this.designated = null;           // هدف انتخابی (TWS/STT)
    this.scanT = 0;
    this.contacts = new Float64Array(MAX_CONTACTS * 5);
    this.out = new Float64Array(MAX_CONTACTS * 2);
    this._pool = [];
    for (let i = 0; i < 16; i++) this._pool.push({ ac: null, snr: 0, age: 0, detected: false, closure: 0 });
    this.lastScanCount = 0;
  }

  cycleMode() {
    this.mode = this.mode === 'srch' ? 'tws' : this.mode === 'tws' ? 'stt' : 'srch';
    if (this.mode === 'srch') {
      this.designated = null;
      this.ac.lockTarget = null;
      this.ac.lockT = 0;
    }
    return this.mode;
  }

  // فراخوانی هر فریم — اسکن با نرخ پایین (بازیکن ۱۰Hz ، AI ۳Hz)
  update(dt, ctx) {
    const ac = this.ac;
    if (!ac.st.alive) return;
    this.scanT -= dt;
    if (this.scanT > 0) { this._ageTracks(dt); return; }
    this.scanT = ac.isPlayer ? 0.1 : 0.35;

    // ---------- گردآوری تماس‌ها ----------
    _fwd.set(0, 0, 1).applyQuaternion(ac.st.quat);
    const gimbalCos = Math.cos(this.gimbal);
    let n = 0;
    for (const other of ctx.aircraft) {
      if (n >= MAX_CONTACTS) break;
      if (!other.alive || other === ac || other.team === ac.team) continue;
      if (other.spawnProtect > 0) continue;
      const o = n * 5;
      this.contacts[o] = other.st.pos.x;
      this.contacts[o + 1] = other.st.pos.y;
      this.contacts[o + 2] = other.st.pos.z;
      this.contacts[o + 3] = other.spec.rcs || 5;
      // ضریب ناتچینگ: اگر سرعت هدف تقریباً عمود بر خط دید و دور → اکو ضعیف
      _los.copy(other.st.pos).sub(ac.st.pos);
      const dist = _los.length() || 1;
      _los.multiplyScalar(1 / dist);
      let mult = 1;
      const vLen = other.st.vel.length();
      if (dist > WEAPONS.notchMinRange && vLen > 60) {
        const along = Math.abs(other.st.vel.dot(_los) / vLen);
        if (along < WEAPONS.notchCos) mult = 0.06;   // در ناتچ
      }
      this.contacts[o + 4] = mult;
      n++;
    }

    // ---------- اسکن WASM ----------
    // آستانه SNR: کالیبره برای شناسایی RCS≈۵ در برد نزدیک به سقف رادار
    // ناتچینگ (mult=0.06) برد مؤثر را نصف می‌کند
    const count = simcore.radarScan(
      ac.st.pos.x, ac.st.pos.y, ac.st.pos.z,
      _fwd.x, _fwd.y, _fwd.z,
      gimbalCos, this.range, 1e-8, this.contacts, n, this.out
    );
    this.lastScanCount = count;

    // ---------- به‌روزرسانی ترک‌ها ----------
    for (const tr of this._pool) tr.detected = false;
    for (let i = 0; i < n; i++) {
      if (this.out[i * 2] < 1) continue;
      // کدام ترک؟ (با مرجع هواپیما — ترتیب تماس‌ها همان حلقه است)
      let idx = 0, k = 0;
      for (const other of ctx.aircraft) {
        if (!other.alive || other === ac || other.team === ac.team) continue;
        if (other.spawnProtect > 0) continue;
        if (k === i) { idx = other; break; }
        k++;
      }
      if (!idx) continue;
      let tr = this._pool.find(t => t.ac === idx);
      if (!tr) {
        tr = this._pool.find(t => t.ac === null);
        if (!tr) continue;
        tr.ac = idx;
      }
      tr.detected = true;
      tr.age = 0;
      tr.snr = this.out[i * 2 + 1];
      tr.closure = idx.st.vel.dot(_los.copy(idx.st.pos).sub(ac.st.pos).normalize());
    }
    this._ageTracks(dt);

    // ---------- حالت‌ها ----------
    if (this.mode === 'srch') {
      if (ac.lockSource === 'radar') { ac.lockTarget = null; ac.lockT = 0; }
    } else {
      // تخصیص: نزدیک‌ترین ترک داخل کون — دست‌نخورده تا وقتی معتبر
      if (!this.designated || !this.designated.detected) {
        let bd = 1e12, best = null;
        for (const tr of this._pool) {
          if (!tr.detected || !tr.ac) continue;
          const d = tr.ac.st.pos.distanceTo(ac.st.pos);
          if (d < bd) { bd = d; best = tr; }
        }
        this.designated = best;
      }
      if (this.designated && this.designated.detected) {
        if (ac.lockTarget !== this.designated.ac) {
          ac.lockTarget = this.designated.ac;
          ac.lockSource = 'radar';
          ac.lockT = 0;
        }
      } else if (ac.lockSource === 'radar') {
        ac.lockTarget = null;
        this.designated = null;
      }
    }
  }

  _ageTracks(dt) {
    for (const tr of this._pool) {
      if (!tr.ac) continue;
      if (!tr.ac.alive) { tr.ac = null; tr.detected = false; continue; }
      if (tr.detected) continue;
      tr.age += dt;
      if (tr.age > 3) { tr.ac = null; }   // حافظه رادار ۳ ثانیه
    }
    if (this.designated && !this.designated.ac) this.designated = null;
  }
}
