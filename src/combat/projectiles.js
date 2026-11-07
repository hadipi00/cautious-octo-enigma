// ============================================================
// پرتابه‌ها — توپ، موشک (IR/SARH/ARH)، بمب، راکت، فلر، چف
// همه پول‌شده (صفر GC حین بازی)
// انتگرال‌گیری بالستیک توپ/بمب/راکت/موشک کور → هسته WASM (simcore)
// الکترونیک: ناتچینگ، چف، روشنایی SARH، جوینده فعال ARH، فلر برای IR
// ============================================================
import * as THREE from 'three';
import { WEAPONS } from '../config.js';
import { simcore } from '../wasm/simcore.js';

const MAX_BULLETS = 320, MAX_MISSILES = 44, MAX_DROPS = 28, MAX_Flares = 48, MAX_CHAFFS = 36;

export class Projectiles {
  constructor(scene, effects, audio) {
    this.scene = scene;
    this.effects = effects;
    this.audio = audio;
    this.sim = simcore;   // هسته WASM (در صورت نبود → fallback JS)

    // ---------- اسکرچ بالستیک (پیش‌تخصیص) ----------
    this._bArr = new Float64Array(MAX_BULLETS * 6);
    this._dArr = new Float64Array(MAX_DROPS * 6);

    // ---------- توپ ----------
    this.bullets = [];
    const bGeoF = new THREE.BoxGeometry(0.16, 0.16, 8);
    const bGeoE = new THREE.BoxGeometry(0.18, 0.18, 8);
    const matF = _addMat(0xffe680);
    const matE = _addMat(0xff7040);
    for (let i = 0; i < MAX_BULLETS; i++) {
      const enemy = i >= MAX_BULLETS / 2;
      const mi = new THREE.Mesh(enemy ? bGeoE : bGeoF, enemy ? matE : matF);
      mi.visible = false;
      mi.frustumCulled = false;
      scene.add(mi);
      this.bullets.push({
        node: mi, pos: new THREE.Vector3(), vel: new THREE.Vector3(),
        life: 0, friendly: !enemy, active: false,
      });
    }

    // ---------- موشک ----------
    this.missiles = [];
    const mGeo = new THREE.CylinderGeometry(0.22, 0.22, 3.2, 8);
    const mMat = new THREE.MeshStandardMaterial({ color: 0xd8d8dc, roughness: 0.4, metalness: 0.5 });
    const flameGeo = new THREE.ConeGeometry(0.3, 2.4, 8);
    const flameMat = _addMat(0xffb050);
    for (let i = 0; i < MAX_MISSILES; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(mGeo, mMat);
      body.rotation.x = Math.PI / 2;
      const flame = new THREE.Mesh(flameGeo, flameMat);
      flame.rotation.x = -Math.PI / 2;
      flame.position.z = -2.6;
      g.add(body, flame);
      g.visible = false;
      scene.add(g);
      this.missiles.push({
        node: g, pos: new THREE.Vector3(), vel: new THREE.Vector3(),
        target: null, friendly: true, life: 0, motor: 0,
        turn: 3.2, speed: 980, dmg: 85, kind: 'ir',
        guided: true, activeSeek: false, illumLostT: 0, lofted: false,
        attacker: null, smokeT: 0, active: false,
      });
    }

    // ---------- بمب و راکت ----------
    this.drops = [];
    const bombGeo = new THREE.CapsuleGeometry(0.35, 1.6, 4, 8);
    const rocketGeo = new THREE.CylinderGeometry(0.15, 0.15, 2.2, 6);
    const dark = new THREE.MeshStandardMaterial({ color: 0x50565c, roughness: 0.5, metalness: 0.5 });
    for (let i = 0; i < MAX_DROPS; i++) {
      const isBomb = i < MAX_DROPS / 2;
      const mesh = new THREE.Mesh(isBomb ? bombGeo : rocketGeo, dark);
      if (!isBomb) mesh.rotation.x = Math.PI / 2;
      mesh.visible = false;
      scene.add(mesh);
      this.drops.push({
        node: mesh, pos: new THREE.Vector3(), vel: new THREE.Vector3(),
        life: 0, bomb: isBomb, dmg: 0, active: false,
      });
    }

    // ---------- فلر ----------
    this.flares = [];
    const flareMat = _addMat(0xffd070);
    const flareGeo = new THREE.SphereGeometry(0.5, 6, 4);
    for (let i = 0; i < MAX_Flares; i++) {
      const node = new THREE.Mesh(flareGeo, flareMat);
      node.visible = false;
      scene.add(node);
      this.flares.push({
        node, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, active: false,
      });
    }

    // ---------- چف (بازتاب راداری) ----------
    this.chaffs = [];
    const chaffMat = new THREE.MeshBasicMaterial({ color: 0xdde4ee, transparent: true, opacity: 0.8 });
    const chaffGeo = new THREE.OctahedronGeometry(0.7, 0);
    for (let i = 0; i < MAX_CHAFFS; i++) {
      const node = new THREE.Mesh(chaffGeo, chaffMat);
      node.visible = false;
      scene.add(node);
      this.chaffs.push({
        node, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, active: false,
      });
    }

    // کال‌بک‌ها (game وصل می‌کند)
    this.onAircraftHit = null;     // (aircraft, dmg, attacker)
    this.onGroundTargetHit = null; // (propsTarget, dmg)
    this.onSamHit = null;          // (samSite, dmg)
  }

