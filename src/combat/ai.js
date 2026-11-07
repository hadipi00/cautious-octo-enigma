// ============================================================
// خلبان AI نسخه ۲ — نبرد فراتر از برد دید (BVR) + مانورهای نزدیک (BFM)
//  • شلیک موشک راداری از برد دور + کرانک (خم شدن از خط شلیک)
//  • ناتچینگ و چف در برابر موشک راداری، فلر و پیچ در برابر حرارتی
//  • شکستن قفل توپ با غلت شکسته (break turn) هنگام رد شدن
// خروجی: ورودی‌های هواپیما (همان کنترل‌های خلبان انسان)
// ============================================================
import * as THREE from 'three';
import { WEAPONS } from '../config.js';

const _aim = new THREE.Vector3(), _local = new THREE.Vector3(), _fwd = new THREE.Vector3();
const _los = new THREE.Vector3(), _side = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class PilotAI {
  constructor(aircraft, opts = {}) {
    this.ac = aircraft;
    this.skill = opts.skill || 1;       // 0.6 تا 1.3
    this.team = aircraft.team;
    this.state = 'pursue';
    this.stateT = 0;
    this.gunBurst = 0;
    this.missileCd = 6 + Math.random() * 8;
    this.counterCd = 0;
    this._thinkT = 0;
    this._evadeDir = new THREE.Vector3();
    this._crankSide = Math.random() < 0.5 ? 1 : -1;
    this._crankT = 0;
    this._scissorsDir = 0;
    this._evadeMode = 'gun';
    this._attackRole = aircraft.spec.role === 'attack';
  }

  update(dt, ctx) {
    const ac = this.ac;
    const inp = ac.input;
    // LOD فکری: دور کمتر فکر می‌کند
    this._thinkT -= dt;
    if (this._thinkT > 0) return;
    this._thinkT = ac.distToPlayer > 3500 ? 0.15 : 0.05;

    this.stateT -= dt;
    this.missileCd -= dt;
    this.counterCd -= dt;

    // ---------- انتخاب دشمن ----------
    let target = null, bestD = 1e12;
    for (const other of ctx.aircraft) {
      if (!other.alive || other.team === ac.team) continue;
      const d = other.st.pos.distanceTo(ac.st.pos);
      if (d < bestD) { bestD = d; target = other; }
    }
    ac.targetRef = target;

    const st = ac.st;
    const fwd = _fwd.set(0, 0, 1).applyQuaternion(st.quat);

    // ---------- موشک در راه؟ واکنش بر اساس نوع جوینده ----------
    const inbound = ctx.projectiles.missileInboundInfo(ac);
    if (inbound) {
      // مقابل‌پیشه‌ها با فاصله
      if (this.counterCd <= 0 && (ac.flares > 7 || ac.chaff > 3)) {
        ac.dropFlares();
        this.counterCd = 1.4;
      }
      if (inbound.kind === 'ir') {
        // حرارتی: پیچ شدید + افتربرنر
        if (this.state !== 'evade' || this._evadeMode !== 'ir') {
          this.state = 'evade'; this.stateT = 2.2; this._evadeMode = 'ir';
          this._evadeDir.set(Math.random() - 0.5, Math.random() * 0.5 - 0.25, Math.random() - 0.5).normalize();
          if (st.fuel > 0) st.ab = true;
        }
      } else if (this.state !== 'evade' || this._evadeMode !== 'radar') {
        // راداری: ناتچ/کرانک
        this.state = 'evade'; this.stateT = 2.6; this._evadeMode = 'radar';
        this._crankT = 2.5;
        if (st.fuel > 0) st.ab = true;
      }
    }

    // ---------- انتخاب وضعیت ----------
    if (target && !(this.state === 'evade' && this.stateT > 0)) {
      const closing = fwd.dot(_los.copy(target.st.pos).sub(st.pos).normalize());
      if (this.state === 'pursue' && bestD < 700 && closing < 0.15 && st.V > 180) {
        // رد شدن از هدف → غلت شکسته
        this.state = 'scissors'; this.stateT = 1.3;
        this._scissorsDir = Math.random() < 0.5 ? 1 : -1;
      } else if (this.state === 'scissors' && this.stateT <= 0) {
        this.state = 'pursue';
      } else if (this.state === 'pursue' && closing < -0.4 && bestD < 800) {
        this.state = 'evade'; this.stateT = 2.0; this._evadeMode = 'gun';
        this._evadeDir.set(Math.random() - 0.5, Math.random() - 0.2, Math.random() - 0.5).normalize();
      } else if (this.state === 'evade' && this.stateT <= 0) {
        this.state = 'extend'; this.stateT = 1.4;
      } else if (this.state === 'extend' && this.stateT <= 0) {
        this.state = 'pursue';
      }
      // هواپیمای حمله‌ای: وارد داگفایت نمی‌شود
      if (this._attackRole && this.state === 'pursue' && bestD < 2200) {
        this.state = 'extend'; this.stateT = 2.5;
      }
    }

    // ---------- نقطه نشانه‌گیری (به ترتیب اولویت وضعیت) ----------
    let aimPos;
    if (this.state === 'evade' && this._evadeMode === 'radar') {
      // کرانک: خم شدن ۶۵ درجه از خط هدف، تعویض طرف هر ۲.۵ ثانیه
      this._crankT -= dt;
      if (this._crankT <= 0) { this._crankSide *= -1; this._crankT = 2.5; }
      _side.set(1, 0, 0).applyQuaternion(st.quat);
      aimPos = _aim.copy(st.pos).addScaledVector(fwd, 600).addScaledVector(_side, this._crankSide * 700);
    } else if (this.state === 'evade') {
      aimPos = _aim.copy(st.pos).addScaledVector(this._evadeDir, 800);
    } else if (this.state === 'scissors') {
      aimPos = _aim.copy(st.pos).addScaledVector(fwd, 300);
      aimPos.y += 120;
    } else if (this.state === 'extend') {
      aimPos = _aim.copy(st.pos).addScaledVector(fwd, 800);
    } else if (target) {
      const d = target.st.pos.distanceTo(st.pos);
      aimPos = _aim.copy(target.st.pos);
      aimPos.addScaledVector(target.st.vel, Math.min(d / WEAPONS.gunMv, 2.5) * 0.85 * this.skill);
    } else {
      // بدون دشمن: پرواز آرام به سمت مرکز
      aimPos = _aim.set(st.pos.x * 0.5, st.pos.y + 300, st.pos.z * 0.5);
    }

    // اجتناب از زمین
    const agl = st.pos.y - st.groundY;
    if (agl < 260) {
      aimPos.y = Math.max(aimPos.y, st.pos.y + 500);
    }

    // ---------- تبدیل به ورودی محلی ----------
    _local.copy(aimPos).sub(st.pos).normalize();
    _q.copy(st.quat).invert();
    _local.applyQuaternion(_q);
    // _local.x راست، _local.y بالا (نسبت به بدنه)

    inp.roll = THREE.MathUtils.clamp(_local.x * 3.2, -1, 1);
    inp.pitch = THREE.MathUtils.clamp(_local.y * 3.4 + 0.12, -1, 1);
    inp.yaw = THREE.MathUtils.clamp(_local.x * 0.4, -0.4, 0.4);
    inp.throttle = 1.0;
    inp.fbw = true;
    inp.ab = st.fuel > 0 && (this.state === 'evade' || bestD > 2500);

    // ---------- شلیک توپ ----------
    const aligned = Math.abs(_local.x) < 0.045 && Math.abs(_local.y) < 0.05;
    if (this.state === 'pursue' && target && aligned && bestD < 1500 && this.gunBurst <= 0) {
      this.gunBurst = 0.5 + Math.random() * 0.4;
    }
    if (this.gunBurst > 0) {
      this.gunBurst -= dt;
      inp.fire = true;
    } else {
      inp.fire = false;
    }

    // ---------- موشک حرارتی (نزدیک) ----------
    if (this.state === 'pursue' && target && this.missileCd <= 0
        && bestD > 500 && bestD < 4500
        && fwd.dot(_los.copy(target.st.pos).sub(st.pos).normalize()) > 0.9) {
      const irStation = ac.mslStations.find(s => s.left > 0 && s.type === 'ir');
      if (irStation) {
        ac.lockTarget = target;
        ac.lockSource = 'ir';
        ac.lockT = WEAPONS.lockTime;
        ac.fireMissile(target);
        this.missileCd = (9 + Math.random() * 8) / this.skill;
      }
    }

    // ---------- موشک راداری (فراتر از برد دید) ----------
    if (ac.radar && target && this.missileCd <= 0 && bestD > 6000
        && bestD < Math.min(24000, ac.radar.range * 0.8)
        && fwd.dot(_los.copy(target.st.pos).sub(st.pos).normalize()) > 0.93) {
      const station = ac.mslStations.find(s => s.left > 0 && s.type !== 'ir');
      if (station) {
        // قفل راداری برای شلیک
        ac.radar.mode = 'stt';
        ac.lockTarget = target;
        ac.lockSource = 'radar';
        ac.lockT = WEAPONS.lockTime;
        ac.fireMissile(target);
        this.missileCd = (16 + Math.random() * 12) / this.skill;
        // بعد از شلیک: کرانک
        this.state = 'evade'; this._evadeMode = 'radar'; this.stateT = 1.6;
        this._crankT = 2.5;
      }
    }
  }
}
