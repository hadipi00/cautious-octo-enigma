// آسمان سینمایی + خورشید + نور — و لایه ابر
import * as THREE from 'three';

const _fv = new THREE.Vector3();
const _sv = new THREE.Vector3();
const _gv = new THREE.Vector3();

export function buildSky(scene, quality) {
  const sunDir = new THREE.Vector3(-0.45, 0.55, 0.40).normalize();

  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { sunDir: { value: sunDir } },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vDir;
      uniform vec3 sunDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0);
        vec3 zen = vec3(0.15, 0.34, 0.60);
        vec3 hor = vec3(0.76, 0.74, 0.70);
        vec3 col = mix(hor, zen, pow(h, 0.5));
        float s = max(dot(d, sunDir), 0.0);
        col += vec3(1.0, 0.87, 0.62) * pow(s, 900.0) * 12.0;   // قرص خورشید
        col += vec3(1.0, 0.72, 0.42) * pow(s, 16.0) * 0.35;    // هاله
        col += vec3(0.92, 0.62, 0.36) * pow(max(1.0 - h, 0.0), 7.0) * 0.22;
        // ابرهای آسمان دوردست — لکه‌های نرم (بدون نوار)
        float band = smoothstep(0.03, 0.20, d.y) * (1.0 - smoothstep(0.20, 0.50, d.y));
        float cl = sin(d.x * 11.0 + d.z * 6.0) * sin(d.z * 15.0 - d.x * 4.0 + d.y * 7.0);
        cl = cl * 0.5 + 0.5;
        cl *= 0.5 + 0.5 * sin(d.x * 5.0 - d.z * 9.0 + 2.0);
        col += vec3(0.055) * band * smoothstep(0.62, 0.94, cl);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });

  const sky = new THREE.Mesh(new THREE.SphereGeometry(30000, 32, 16), skyMat);
  sky.frustumCulled = false;
  scene.add(sky);

  const sun = new THREE.DirectionalLight(0xfff0da, 3.0);
  sun.castShadow = quality.shadows;
  if (quality.shadows) {
    sun.shadow.mapSize.set(quality.shadowSize, quality.shadowSize);
    sun.shadow.camera.near = 100;
    sun.shadow.camera.far = 1600;
    sun.shadow.camera.left = -280; sun.shadow.camera.right = 280;
    sun.shadow.camera.top = 280; sun.shadow.camera.bottom = -280;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 1.5;
  }
  scene.add(sun);
  scene.add(sun.target);

  const hemi = new THREE.HemisphereLight(0xbdd4ff, 0x9a8a68, 0.5);
  scene.add(hemi);

  // ---------- لنز فلر (اسپرایت‌های افزودنی روی خط خورشید) ----------
  const flareTex = _flareTexture();
  const mkFlare = (size, color, opacity = 0.5) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: flareTex, color, transparent: true, opacity,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false,
    }));
    sp.renderOrder = 90;
    sp.visible = false;
    scene.add(sp);
    return sp;
  };
  const flares = [
    { sp: mkFlare(4200, 0xffe8c0), base: 0.5, k: 0.0 },   // هاله اصلی روی خورشید
    { sp: mkFlare(1300, 0xaed4ff), base: 0.22, k: -0.35 },// بازتاب‌ها روی محور مرکز↔خورشید
    { sp: mkFlare(800, 0xffd2a0), base: 0.18, k: -0.65 },
    { sp: mkFlare(550, 0x9fe8c0), base: 0.15, k: -1.0 },
  ];

  return {
    sky, sun, hemi, sunDir, flares,
    update(playerPos, camera) {
      sky.position.set(playerPos.x, 0, playerPos.z);
      sun.position.copy(playerPos).addScaledVector(sunDir, 700);
      sun.target.position.copy(playerPos);
      sun.target.updateMatrixWorld();
      // لنز فلر — فقط وقتی خورشید جلوی دوربین است
      _fv.set(0, 0, -1).applyQuaternion(camera.quaternion);
      const facing = _fv.dot(sunDir);
      if (facing > 0.3) {
        _sv.copy(camera.position).addScaledVector(sunDir, 9000).project(camera);
        const edgeFade = Math.min(1, (facing - 0.3) * 4) * (_sv.z < 1 ? 1 : 0);
        for (const f of flares) {
          _gv.set(-_sv.x * f.k, -_sv.y * f.k, 0.5).unproject(camera);
          f.sp.position.copy(_gv);
          f.sp.material.opacity = f.base * edgeFade;
          f.sp.visible = true;
        }
      } else {
        for (const f of flares) f.sp.visible = false;
      }
    },
  };
}

function _flareTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 2, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.5)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(cv);
}

// ------------------------------------------------------------
// ابرها — بیلبوردهای نرم ارزان (بزرگ‌ترین برد بصری به ازای کمترین هزینه)
// ------------------------------------------------------------
export function buildClouds(scene, quality) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 8, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.55, 'rgba(250,250,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;

  const group = new THREE.Group();
  const mat = new THREE.SpriteMaterial({
    map: tex, transparent: true, depthWrite: false, fog: true, opacity: 0.9,
  });
  const sprites = [];
  for (let i = 0; i < quality.clouds; i++) {
    const sp = new THREE.Sprite(mat.clone());
    const puff = 2 + (Math.random() * 3) | 0;
    sp.position.set(
      (Math.random() * 2 - 1) * 11000,
      2500 + Math.random() * 1900,
      (Math.random() * 2 - 1) * 11000
    );
    sp.scale.set(700 + Math.random() * 900, 320 + Math.random() * 380, 1);
    sp.material.opacity = 0.35 + Math.random() * 0.3;
    group.add(sp);
    sprites.push(sp);
  }
  scene.add(group);
  return {
    update(camPos) {
      // ابرها در دنیا ثابت‌اند؛ فقط گره حرکت آهسته
      for (const sp of sprites) {
        sp.position.x += 3.5 * 0.016; // باد ملایم
        if (sp.position.x - camPos.x > 12000) sp.position.x -= 24000;
        if (sp.position.x - camPos.x < -12000) sp.position.x += 24000;
        if (sp.position.z - camPos.z > 12000) sp.position.z -= 24000;
        if (sp.position.z - camPos.z < -12000) sp.position.z += 24000;
      }
    },
  };
}
