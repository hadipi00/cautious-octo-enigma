// ============================================================
// هواپیما — فیزیک + تسلیحات + آسیب + قفل (مشترک بین بازیکن و AI)
// قرارداد: دماغه +Z ، شمال +Z ، شرق +X
// ============================================================
import * as THREE from 'three';
import { buildJet } from '../models/parametric.js';
import { buildCockpit } from '../cockpit.js';
import { stepFlight } from './model.js';
import { SIM, BASES, WEAPONS } from '../config.js';
import { RadarSystem } from '../combat/radar.js';
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

    // کابین سه‌بعدی — همه جنگنده‌ها دارند
    const cs = spec.len / 15;
    this.cockpit = buildCockpit(spec);
    this.cockpitHead = new THREE.Vector3(0, 0.30 * cs, 1.95 * cs);
    this.group.add(this.cockpit.group);

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
    // ایستگاه‌های موشک — هر ایستگاه یک نوع (ir/sarh/arh) با مهمات جدا
    this.mslStations = (spec.missiles || []).map(m => ({
      name: m.name, type: m.type || 'ir', range: m.range || 8000,
      count: m.count, left: m.count,
    }));
    this.bombs = spec.bombs || 0;
    this.rockets = spec.rockets || 0;
    this.flares = spec.flares || 48;
    this.chaff = spec.chaff || 60;
    this.radar = spec.radar ? new RadarSystem(this, spec.radar) : null;
    this.lockSource = 'none';   // none | ir | radar

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
  get missiles() {
    let n = 0;
    for (const s of this.mslStations) n += s.left;
    return n;
  }

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
    for (const s of this.mslStations) s.left = s.count;
    this.bombs = this.spec.bombs || 0;
    this.rockets = this.spec.rockets || 0;
    this.flares = this.spec.flares || 48;
    this.chaff = this.spec.chaff || 60;
    this.lockTarget = null; this.lockT = 0; this.lockSource = 'none';
    if (this.radar) { this.radar.mode = 'srch'; this.radar.designated = null; }
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

    // دنباله G بالا / سوپرسونیک / زاویه حمله بالا (گردباد)
    this.contrailT -= dt;
    if (this.contrailT <= 0 && (Math.abs(st.gForce) > 4.5 || st.mach > 0.92 || Math.abs(st.alpha) > 0.21) && !st.onGround) {
      this.contrailT = 0.05;
      if (this.effects) {
        _right.set(1, 0, 0).applyQuaternion(st.quat).multiplyScalar(this.spec.wingSpan * 0.45);
        for (const s of [1, -1]) {
          _tmp.copy(st.pos).addScaledVector(_right, s).addScaledVector(_fwd.set(0, 0, 1).applyQuaternion(st.quat), -2);
          this.effects.puff(_tmp, _tmp.set(0, 0, 0), 2.2, 0.9, 0xffffff, 0.35);
        }
      }
    }
    // دود آسیب + آتش موتور
    if (this.hp < this.hpMax * 0.3) {
      st.thrustFactor = 0.45 + Math.random() * 0.15;
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = 0.05;
        if (this.effects) {
          _fwd.set(0, 0, 1).applyQuaternion(st.quat);
          _tmp.copy(st.pos).addScaledVector(_fwd, -6.5 * (this.spec.len / 15));
          this.effects.puff(_tmp, _tmp.set(0, 1.2, 0), 3.2, 0.5, 0xff6020, 0.75); // شعله
          _tmp.copy(st.pos).addScaledVector(_fwd, -7.5 * (this.spec.len / 15));
          this.effects.puff(_tmp, _tmp.set(0, 2.2, 0), 5, 1.5, 0x171717, 0.65);   // دود تیره
        }
      }
    } else if (this.hp < this.hpMax * 0.45) {
      st.thrustFactor = 0.85;
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = 0.07;
        if (this.effects) {
          _fwd.set(0, 0, 1).applyQuaternion(st.quat);
          _tmp.copy(st.pos).addScaledVector(_fwd, -7 * (this.spec.len / 15));
          this.effects.puff(_tmp, _tmp.set(0, 2, 0), 4.5, 1.3, 0x333333, 0.5);
        }
      }
    } else {
      st.thrustFactor = 1;
    }

    this._updateLock(dt);
    if (inp.fire) this._fireGun(dt);
    // سوسو زدن شعله افتربرنر — انیمیشن زنده
    if (st.afterburner && this.refs.abGlows.length) {
      for (const gl of this.refs.abGlows) {
        const f = 0.88 + Math.random() * 0.28;
        gl.scale.set(f, f, 0.8 + Math.random() * 0.55 + st.mach * 0.25);
        gl.material.opacity = 0.55 + Math.random() * 0.4;
      }
    }
    if (this.cockpit) this.cockpit.update(dt, this, this.game);
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

  // ---------- قفل: جوینده حرارتی (IR) + هم‌کنش با قفل راداری ----------
  _updateLock(dt) {
    const st = this.st;
    _fwd.set(0, 0, 1).applyQuaternion(st.quat);
    let best = null, bestD = 1e12;
    const cosCone = Math.cos(WEAPONS.lockCone * DEG);
    if (this.game && this.lockSource !== 'radar') {
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
    if (this.lockSource === 'radar') {
      // قفل راداری: زمان تخصیص ادامه می‌یابد (SARH قفل کامل، ARH تخصیص کوتاه می‌خواهد)
      if (this.lockTarget && this.lockTarget.alive) {
        this.lockT = Math.min(this.lockT + dt, 2.0);
      } else {
        this.lockTarget = null;
        this.lockSource = 'none';
        this.lockT = 0;
      }
      return;
    }
    if (best && best === this.lockTarget) {
      this.lockT = Math.min(this.lockT + dt, WEAPONS.lockTime);
      if (this.isPlayer && this.lockT >= WEAPONS.lockTime && this.lockT - dt < WEAPONS.lockTime && this.audio) {
        this.audio.lockTone(true);
      }
    } else if (best) {
      if (this.isPlayer && this.audio && this.lockTarget !== best) this.audio.lockTone(false);
      this.lockTarget = best;
      this.lockSource = 'ir';
      this.lockT = 0;
    } else {
      if (this.isPlayer && this.lockTarget && this.audio) this.audio.lockTone(false);
      this.lockTarget = null;
      this.lockSource = 'none';
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
    this.projectiles.fireBullet(_tmp, vel, this.team === 'blue', this.spec.gunDmg || WEAPONS.gunDmg, this);
    if (this.isPlayer && this.audio) this.audio.gun();
  }

  // انتخاب ایستگاه مناسب برای قفل فعلی (برای HUD هم استفاده می‌شود)
  selectedStation() {
    const lt = this.lockTarget;
    const ready = this.lockT;
    let ir = null, radar = null;
    for (const s of this.mslStations) {
      if (s.left <= 0) continue;
      if (s.type === 'ir' && !ir) ir = s;
      if (s.type !== 'ir' && !radar) radar = s;
    }
    if (lt) {
      const d = lt.st ? lt.st.pos.distanceTo(this.st.pos) : 1e9;
      if (this.lockSource === 'radar') {
        // SARH فقط با قفل کامل؛ ARH با تخصیص کافی (۰٫۴ث)
        if (radar) {
          if (radar.type === 'sarh' && ready >= WEAPONS.lockTime) return radar;
          if (radar.type === 'arh' && ready >= 0.4) return radar;
          if (radar.type === 'sarh') return null; // قفل ناقص
          return radar;
        }
      } else if (d < (ir ? 4500 : 0) && ir) {
        return ir;
      }
    }
    return ir || radar || null;
  }

  fireMissile(target = null) {
    if (this.missileCd > 0 || !this.projectiles) return false;
    const st = this.mslStations;
    if (!target) {
      if (!this.lockTarget || this.lockSource === 'none') return false;
      target = this.lockTarget;
    }
    // انتخاب نوع موشک: راداری برای قفل راداری، حرارتی برای قفل IR
    let station = null;
    if (this.lockSource === 'radar') {
      station = st.find(s => s.left > 0 && s.type === 'sarh') || st.find(s => s.left > 0 && s.type === 'arh');
      // SARH فقط با قفل کامل، ARH با تخصیص کوتاه
      if (station && station.type === 'sarh' && this.lockT < WEAPONS.lockTime) {
        const arh = st.find(s => s.left > 0 && s.type === 'arh');
        station = arh && this.lockT >= 0.4 ? arh : null;
      } else if (station && station.type === 'arh' && this.lockT < 0.4) {
        station = null;
      }
    } else {
      station = st.find(s => s.left > 0 && s.type === 'ir');
      if (this.lockT < WEAPONS.lockTime) station = null;
    }
    if (!station) return false;

    this.missileCd = 1.4;
    station.left--;
    const s = this.st;
    _fwd.set(0, 0, 1).applyQuaternion(s.quat);
    _tmp.copy(s.pos).addScaledVector(_fwd, 2).addScaledVector(_up.set(0, 1, 0).applyQuaternion(s.quat), -1.7);
    const vel = _v3.copy(s.vel).addScaledVector(_fwd, 80);
    const d = target.st ? target.st.pos.distanceTo(s.pos) : 0;
    const m = this.projectiles.launchMissile(_tmp, vel, target, this.team === 'blue', {
      kind: station.type,
      range: station.range,
      loft: station.type !== 'ir' && d > WEAPONS.loftRange,
      attacker: this,
    });
    if (m && station.range && m.life > 0) {
      // موشک بعد از پایان موتور تا برد ایستگاه کار می‌کند
      m.life = Math.max(m.life, Math.min(station.range / m.speed + 6, WEAPONS.MSL[station.type].life));
    }
    if (this.isPlayer && this.game) this.game.onPlayerEvent(`${station.name} شلیک شد`);
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
    // چف هم همراه فلر (مثل دکمه مقابل‌پیشه‌های واحد وارتاندر)
    if (this.chaff >= 4) {
      this.chaff -= 4;
      this.projectiles.dropChaffs(_tmp, st.vel, 4);
    }
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
