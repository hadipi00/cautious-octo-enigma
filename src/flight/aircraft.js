// ============================================================
// هواپیما — فیزیک + تسلیحات + آسیب + قفل (مشترک بین بازیکن و AI)
// قرارداد: دماغه +Z ، شمال +Z ، شرق +X
// ============================================================
import * as THREE from 'three';
import { buildJet } from '../models/parametric.js';
import { stepFlight } from './model.js';
import { SIM, BASES, WEAPONS } from '../config.js';
import { DEG, clamp } from '../utils.js';

const _UP = new THREE.Vector3(0, 1, 0);
const _fwd = new THREE.Vector3(), _up = new THREE.Vector3(), _right = new THREE.Vector3();
const _dq = new THREE.Quaternion();
const _tmp = new THREE.Vector3();

export class Aircraft {
  constructor(spec, scene, terrain, hooks = {}) {
    this.spec = spec;
    this.terrain = terrain;
    this.effects = hooks.effects || null;
    this.projectiles = hooks.projectiles || null;
    this.audio = hooks.audio || null;
    this.game = hooks.game || null;
    this.team = hooks.team || 'blue';
    this.isPlayer = !!hooks.isPlayer;
    this.name = hooks.name || spec.name;
    this.ai = null; // PilotAI در صورت نیاز

    const built = buildJet(spec.visual, spec.len, spec.wingSpan);
    this.group = built.group;
    this.refs = built.refs;
    scene.add(this.group);

    this.st = {
      pos: new THREE.Vector3(), vel: new THREE.Vector3(), quat: new THREE.Quaternion(),
      angVel: { p: 0, y: 0, r: 0 },
      throttle: 0, ab: false, gear: true, flaps: 0, brake: false, fbw: true,
      fuel: spec.fuelCap, onGround: false, alive: true,
      gForce: 1, alpha: 0, beta: 0, mach: 0, V: 0, lift: 0,
      stalled: false, blackout: 0, redout: 0, afterburner: false,
      groundY: 0,
    };

    this.hpMax = spec.hp || 100;
    this.hp = this.hpMax;
    this.gunAmmo = spec.guns[0].ammo;
    this.missiles = spec.missiles[0].count;
    this.bombs = spec.bombs || 0;
    this.rockets = spec.rockets || 0;
    this.flares = spec.flares || 48;

    this.gunCd = 0; this.missileCd = 0; this.bombCd = 0; this.rocketCd = 0; this.flareCd = 0;
    this.lockTarget = null; this.lockT = 0;
    this.spawnProtect = 0;
    this.targetRef = null;
    this.distToPlayer = 9999;
    this.contrailT = 0;
    this.smokeT = 0;

    this.input = {
      pitch: 0, roll: 0, yaw: 0, throttle: 0,
      ab: false, gear: true, flaps: 0, brake: false, fbw: true, fire: false,
    };
    this.crashReason = '';
  }

  get pos() { return this.st.pos; }
  get vel() { return this.st.vel; }
  get alive() { return this.st.alive; }

  // ---------- اسپاون ----------
  spawnAir(alt = 1500, headingDeg = 0, x = 0, z = 0) {
    const st = this.st;
    st.pos.set(x, this.terrain.getHeight(x, z) + alt, z);
    st.quat.setFromAxisAngle(_UP, headingDeg * DEG);
    st.vel.set(0, 0, 1).applyQuaternion(st.quat).multiplyScalar(220);
    this._resetState();
    st.gear = false;
    st.throttle = 0.75;
    this.spawnProtect = 3;
  }

  spawnRunway() {
    const st = this.st, B = BASES.friendly;
    const gy = this.terrain.getHeight(B.x, B.z - 1000);
    st.pos.set(B.x, gy + this.spec.gearH, B.z - 1000);
    st.quat.identity(); // رو به +Z (شمال)
    st.vel.set(0, 0, 0);
    this._resetState();
    st.gear = true;
    st.flaps = 1;
    this.input.flaps = 1;
    this.spawnProtect = 3;
  }

  _resetState() {
    const st = this.st;
    st.angVel.p = st.angVel.y = st.angVel.r = 0;
    st.throttle = 0; st.ab = false;
    st.fuel = this.spec.fuelCap;
    st.alive = true; st.onGround = false;
    st.gForce = 1; st.blackout = 0; st.redout = 0; st.stalled = false;
    this.group.visible = true;
  }

