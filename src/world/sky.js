// آسمان سینمایی + خورشید + نور — و لایه ابر
import * as THREE from 'three';

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
        // ابرهای آسمان دوردست (نویز ارزان)
        float band = smoothstep(0.04, 0.24, d.y) * (1.0 - smoothstep(0.24, 0.55, d.y));
        float cl = sin(d.x * 28.0 + d.z * 17.0) * sin(d.z * 23.0 - d.x * 11.0);
        col += vec3(0.06) * band * smoothstep(0.55, 1.0, cl);
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

  return {
    sky, sun, hemi, sunDir,
    update(playerPos) {
      sky.position.set(playerPos.x, 0, playerPos.z);
      sun.position.copy(playerPos).addScaledVector(sunDir, 700);
      sun.target.position.copy(playerPos);
      sun.target.updateMatrixWorld();
    },
  };
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