  // ---------- شلیک‌ها ----------
  fireBullet(pos, vel, friendly, dmg = WEAPONS.gunDmg, attacker = null) {
    const b = this.bullets.find(x => !x.active);
    if (!b) return;
    b.active = true;
    b.life = 1.6;
    b.friendly = friendly;
    b.attacker = attacker;
    b.pos.copy(pos);
    b.vel.copy(vel);
    b.node.visible = true;
    b.node.position.copy(pos);
    b.node.lookAt(_look.copy(pos).add(vel));
  }

  // opts: { kind:'ir'|'sarh'|'arh', speed, turn, dmg, life, attacker, loft }
  launchMissile(pos, vel, target, friendly, opts = {}) {
    const m = this.missiles.find(x => !x.active);
    if (!m) return null;
    const kind = opts.kind || 'ir';
    const base = WEAPONS.MSL[kind] || WEAPONS.MSL.ir;
    m.active = true;
    m.pos.copy(pos);
    m.vel.copy(vel).setLength(Math.min(vel.length() + 150, base.speed * 0.5));
    m.target = target;
    m.friendly = friendly;
    m.kind = kind;
    m.guided = true;
    m.activeSeek = false;
    m.illumLostT = 0;
    m.attacker = opts.attacker || null;
    m.life = opts.life || base.life;
    m.motor = base.motor;
    m.turn = opts.turn || base.turn;
    m.speed = opts.speed || base.speed;
    m.dmg = opts.dmg || base.dmg;
    m.lofted = !!opts.loft;
    if (m.lofted) m.vel.y += 200;   // اوج اولیه برای انرژی (بی‌آر)
    m.smokeT = 0;
    m.node.visible = true;
    m.node.position.copy(pos);
    m.node.lookAt(_look.copy(pos).add(m.vel));
    if (this.audio) this.audio.missileLaunch(friendly);
    return m;
  }

  dropBomb(pos, vel, dmg = WEAPONS.bombDmg) {
    const d = this.drops.find(x => !x.active && x.bomb);
    if (!d) return;
    d.active = true;
    d.pos.copy(pos);
    d.vel.copy(vel);
    d.life = 30;
    d.dmg = dmg;
    d.node.visible = true;
  }

  fireRocket(pos, vel, dmg = WEAPONS.rocketDmg) {
    const d = this.drops.find(x => !x.active && !x.bomb);
    if (!d) return;
    d.active = true;
    d.pos.copy(pos);
    d.vel.copy(vel);
    d.life = WEAPONS.rocketLife;
    d.dmg = dmg;
    d.node.visible = true;
  }

  dropFlares(pos, vel, count = 8) {
    let dropped = 0;
    for (const f of this.flares) {
      if (f.active) continue;
      f.active = true;
      f.life = WEAPONS.flareLife;
      f.pos.copy(pos);
      f.vel.copy(vel).multiplyScalar(0.45).add(_v1.set(
        (Math.random() - 0.5) * 60, -8 - Math.random() * 20, (Math.random() - 0.5) * 60
      ));
      f.node.visible = true;
      if (++dropped >= count) break;
    }
  }

