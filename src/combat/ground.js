// ============================================================
// پدافند زمینی — SAM (موشک هدایت‌شونده) و توپ ضدهوایی
// فقط به تیم قرمز حمله می‌کند (بازیکن و متحدانش)
// ============================================================
import * as THREE from 'three';
import { WEAPONS } from '../config.js';

const _lead = new THREE.Vector3(), _dir = new THREE.Vector3();

export class GroundDefense {
  constructor(props, projectiles, effects, audio) {
    this.props = props;
    this.projectiles = projectiles;
    this.effects = effects;
    this.audio = audio;
    this.enabled = true;
  }

  update(dt, aircraftList) {
    if (!this.enabled || !this.props) return;
    const threats = aircraftList.filter(a => a.alive && a.team === 'blue' && !a.onGround);

    // ---------- SAM ----------
    for (const site of this.props.samSites) {
      if (site.destroyed) continue;
      site.cooldown -= dt;
      if (site.cooldown > 0) continue;
      for (const ac of threats) {
        const d = ac.st.pos.distanceTo(site.pos);
        if (d < WEAPONS.samRange && ac.st.pos.y > site.pos.y + 60) {
          _dir.set(0, 1, 0).addScaledVector(_lead.copy(ac.st.pos).sub(site.pos).normalize(), 0.8).normalize();
          this.projectiles.launchMissile(
            site.pos.clone().add(new THREE.Vector3(0, 4, 0)),
            _dir.multiplyScalar(140),
            ac, false,
            { turn: 2.7, speed: 880, life: 12, dmg: 70 }
          );
          this.effects.spark(site.pos);
          site.cooldown = WEAPONS.samReload + Math.random() * 4;
          break;
        }
      }
    }

    // ---------- پدافند هوایی ----------
    for (const site of this.props.aaaSites) {
      if (site.destroyed) continue;
      site.cooldown -= dt;
      if (site.cooldown > 0) continue;
      for (const ac of threats) {
        const d = ac.st.pos.distanceTo(site.pos);
        if (d < WEAPONS.aaaRange) {
          // پیش‌بینی مسیر هدف
          const tFly = d / 900;
          _lead.copy(ac.st.pos).addScaledVector(ac.st.vel, tFly);
          _lead.x += (Math.random() - 0.5) * 34;
          _lead.y += (Math.random() - 0.5) * 26;
          _lead.z += (Math.random() - 0.5) * 34;
          _dir.copy(_lead).sub(site.pos).normalize();
          for (let i = 0; i < 5; i++) {
            _dir.x += (Math.random() - 0.5) * 0.02;
            _dir.y += (Math.random() - 0.5) * 0.02;
            _dir.z += (Math.random() - 0.5) * 0.02;
            this.projectiles.fireBullet(
              site.pos.clone().addScaledVector(_dir, 6),
              _dir.clone().multiplyScalar(900),
              false, 6, null
            );
          }
          site.cooldown = WEAPONS.aaaReload;
          break;
        }
      }
    }
  }

  damageSite(site, dmg) {
    if (site.destroyed) return false;
    site.hp = (site.hp ?? 50) - dmg;
    if (site.hp <= 0) {
      site.destroyed = true;
      if (site.mesh) site.mesh.scale.y = 0.3;
      return true;
    }
    return false;
  }
}
