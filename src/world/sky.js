// ============================================================
// آسمان نسخه ۲ — گرادیان فیزیکی + خورشید HDR + نقشه محیطی (بازتاب نور
// آفتاب روی بدنه جت‌ها) + لنز فلر سینمایی + ابرهای پفکی چندلایه
// ------------------------------------------------------------
// خورشید در شیدر «فوق‌روشن» (HDR ~18x) است تا:
//   ۱) PMREM آن را به‌عنوان منبع نور قطعی در env-map ثبت کند → برق بدنه
//   ۲) ACES هنگام تون‌مپینگ، هاله‌ی نرم دور قرص بسازد
// ============================================================
import * as THREE from 'three';

const _fv = new THREE.Vector3();
const _sv = new THREE.Vector3();
const _gv = new THREE.Vector3();

export const SUN_DIR = new THREE.Vector3(-0.42, 0.58, 0.40).normalize();

// رنگ‌های مرجع — بازی fog را با این هماهنگ می‌کند
export const SKY_HORIZON = new THREE.Color(0.80, 0.76, 0.66);
export const SKY_ZENITH = new THREE.Color(0.10, 0.26, 0.55);

const SKY_FRAG = /* glsl */`
  varying vec3 vDir;
  uniform vec3 sunDir;
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    float sd = clamp(dot(d, sunDir), -1.0, 1.0);

    // ----- گرادیان ریلی (مثل پراکندگی نور واقعی آسمان) -----
    float hz = smoothstep(-0.02, 0.12, h);            // نزدیک افق
    float up = pow(smoothstep(0.0, 0.85, h), 0.68);   // سمت سرِ آسمان
    vec3 horizon = vec3(0.82, 0.77, 0.66);
    vec3 mid     = vec3(0.34, 0.55, 0.85);
    vec3 zenith  = vec3(0.075, 0.21, 0.52);
    vec3 col = mix(horizon, mid, hz);
    col = mix(col, zenith, up);

    // ----- پراکندگی می (هاله‌ی خورشید) -----
    col += vec3(0.95, 0.80, 0.58) * pow(max(sd, 0.0), 5.0) * 0.22;
    col += vec3(1.00, 0.87, 0.62) * pow(max(sd, 0.0), 48.0) * 0.55;
    col += vec3(1.00, 0.93, 0.74) * pow(max(sd, 0.0), 550.0) * 1.9;

    // ----- قرص خورشید HDR (منبع بازتاب بدنه) -----
    float disc = smoothstep(0.99958, 0.99985, sd);
    col += vec3(1.0, 0.93, 0.80) * disc * 16.0;

    // ----- گرمای افق (غروب‌مانند ملایم در سمت خورشید) -----
    float warm = pow(max(sd, 0.0), 2.5) * (1.0 - smoothstep(0.0, 0.30, h));
    col += vec3(0.35, 0.20, 0.08) * warm * 0.5;

    // ----- زیر افق: مه زمین -----
    float below = smoothstep(0.0, -0.05, h);
    col = mix(col, vec3(0.58, 0.54, 0.47), below);

    // ----- سیروس‌های دوردست (رگه‌های ابر بلند) -----
    float cir = sin(d.x * 8.0 + d.z * 3.0) * sin(d.z * 12.0 - d.x * 5.0 + d.y * 24.0);
    cir = cir * 0.5 + 0.5;
    cir *= smoothstep(0.16, 0.40, h) * (1.0 - smoothstep(0.40, 0.78, h));
    col += vec3(0.85, 0.88, 0.93) * smoothstep(0.70, 0.97, cir) * 0.12;

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

const SKY_VERT = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

export function buildSky(scene, quality, renderer) {
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { sunDir: { value: SUN_DIR.clone() } },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
  });

  const skyGeo = new THREE.SphereGeometry(30000, 48, 24);
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  scene.add(sky);

  // ---------- نقشه محیطی (PMREM) — قلب بازتاب‌های PBR ----------
  // یک‌بار در بوت از خود آسمان گرفته می‌شود؛ چون خورشید ثابت است کافی است
  let envRT = null;
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const tmpScene = new THREE.Scene();
    const tmpSky = new THREE.Mesh(skyGeo, skyMat);
    tmpScene.add(tmpSky);
    envRT = pmrem.fromScene(tmpScene, 0.02);
    pmrem.dispose();
  } catch (e) {
    console.warn('[sky] PMREM env failed:', e);
  }
  if (envRT) scene.environment = envRT.texture;

  // ---------- نورها ----------
  const sun = new THREE.DirectionalLight(0xfff1dc, 3.4);
  sun.castShadow = quality.shadows;
  if (quality.shadows) {
    sun.shadow.mapSize.set(quality.shadowSize, quality.shadowSize);
    sun.shadow.camera.near = 100;
    sun.shadow.camera.far = 1800;
    sun.shadow.camera.left = -320; sun.shadow.camera.right = 320;
    sun.shadow.camera.top = 320; sun.shadow.camera.bottom = -320;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 1.5;
  }
  scene.add(sun);
  scene.add(sun.target);

  // نور آسمان (محیطی دوقطبی) — با env-map جمع می‌شود و عمق رنگ می‌دهد
  const hemi = new THREE.HemisphereLight(0xbcd2ff, 0x8f7d5e, 0.35);
  scene.add(hemi);

  // ---------- لنز فلر سینمایی ----------
  const flareTex = _flareTexture();
  const streakTex = _streakTexture();
  const mkSprite = (tex, size, color, opacity) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, color, transparent: true, opacity,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false,
    }));
    sp.scale.setScalar(size);
    sp.renderOrder = 90;
    sp.visible = false;
    scene.add(sp);
    return sp;
  };
  const flares = [
    { sp: mkSprite(flareTex, 5200, 0xffe9c4, 0.55), base: 0.55, k: 0.0, streak: false },
    { sp: mkSprite(streakTex, 3600, 0xffdfb0, 0.30), base: 0.30, k: 0.0, streak: true }, // خط آنامورفیک
    { sp: mkSprite(flareTex, 1500, 0xaed4ff, 0.20), base: 0.20, k: -0.4, streak: false },
    { sp: mkSprite(flareTex, 900, 0xffd2a0, 0.16), base: 0.16, k: -0.7, streak: false },
    { sp: mkSprite(flareTex, 600, 0x9fe8c0, 0.13), base: 0.13, k: -1.05, streak: false },
    { sp: mkSprite(flareTex, 800, 0xd0b4ff, 0.12), base: 0.12, k: -1.5, streak: false },
  ];

  return {
    sky, sun, hemi, sunDir: SUN_DIR, flares, envRT,
    update(camPos, camera) {
      // گنبد آسمان چسبیده به دوربین — بدون پارالاکس
      sky.position.copy(camPos);
      sun.position.copy(camPos).addScaledVector(SUN_DIR, 750);
      sun.target.position.copy(camPos);
      sun.target.updateMatrixWorld();
      // لنز فلر — فقط وقتی خورشید جلوی دوربین است
      _fv.set(0, 0, -1).applyQuaternion(camera.quaternion);
      const facing = _fv.dot(SUN_DIR);
      if (facing > 0.25) {
        _sv.copy(camPos).addScaledVector(SUN_DIR, 9000).project(camera);
        const edgeFade = Math.min(1, (facing - 0.25) * 4) * (_sv.z < 1 ? 1 : 0);
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
  grad.addColorStop(0.22, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.13)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(cv);
}

function _streakTexture() {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 32;
  const g = cv.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.5, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 32);
  // محو عمودی
  const vgrad = g.createLinearGradient(0, 0, 0, 32);
  vgrad.addColorStop(0, 'rgba(0,0,0,1)');
  vgrad.addColorStop(0.5, 'rgba(0,0,0,0)');
  vgrad.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = vgrad;
  g.fillRect(0, 0, 256, 32);
  return new THREE.CanvasTexture(cv);
}

// ------------------------------------------------------------
// ابرهای نسخه ۲ — خوشه‌های پفکی با بافت نامنظم (نه دایره‌های تکراری)
// هر خوشه ۴ تا ۸ پفک با ارتفاع/سایه متفاوت — از دور مثل کومولوس واقعی
// ------------------------------------------------------------
export function buildClouds(scene, quality) {
  const tex = _puffTexture();

  const group = new THREE.Group();
  const sprites = [];
  const clusters = Math.max(8, Math.round(quality.clouds * 1.6));

  for (let i = 0; i < clusters; i++) {
    const cx = (Math.random() * 2 - 1) * 11000;
    const cz = (Math.random() * 2 - 1) * 11000;
    const cy = 2500 + Math.random() * 2100;
    const puffs = 4 + (Math.random() * 5 | 0);
    const baseScale = 380 + Math.random() * 520;
    // خوشه‌های پهن‌تر در باد — کشیدگی افقی
    const flat = 0.42 + Math.random() * 0.2;
    for (let p = 0; p < puffs; p++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, transparent: true, depthWrite: false, fog: true,
        opacity: 0.55 + Math.random() * 0.3,
        color: new THREE.Color().setHSL(0.6, 0.08, 0.86 + Math.random() * 0.12),
      }));
      const ox = (Math.random() * 2 - 1);
      const oz = (Math.random() * 2 - 1);
      const oy = Math.abs(Math.random() * 2 - 1);
      sp.position.set(
        cx + ox * baseScale * 2.4,
        cy + oy * baseScale * flat * 0.9,
        cz + oz * baseScale * 1.7
      );
      sp.scale.set(
        baseScale * (0.75 + Math.random() * 0.7),
        baseScale * flat * (0.75 + Math.random() * 0.5),
        1
      );
      group.add(sp);
      sprites.push(sp);
    }
  }
  scene.add(group);

  return {
    update(camPos, dt = 0.016) {
      // باد ملایم + قفسه‌بندی دور دوربین (ابرها همه‌جا هستند)
      for (const sp of sprites) {
        sp.position.x += 4.5 * dt;
        if (sp.position.x - camPos.x > 12000) sp.position.x -= 24000;
        if (sp.position.x - camPos.x < -12000) sp.position.x += 24000;
        if (sp.position.z - camPos.z > 12000) sp.position.z -= 24000;
        if (sp.position.z - camPos.z < -12000) sp.position.z += 24000;
      }
    },
  };
}

// بافت پفک نامنظم — ده‌ها گرادیان ریز داخل یک دایره نرم
function _puffTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  // ماسک دایره‌ای پایه
  const base = g.createRadialGradient(128, 128, 20, 128, 128, 124);
  base.addColorStop(0, 'rgba(255,255,255,1)');
  base.addColorStop(0.62, 'rgba(255,255,255,0.55)');
  base.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  // پفک‌های ریز روشن (برجستگی)
  g.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 26; i++) {
    const x = 40 + Math.random() * 176, y = 40 + Math.random() * 146;
    const r = 14 + Math.random() * 34;
    const gr = g.createRadialGradient(x, y - r * 0.25, 1, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.5)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // سایه ملایم پایین (حجم)
  for (let i = 0; i < 12; i++) {
    const x = 50 + Math.random() * 156, y = 140 + Math.random() * 70;
    const r = 18 + Math.random() * 30;
    const gr = g.createRadialGradient(x, y, 1, x, y, r);
    gr.addColorStop(0, 'rgba(140,155,175,0.35)');
    gr.addColorStop(1, 'rgba(140,155,175,0)');
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