  dropChaffs(pos, vel, count = 4) {
    let dropped = 0;
    for (const c of this.chaffs) {
      if (c.active) continue;
      c.active = true;
      c.life = WEAPONS.chaffLife;
      c.pos.copy(pos);
      c.vel.copy(vel).multiplyScalar(0.5).add(_v1.set(
        (Math.random() - 0.5) * 40, -4 - Math.random() * 12, (Math.random() - 0.5) * 40
      ));
      c.node.visible = true;
      if (++dropped >= count) break;
    }
  }

  missileInbound(targetAircraft) {
    for (const m of this.missiles) {
      if (m.active && !m.friendly && m.target === targetAircraft) return true;
    }
    return false;
  }

  // نزدیک‌ترین موشک هدایت‌شونده در راه هدف — برای RWR هوشمند
  missileInboundInfo(targetAircraft) {
    let best = null, bd = 1e12;
    for (const m of this.missiles) {
      if (!m.active || m.friendly || m.target !== targetAircraft) continue;
      const d = m.pos.distanceTo(targetAircraft.st.pos);
      if (d < bd) { bd = d; best = m; }
    }
    return best ? { kind: best.kind, dist: bd, activeSeek: best.activeSeek } : null;
  }

  // ---------- به‌روزرسانی ----------
  update(dt, ctx) {
    // ctx: { aircraft, props, terrain }
    this._dt = dt;
    this._integrateBallistics(dt);
    this._collideBullets(ctx);
    this._collideDrops(ctx);
    this._updateMissiles(dt, ctx);
    this._updateFlares(dt, ctx);
    this._updateChaffs(dt, ctx);
  }

  // انتگرال‌گیری دسته‌ای توپ/بمب/راکت/موشک کور با WASM
  _integrateBallistics(dt) {
    // توپ‌ها (گرانش سبک، بدون درگ)
    let n = 0;
    for (const b of this.bullets) {
      if (!b.active) continue;
      const o = n * 6;
      this._bArr[o] = b.pos.x; this._bArr[o + 1] = b.pos.y; this._bArr[o + 2] = b.pos.z;
      this._bArr[o + 3] = b.vel.x; this._bArr[o + 4] = b.vel.y; this._bArr[o + 5] = b.vel.z;
      n++;
    }
    if (n > 0) {
      this.sim.ballisticBatch(this._bArr, n, dt, 4, 0);
      let i = 0;
      for (const b of this.bullets) {
        if (!b.active) continue;
        const o = i * 6;
        b.pos.set(this._bArr[o], this._bArr[o + 1], this._bArr[o + 2]);
        b.vel.set(this._bArr[o + 3], this._bArr[o + 4], this._bArr[o + 5]);
        i++;
      }
    }
    // بمب و راکت (دو فراخوان با گرانش/درگ متفاوت)
    this._integrateDrops(dt, true, 9.81, 0.06);
    this._integrateDrops(dt, false, 3.5, 0);
    // موشک‌های کور (قفل شکسته) — بالستیک واقعی
    let m = 0;
    for (const ms of this.missiles) {
      if (!ms.active || ms.guided) continue;
      const o = m * 6;
      this._bArr[o] = ms.pos.x; this._bArr[o + 1] = ms.pos.y; this._bArr[o + 2] = ms.pos.z;
      this._bArr[o + 3] = ms.vel.x; this._bArr[o + 4] = ms.vel.y; this._bArr[o + 5] = ms.vel.z;
      m++;
    }
    if (m > 0) {
      this.sim.ballisticBatch(this._bArr, m, dt, 6, 0.08);
      let i = 0;
      for (const ms of this.missiles) {
        if (!ms.active || ms.guided) continue;
        const o = i * 6;
        ms.pos.set(this._bArr[o], this._bArr[o + 1], this._bArr[o + 2]);
        ms.vel.set(this._bArr[o + 3], this._bArr[o + 4], this._bArr[o + 5]);
        i++;
      }
    }
  }