  respawnFull() {
    this.hp = this.hpMax;
    this.gunAmmo = this.spec.guns[0].ammo;
    this.missiles = this.spec.missiles[0].count;
    this.bombs = this.spec.bombs || 0;
    this.rockets = this.spec.rockets || 0;
    this.flares = this.spec.flares || 48;
    this.lockTarget = null; this.lockT = 0;
    this.spawnAir();
  }

  // ---------- حلقه ----------
  update(dt) {
    const st = this.st;
    if (!st.alive) return;
    this.spawnProtect = Math.max(0, this.spawnProtect - dt);
    this.gunCd = Math.max(0, this.gunCd - dt);
    this.missileCd = Math.max(0, this.missileCd - dt);
    this.bombCd = Math.max(0, this.bombCd - dt);
    this.rocketCd = Math.max(0, this.rocketCd - dt);
    this.flareCd = Math.max(0, this.flareCd - dt);

    const inp = this.input;
    // سینک وضعیت‌های toggle از ورودی
    st.gear = inp.gear;
    st.flaps = inp.flaps;
    st.brake = inp.brake;
    // ضعف کنترل هنگام blackout/redout
    const bo = Math.max(st.blackout, st.redout);
    let pitch = inp.pitch, roll = inp.roll, yaw = inp.yaw;
    if (bo > 0) {
      pitch *= 1 - bo * 0.7;
      roll *= 1 - bo * 0.5;
      yaw *= 1 - bo * 0.5;
    }
    const effInp = { ...inp, pitch, roll, yaw };

    const steps = Math.min(Math.max(1, Math.ceil(dt / SIM.fixedDt)), SIM.maxSubsteps);
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      stepFlight(st, this.spec, effInp, h);
      if (st.alive) this._ground(h, effInp);
      if (!st.alive) break;
    }
    if (!st.alive) return;

    // ظاهر
    this.group.position.copy(st.pos);
    this.group.quaternion.copy(st.quat);
    this.refs.gearGroup.visible = st.gear;
    for (const m of this.refs.abGlows) m.visible = st.afterburner;

