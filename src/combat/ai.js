// ============================================================
// خلبان AI — تعقیب با پیش‌بینی، فرار، شلیک، موشک، فلر، اجتناب از زمین
// خروجی: ورودی‌های هواپیما (همان کنترل‌های خلبان انسان)
// ============================================================
import * as THREE from 'three';
import { WEAPONS } from '../config.js';

const _aim = new THREE.Vector3(), _local = new THREE.Vector3(), _fwd = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class PilotAI {
  constructor(aircraft, opts = {}) {
    this.ac = aircraft;
    this.skill = opts.skill || 1;       // 0.6 تا 1.3
    this.team = aircraft.team;
    this.state = 'pursue';
    this.stateT = 0;
    this.gunBurst = 0;
    this.missileCd = 8 + Math.random() * 10;
    this.flareCd = 0;
    this._thinkT = 0;
    this._evadeDir = new THREE.Vector3();
  }

  update(dt, ctx) {
    const ac = this.ac;
    const inp = ac.input;
    // LOD فکری: دور کمتر فکر می‌کند
    this._thinkT -= dt;
    if (this._thinkT > 0) return;
    this._thinkT = ac.distToPlayer > 3500 ? 0.2 : 0.05;

    this.stateT -= dt;
    this.missileCd -= dt;
    this.flareCd -= dt;

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

    // ---------- موشک در راه؟ فرار + فلر ----------
    if (ctx.projectiles.missileInbound(ac)) {
      if (this.flareCd <= 0 && ac.flares > 0) {
        ac.dropFlares();
        this.flareCd = 2.5;
      }
      if (this.state !== 'evade') {
        this.state = 'evade';
        this.stateT = 2.2;
        this._evadeDir.set(Math.random() - 0.5, Math.random() * 0.6 - 0.1, Math.random() - 0.5).normalize();
        if (st.fuel > 0) st.ab = true;
      }
    }

    // ---------- انتخاب وضعیت ----------
    if (target) {
      const toT = _local.copy(target.st.pos).sub(st.pos);
      const closing = fwd.dot(toT.clone().normalize());
      if (this.state === 'pursue' && closing < -0.4 && bestD < 800) {
        this.state = 'evade'; this.stateT = 2.0;
        this._evadeDir.set(Math.random() - 0.5, Math.random() - 0.2, Math.random() - 0.5).normalize();
      } else if (this.state === 'evade' && this.stateT <= 0) {
        this.state = 'extend'; this.stateT = 1.4;
      } else if (this.state === 'extend' && this.stateT <= 0) {
        this.state = 'pursue';
      }
    }

    // ---------- نقطه نشانه‌گیری ----------
    let aimPos = null;
    if (target) {
      aimPos = _aim.copy(target.st.pos);
      if (this.state === 'pursue') {
        const d = target.st.pos.distanceTo(st.pos);
        aimPos.addScaledVector(target.st.vel, Math.min(d / WEAPONS.gunMv, 2.5) * 0.85 * this.skill);
      }
    } else {
      // بدون دشمن: پرواز آرام به سمت مرکز
      aimPos = _aim.set(st.pos.x * 0.5, st.pos.y + 300, st.pos.z * 0.5);
    }

    if (this.state === 'evade') {
      aimPos = _aim.copy(st.pos).addScaledVector(this._evadeDir, 800);
    } else if (this.state === 'extend') {
      aimPos = _aim.copy(st.pos).addScaledVector(fwd, 800);
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

    // ---------- شلیک ----------
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

    // موشک
    if (this.state === 'pursue' && target && this.missileCd <= 0 && ac.missiles > 0
        && bestD > 1200 && bestD < 7500 && fwd.dot(_local.copy(target.st.pos).sub(st.pos).normalize()) > 0.86) {
      ac.fireMissile(target);
      this.missileCd = (14 + Math.random() * 10) / this.skill;
    }
  }
}