  _integrateDrops(dt, bomb, g, drag) {
    let n = 0;
    for (const d of this.drops) {
      if (!d.active || d.bomb !== bomb) continue;
      const o = n * 6;
      this._bArr[o] = d.pos.x; this._bArr[o + 1] = d.pos.y; this._bArr[o + 2] = d.pos.z;
      this._bArr[o + 3] = d.vel.x; this._bArr[o + 4] = d.vel.y; this._bArr[o + 5] = d.vel.z;
      n++;
    }
    if (n === 0) return;
    this.sim.ballisticBatch(this._bArr, n, dt, g, drag);
    let i = 0;
    for (const d of this.drops) {
      if (!d.active || d.bomb !== bomb) continue;
      const o = i * 6;
      d.pos.set(this._bArr[o], this._bArr[o + 1], this._bArr[o + 2]);
      d.vel.set(this._bArr[o + 3], this._bArr[o + 4], this._bArr[o + 5]);
      i++;
    }
  }

  _collideBullets(ctx) {
    const dt = this._dt || 0.016;
    for (const b of this.bullets) {
      if (!b.active) continue;
      b.life -= dt;
      if (b.life <= 0) { b.active = false; b.node.visible = false; continue; }
      const a = _v1.copy(b.pos).addScaledVector(b.vel, -dt); // موقعیت قبلی
      const bb = b.pos;
      let hit = false;
      // هواپیماها
      for (const ac of ctx.aircraft) {
        if (!ac.alive || ac.team === (b.friendly ? 'blue' : 'red')) continue;
        if (ac.spawnProtect > 0) continue;
        if (_segSphere(a, bb, ac.st.pos, 7)) {
          this.onAircraftHit && this.onAircraftHit(ac, b.friendly ? 5 : 4, b.attacker);
          this.effects.spark(bb);
          hit = true;
          break;
        }
      }
      // اهداف زمینی (فقط توپ friendly)
      if (!hit && b.friendly && ctx.props) {
        for (const t of ctx.props.targets) {
          if (!t.alive) continue;
          if (_segSphere(a, bb, t.pos, 16)) {
            this.onGroundTargetHit && this.onGroundTargetHit(t, b.friendly ? 6 : 0);
            this.effects.spark(bb);
            hit = true;
            break;
          }
        }
        if (!hit) {
          for (const site of ctx.props.samSites) {
            if (site.destroyed) continue;
            if (_segSphere(a, bb, site.pos, 9)) {
              this.onSamHit && this.onSamHit(site, 6);
              this.effects.spark(bb);
              hit = true;
              break;
            }
          }
        }
        if (!hit) {
          for (const site of ctx.props.aaaSites) {
            if (site.destroyed) continue;
            if (_segSphere(a, bb, site.pos, 9)) {
              this.onSamHit && this.onSamHit(site, 6);
              this.effects.spark(bb);
              hit = true;
              break;
            }
          }
        }
      }
      if (!hit && b.pos.y < ctx.terrain.getHeight(b.pos.x, b.pos.z)) {
        this.effects.spark(b.pos);
        hit = true;
      }
      if (hit) { b.active = false; b.node.visible = false; continue; }
      b.node.position.copy(b.pos);
      b.node.lookAt(_v2.copy(b.pos).add(b.vel));
    }
  }

