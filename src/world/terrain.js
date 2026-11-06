// ============================================================
// زمین کویر غنی: تپه‌شکن + کوه‌های لبه + رنگ‌بندی چندلایه + صخره‌ها + باند
// یک بار ساخته می‌شود؛ getHeight از گرید مش مکمل نمونه‌گیری می‌کند
// ============================================================
import * as THREE from 'three';
import { makeNoise2D, fbm, clamp, lerp, smoothstep } from '../utils.js';
import { WORLD, BASES } from '../config.js';

export class Terrain {
  constructor(scene, quality) {
    this.size = WORLD.size;
    this.seg = quality.terrainSeg;
    this.n = this.seg + 1;
    this.half = this.size / 2;
    this.step = this.size / this.seg;
    this.noise = makeNoise2D(WORLD.seed);
    this.heights = new Float32Array(this.n * this.n);

    this._buildHeightfield();
    this._buildMesh(scene, quality);
    this._buildRocks(scene, quality);
    this._buildBase(scene);
  }

  // ---------- ارتفاع ----------
  _flatten(h, x, z, cx, cz, r, elev) {
    const d = Math.hypot(x - cx, z - cz);
    if (d >= r * 1.5) return h;
    return lerp(elev, h, smoothstep(r, r * 1.5, d));
  }

  _baseHeight(x, z) {
    const s = this.size;
    const nx = (x / s) * 46, nz = (z / s) * 46;
    // تپه‌های شنی
    let h = fbm(this.noise, nx, nz, 5) * 26;
    // رشته‌های پهن
    h += Math.abs(fbm(this.noise, nx * 0.32 + 9.2, nz * 0.32 + 3.1, 3)) * 42;
    // دره‌های خشک (منفی)
    const wadi = fbm(this.noise, nx * 1.4 + 51, nz * 1.4 + 17, 3);
    if (wadi < -0.22) h += (wadi + 0.22) * 34;
    // جزئیات
    h += fbm(this.noise, nx * 6 + 40, nz * 6 + 11, 2) * 4;
    h += 30;
    // کوه‌های حاشیه برای بستن افق
    const edge = Math.max(Math.abs(x), Math.abs(z)) / this.half;
    const wall = smoothstep(0.72, 1.0, edge);
    h += wall * wall * (160 + fbm(this.noise, nx * 2 + 99, nz * 2 + 7, 4) * 130);
    // هموارسازی بیس‌ها
    h = this._flatten(h, x, z, BASES.friendly.x, BASES.friendly.z, 950, BASES.friendly.elev);
    h = this._flatten(h, x, z, BASES.enemy.x, BASES.enemy.z, 950, BASES.enemy.elev);
    return h;
  }

  _buildHeightfield() {
    for (let j = 0; j < this.n; j++) {
      const z = -this.half + j * this.step;
      for (let i = 0; i < this.n; i++) {
        this.heights[j * this.n + i] = this._baseHeight(-this.half + i * this.step, z);
      }
    }
  }

  getHeight(x, z) {
    const fx = clamp((x + this.half) / this.step, 0, this.seg - 1e-4);
    const fz = clamp((z + this.half) / this.step, 0, this.seg - 1e-4);
    const i = fx | 0, j = fz | 0;
    const tx = fx - i, tz = fz - j;
    const h00 = this.heights[j * this.n + i];
    const h10 = this.heights[j * this.n + i + 1];
    const h01 = this.heights[(j + 1) * this.n + i];
    const h11 = this.heights[(j + 1) * this.n + i + 1];
    return lerp(lerp(h00, h10, tx), lerp(h01, h11, tx), tz);
  }

  // ---------- مش با رنگ چندلایه ----------
  _buildMesh(scene, quality) {
    const geo = new THREE.PlaneGeometry(this.size, this.size, this.seg, this.seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();

    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), z = pos.getZ(k);
      const h = this._baseHeight(x, z);
      pos.setY(k, h);

      const hx = this._baseHeight(x + this.step, z) - h;
      const hz = this._baseHeight(x, z + this.step) - h;
      const slope = Math.min(1, (Math.abs(hx) + Math.abs(hz)) / (this.step * 0.26));
      const mott = fbm(this.noise, x * 0.0045 + 77, z * 0.0045 + 13, 3);
      const streak = fbm(this.noise, x * 0.0012 - 5, z * 0.012 + 31, 2); // موج شن

      // پالت: شن گرم → موج‌های تیره‌تر → کف نمکی → صخره شیب‌دار → قله روشن
      c.setRGB(
        0.80 + mott * 0.07 + streak * 0.05,
        0.68 + mott * 0.06 + streak * 0.05,
        0.47 + mott * 0.04,
      );
      if (h < 34) c.lerp(_cSalt, clamp((34 - h) / 16, 0, 1) * 0.75);
      if (h > 95) c.lerp(_cHigh, clamp((h - 95) / 60, 0, 1) * 0.7);
      c.lerp(_cRock, slope * 0.9);
      if (h > 150) c.lerp(_cPeak, clamp((h - 150) / 120, 0, 1) * 0.8);
      c.convertSRGBToLinear();
      colors[k * 3] = c.r; colors[k * 3 + 1] = c.g; colors[k * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);
  }

