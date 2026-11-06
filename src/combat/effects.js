// ============================================================
// افکت‌ها — انفجار، جرقه، دود، نور فلاش — همه پول‌شده (صفر GC حین بازی)
// ============================================================
import * as THREE from 'three';

export class EffectSystem {
  constructor(scene, quality) {
    this.scene = scene;
    this.maxPuffs = quality.maxParticles;

    // ---------- استخر دود/ذره (اسپرایت) ----------
    this.puffs = [];
    this._puffCursor = 0;
    const tex = _puffTexture();
    for (let i = 0; i < this.maxPuffs; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, transparent: true, depthWrite: false, opacity: 0,
      }));
      sp.visible = false;
      scene.add(sp);
      this.puffs.push({ sp, vel: new THREE.Vector3(), life: 0, maxLife: 1, grow: 1, fade: 1 });
    }

    // ---------- استخر انفجار (نقاط سرکشنده) ----------
    this.bursts = [];
    for (let b = 0; b < 10; b++) {
      const N = 80;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
      const mat = new THREE.PointsMaterial({
        color: 0xffaa44, size: 5.5, transparent: true, opacity: 1,
        depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const pts = new THREE.Points(geo, mat);
      pts.visible = false;
      pts.frustumCulled = false;
      scene.add(pts);
      this.bursts.push({
        pts, mat, vel: new Float32Array(N * 3), n: N,
        life: 0, maxLife: 1.3, active: false,
      });
    }

    // ---------- استخر فلاش نور ----------
    this.lights = [];
    for (let i = 0; i < 6; i++) {
      const l = new THREE.PointLight(0xffaa55, 0, 300);
      l.visible = false;
      scene.add(l);
      this.lights.push({ l, life: 0, maxLife: 0.7, peak: 20 });
    }

    // ---------- موج انفجار (حلقه در حال انبساط) ----------
    this.rings = [];
    const ringGeo = new THREE.RingGeometry(0.8, 1, 28);
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
        color: 0xffc070, transparent: true, opacity: 0,
        side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      m.visible = false;
      scene.add(m);
      this.rings.push({ m, life: 0, maxLife: 0.9, scale: 30 });
    }

    // ---------- ترکش‌های پرتابی ----------
    this.debris = [];
    const dGeo = new THREE.BoxGeometry(0.7, 0.7, 0.7);
    const dMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.9 });
    for (let i = 0; i < 42; i++) {
      const m = new THREE.Mesh(dGeo, dMat);
      m.visible = false;
      m.castShadow = false;
      scene.add(m);
      this.debris.push({
        m, vel: new THREE.Vector3(), rot: new THREE.Vector3(),
        life: 0, active: false,
      });
    }
  }

  puff(pos, vel, size, life, color = 0xaaaaaa, opacity = 0.55) {
    const p = this.puffs[this._puffCursor];
    this._puffCursor = (this._puffCursor + 1) % this.puffs.length;
    p.sp.visible = true;
    p.sp.position.copy(pos);
    p.sp.scale.set(size, size, 1);
    p.sp.material.color.setHex(color);
    p.sp.material.opacity = opacity;
    p.sp.material.rotation = Math.random() * 6.28;
    p.vel.copy(vel);
    p.life = life; p.maxLife = life;
    p.grow = 1.6; p.fade = opacity;
  }

  explosion(pos, scale = 1) {
    const b = this.bursts.find(x => !x.active) || this.bursts[0];
    b.active = true;
    b.life = 1.15 * Math.sqrt(scale);
    b.maxLife = b.life;
    b.mat.color.setHex(0xffa540);
    b.mat.size = 4.5 * scale;
    b.pts.visible = true;
    const posArr = b.pts.geometry.attributes.position.array;
    for (let i = 0; i < b.n; i++) {
      posArr[i * 3] = pos.x; posArr[i * 3 + 1] = pos.y; posArr[i * 3 + 2] = pos.z;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(Math.random() * 2 - 1);
      const sp = (12 + Math.random() * 55) * scale;
      b.vel[i * 3] = Math.sin(ph) * Math.cos(th) * sp;
      b.vel[i * 3 + 1] = Math.abs(Math.cos(ph)) * sp * 0.8 + 8;
      b.vel[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * sp;
    }
    b.pts.geometry.attributes.position.needsUpdate = true;
    // دودهای تیره
    for (let i = 0; i < 6; i++) {
      this.puff(
        pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 14, Math.random() * 8, (Math.random() - 0.5) * 14)),
        new THREE.Vector3((Math.random() - 0.5) * 8, 6 + Math.random() * 10, (Math.random() - 0.5) * 8),
        (14 + Math.random() * 18) * scale, 2.2 + Math.random() * 1.5, 0x2c2a28, 0.6
      );
    }
    // گلوله‌های آتش
    for (let i = 0; i < 3; i++) {
      this.puff(
        pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 8, Math.random() * 5, (Math.random() - 0.5) * 8)),
        new THREE.Vector3(0, 4 + Math.random() * 6, 0),
        (10 + Math.random() * 10) * scale, 0.7, 0xff8030, 0.8
      );
    }
    // فلاش
    const fl = this.lights.find(x => x.life <= 0) || this.lights[0];
    fl.l.visible = true;
    fl.l.position.copy(pos);
    fl.l.position.y += 6;
    fl.peak = 26 * scale;
    fl.life = 0.75; fl.maxLife = 0.75;

    // موج انفجار
    const ring = this.rings.find(r => r.life <= 0) || this.rings[0];
    ring.m.visible = true;
    ring.m.position.copy(pos);
    ring.m.rotation.set(-Math.PI / 2 + (Math.random() - 0.5) * 0.6, 0, Math.random() * 3);
    ring.m.scale.setScalar(2);
    ring.m.material.opacity = 0.85;
    ring.life = 0.9; ring.maxLife = 0.9;
    ring.scale = 34 * scale;

    // ترکش‌های فلزی
    let dn = 0;
    for (const d of this.debris) {
      if (d.active) continue;
      d.active = true;
      d.life = 1.6 + Math.random() * 1.4;
      d.m.visible = true;
      d.m.position.copy(pos);
      d.m.scale.setScalar(0.5 + Math.random() * 1.2 * scale);
      d.vel.set((Math.random() - 0.5) * 60, 12 + Math.random() * 45, (Math.random() - 0.5) * 60);
      d.rot.set(Math.random() * 9, Math.random() * 9, Math.random() * 9);
      if (++dn >= 5 + Math.round(scale * 2)) break;
    }
  }

  spark(pos) {
    const b = this.bursts.find(x => !x.active);
    if (!b) return;
    b.active = true;
    b.life = 0.35; b.maxLife = 0.35;
    b.mat.color.setHex(0xffe080);
    b.mat.size = 2.5;
    b.pts.visible = true;
    const posArr = b.pts.geometry.attributes.position.array;
    for (let i = 0; i < b.n; i++) {
      posArr[i * 3] = pos.x; posArr[i * 3 + 1] = pos.y; posArr[i * 3 + 2] = pos.z;
      const sp = 20 + Math.random() * 45;
      b.vel[i * 3] = (Math.random() - 0.5) * sp;
      b.vel[i * 3 + 1] = (Math.random() - 0.3) * sp;
      b.vel[i * 3 + 2] = (Math.random() - 0.5) * sp;
    }
    b.pts.geometry.attributes.position.needsUpdate = true;
  }

  update(dt) {
    for (const b of this.bursts) {
      if (!b.active) continue;
      b.life -= dt;
      if (b.life <= 0) { b.active = false; b.pts.visible = false; continue; }
      const posArr = b.pts.geometry.attributes.position.array;
      for (let i = 0; i < b.n; i++) {
        posArr[i * 3] += b.vel[i * 3] * dt;
        posArr[i * 3 + 1] += b.vel[i * 3 + 1] * dt;
        posArr[i * 3 + 2] += b.vel[i * 3 + 2] * dt;
        b.vel[i * 3 + 1] -= 30 * dt;
        b.vel[i * 3] *= 0.985; b.vel[i * 3 + 2] *= 0.985;
      }
      b.pts.geometry.attributes.position.needsUpdate = true;
      b.mat.opacity = Math.min(1, b.life / b.maxLife * 1.6);
    }
    for (const p of this.puffs) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.sp.visible = false; continue; }
      p.sp.position.addScaledVector(p.vel, dt);
      const t = p.life / p.maxLife;
      p.sp.material.opacity = p.fade * Math.min(1, t * 2);
      const s = p.sp.scale.x + p.grow * dt * p.sp.scale.x * 0.5;
      p.sp.scale.set(s, s, 1);
    }
    for (const f of this.lights) {
      if (f.life <= 0) continue;
      f.life -= dt;
      if (f.life <= 0) { f.l.visible = false; continue; }
      f.l.intensity = f.peak * (f.life / f.maxLife);
    }
    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      if (r.life <= 0) { r.m.visible = false; continue; }
      const t = 1 - r.life / r.maxLife;
      r.m.scale.setScalar(2 + t * r.scale);
      r.m.material.opacity = 0.85 * (1 - t);
    }
    for (const d of this.debris) {
      if (!d.active) continue;
      d.life -= dt;
      if (d.life <= 0) { d.active = false; d.m.visible = false; continue; }
      d.vel.y -= 28 * dt;
      d.m.position.addScaledVector(d.vel, dt);
      d.m.rotation.x += d.rot.x * dt;
      d.m.rotation.y += d.rot.y * dt;
      d.m.rotation.z += d.rot.z * dt;
    }
  }
}

let _tex = null;
function _puffTexture() {
  if (_tex) return _tex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.4)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  _tex = new THREE.CanvasTexture(cv);
  return _tex;
}