  _updateMissiles(dt, ctx) {
    for (const m of this.missiles) {
      if (!m.active) continue;
      m.life -= dt;
      if (m.life <= 0) { this._boomMissile(m, ctx); continue; }

      const t = m.target;
      const radar = m.kind !== 'ir';

      // ---------- الکترونیک: روشنایی SARH ----------
      if (m.guided && m.kind === 'sarh' && m.attacker) {
        const lit = m.attacker.alive && m.attacker.lockTarget === t && m.attacker.lockT >= WEAPONS.lockTime * 0.6;
        m.illumLostT = lit ? 0 : m.illumLostT + dt;
        if (m.illumLostT > WEAPONS.sarhGraceT) {
          m.guided = false;   // قفل روشنایی قطع شد → بالستیک
        }
      }

      // ---------- الکترونیک: ناتچینگ (کراسینگ) برای موشک راداری ----------
      if (m.guided && radar && t && t.vel && t.alive !== false) {
        const dist = m.pos.distanceTo(t.pos);
        if (!m.activeSeek && dist > WEAPONS.notchMinRange) {
          const vLen = t.vel.length();
          if (vLen > 60) {
            _v1.copy(t.pos).sub(m.pos).normalize();
            const along = Math.abs(t.vel.dot(_v1) / vLen);
            if (along < WEAPONS.notchCos && Math.random() < 0.9 * dt) {
              m.guided = false;   // ناتچ موفق → از دید رادار خارج شد
            }
          }
        }
        if (m.kind === 'arh' && !m.activeSeek &&
            (dist < WEAPONS.activeRadarRange || m.life < 8)) {
          m.activeSeek = true;   // جوینده فعال روشن شد
        }
        if (m.activeSeek && dist < WEAPONS.notchMinRange * 0.4) {
          // نزدیکِ جوینده فعال → فقط چف فرصت گول دارد (پایین‌تر)
        }
      }

      // ---------- الکترونیک: گول‌زننده‌ها ----------
      if (m.guided) {
        if (m.kind === 'ir' && Math.random() < WEAPONS.flareDecoyChance * dt * 0.9) {
          for (const f of this.flares) {
            if (f.active && f.pos.distanceTo(m.pos) < 320) {
              m.target = { pos: f.pos, vel: f.vel, alive: true, radius: 14 };
              break;
            }
          }
        } else if (radar && Math.random() < WEAPONS.chaffDecoyChance * dt) {
          for (const c of this.chaffs) {
            if (c.active && c.pos.distanceTo(m.pos) < 300) {
              m.guided = false;   // چف اکوی جعلی → قفل راداری شکست
              break;
            }
          }
        }
      }

      // ---------- هدایت ----------
      if (m.guided) {
        const speed = m.motor > 0
          ? Math.min(m.vel.length() + 300 * dt, m.speed)
          : Math.max(m.vel.length() - 60 * dt, 320);
        if (t && (t.alive === undefined || t.alive)) {
          const tp = _v1.copy(t.pos);
          if (t.vel && t.vel.lengthSq) tp.addScaledVector(t.vel, m.pos.distanceTo(t.pos) / speed * 0.75);
          const desired = _v2.copy(tp).sub(m.pos).normalize();
          const cur = _v3.copy(m.vel).normalize();
          const axis = _v4.copy(cur).cross(desired);
          if (axis.lengthSq() > 1e-8) {
            const ang = Math.min(cur.angleTo(desired), m.turn * dt);
            m.vel.copy(cur.applyAxisAngle(axis.normalize(), ang)).multiplyScalar(speed);
          } else {
            m.vel.setLength(speed);
          }
          // برخورد نزدیک
          if (m.pos.distanceTo(t.pos) < (t.radius || 12)) {
            this._boomMissile(m, ctx);
            continue;
          }
        } else {
          m.vel.setLength(speed);
        }
        m.pos.addScaledVector(m.vel, dt);
      } else {
        // کور: موقعیت از بچ WASM آمده — فقط برخورد تصادفی با هدف
        if (t && t.pos && m.pos.distanceTo(t.pos) < 10) { this._boomMissile(m, ctx); continue; }
      }

      // دود دنباله
      m.smokeT -= dt;
      if (m.smokeT <= 0) {
        m.smokeT = 0.028;
        this.effects.puff(m.pos, _v2.set(0, 1.5, 0), 5.5, 1.4, 0xcfcfcf, 0.4);
      }
      // زمین
      if (m.pos.y < ctx.terrain.getHeight(m.pos.x, m.pos.z) + 2) {
        this._boomMissile(m, ctx);
        continue;
      }
      m.node.position.copy(m.pos);
      m.node.lookAt(_v2.copy(m.pos).add(m.vel));
    }
  }

