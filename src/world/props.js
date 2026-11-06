// ============================================================
// بیس دشمن: اهداف انفجاری (هانگار/مخزن/رادار) + سایت‌های SAM و پدافند
// ============================================================
import * as THREE from 'three';
import { BASES, SCORE } from '../config.js';

export class Props {
  constructor(scene, terrain) {
    this.targets = [];   // اهداف قابل انهدام
    this.samSites = [];  // سایت‌های موشکی (منطق شلیک در combat/ground.js)
    this.aaaSites = [];  // توپ‌های ضدهوایی
    this._buildEnemyBase(scene);
  }

  _buildEnemyBase(scene) {
    const B = BASES.enemy;
    const y = B.elev;
    const bMat = new THREE.MeshStandardMaterial({ color: 0x6e675a, roughness: 0.9 });
    const tankMat = new THREE.MeshStandardMaterial({ color: 0x8a8478, roughness: 0.6, metalness: 0.4 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x4a463f, roughness: 0.8 });

    // باند دشمن
    const rw = new THREE.Mesh(
      new THREE.PlaneGeometry(46, 2600),
      new THREE.MeshStandardMaterial({
        color: 0x3d3f41, roughness: 0.95,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      })
    );
    rw.rotation.x = -Math.PI / 2;
    rw.position.set(B.x, y + 0.22, B.z);
    scene.add(rw);

    // هانگارها × ۴
    for (let i = 0; i < 4; i++) {
      this._addTarget(scene, 'hangar',
        new THREE.BoxGeometry(44, 15, 36), bMat,
        B.x - 130 + (i % 2) * 90, y + 7.5, B.z - 700 + Math.floor(i / 2) * 320);
    }
    // مخزن‌های سوخت × ۴
    for (let i = 0; i < 4; i++) {
      this._addTarget(scene, 'fuelTank',
        new THREE.CylinderGeometry(11, 11, 16, 12), tankMat,
        B.x - 60 + (i % 2) * 70, y + 8, B.z + 250 + Math.floor(i / 2) * 260);
    }
    // برج و دیش رادار
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(3, 4.5, 34, 8), darkMat);
    tower.position.set(B.x + 40, y + 17, B.z - 80);
    tower.castShadow = true;
    scene.add(tower);
    this._addTarget(scene, 'radar',
      new THREE.SphereGeometry(9, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), tankMat,
      B.x + 40, y + 34, B.z - 80);
    // چرخش دیش رادار (جلوه زنده بودن بیس)
    const radarTarget = this.targets[this.targets.length - 1];
    radarTarget.spin = true;

    // سایت‌های SAM × ۳
    for (let i = 0; i < 3; i++) {
      const ang = (i / 3) * Math.PI * 2 + 0.5;
      const px = B.x + Math.cos(ang) * 520, pz = B.z + Math.sin(ang) * 520;
      const py = this._terrainH ? this._terrainH(px, pz) : y;
      const launcher = new THREE.Mesh(new THREE.BoxGeometry(10, 3.5, 16), darkMat);
      launcher.position.set(px, py + 1.8, pz);
      launcher.castShadow = true;
      scene.add(launcher);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 9), darkMat);
      rail.position.set(px, py + 4.5, pz);
      rail.rotation.x = -0.5;
      scene.add(rail);
      const plate = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 0.6), darkMat);
      plate.position.set(px, py + 3.2, pz);
      plate.rotation.y = Math.random() * 3;
      scene.add(plate);
      this.samSites.push({ pos: new THREE.Vector3(px, py + 3, pz), cooldown: 2 + i * 2, mesh: rail });
    }

    // توپ‌های ضدهوایی × ۳
    for (let i = 0; i < 3; i++) {
      const ang = (i / 3) * Math.PI * 2 + 2.2;
      const px = B.x + Math.cos(ang) * 340, pz = B.z + Math.sin(ang) * 340;
      const py = this._terrainH ? this._terrainH(px, pz) : y;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(4, 5, 2.4, 8), darkMat);
      base.position.set(px, py + 1.2, pz);
      scene.add(base);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 9, 6), darkMat);
      barrel.rotation.x = Math.PI / 2.4;
      barrel.position.set(px, py + 3.4, pz);
      scene.add(barrel);
      this.aaaSites.push({ pos: new THREE.Vector3(px, py + 3.4, pz), cooldown: 1 + i, mesh: barrel });
    }
  }

  _addTarget(scene, type, geo, mat, x, y, z) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    this.targets.push({
      type, mesh, pos: mesh.position.clone(), alive: true,
      hp: type === 'radar' ? 60 : type === 'fuelTank' ? 40 : 70,
      score: SCORE[type === 'hangar' ? 'hangar' : type === 'fuelTank' ? 'fuelTank' : 'radar'],
    });
  }

  // تزریق تابع ارتفاع زمین (برای سایت‌ها بعد از ساخت Terrain)
  setTerrainH(fn) {
    this._terrainH = fn;
    for (const s of this.samSites) s.pos.y = fn(s.pos.x, s.pos.z) + 3;
    for (const a of this.aaaSites) {
      a.pos.y = fn(a.pos.x, a.pos.z) + 3.4;
      a.mesh.position.y = fn(a.pos.x, a.pos.z) + 3.4;
    }
  }

  damageTarget(target, dmg) {
    if (!target.alive) return null;
    target.hp -= dmg;
    if (target.hp <= 0) {
      target.alive = false;
      // تبدیل به آوار
      target.mesh.scale.y = 0.25;
      const m = target.mesh.material;
      if (m.color) m.color.multiplyScalar(0.45);
      target.mesh.position.y -= target.pos.y * 0.0;
      return { killed: true, type: target.type, pos: target.pos.clone(), score: target.score };
    }
    return { killed: false, pos: target.pos.clone() };
  }

  aliveTargets(type) {
    return this.targets.filter(t => t.alive && (!type || t.type === type));
  }
}