    // دنباله G بالا / سوپرسونیک
    this.contrailT -= dt;
    if (this.contrailT <= 0 && (Math.abs(st.gForce) > 4.5 || st.mach > 0.92) && !st.onGround) {
      this.contrailT = 0.05;
      if (this.effects) {
        _right.set(1, 0, 0).applyQuaternion(st.quat).multiplyScalar(this.spec.wingSpan * 0.45);
        for (const s of [1, -1]) {
          _tmp.copy(st.pos).addScaledVector(_right, s).addScaledVector(_fwd.set(0, 0, 1).applyQuaternion(st.quat), -2);
          this.effects.puff(_tmp, _tmp.set(0, 0, 0), 2.2, 0.9, 0xffffff, 0.35);
        }
      }
    }
    // دود آسیب
    if (this.hp < this.hpMax * 0.4) {
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = 0.06;
        if (this.effects) {
          _tmp.copy(st.pos).addScaledVector(_fwd.set(0, 0, 1).applyQuaternion(st.quat), 6);
          this.effects.puff(_tmp, _tmp.set(0, 2, 0), 4, 1.2, 0x333333, 0.5);
        }
      }
    }

    this._updateLock(dt);
    if (inp.fire) this._fireGun(dt);
  }

  _ground(dt, inp) {
    const st = this.st, spec = this.spec;
    const gy = this.terrain.getHeight(st.pos.x, st.pos.z);
    st.groundY = gy;
    const gh = st.gear ? spec.gearH : spec.bellyH;

    if (st.pos.y < gy + gh + 0.05) {
      if (!st.onGround) {
        _right.set(1, 0, 0).applyQuaternion(st.quat);
        _up.set(0, 1, 0).applyQuaternion(st.quat);
        const bank = Math.abs(Math.asin(clamp(_right.y, -1, 1)));
        const sink = -st.vel.y;
        if (!st.gear) return this.crash('بدون چرخ فرود به زمین خوردی!');
        if (sink > SIM.crashSinkRate) return this.crash(`فرود سخت — نرخ فرود ${sink.toFixed(0)} m/s (حداکثر ${SIM.crashSinkRate})`);
        if (bank > 0.5 || _up.y < 0.55) return this.crash('وضعیت هواپیما هنگام تماس نامناسب بود');
        st.onGround = true;
        if (this.isPlayer && this.game) this.game.onTouchdown();
      }
      st.pos.y = gy + gh;
      if (st.vel.y < 0) st.vel.y = 0;
      const hSpd = Math.hypot(st.vel.x, st.vel.z);
      if (hSpd > 0.05) {
        const dec = (inp.brake ? 3.8 : 0.3) * dt;
        const ns = Math.max(0, hSpd - dec);
        st.vel.x *= ns / hSpd; st.vel.z *= ns / hSpd;
      }
      _right.set(1, 0, 0).applyQuaternion(st.quat);
      const lat = st.vel.dot(_right);
      st.vel.addScaledVector(_right, -lat * Math.min(1, 5 * dt));
      const steer = inp.yaw * clamp(0.9 - hSpd * 0.011, 0.04, 0.9);
      _dq.setFromAxisAngle(_UP, -steer * dt);
      st.quat.premultiply(_dq).normalize();
      _fwd.set(0, 0, 1).applyQuaternion(st.quat);
      const rollFix = -Math.asin(clamp(_right.set(1, 0, 0).applyQuaternion(st.quat).y, -1, 1)) * 3 * dt;
      _dq.setFromAxisAngle(_fwd, rollFix);
      st.quat.multiply(_dq).normalize();
      if ((hSpd < 45 || inp.pitch <= 0) && _fwd.y < 0.25) {
        _dq.setFromAxisAngle(_right.set(1, 0, 0).applyQuaternion(st.quat), _fwd.y * 2.5 * dt);
        st.quat.multiply(_dq).normalize();
      }
      if (st.lift > (spec.mass + st.fuel) * SIM.g0 * 1.03) st.onGround = false;
    } else if (st.onGround && st.pos.y > gy + gh + 0.3) {
      st.onGround = false;
    }
  }

  // ---------- قفل حرارتی ----------
  _updateLock(dt) {
    const st = this.st;
    _fwd.set(0, 0, 1).applyQuaternion(st.quat);
    let best = null, bestD = 1e12;
    const cosCone = Math.cos(WEAPONS.lockCone * DEG);
    if (this.game) {
      for (const ac of this.game.aircraft) {
        if (!ac.alive || ac === this || ac.team === this.team) continue;
        if (ac.spawnProtect > 0) continue;
        _tmp.copy(ac.st.pos).sub(st.pos);
        const d = _tmp.length();
        if (d > WEAPONS.lockRange || d < 120) continue;
        if (_fwd.dot(_tmp.normalize()) < cosCone) continue;
        if (d < bestD) { bestD = d; best = ac; }
      }
    }
    if (best && best === this.lockTarget) {
      this.lockT = Math.min(this.lockT + dt, WEAPONS.lockTime);
      if (this.isPlayer && this.lockT >= WEAPONS.lockTime && this.lockT - dt < WEAPONS.lockTime && this.audio) {
        this.audio.lockTone(true);
      }
    } else if (best) {
      if (this.isPlayer && this.audio && this.lockTarget !== best) this.audio.lockTone(false);
      this.lockTarget = best;
      this.lockT = 0;
    } else {
      if (this.isPlayer && this.lockTarget && this.audio) this.audio.lockTone(false);
      this.lockTarget = null;
      this.lockT = 0;
    }
  }

  // ---------- تسلیحات ----------
  _fireGun(dt) {
    if (this.gunCd > 0 || this.gunAmmo <= 0 || !this.projectiles) return;
    this.gunCd = 0.02;
    this.gunAmmo--;
    const st = this.st;
    _fwd.set(0, 0, 1).applyQuaternion(st.quat);
    _tmp.copy(st.pos).addScaledVector(_fwd, 7);
    _tmp.y -= 0.5;
    const spread = 0.005;
    const vel = _v3.copy(_fwd).multiplyScalar(WEAPONS.gunMv).add(st.vel);
    vel.x += (Math.random() - 0.5) * spread * WEAPONS.gunMv;
    vel.y += (Math.random() - 0.5) * spread * WEAPONS.gunMv;
    vel.z += (Math.random() - 0.5) * spread * WEAPONS.gunMv;
    this.projectiles.fireBullet(_tmp, vel, this.team === 'blue', WEAPONS.gunDmg, this);
    if (this.isPlayer && this.audio) this.audio.gun();
  }

  fireMissile(target = null) {
    if (this.missileCd > 0 || this.missiles <= 0 || !this.projectiles) return false;
    if (!target) {
      if (!this.lockTarget || this.lockT < WEAPONS.lockTime) return false;
      target = this.lockTarget;
    }
    this.missileCd = 1.4;
    this.missiles--;
    const st = this.st;
    _fwd.set(0, 0, 1).applyQuaternion(st.quat);
    _tmp.copy(st.pos).addScaledVector(_fwd, 2).addScaledVector(_up.set(0, 1, 0).applyQuaternion(st.quat), -1.7);
    const vel = _v3.copy(st.vel).addScaledVector(_fwd, 80);
    const m = this.projectiles.launchMissile(_tmp, vel, target, this.team === 'blue');
    if (this.isPlayer && this.game) this.game.onPlayerEvent('موشک شلیک شد');
    return true;
  }

  dropBomb() {
    if (this.bombCd > 0 || this.bombs <= 0 || !this.projectiles || this.st.onGround) return false;
    this.bombCd = 1.2;
    this.bombs--;
    const st = this.st;
    _fwd.set(0, 0, 1).applyQuaternion(st.quat);
    _tmp.copy(st.pos).addScaledVector(_fwd, 1).addScaledVector(_up.set(0, 1, 0).applyQuaternion(st.quat), -1.9);
    this.projectiles.dropBomb(_tmp, _v3.copy(st.vel), WEAPONS.bombDmg);
    if (this.isPlayer && this.game) this.game.onPlayerEvent('بمب رها شد');
    return true;
  }

  fireRockets() {
    if (this.rocketCd > 0 || this.rockets <= 0 || !this.projectiles) return false;
    this.rocketCd = 2.2;
    const n = Math.min(6, this.rockets);
    this.rockets -= n;
    const st = this.st;
    _fwd.set(0, 0, 1).applyQuaternion(st.quat);
    for (let i = 0; i < n; i++) {
      _tmp.copy(st.pos).addScaledVector(_fwd, 5);
      _tmp.y -= 1.2;
      const vel = _v3.copy(st.vel).addScaledVector(_fwd, WEAPONS.rocketSpeed);
      vel.x += (Math.random() - 0.5) * 26;
      vel.y += (Math.random() - 0.5) * 26;
      vel.z += (Math.random() - 0.5) * 26;
      this.projectiles.fireRocket(_tmp, vel, WEAPONS.rocketDmg);
    }
    if (this.isPlayer && this.game) this.game.onPlayerEvent('راکت شلیک شد');
    return true;
  }

  dropFlares() {
    if (this.flareCd > 0 || this.flares < 8 || !this.projectiles) return false;
    this.flareCd = 1.6;
    this.flares -= 8;
    const st = this.st;
    _tmp.copy(st.pos).addScaledVector(_up.set(0, 1, 0).applyQuaternion(st.quat), -1.5);
    this.projectiles.dropFlares(_tmp, st.vel, 8);
    if (this.audio) this.audio.flarePop();
    return true;
  }

  // ---------- آسیب ----------
  takeHit(dmg, attacker = null) {
    if (!this.st.alive || this.spawnProtect > 0) return;
    this.hp -= dmg;
    if (this.effects) this.effects.spark(this.st.pos);
    if (this.isPlayer && this.game) {
      this.game.hud.flashDamage();
      this.game.hud.hitMarker();
    }
    if (this.hp <= 0) this.die(attacker);
  }

  die(attacker = null) {
    if (!this.st.alive) return;
    this.st.alive = false;
    this.group.visible = false;
    if (this.effects) this.effects.explosion(this.st.pos, 1.7);
    if (this.audio) this.audio.explosion(1);
    if (this.game) this.game.onAircraftKilled(this, attacker);
  }

  crash(reason) {
    this.st.alive = false;
    this.group.visible = false;
    this.crashReason = reason;
    if (this.effects) this.effects.explosion(this.st.pos, 1.7);
    if (this.audio) this.audio.explosion(1);
    if (this.game) this.game.onAircraftKilled(this, null, reason);
  }
}

const _v3 = new THREE.Vector3();