  _boomMissile(m, ctx) {
    this.effects.explosion(m.pos, m.friendly ? 1.1 : 1.2);
    if (this.audio) this.audio.explosion(0.7);
    if (m.target && m.target.alive && m.pos.distanceTo(m.target.pos) < 30) {
      if (m.target.hp !== undefined && m.target.takeHit) {
        this.onAircraftHit && this.onAircraftHit(m.target, m.dmg, m.attacker);
      }
    }
    m.active = false;
    m.node.visible = false;
  }

  _collideDrops(ctx) {
    for (const d of this.drops) {
      if (!d.active) continue;
      d.life -= (this._dt || 0.016);
      if (d.life <= 0) { d.active = false; d.node.visible = false; continue; }
      let boom = false;
      // برخورد با هواپیما (راکت)
      if (!d.bomb) {
        for (const ac of ctx.aircraft) {
          if (!ac.alive || ac.team === 'blue') continue;
          if (d.pos.distanceTo(ac.st.pos) < 10) { boom = true; break; }
        }
      }
      const gy = ctx.terrain.getHeight(d.pos.x, d.pos.z);
      if (d.pos.y <= gy + 1) boom = true;
      if (boom) {
        this.effects.explosion(d.pos, d.bomb ? 1.6 : 0.8);
        if (this.audio) this.audio.explosion(d.bomb ? 1 : 0.5);
        if (d.bomb) {
          // آسیب ناحیه‌ای
          for (const ac of ctx.aircraft) {
            if (ac.alive && d.pos.distanceTo(ac.st.pos) < WEAPONS.bombRadius) {
              this.onAircraftHit && this.onAircraftHit(ac, d.dmg * 0.6, d.attacker);
            }
          }
          if (ctx.props) {
            for (const t of ctx.props.targets) {
              if (t.alive && d.pos.distanceTo(t.pos) < WEAPONS.bombRadius + 10) {
                this.onGroundTargetHit && this.onGroundTargetHit(t, d.dmg);
              }
            }
            for (const site of [...ctx.props.samSites, ...ctx.props.aaaSites]) {
              if (!site.destroyed && d.pos.distanceTo(site.pos) < WEAPONS.bombRadius + 10) {
                this.onSamHit && this.onSamHit(site, d.dmg);
              }
            }
          }
        }
        d.active = false;
        d.node.visible = false;
        continue;
      }
      d.node.position.copy(d.pos);
      if (!d.bomb) d.node.lookAt(_v2.copy(d.pos).add(d.vel));
    }
  }

  _updateFlares(dt, ctx) {
    for (const f of this.flares) {
      if (!f.active) continue;
      f.life -= dt;
      if (f.life <= 0) { f.active = false; f.node.visible = false; continue; }
      f.vel.y -= 7 * dt;
      f.pos.addScaledVector(f.vel, dt);
      f.node.position.copy(f.pos);
      if (Math.random() < 0.4) {
        this.effects.puff(f.pos, _v2.set(0, 1, 0), 3, 0.5, 0xffc060, 0.5);
      }
    }
  }

  _updateChaffs(dt, ctx) {
    for (const c of this.chaffs) {
      if (!c.active) continue;
      c.life -= dt;
      if (c.life <= 0) { c.active = false; c.node.visible = false; continue; }
      c.vel.multiplyScalar(1 - 0.8 * dt);
      c.vel.y -= 2.5 * dt;
      c.pos.addScaledVector(c.vel, dt);
      c.node.position.copy(c.pos);
      c.node.rotation.y += 3 * dt;
      if (Math.random() < 0.25) {
        this.effects.puff(c.pos, _v2.set(0, 0.5, 0), 2.5, 0.4, 0xcfd6e2, 0.35);
      }
    }
  }
}

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _look = new THREE.Vector3();

function _addMat(hex) {
  return new THREE.MeshBasicMaterial({
    color: hex, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
}

function _segSphere(a, b, c, r) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const len2 = abx * abx + aby * aby + abz * abz;
  const t = Math.max(0, Math.min(1, ((c.x - a.x) * abx + (c.y - a.y) * aby + (c.z - a.z) * abz) / (len2 || 1e-6)));
  const dx = a.x + abx * t - c.x, dy = a.y + aby * t - c.y, dz = a.z + abz * t - c.z;
  return dx * dx + dy * dy + dz * dz <= r * r;
}
