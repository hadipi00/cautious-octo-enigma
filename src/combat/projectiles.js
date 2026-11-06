// ============================================================
// پرتابه‌ها — توپ، موشک هدایت‌شونده، بمب، راکت، فلر (همه پول‌شده)
// برخورد: پاره‌خط-کره برای توپ، شعاع برای بقیه
// ============================================================
import * as THREE from 'three';
import { WEAPONS } from '../config.js';

export class Projectiles {
  constructor(scene, effects, audio) {
    this.scene = scene;
    this.effects = effects;
    this.audio = audio;

    // ---------- توپ ----------
    this.bullets = [];
    const bGeoF = new THREE.BoxGeometry(0.16, 0.16, 8);
    const bGeoE = new THREE.BoxGeometry(0.18, 0.18, 8);
    const matF = _addMat(0xffe680);
    const matE = _addMat(0xff7040);
    for (let i = 0; i < 260; i++) {
      const enemy = i >= 130;
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
    for (let i = 0; i < 28; i++) {
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
        target: null, friendly: true, life: 0, motor: 0, turn: WEAPONS.missileTurn,
        speed: WEAPONS.missileSpeed, dmg: WEAPONS.missileDmg, smokeT: 0, active: false,
      });
    }

    // ---------- بمب و راکت ----------
    this.drops = [];
    const bombGeo = new THREE.CapsuleGeometry(0.35, 1.6, 4, 8);
    const rocketGeo = new THREE.CylinderGeometry(0.15, 0.15, 2.2, 6);
    const dark = new THREE.MeshStandardMaterial({ color: 0x50565c, roughness: 0.5, metalness: 0.5 });
    for (let i = 0; i < 24; i++) {
      const isBomb = i < 12;
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
    for (let i = 0; i < 48; i++) {
      const node = new THREE.Mesh(flareGeo, flareMat);
      node.visible = false;
      scene.add(node);
      this.flares.push({
        node, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, active: false,
      });
    }

    // کال‌بک‌ها (game وصل می‌کند)
    this.onAircraftHit = null;   // (aircraft, dmg, attacker)
    this.onGroundTargetHit = null; // (propsTarget, dmg)
    this.onSamHit = null;        // (samSite, dmg)
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
    b.node.lookAt(pos.clone().add(vel));
  }

  launchMissile(pos, vel, target, friendly, opts = {}) {
    const m = this.missiles.find(x => !x.active);
    if (!m) return;
    m.active = true;
    m.pos.copy(pos);
    m.vel.copy(vel).setLength(Math.min(vel.length() + 150, 420));
    m.target = target;
    m.friendly = friendly;
    m.life = opts.life || WEAPONS.missileLife;
    m.motor = 3.2;
    m.turn = opts.turn || WEAPONS.missileTurn;
    m.speed = opts.speed || WEAPONS.missileSpeed;
    m.dmg = opts.dmg || WEAPONS.missileDmg;
    m.smokeT = 0;
    m.node.visible = true;
    m.node.position.copy(pos);
    m.node.lookAt(pos.clone().add(m.vel));
    if (this.audio) this.audio.missileLaunch(friendly);
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
      f.vel.copy(vel).multiplyScalar(0.45).add(new THREE.Vector3(
        (Math.random() - 0.5) * 60, -8 - Math.random() * 20, (Math.random() - 0.5) * 60
      ));
      f.node.visible = true;
      if (++dropped >= count) break;
    }
  }

  missileInbound(targetAircraft) {
    for (const m of this.missiles) {
      if (m.active && !m.friendly && m.target === targetAircraft) return true;
    }
    return false;
  }

  // ---------- به‌روزرسانی ----------
  update(dt, ctx) {
    // ctx: { aircraft (لیست هواپیماها), props (اهداف زمینی), terrain, spawnProtect }
    this._updateBullets(dt, ctx);
    this._updateMissiles(dt, ctx);
    this._updateDrops(dt, ctx);
    this._updateFlares(dt, ctx);
  }

  _updateBullets(dt, ctx) {
    for (const b of this.bullets) {
      if (!b.active) continue;
      b.life -= dt;
      if (b.life <= 0) { b.active = false; b.node.visible = false; continue; }
      const a = _v1.copy(b.pos);
      b.vel.y -= 4 * dt;
      b.pos.addScaledVector(b.vel, dt);
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
      m.motor -= dt;
      if (m.life <= 0) { this._boomMissile(m, ctx); continue; }

      const speed = m.motor > 0
        ? Math.min(m.vel.length() + 300 * dt, m.speed)
        : Math.max(m.vel.length() - 60 * dt, 320);

      const t = m.target;
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
        // گول‌زنی فلر
        if (!m.friendly && Math.random() < WEAPONS.flareDecoyChance * dt * 0.9) {
          for (const f of this.flares) {
            if (f.active && f.pos.distanceTo(m.pos) < 320) {
              m.target = { pos: f.pos, vel: f.vel, alive: true, radius: 14 };
              break;
            }
          }
        }
      } else {
        m.vel.setLength(speed);
      }

      m.pos.addScaledVector(m.vel, dt);
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

  _updateDrops(dt, ctx) {
    for (const d of this.drops) {
      if (!d.active) continue;
      d.life -= dt;
      if (d.life <= 0) { d.active = false; d.node.visible = false; continue; }
      if (d.bomb) {
        d.vel.y -= 9.81 * dt;
        d.vel.multiplyScalar(1 - 0.06 * dt);
      } else {
        d.vel.y -= 3.5 * dt;
      }
      d.pos.addScaledVector(d.vel, dt);
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
}

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();

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