  // ---------- صخره‌های پراکنده (اینستنس — یک دراکال) ----------
  _buildRocks(scene, quality) {
    const count = quality.rocks;
    const geo = new THREE.DodecahedronGeometry(1, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x8a7660, roughness: 1, flatShading: true });
    const inst = new THREE.InstancedMesh(geo, mat, count);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    let placed = 0, guard = 0;
    while (placed < count && guard++ < count * 8) {
      const x = (Math.random() * 2 - 1) * this.half * 0.9;
      const z = (Math.random() * 2 - 1) * this.half * 0.9;
      if (Math.hypot(x - BASES.friendly.x, z - BASES.friendly.z) < 1100) continue;
      if (Math.hypot(x - BASES.enemy.x, z - BASES.enemy.z) < 1100) continue;
      const h = this._baseHeight(x, z);
      if (h > 130) continue; // روی قله نیست
      const s = 2.5 + Math.random() * Math.random() * 9;
      pos.set(x, h + s * 0.25, z);
      scl.set(s, s * (0.6 + Math.random() * 0.7), s);
      q.setFromEuler(new THREE.Euler(0, Math.random() * 6.28, 0));
      m4.compose(pos, q, scl);
      inst.setMatrixAt(placed++, m4);
    }
    inst.count = placed;
    inst.castShadow = true;
    inst.receiveShadow = true;
    scene.add(inst);
  }

  // ---------- بیس متفقین: باند + سکو + چراغ ----------
  _buildBase(scene) {
    const B = BASES.friendly;
    const y = B.elev;

    const rw = new THREE.Mesh(
      new THREE.PlaneGeometry(46, 2600),
      new THREE.MeshStandardMaterial({
        map: _runwayTexture(), roughness: 0.95, metalness: 0,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      })
    );
    rw.rotation.x = -Math.PI / 2;
    rw.position.set(B.x, y + 0.22, B.z);
    rw.receiveShadow = true;
    scene.add(rw);

    const apron = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 160),
      new THREE.MeshStandardMaterial({
        color: 0x6b6b66, roughness: 1,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      })
    );
    apron.rotation.x = -Math.PI / 2;
    apron.position.set(B.x + 140, y + 0.2, B.z - 1050);
    apron.receiveShadow = true;
    scene.add(apron);

    // هانگارهای متفقین (تزئینی)
    for (let i = 0; i < 3; i++) {
      const hangar = new THREE.Mesh(
        new THREE.BoxGeometry(42, 14, 34),
        new THREE.MeshStandardMaterial({ color: 0x77715f, roughness: 0.9 })
      );
      hangar.position.set(B.x + 130, y + 7, B.z - 960 + i * 55);
      hangar.castShadow = true;
      scene.add(hangar);
    }

    // چراغ‌های لبه باند
    const count = 2 * Math.ceil(2600 / 65) + 2;
    const lights = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.55, 6, 4),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0 }),
      count
    );
    const m4 = new THREE.Matrix4();
    let idx = 0;
    for (let d = -1300; d <= 1300 && idx < count; d += 65) {
      m4.makeTranslation(B.x - 23.5, y + 0.5, B.z + d);
      lights.setMatrixAt(idx++, m4);
      m4.makeTranslation(B.x + 23.5, y + 0.5, B.z + d);
      lights.setMatrixAt(idx++, m4);
    }
    lights.count = idx;
    scene.add(lights);
  }
}

const _cSalt = new THREE.Color(0.58, 0.52, 0.40);
const _cRock = new THREE.Color(0.50, 0.43, 0.38);
const _cHigh = new THREE.Color(0.64, 0.56, 0.47);
const _cPeak = new THREE.Color(0.72, 0.70, 0.68);

function _runwayTexture() {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 2048;
  const g = cv.getContext('2d');
  g.fillStyle = '#3d3f41';
  g.fillRect(0, 0, 256, 2048);
  for (let i = 0; i < 500; i++) {
    const v = 25 + (Math.random() * 28) | 0;
    g.fillStyle = `rgba(${v},${v},${v + 3},0.20)`;
    g.fillRect(Math.random() * 256, Math.random() * 2048, 2 + Math.random() * 42, 1 + Math.random() * 3);
  }
  g.strokeStyle = '#e6e6dc'; g.lineWidth = 4;
  g.beginPath();
  g.moveTo(14, 0); g.lineTo(14, 2048);
  g.moveTo(242, 0); g.lineTo(242, 2048);
  g.stroke();
  g.setLineDash([70, 50]); g.lineWidth = 6;
  g.beginPath(); g.moveTo(128, 0); g.lineTo(128, 2048); g.stroke();
  g.setLineDash([]);
  for (let i = 0; i < 8; i++) {
    const x = 30 + i * 26;
    g.fillRect(x, 28, 14, 92);
    g.fillRect(x, 2048 - 120, 14, 92);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
