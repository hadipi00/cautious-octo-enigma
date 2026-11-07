// ============================================================
// کابین نسخه ۳ — «انگار واقعا تو جنگنده نشستی»
// ------------------------------------------------------------
// • پنل کامل ۱۰۲۴px با عقربه‌های زنده: افق مصنوعی، سرعت، ارتفاع،
//   واریومتر، قطب‌نما، دور موتور، جی‌متر + دو MFD روی خود پنل
// • HUD واقعی روی شیشه: نردبان افق، نوار سرعت/ارتفاع/جهت، FPM،
//   نشانگر توپ + پیپر پیش‌روی (WASM) + نشانگر هدف
// • بدن خلبان: پاها روی پدال سکان، دست‌ها روی استیک و گاز
// • حرکت سر با G (فرورفتن در صندلی) + لرزش موتور/افتربرنر/توپ
// • شیشه خراش‌دار با بازتاب محیط، آینه عقب، دستگیره پرتاب
// eyeLocal: چشم خلبان — game.js دوربین را دقیقاً همین‌جا می‌نشیند
// camOffset: جابجایی لحظه‌ای سر — game.js به دوربین اضافه می‌کند
// ============================================================
import * as THREE from 'three';
import { WEAPONS } from './config.js';
import { simcore } from './wasm/simcore.js';

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _fwd = new THREE.Vector3();
const _upL = new THREE.Vector3();
const DEG = 180 / Math.PI;

const PHOS = (west) => (west ? '#8dffc0' : '#ffd88a');
const FACE = '#0b0f13';

// هندسه کابین — همه نسبت به s (مقیاس جت). چشم: (0, 0.30, -0.10)
const EYE_Y = 0.30, EYE_Z = -0.10;
const HUD_W = 0.50, HUD_H = 0.34, HUD_Z = 0.78, HUD_CY = 0.32;

export function buildCockpit(spec) {
  const cfg = spec.cockpit || {};
  const style = cfg.style || 'west';
  const s = spec.len / 15;
  const west = style === 'west';

  const panelCol = cfg.panel || (west ? 0x2b3138 : 0x1e3b34);
  const seatCol = cfg.seat || 0x1b1f25;
  const accentCol = west ? 0x3a4550 : 0x274a3f;
  const glowCol = west ? 0x66d9a0 : 0xffd070;

  const g = new THREE.Group();
  g.name = 'Cockpit';
  g.position.set(0, 0.02 * s, 1.62 * s);

  const EYE = new THREE.Vector3(0, EYE_Y * s, EYE_Z * s);

  const mat = (c, rough = 0.85, metal = 0.1) =>
    new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal });
  const shellMat = mat(0x181c22, 0.92, 0.08);
  const rubberMat = mat(0x101215, 0.95, 0.02);

  // ============================================================
  // ۱) ساختار: کف، دیواره‌ها، پشت‌سر
  // ============================================================
  const floor = new THREE.Mesh(new THREE.BoxGeometry(0.96 * s, 0.07 * s, 2.1 * s), rubberMat);
  floor.position.set(0, -0.40 * s, 0.15 * s);
  g.add(floor);
  for (let i = 0; i < 6; i++) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.9 * s, 0.012 * s, 0.018 * s), mat(0x1d2126, 0.9));
    rib.position.set(0, -0.362 * s, -0.5 + i * 0.22);
    g.add(rib);
  }
  for (const sx of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.05 * s, 0.62 * s, 1.35 * s), shellMat);
    wall.position.set(sx * 0.55 * s, -0.10 * s, 0.10 * s);
    g.add(wall);
    const sill = new THREE.Mesh(new THREE.BoxGeometry(0.09 * s, 0.03 * s, 1.3 * s), mat(accentCol, 0.7, 0.3));
    sill.position.set(sx * 0.53 * s, 0.205 * s, 0.10 * s);
    g.add(sill);
  }
  const bulk = new THREE.Mesh(new THREE.BoxGeometry(0.96 * s, 0.85 * s, 0.06 * s), shellMat);
  bulk.position.set(0, 0.0, -0.68 * s);
  g.add(bulk);

  // ============================================================
  // ۲) پنل زنده — همه ابزارها + دو MFD در یک بوم ۱۰۲۴×۴۰۰
  // ============================================================
  // آفتاب‌گیر باریک — کلاهک روی لبه‌ی بالای پنل
  const glare = new THREE.Mesh(new THREE.BoxGeometry(0.94 * s, 0.04 * s, 0.13 * s), shellMat);
  glare.position.set(0, 0.14 * s, 0.55 * s);
  g.add(glare);

  const panelCanvas = document.createElement('canvas');
  panelCanvas.width = 1024; panelCanvas.height = 400;
  const panelTex = new THREE.CanvasTexture(panelCanvas);
  panelTex.colorSpace = THREE.SRGBColorSpace;
  panelTex.anisotropy = 8;
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(0.98 * s, 0.383 * s),
    new THREE.MeshStandardMaterial({
      map: panelTex, roughness: 0.88, metalness: 0.05,
      emissive: 0xffffff, emissiveMap: panelTex, emissiveIntensity: 0.42, // نورافکنی داخلی ابزارها
    })
  );
  panel.position.set(0, 0.015 * s, 0.575 * s);
  panel.rotation.set(-0.55, Math.PI, 0, 'YXZ');   // پنل به سمت چشم خلبان خوابیده
  g.add(panel);

  // ============================================================
  // ۳) شیشه HUD — فقط نشانه‌گذاری روی شیشه، قاب لبه‌باز
  // ============================================================
  const hudCanvas = document.createElement('canvas');
  hudCanvas.width = 512; hudCanvas.height = 356;
  const hudTex = new THREE.CanvasTexture(hudCanvas);
  hudTex.colorSpace = THREE.SRGBColorSpace;
  const hudGlass = new THREE.Mesh(
    new THREE.PlaneGeometry(HUD_W * s, HUD_H * s),
    new THREE.MeshBasicMaterial({ map: hudTex, transparent: true, depthWrite: false, side: THREE.DoubleSide })
  );
  hudGlass.position.set(0, HUD_CY * s, HUD_Z * s);
  hudGlass.rotation.set(-0.06, Math.PI, 0, 'YXZ');
  g.add(hudGlass);
  // قاب: چهار میله باریک دور شیشه
  const rimMat = mat(accentCol, 0.5, 0.6);
  const rimH = new THREE.BoxGeometry((HUD_W + 0.04) * s, 0.022 * s, 0.016 * s);
  const rimV = new THREE.BoxGeometry(0.022 * s, (HUD_H + 0.04) * s, 0.016 * s);
  const rimTop = new THREE.Mesh(rimH, rimMat); rimTop.position.set(0, (HUD_CY + HUD_H / 2 + 0.02) * s, HUD_Z * s);
  const rimBot = new THREE.Mesh(rimH, rimMat); rimBot.position.set(0, (HUD_CY - HUD_H / 2 - 0.02) * s, HUD_Z * s);
  const rimL = new THREE.Mesh(rimV, rimMat); rimL.position.set(-((HUD_W + 0.04) / 2) * s, HUD_CY * s, HUD_Z * s);
  const rimR = new THREE.Mesh(rimV, rimMat); rimR.position.set(((HUD_W + 0.04) / 2) * s, HUD_CY * s, HUD_Z * s);
  g.add(rimTop, rimBot, rimL, rimR);
  // نگاشت زاویه‌ای HUD — بورسایت (خط口径) کجا روی بوم می‌افتد
  const hudAng = {
    x: Math.atan((HUD_W * s / 2) / ((HUD_Z - EYE_Z) * s)),
    y: Math.atan((HUD_H * s / 2) / ((HUD_Z - EYE_Z) * s)),
    boresight: (HUD_CY - EYE_Y) / HUD_H,   // نسبت عمودی خط口径 روی بوم
  };

  // ============================================================
  // ۴) پایه وسط + کنسول‌های جانبی + کلیدها
  // ============================================================
  // پایه کوتاه بین زانوها — جلوی پنل را نمی‌گیرد
  const pedestal = new THREE.Mesh(new THREE.BoxGeometry(0.34 * s, 0.30 * s, 0.44 * s), mat(panelCol));
  pedestal.position.set(0, -0.30 * s, 0.12 * s);
  g.add(pedestal);
  const pedTop = new THREE.Mesh(new THREE.BoxGeometry(0.36 * s, 0.03 * s, 0.46 * s), mat(accentCol, 0.6, 0.3));
  pedTop.position.set(0, -0.145 * s, 0.12 * s);
  g.add(pedTop);
  const leds = [];
  for (const sx of [-1, 1]) {
    const con = new THREE.Mesh(new THREE.BoxGeometry(0.22 * s, 0.14 * s, 0.85 * s), mat(panelCol));
    con.position.set(sx * 0.52 * s, -0.06 * s, 0.18 * s);
    g.add(con);
    for (let i = 0; i < 5; i++) {
      const sw = new THREE.Mesh(new THREE.BoxGeometry(0.014 * s, 0.032 * s, 0.014 * s), mat(0xd8d4c8, 0.5, 0.2));
      sw.position.set(sx * 0.50 * s, 0.012 * s, -0.05 + i * 0.075 * s);
      sw.rotation.x = (i % 2 ? 0.5 : -0.5);
      g.add(sw);
    }
    for (let i = 0; i < 6; i++) {
      const led = new THREE.Mesh(
        new THREE.SphereGeometry(0.011 * s, 6, 4),
        new THREE.MeshBasicMaterial({ color: i % 3 === 0 ? glowCol : 0x30404a })
      );
      led.position.set(sx * (0.48 + Math.random() * 0.07) * s, 0.005 * s, 0.30 + i * 0.08 * s);
      g.add(led);
      leds.push(led);
    }
  }

  // ============================================================
  // ۵) استیک + دست راست | اهرم گاز + دست چپ
  // ============================================================
  const stickGroup = new THREE.Group();
  const side = cfg.sideStick ? 1 : 0;
  // راست خلبان = -x در دستگاه محلی (y بالا، z دماغه) — استیک کناری سمت راست
  const stickX = side ? -0.30 * s : 0;
  const stickY = side ? -0.10 * s : -0.12 * s;
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.024 * s, 0.034 * s, 0.26 * s, 8), mat(0x14181d, 0.6, 0.3));
  stick.position.y = 0.12 * s;
  const grip = new THREE.Mesh(new THREE.SphereGeometry(0.042 * s, 10, 8), mat(0x0d1013, 0.5, 0.2));
  grip.position.y = 0.26 * s;
  grip.scale.set(0.8, 1.1, 0.65);
  const fireBtn = new THREE.Mesh(new THREE.SphereGeometry(0.012 * s, 6, 5), mat(0xb02020, 0.4));
  fireBtn.position.set(0, 0.325 * s, 0.016 * s);
  stickGroup.add(stick, grip, fireBtn);
  const rHand = new THREE.Mesh(new THREE.CapsuleGeometry(0.038 * s, 0.055 * s, 3, 8), mat(0x3a4433, 0.7));
  rHand.position.set(0.012 * s, 0.27 * s, 0.018 * s);
  rHand.rotation.set(0.9, 0, 0.3);
  stickGroup.add(rHand);
  stickGroup.position.set(stickX, stickY, 0.40 * s);
  g.add(stickGroup);

  const throttleGroup = new THREE.Group();
  const throttleLever = new THREE.Mesh(new THREE.BoxGeometry(0.045 * s, 0.045 * s, 0.16 * s), mat(0x14181d, 0.6));
  throttleLever.position.set(0, 0.05 * s, 0);
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.026 * s, 0.026 * s, 0.05 * s, 10), mat(0x20262c, 0.5));
  knob.rotation.x = Math.PI / 2;
  knob.position.set(0, 0.07 * s, -0.05 * s);
  const lHand = new THREE.Mesh(new THREE.CapsuleGeometry(0.038 * s, 0.055 * s, 3, 8), mat(0x3a4433, 0.7));
  lHand.position.set(0, 0.07 * s, 0.05 * s);
  lHand.rotation.set(1.2, 0, -0.2);
  throttleGroup.add(throttleLever, knob, lHand);
  throttleGroup.position.set(side ? 0.20 * s : 0.14 * s, -0.125 * s, 0.24 * s);
  g.add(throttleGroup);
  // نور داخلی کابین — گرم و کم، فقط برای خوانایی ابزارها
  const cabLight = new THREE.PointLight(0xffe8c0, 0.4, 2.6 * s, 1.8);
  cabLight.position.set(0, 0.42 * s, 0.30 * s);
  g.add(cabLight);

  // ============================================================
  // ۶) پدال سکان + پاها + چکمه
  // ============================================================
  const pedals = [];
  for (const sx of [-1, 1]) {
    const ped = new THREE.Mesh(new THREE.BoxGeometry(0.085 * s, 0.16 * s, 0.02 * s), mat(0x0f1215, 0.6, 0.3));
    ped.position.set(sx * 0.13 * s, -0.34 * s, 0.50 * s);
    ped.rotation.x = -0.15;
    g.add(ped);
    pedals.push(ped);
  }
  const legMat = mat(0x2e3a2a, 0.8);
  const bootMat = mat(0x14100c, 0.7);
  for (const sx of [-1, 1]) {
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.062 * s, 0.20 * s, 3, 8), legMat);
    thigh.position.set(sx * 0.115 * s, -0.175 * s, -0.06 * s);
    thigh.rotation.set(-1.18, 0, sx * 0.06);
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.048 * s, 0.20 * s, 3, 8), legMat);
    shin.position.set(sx * 0.125 * s, -0.30 * s, 0.22 * s);
    shin.rotation.set(-0.38, 0, 0);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.075 * s, 0.07 * s, 0.14 * s), bootMat);
    boot.position.set(sx * 0.13 * s, -0.365 * s, 0.435 * s);
    g.add(thigh, shin, boot);
  }

  // ============================================================
  // ۷) صندلی + بندها + دستگیره پرتاب + بدن/سر خلبان
  // ============================================================
  const firstPersonHide = [];
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.50 * s, 0.13 * s, 0.48 * s), mat(seatCol));
  seat.position.set(0, -0.16 * s, -0.30 * s);
  g.add(seat);
  const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.50 * s, 0.62 * s, 0.12 * s), mat(seatCol));
  seatBack.position.set(0, 0.10 * s, -0.52 * s);
  seatBack.rotation.x = 0.14;
  g.add(seatBack);
  const headrest = new THREE.Mesh(new THREE.BoxGeometry(0.30 * s, 0.22 * s, 0.14 * s), mat(seatCol));
  headrest.position.set(0, 0.34 * s, -0.55 * s);
  g.add(headrest);
  for (const sx of [-1, 1]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.07 * s, 0.44 * s, 0.02 * s), mat(0x2f3a2c, 0.85));
    strap.position.set(sx * 0.11 * s, 0.14 * s, -0.455 * s);
    strap.rotation.x = 0.14;
    g.add(strap);
  }
  const pullCanvas = document.createElement('canvas');
  pullCanvas.width = 64; pullCanvas.height = 8;
  const pg = pullCanvas.getContext('2d');
  for (let i = 0; i < 8; i++) { pg.fillStyle = i % 2 ? '#111' : '#e8c418'; pg.fillRect(i * 8, 0, 8, 8); }
  const pullTex = new THREE.CanvasTexture(pullCanvas);
  pullTex.colorSpace = THREE.SRGBColorSpace;
  const ejection = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022 * s, 0.022 * s, 0.30 * s, 10),
    new THREE.MeshStandardMaterial({ map: pullTex, roughness: 0.6 })
  );
  ejection.rotation.z = Math.PI / 2;
  ejection.position.set(0, -0.115 * s, 0.26 * s);
  g.add(ejection);

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.16 * s, 0.24 * s, 4, 8), mat(0x2e3a2a));
  body.position.set(0, 0.10 * s, -0.38 * s);
  body.rotation.x = 0.22;
  g.add(body);
  const headGroup = new THREE.Group();
  headGroup.position.copy(EYE);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.125 * s, 10, 8), mat(0xd8dcd4, 0.4));
  const visor = new THREE.Mesh(
    new THREE.SphereGeometry(0.12 * s, 10, 6, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.35),
    mat(0x22262c, 0.2, 0.8)
  );
  visor.rotation.x = 0.35;
  headGroup.add(helmet, visor);
  g.add(headGroup);
  firstPersonHide.push(body, headGroup);

  // ============================================================
  // ۸) قاب کانوپی + شیشه خراش‌دار + آینه عقب
  // ============================================================
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x79828b, roughness: 0.42, metalness: 0.7 });
  for (const sx of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05 * s, 0.05 * s, 1.55 * s), frameMat);
    rail.position.set(sx * 0.53 * s, 0.235 * s, 0.10 * s);
    g.add(rail);
  }
  // کمان‌های کانوپی — در صفحه XY می‌مانند (قوس چپ-راست روی عرض کابین)
  const archF = new THREE.Mesh(new THREE.TorusGeometry(0.545 * s, 0.026 * s, 6, 16, Math.PI), frameMat);
  archF.position.set(0, 0.24 * s, 0.82 * s);
  g.add(archF);
  const archR = new THREE.Mesh(new THREE.TorusGeometry(0.545 * s, 0.024 * s, 6, 16, Math.PI), frameMat);
  archR.position.set(0, 0.24 * s, -0.62 * s);
  g.add(archR);

  const mirror = new THREE.Mesh(
    new THREE.BoxGeometry(0.20 * s, 0.055 * s, 0.015 * s),
    new THREE.MeshPhysicalMaterial({ color: 0x9aa4ad, roughness: 0.05, metalness: 1.0, envMapIntensity: 1.6 })
  );
  mirror.position.set(0, 0.44 * s, 0.80 * s);
  mirror.rotation.x = 0.35;
  g.add(mirror);
  const mirrorArm = new THREE.Mesh(new THREE.CylinderGeometry(0.008 * s, 0.008 * s, 0.05 * s, 6), frameMat);
  mirrorArm.position.set(0, 0.475 * s, 0.815 * s);
  g.add(mirrorArm);

  const scrCanvas = document.createElement('canvas');
  scrCanvas.width = scrCanvas.height = 256;
  {
    const sg = scrCanvas.getContext('2d');
    sg.fillStyle = '#000';
    sg.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 26; i++) {
      sg.strokeStyle = `rgba(255,255,255,${0.05 + Math.random() * 0.16})`;
      sg.lineWidth = Math.random() * 1.4;
      sg.beginPath();
      const x = Math.random() * 256, y = Math.random() * 256;
      sg.moveTo(x, y);
      sg.lineTo(x + (Math.random() - 0.5) * 90, y + (Math.random() - 0.5) * 40);
      sg.stroke();
    }
    for (let i = 0; i < 220; i++) {
      sg.fillStyle = `rgba(255,255,255,${0.04 + Math.random() * 0.10})`;
      sg.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 1.5);
    }
  }
  const scrTex = new THREE.CanvasTexture(scrCanvas);
  const glassMat = () => new THREE.MeshPhysicalMaterial({
    color: 0x2a4a60, transparent: true, opacity: 0.09, roughness: 0.04,
    roughnessMap: scrTex, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05,
    envMapIntensity: 0.55, side: THREE.DoubleSide, depthWrite: false,
  });
  for (const sx of [-1, 1]) {
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(1.3 * s, 0.42 * s), glassMat());
    sg.position.set(sx * 0.575 * s, 0.33 * s, 0.10 * s);
    sg.rotation.y = Math.PI / 2;
    g.add(sg);
  }
  const topGlass = new THREE.Mesh(
    new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    glassMat()
  );
  topGlass.scale.set(0.55 * s, 0.42 * s, 1.15 * s);
  topGlass.position.set(0, 0.26 * s, 0.10 * s);
  g.add(topGlass);

  g.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });

  // ============================================================
  return {
    group: g,
    eyeLocal: EYE,
    firstPersonHide,
    stickGroup, throttle: throttleGroup, pedals,
    mfds: [], leds, headGroup,
    camOffset: new THREE.Vector3(),
    hudAng,
    panelT: 0, hudT: 0, rpm: 0, frame: 0,

    update(dt, aircraft, game) {
      const inp = aircraft.input;
      const st = aircraft.st;
      stickGroup.rotation.z = THREE.MathUtils.clamp(inp.roll, -1, 1) * 0.45;
      stickGroup.rotation.x = THREE.MathUtils.clamp(inp.pitch, -1, 1) * 0.35;
      throttleGroup.rotation.x = -0.55 + st.throttle * 0.85;
      const rud = THREE.MathUtils.clamp(inp.yaw || 0, -1, 1);
      pedals[0].position.z = (0.50 + rud * 0.035) * s;
      pedals[1].position.z = (0.50 - rud * 0.035) * s;
      if (game && game.controls) {
        const look = game.controls.look;
        headGroup.rotation.y = THREE.MathUtils.clamp(look.yaw, -1.2, 1.2) * 0.75;
        headGroup.rotation.x = THREE.MathUtils.clamp(-look.pitch, -0.6, 0.6) * 0.7;
      }
      const blink = (Date.now() / 400 | 0) % 2 === 0;
      const warn = st.stalled || aircraft.hp < aircraft.hpMax * 0.3;
      for (let i = 0; i < leds.length; i++) {
        const isWarn = warn && i % 3 === 0;
        leds[i].material.color.setHex(isWarn ? (blink ? 0xff3030 : 0x551010) : (i % 3 === 0 ? glowCol : 0x30404a));
      }

      // حرکت سر: G + لرزش + پس‌زنی توپ
      const firing = inp.fire && aircraft.gunAmmo > 0;
      const rpmTarget = st.throttle * 100 + (st.ab ? 6 : 0);
      this.rpm += (rpmTarget - this.rpm) * Math.min(1, dt * 1.1);
      const vibAmp = (0.0006 + st.throttle * 0.0016 + (st.ab ? 0.0022 : 0) +
                      (st.stalled ? 0.006 : 0) + (firing ? 0.0014 : 0)) * s;
      const t = performance.now() * 0.001;
      this.camOffset.set(
        (Math.sin(t * 213) + Math.sin(t * 97) * 0.6) * vibAmp,
        Math.cos(t * 179) * vibAmp - (st.gForce - 1) * 0.014 * s,
        0
      );
      if (st.blackout > 0.4) this.camOffset.y -= (st.blackout - 0.4) * 0.05 * s;

      // بوم‌ها
      this.frame++;
      this.panelT -= dt;
      if (this.panelT <= 0) {
        this.panelT = 0.11;
        drawPanelLive(panelCanvas, panelTex, aircraft, game, west, glowCol, this.rpm);
      }
      this.hudT -= dt;
      if (this.hudT <= 0) {
        this.hudT = 1 / 30;
        drawHUD(hudCanvas, hudTex, aircraft, game, west, hudAng);
      }
    },
  };
}

// ============================================================
// پنل زنده — همه چیز در یک بوم
// ============================================================
function drawPanelLive(canvas, tex, aircraft, game, west, glow, rpm) {
  const g = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const st = aircraft.st;
  const phos = PHOS(west);

  const bg = '#' + new THREE.Color(aircraft.spec.cockpit?.panel || (west ? 0x2b3138 : 0x1e3b34)).getHexString();
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, shade(bg, 1.22));
  grad.addColorStop(0.5, bg);
  grad.addColorStop(1, shade(bg, 0.72));
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  for (const [x, y] of [[14, 14], [W - 14, 14], [14, H - 14], [W - 14, H - 14], [W / 2, 10], [W / 2, H - 10]]) {
    g.fillStyle = '#11161b';
    g.beginPath(); g.arc(x, y, 4.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#3c454e';
    g.beginPath(); g.arc(x - 1.2, y - 1.2, 1.6, 0, Math.PI * 2); g.fill();
  }

  // ---------- ردیف چراغ هشدار ----------
  const blink = (Date.now() / 380 | 0) % 2 === 0;
  const lamps = [
    ['MASTER', aircraft.hp < aircraft.hpMax * 0.35, '#ff4040'],
    ['STALL', st.stalled, '#ff4040'],
    ['GEAR', st.gear, '#5fd06f'],
    ['FUEL', st.fuel < aircraft.spec.fuelCap * 0.18, '#ffb340'],
    ['FIRE', aircraft.engineFire === true, '#ff4040'],
    ['MSL', aircraft.missiles === 0, '#ffb340'],
    ['OVER-G', st.gForce > 8, '#ff4040'],
  ];
  for (let i = 0; i < lamps.length; i++) {
    const [name, on, col] = lamps[i];
    const x = 22 + i * 142;
    g.fillStyle = on ? (blink ? col : shade(col, 0.35)) : '#10151a';
    g.fillRect(x, 10, 126, 26);
    g.strokeStyle = on ? '#fff8' : '#2a333c';
    g.lineWidth = 1.5;
    g.strokeRect(x, 10, 126, 26);
    g.fillStyle = on ? '#fff' : '#39434d';
    g.font = 'bold 15px monospace';
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.fillText(name, x + 63, 29);
  }

  // ---------- ردیف اصلی: سرعت | افق | ارتفاع | واریومتر | قطب‌نما ----------
  drawASI(g, 118, 168, 88, st.V * 3.6, phos);
  drawAttitude(g, 328, 168, 100, aircraft, phos);
  drawAltimeter(g, 538, 168, 88, st.pos.y, phos);
  drawVSI(g, 726, 168, 74, st.vel.y, phos);
  _fwd.set(0, 0, 1).applyQuaternion(st.quat);
  drawCompass(g, 902, 168, 68, (Math.atan2(_fwd.x, _fwd.z) * DEG + 360) % 360, phos);

  // ---------- ردیف پایین: دو MFD + دور | جی | سوخت/گاز | وضعیت ----------
  drawMfdBezel(g, 22, 262, 210, 126);
  drawRadarMfdInto(g, 26, 266, 202, 118, aircraft, game, west);
  drawMfdBezel(g, 244, 262, 210, 126);
  drawStatusMfdInto(g, 248, 266, 202, 118, aircraft, west);

  drawRPM(g, 512, 325, 52, rpm, st.ab, phos);
  drawGmeter(g, 634, 325, 46, st.gForce, phos);
  drawFuelThr(g, 700, 300, st.fuel / aircraft.spec.fuelCap, st.throttle, st.ab, phos);
  drawStoreBlock(g, 700, 356, aircraft, phos);
  drawGearBlock(g, 880, 300, st, phos);

  tex.needsUpdate = true;
}

function shade(hex, f) {
  const c = new THREE.Color(hex);
  c.r = Math.min(1, c.r * f); c.g = Math.min(1, c.g * f); c.b = Math.min(1, c.b * f);
  return '#' + c.getHexString();
}

// ---------- قاب MFD روی پنل ----------
function drawMfdBezel(g, x, y, w, h) {
  g.fillStyle = '#191e24';
  g.fillRect(x - 6, y - 6, w + 12, h + 12);
  g.strokeStyle = '#39434d'; g.lineWidth = 2;
  g.strokeRect(x - 6, y - 6, w + 12, h + 12);
  for (const [bx, by] of [[x - 14, y + h / 2], [x + w + 14, y + h / 2]]) {
    g.fillStyle = '#0d1114';
    g.beginPath(); g.arc(bx, by, 4, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#4a545e'; g.stroke();
  }
}

// ---------- افق مصنوعی ----------
function drawAttitude(g, cx, cy, R, aircraft, phos) {
  const st = aircraft.st;
  _fwd.set(0, 0, 1).applyQuaternion(st.quat);
  _upL.set(0, 1, 0).applyQuaternion(_q.copy(st.quat).invert());
  const pitch = Math.asin(THREE.MathUtils.clamp(_fwd.y, -1, 1)) * DEG;
  const roll = Math.atan2(_upL.x, _upL.y);

  g.save();
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.clip();
  g.translate(cx, cy);
  g.rotate(-roll);
  const pxPerDeg = R / 45;
  const yOff = pitch * pxPerDeg;
  const skyG = g.createLinearGradient(0, -R * 2 + yOff, 0, yOff);
  skyG.addColorStop(0, '#2e5f8f'); skyG.addColorStop(1, '#7fb2d9');
  g.fillStyle = skyG;
  g.fillRect(-R * 2, -R * 2 + yOff, R * 4, R * 2);
  const grG = g.createLinearGradient(0, yOff, 0, R * 2 + yOff);
  grG.addColorStop(0, '#8a6a42'); grG.addColorStop(1, '#4c3a24');
  g.fillStyle = grG;
  g.fillRect(-R * 2, yOff, R * 4, R * 2);
  g.strokeStyle = '#f2f5f7'; g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(-R * 2, yOff); g.lineTo(R * 2, yOff); g.stroke();
  g.fillStyle = '#f2f5f7'; g.font = '11px monospace'; g.textAlign = 'center';
  for (const p of [-30, -20, -10, 10, 20, 30]) {
    const y = yOff - p * pxPerDeg;
    const w = p % 20 === 0 ? 30 : 18;
    g.strokeStyle = '#e8ecef'; g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-w, y); g.lineTo(w, y);
    if (p > 0) { g.moveTo(-w, y); g.lineTo(-w, y - 6); g.moveTo(w, y); g.lineTo(w, y - 6); }
    else { g.moveTo(-w, y); g.lineTo(-w, y + 6); g.moveTo(w, y); g.lineTo(w, y + 6); }
    g.stroke();
    g.fillText(String(Math.abs(p)), -w - 11, y + 4);
    g.fillText(String(Math.abs(p)), w + 11, y + 4);
  }
  g.restore();
  g.strokeStyle = '#ffd23e'; g.lineWidth = 3;
  g.beginPath();
  g.moveTo(cx - R * 0.62, cy); g.lineTo(cx - R * 0.2, cy); g.lineTo(cx - R * 0.1, cy + 8);
  g.moveTo(cx + R * 0.62, cy); g.lineTo(cx + R * 0.2, cy); g.lineTo(cx + R * 0.1, cy + 8);
  g.moveTo(cx, cy - 4); g.lineTo(cx, cy + 2);
  g.stroke();
  g.strokeStyle = '#cfd6db'; g.lineWidth = 2;
  for (const a of [-60, -45, -30, -15, 0, 15, 30, 45, 60]) {
    const rad = (a - 90) * Math.PI / 180;
    const l = a % 30 === 0 ? 10 : 6;
    g.beginPath();
    g.moveTo(cx + Math.cos(rad) * R, cy + Math.sin(rad) * R);
    g.lineTo(cx + Math.cos(rad) * (R - l), cy + Math.sin(rad) * (R - l));
    g.stroke();
  }
  g.save();
  g.translate(cx, cy);
  g.rotate(-roll);
  g.fillStyle = '#ffd23e';
  g.beginPath(); g.moveTo(0, -R + 4); g.lineTo(-6, -R + 16); g.lineTo(6, -R + 16); g.closePath(); g.fill();
  g.restore();
  g.strokeStyle = '#39434d'; g.lineWidth = 3;
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = '#556068'; g.lineWidth = 1.5;
  g.beginPath(); g.arc(cx, cy, R + 4, 0, Math.PI * 2); g.stroke();
  const slip = THREE.MathUtils.clamp(-(_upL.x || 0) * 3, -1, 1);
  g.fillStyle = '#10151a'; g.fillRect(cx - 22, cy + R - 10, 44, 9);
  g.fillStyle = '#e8ecef';
  g.fillRect(cx + slip * 15 - 4, cy + R - 10, 8, 9);
  g.fillStyle = phos; g.font = 'bold 11px monospace'; g.textAlign = 'center';
  g.fillText('ADI', cx, cy + R + 16);
}

// ---------- سرعت‌سنج ----------
function drawASI(g, cx, cy, R, kmh, phos) {
  dialBase(g, cx, cy, R);
  const VMAX = 1400;
  const a0 = 0.75 * Math.PI, a1 = 2.25 * Math.PI;
  g.strokeStyle = '#c03030'; g.lineWidth = 5;
  g.beginPath();
  g.arc(cx, cy, R - 10, a0 + (a1 - a0) * (1150 / VMAX), a1);
  g.stroke();
  g.strokeStyle = '#aeb6bd'; g.lineWidth = 2;
  g.fillStyle = '#c3cad0'; g.font = '11px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let v = 0; v <= VMAX; v += 100) {
    const a = a0 + (a1 - a0) * (v / VMAX);
    const l = v % 200 === 0 ? 12 : 7;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    g.lineTo(cx + Math.cos(a) * (R - l), cy + Math.sin(a) * (R - l));
    g.stroke();
    if (v % 200 === 0) g.fillText(String(v / 100), cx + Math.cos(a) * (R - 26), cy + Math.sin(a) * (R - 26));
  }
  const a = a0 + (a1 - a0) * (THREE.MathUtils.clamp(kmh, 0, VMAX) / VMAX);
  needle(g, cx, cy, R - 22, a, 4, '#f5f7f8');
  g.fillStyle = phos; g.font = 'bold 14px monospace';
  g.fillText(String(Math.round(kmh)), cx, cy + R * 0.48);
  g.fillStyle = '#8b959e'; g.font = '10px monospace';
  g.fillText('KM/H', cx, cy - R * 0.42);
}

// ---------- ارتفاع‌سنج ----------
function drawAltimeter(g, cx, cy, R, altM, phos) {
  dialBase(g, cx, cy, R);
  g.strokeStyle = '#aeb6bd'; g.lineWidth = 2;
  g.fillStyle = '#c3cad0'; g.font = '12px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    g.lineTo(cx + Math.cos(a) * (R - 11), cy + Math.sin(a) * (R - 11));
    g.stroke();
    g.fillText(String(i), cx + Math.cos(a) * (R - 25), cy + Math.sin(a) * (R - 25));
  }
  const a100 = ((altM % 1000) / 1000) * Math.PI * 2 - Math.PI / 2;
  const a1000 = ((altM % 10000) / 10000) * Math.PI * 2 - Math.PI / 2;
  needle(g, cx, cy, R - 30, a1000, 3, '#d7dde1');
  needle(g, cx, cy, R - 19, a100, 4, '#f5f7f8');
  g.fillStyle = '#05070a'; g.fillRect(cx - 36, cy - 12, 72, 20);
  g.strokeStyle = '#39434d'; g.strokeRect(cx - 36, cy - 12, 72, 20);
  g.fillStyle = phos; g.font = 'bold 15px monospace';
  g.fillText(String(Math.max(0, Math.round(altM))), cx, cy - 1);
  g.fillStyle = '#8b959e'; g.font = '10px monospace';
  g.fillText('M', cx, cy - R * 0.42);
}

// ---------- واریومتر ----------
function drawVSI(g, cx, cy, R, vy, phos) {
  dialBase(g, cx, cy, R);
  const VMAX = 150;
  g.strokeStyle = '#aeb6bd'; g.lineWidth = 2;
  g.fillStyle = '#c3cad0'; g.font = '10px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let v = -150; v <= 150; v += 25) {
    const aa = Math.PI * 1.5 - (v / VMAX) * (Math.PI * 0.8);
    const l = v % 50 === 0 ? 11 : 6;
    g.beginPath();
    g.moveTo(cx + Math.cos(aa) * R, cy + Math.sin(aa) * R);
    g.lineTo(cx + Math.cos(aa) * (R - l), cy + Math.sin(aa) * (R - l));
    g.stroke();
    if (v % 50 === 0 && v !== 0) g.fillText(String(Math.abs(v)), cx + Math.cos(aa) * (R - 23), cy + Math.sin(aa) * (R - 23));
  }
  const a = Math.PI * 1.5 - THREE.MathUtils.clamp(vy, -VMAX, VMAX) / VMAX * (Math.PI * 0.8);
  needle(g, cx, cy, R - 17, a, 3.2, '#f5f7f8');
  g.fillStyle = phos; g.font = 'bold 11px monospace';
  g.fillText((vy >= 0 ? '+' : '') + Math.round(vy), cx, cy + R * 0.55);
  g.fillStyle = '#8b959e'; g.font = '9px monospace';
  g.fillText('m/s', cx, cy - R * 0.42);
}

// ---------- قطب‌نما ----------
function drawCompass(g, cx, cy, R, hdg, phos) {
  dialBase(g, cx, cy, R);
  g.save();
  g.translate(cx, cy);
  g.rotate(-hdg * Math.PI / 180);
  g.fillStyle = '#c3cad0'; g.font = '10px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.strokeStyle = '#aeb6bd'; g.lineWidth = 1.5;
  for (let d = 0; d < 360; d += 15) {
    const a = (d / 360) * Math.PI * 2 - Math.PI / 2;
    g.beginPath();
    g.moveTo(Math.cos(a) * R, Math.sin(a) * R);
    g.lineTo(Math.cos(a) * (R - (d % 45 === 0 ? 9 : 4)), Math.sin(a) * (R - (d % 45 === 0 ? 9 : 4)));
    g.stroke();
    if (d % 90 === 0) {
      const lbl = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[d];
      g.fillText(lbl, Math.cos(a) * (R - 17), Math.sin(a) * (R - 17));
    } else if (d % 45 === 0) {
      g.fillText(String(d / 10), Math.cos(a) * (R - 17), Math.sin(a) * (R - 17));
    }
  }
  g.restore();
  g.strokeStyle = '#ffd23e'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(cx, cy - R + 2); g.lineTo(cx, cy - R + 11); g.stroke();
  g.fillStyle = phos; g.font = 'bold 12px monospace';
  g.fillText(String(Math.round(hdg)).padStart(3, '0'), cx, cy + 5);
}

// ---------- دور موتور ----------
function drawRPM(g, cx, cy, R, rpm, ab, phos) {
  dialBase(g, cx, cy, R);
  const a0 = 0.75 * Math.PI, a1 = 2.25 * Math.PI;
  g.strokeStyle = '#aeb6bd'; g.lineWidth = 1.6;
  g.fillStyle = '#c3cad0'; g.font = '9px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let v = 0; v <= 110; v += 10) {
    const a = a0 + (a1 - a0) * (v / 110);
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    g.lineTo(cx + Math.cos(a) * (R - (v % 20 === 0 ? 9 : 5)), cy + Math.sin(a) * (R - (v % 20 === 0 ? 9 : 5)));
    g.stroke();
  }
  const a = a0 + (a1 - a0) * (THREE.MathUtils.clamp(rpm, 0, 110) / 110);
  needle(g, cx, cy, R - 12, a, 2.6, '#f5f7f8');
  g.fillStyle = ab ? '#ff9040' : phos; g.font = 'bold 11px monospace';
  g.fillText(Math.round(rpm) + '%', cx, cy + R * 0.5);
  g.fillStyle = '#8b959e'; g.font = '9px monospace';
  g.fillText(ab ? 'A/B' : 'RPM', cx, cy - R * 0.42);
}

// ---------- جی‌متر ----------
function drawGmeter(g, cx, cy, R, gf, phos) {
  dialBase(g, cx, cy, R);
  const g0 = -2, g1 = 9;
  const a0 = Math.PI * 0.85, a1 = Math.PI * 2.15;
  g.strokeStyle = '#aeb6bd'; g.lineWidth = 1.6;
  g.fillStyle = '#c3cad0'; g.font = '9px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let v = g0; v <= g1; v += 1) {
    const a = a0 + (a1 - a0) * ((v - g0) / (g1 - g0));
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    g.lineTo(cx + Math.cos(a) * (R - (v % 2 === 0 ? 8 : 4)), cy + Math.sin(a) * (R - (v % 2 === 0 ? 8 : 4)));
    g.stroke();
    if (v % 2 === 0) g.fillText(String(v), cx + Math.cos(a) * (R - 16), cy + Math.sin(a) * (R - 16));
  }
  const a = a0 + (a1 - a0) * (THREE.MathUtils.clamp(gf, g0, g1) - g0) / (g1 - g0);
  needle(g, cx, cy, R - 10, a, 2.6, gf > 8 ? '#ff5050' : '#f5f7f8');
  g.fillStyle = phos; g.font = 'bold 12px monospace';
  g.fillText(gf.toFixed(1) + 'G', cx, cy + R * 0.55);
}

// ---------- سوخت + گاز ----------
function drawFuelThr(g, x, y, fuel, thr, ab, phos) {
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.fillStyle = '#8b959e'; g.font = '11px monospace';
  g.fillText('FUEL', x, y - 4);
  g.fillStyle = '#10151a'; g.fillRect(x, y, 104, 13);
  g.fillStyle = fuel < 0.18 ? (Math.floor(Date.now() / 400) % 2 ? '#ffb340' : '#7a5018') : '#ffb340';
  g.fillRect(x + 2, y + 2, 100 * Math.max(0, fuel), 9);
  g.strokeStyle = '#39434d'; g.strokeRect(x, y, 104, 13);
  g.fillStyle = phos; g.font = '10px monospace';
  g.fillText(Math.round(fuel * 100) + '%', x + 110, y + 11);

  g.fillStyle = '#8b959e'; g.font = '11px monospace';
  g.fillText('THR', x, y + 28);
  g.fillStyle = '#10151a'; g.fillRect(x, y + 32, 104, 13);
  g.fillStyle = ab ? '#ff9040' : '#5fd06f';
  g.fillRect(x + 2, y + 34, 100 * Math.max(0, Math.min(1, thr)), 9);
  g.strokeStyle = '#39434d'; g.strokeRect(x, y + 32, 104, 13);
  g.fillStyle = phos; g.font = '10px monospace';
  g.fillText(Math.round(thr * 100) + '%' + (ab ? ' AB' : ''), x + 110, y + 43);
}

// ---------- بلوک مهمات ----------
function drawStoreBlock(g, x, y, aircraft, phos) {
  g.textAlign = 'left'; g.font = '12px monospace'; g.textBaseline = 'alphabetic';
  g.fillStyle = '#c3cad0';
  g.fillText(`GUN ${aircraft.gunAmmo}   MSL ${aircraft.missiles}`, x, y + 6);
  g.fillText(`BMB ${aircraft.bombs}   RKT ${aircraft.rockets}`, x, y + 24);
  g.fillText(`FLR ${aircraft.flares}   CHF ${aircraft.chaff}`, x, y + 42);
}

// ---------- بلوک چرخ/فلپ/ترمز ----------
function drawGearBlock(g, x, y, st, phos) {
  const blink = Math.floor(Date.now() / 400) % 2 === 0;
  const item = (label, on, col, yy) => {
    g.font = 'bold 11px monospace';
    g.fillStyle = on ? col : '#39434d';
    g.fillText(label, x, yy);
    g.fillStyle = on ? col : '#10151a';
    g.fillRect(x + 62, yy - 9, 26, 10);
    if (on && blink) { g.strokeStyle = col; g.strokeRect(x + 62, yy - 9, 26, 10); }
  };
  g.textAlign = 'left';
  item('GEAR', st.gear, '#5fd06f', y);
  item('FLAP', st.flaps > 0.05, '#8ac4ff', y + 18);
  item('BRK', !!st.brake, '#ffb340', y + 36);
  g.font = '11px monospace';
  g.fillStyle = '#8b959e';
  g.fillText(`MACH ${st.mach.toFixed(2)}`, x, y + 58);
  g.fillText(`AOA ${(st.alpha * DEG).toFixed(0)}°`, x, y + 74);
}

function dialBase(g, cx, cy, R) {
  const rim = g.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.2, cx, cy, R);
  rim.addColorStop(0, '#2c343c'); rim.addColorStop(1, '#171c22');
  g.fillStyle = rim;
  g.beginPath(); g.arc(cx, cy, R + 3, 0, Math.PI * 2); g.fill();
  g.fillStyle = FACE;
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
}

function needle(g, cx, cy, len, ang, w, col) {
  g.save();
  g.translate(cx, cy);
  g.rotate(ang + Math.PI / 2);
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(-w, len * 0.18);
  g.lineTo(-w * 0.4, -len);
  g.lineTo(w * 0.4, -len);
  g.lineTo(w, len * 0.18);
  g.closePath();
  g.fill();
  g.fillStyle = '#22282e';
  g.beginPath(); g.arc(0, 0, w * 1.3, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#5a646e'; g.lineWidth = 1;
  g.beginPath(); g.arc(0, 0, w * 1.3, 0, Math.PI * 2); g.stroke();
  g.restore();
}

// ============================================================
// HUD روی شیشه — نگاشت زاویه‌ای واقعی
// ============================================================
function drawHUD(canvas, tex, ac, game, west, ang) {
  const g = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  g.clearRect(0, 0, W, H);
  const st = ac.st;
  const phos = PHOS(west);
  const cx = W / 2;
  const cyB = H / 2 + ang.boresight * H;    // ردیف بورسایت روی بوم
  const sx = (W / 2) / ang.x;
  const sy = (H / 2) / ang.y;

  _fwd.set(0, 0, 1).applyQuaternion(st.quat);
  _upL.set(0, 1, 0).applyQuaternion(_q.copy(st.quat).invert());
  const pitch = Math.asin(THREE.MathUtils.clamp(_fwd.y, -1, 1));
  const roll = Math.atan2(_upL.x, _upL.y);
  const hdg = (Math.atan2(_fwd.x, _fwd.z) * DEG + 360) % 360;
  const ias = st.V * 3.6;
  const alt = st.pos.y;

  g.strokeStyle = phos; g.fillStyle = phos; g.lineWidth = 1.6;

  // ---------- نردبان افق ----------
  const cy = cyB;
  g.save();
  g.beginPath(); g.rect(6, 6, W - 12, H - 12); g.clip();
  g.translate(cx, cy);
  g.rotate(-roll);
  const pxPerRad = sy;
  const yOff = pitch * pxPerRad;
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(-W, yOff); g.lineTo(-18, yOff); g.moveTo(18, yOff); g.lineTo(W, yOff); g.stroke();
  g.font = '11px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const p of [-30, -20, -10, 10, 20, 30]) {
    const y = yOff - p / DEG * pxPerRad;
    if (Math.abs(y) > H * 0.75) continue;
    const w = p % 20 === 0 ? 42 : 26;
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(-w - 14, y); g.lineTo(-14, y);
    g.moveTo(14, y); g.lineTo(w + 14, y);
    if (p > 0) { g.moveTo(-w - 14, y); g.lineTo(-w - 14, y - 7); g.moveTo(w + 14, y); g.lineTo(w + 14, y - 7); }
    else {
      g.setLineDash([6, 4]);
      g.beginPath();
      g.moveTo(-w - 14, y); g.lineTo(-14, y);
      g.moveTo(14, y); g.lineTo(w + 14, y);
      g.stroke();
      g.setLineDash([]);
    }
    g.fillText(String(Math.abs(p)), -w - 30, y);
    g.fillText(String(Math.abs(p)), w + 30, y);
  }
  g.restore();

  // ---------- نشانگر مسیر پرواز (FPM) ----------
  _v.copy(st.vel);
  if (_v.lengthSq() > 25) {
    _v.applyQuaternion(_q.copy(st.quat).invert()).normalize();
    const fx = Math.atan2(_v.x, _v.z);
    const fy = Math.asin(THREE.MathUtils.clamp(_v.y, -1, 1));
    const fpx = cx + THREE.MathUtils.clamp(fx, -ang.x, ang.x) * sx;
    const fpy = cy - THREE.MathUtils.clamp(fy, -ang.y, ang.y) * sy;
    g.lineWidth = 2;
    g.beginPath(); g.arc(fpx, fpy, 7, 0, Math.PI * 2); g.stroke();
    g.beginPath();
    g.moveTo(fpx - 16, fpy); g.lineTo(fpx - 7, fpy);
    g.moveTo(fpx + 7, fpy); g.lineTo(fpx + 16, fpy);
    g.moveTo(fpx, fpy - 7); g.lineTo(fpx, fpy - 14);
    g.stroke();
  }

  // ---------- نشانگر خط口径 ----------
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(cx - 16, cy); g.lineTo(cx - 5, cy);
  g.moveTo(cx + 5, cy); g.lineTo(cx + 16, cy);
  g.moveTo(cx, cy - 16); g.lineTo(cx, cy - 5);
  g.moveTo(cx, cy + 5); g.lineTo(cx, cy + 16);
  g.stroke();

  // ---------- نوار سرعت ----------
  const tapeL = 62, tapeX = 26;
  tape(g, tapeX, cy, 112, ias, 50, 4, (v) => String(Math.round(v)), 'km/h', false, phos);
  g.font = 'bold 15px monospace'; g.textAlign = 'right'; g.textBaseline = 'middle';
  g.fillStyle = '#04070a'; g.fillRect(tapeX - 4, cy - 11, tapeL + 8, 22);
  g.strokeStyle = phos; g.strokeRect(tapeX - 4, cy - 11, tapeL + 8, 22);
  g.fillStyle = phos;
  g.fillText(String(Math.round(ias)), tapeX + tapeL, cy + 1);
  g.font = '11px monospace';
  g.fillText('M ' + st.mach.toFixed(2), tapeX + tapeL, cy + 25);
  g.fillText('G ' + st.gForce.toFixed(1), tapeX + tapeL, cy - 25);

  // ---------- نوار ارتفاع ----------
  const tapeR = 62, tapeX2 = W - 26 - tapeR;
  tape(g, tapeX2, cy, 112, alt, 100, 3, (v) => String(Math.round(v)), 'm', true, phos);
  g.font = 'bold 15px monospace'; g.textAlign = 'left';
  g.fillStyle = '#04070a'; g.fillRect(tapeX2 - 4, cy - 11, tapeR + 8, 22);
  g.strokeStyle = phos; g.strokeRect(tapeX2 - 4, cy - 11, tapeR + 8, 22);
  g.fillStyle = phos;
  g.fillText(String(Math.round(alt)), tapeX2, cy + 1);
  g.font = '11px monospace';
  const vs = st.vel.y;
  g.fillText((vs >= 0 ? '+' : '') + Math.round(vs) + ' m/s', tapeX2, cy + 25);
  g.fillText('AOA ' + (st.alpha * DEG).toFixed(0) + '°', tapeX2, cy - 25);

  // ---------- نوار جهت ----------
  g.save();
  g.translate(cx, 24);
  g.font = '12px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const ppd = 3.2;
  const base = Math.floor((hdg - 30) / 5) * 5;
  for (let h = base; h <= hdg + 30; h += 5) {
    const x = (h - hdg) * ppd;
    if (Math.abs(x) > 120) continue;
    const hN = ((h % 360) + 360) % 360;
    const major = hN % 10 === 0;
    g.strokeStyle = phos; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(x, major ? 6 : 10); g.lineTo(x, 14); g.stroke();
    if (major) {
      const lbl = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[hN] ?? String(hN / 10);
      g.fillText(lbl, x, 2);
    }
  }
  g.fillStyle = '#04070a'; g.fillRect(-24, 17, 48, 16);
  g.strokeStyle = phos; g.strokeRect(-24, 17, 48, 16);
  g.fillStyle = phos; g.font = 'bold 13px monospace';
  g.fillText(String(Math.round(hdg)).padStart(3, '0') + '°', 0, 25);
  const lt0 = ac.lockTarget;
  if (lt0 && lt0.alive) {
    _v.copy(lt0.st.pos).sub(ac.st.pos).normalize();
    const tH = (Math.atan2(_v.x, _v.z) * DEG + 360) % 360;
    let dh = tH - hdg; while (dh > 180) dh -= 360; while (dh < -180) dh += 360;
    const x = THREE.MathUtils.clamp(dh, -30, 30) * ppd;
    g.beginPath(); g.moveTo(x, 5); g.lineTo(x - 4, -1); g.lineTo(x + 4, -1); g.closePath(); g.fill();
  }
  g.restore();

  // ---------- وضعیت سلاح / هشدار ----------
  g.textAlign = 'left'; g.font = '12px monospace'; g.textBaseline = 'middle';
  g.fillText(`GUN ${ac.gunAmmo}`, 10, H - 40);
  g.fillText(`MSL ${ac.missiles}`, 10, H - 22);
  g.fillText(`FLR ${ac.flares} CHF ${ac.chaff}`, 10, H - 4);
  g.textAlign = 'right';
  g.fillText(st.throttle >= 0.99 ? 'AB' : 'THR ' + Math.round(st.throttle * 100), W - 10, H - 22);
  if (st.gear) g.fillText('GEAR', W - 10, H - 4);
  if (st.stalled && Math.floor(Date.now() / 300) % 2 === 0) {
    g.textAlign = 'center'; g.fillStyle = '#ff5050'; g.font = 'bold 17px monospace';
    g.fillText('STALL', cx, cy - 42);
  }
  const lt = ac.lockTarget;
  if (ac.lockT >= 0.4 && lt && lt.alive) {
    g.textAlign = 'center'; g.font = '12px monospace'; g.fillStyle = phos;
    g.fillText('LOCK ' + Math.round(lt.st.pos.distanceTo(ac.st.pos)) + 'm', cx, 66);
  }

  // ---------- نشانگر هدف + پیپر ----------
  const target = ac.lockTarget;
  if (target && target.alive) {
    const proj = (wp) => {
      _v.copy(wp).sub(ac.st.pos).applyQuaternion(_q.copy(st.quat).invert());
      if (_v.z <= 1) return null;
      const oy = Math.atan2(_v.x, _v.z);
      const op = Math.asin(THREE.MathUtils.clamp(_v.y / _v.length(), -1, 1));
      return {
        x: cx + THREE.MathUtils.clamp(oy / ang.x, -1.15, 1.15) * sx,
        y: cy - THREE.MathUtils.clamp(op / ang.y, -1.15, 1.15) * sy,
        in: Math.abs(oy / ang.x) <= 1 && Math.abs(op / ang.y) <= 1,
      };
    };
    const tp = proj(target.st.pos);
    if (tp) {
      g.lineWidth = 2;
      if (tp.in) {
        g.beginPath();
        g.moveTo(tp.x, tp.y - 11); g.lineTo(tp.x + 11, tp.y); g.lineTo(tp.x, tp.y + 11); g.lineTo(tp.x - 11, tp.y);
        g.closePath(); g.stroke();
      } else {
        const ex = Math.sign(tp.x - cx), ey = Math.sign(tp.y - cy);
        g.beginPath(); g.arc(tp.x, tp.y, 9, 0, Math.PI * 2); g.stroke();
        g.beginPath();
        g.moveTo(tp.x + ex * 14, tp.y + ey * 14);
        g.lineTo(tp.x + ex * 22, tp.y + ey * 22);
        g.stroke();
      }
      const dist = target.st.pos.distanceTo(ac.st.pos);
      if (ac.gunAmmo > 0 && dist < 2600 && target.st.vel.lengthSq() > 100) {
        const t = simcore.lead(
          target.st.pos.x, target.st.pos.y, target.st.pos.z,
          target.st.vel.x, target.st.vel.y, target.st.vel.z,
          ac.st.pos.x, ac.st.pos.y, ac.st.pos.z,
          WEAPONS.gunMv
        );
        if (t > 0 && t < 4) {
          _v.copy(target.st.pos).addScaledVector(target.st.vel, t);
          const lp = proj(_v);
          if (lp && lp.in) {
            g.beginPath(); g.arc(lp.x, lp.y, 4.5, 0, Math.PI * 2); g.stroke();
            g.beginPath(); g.arc(lp.x, lp.y, 1.2, 0, Math.PI * 2); g.fill();
          }
        }
      }
    }
  }

  tex.needsUpdate = true;
}

// نوار عمودی
function tape(g, x, cy, h, value, step, ticksPerLabel, fmt, unit, right, phos) {
  const half = h / 2;
  g.strokeStyle = phos; g.lineWidth = 1.4;
  g.font = '11px monospace';
  const span = (ticksPerLabel * step * 5) / 2;
  const first = Math.ceil((value - span) / step) * step;
  for (let v = first; v <= value + span; v += step) {
    if (v < 0) continue;
    const y = cy - ((v - value) / span) * half;
    const major = Math.round(v / step) % ticksPerLabel === 0;
    g.beginPath();
    if (right) { g.moveTo(x, y); g.lineTo(x + (major ? 14 : 8), y); }
    else { g.moveTo(x + 62, y); g.lineTo(x + 62 - (major ? 14 : 8), y); }
    g.stroke();
    if (major) {
      g.fillStyle = phos;
      g.textAlign = right ? 'left' : 'right';
      g.textBaseline = 'middle';
      g.fillText(fmt(v), right ? x + 18 : x + 62 - 18, y);
    }
  }
  g.strokeStyle = phos; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(right ? x : x + 62, cy - half); g.lineTo(right ? x : x + 62, cy + half); g.stroke();
  g.fillStyle = phos; g.textAlign = 'center'; g.font = '10px monospace';
  g.fillText(unit, x + 31, cy - half - 8);
}

// ============================================================
// MFD رادار — درون مستطیل پنل
// ============================================================
function drawRadarMfdInto(g, x, y, w, h, aircraft, game, west) {
  const glowHex = west ? '#7dffb2' : '#ffd88a';
  g.fillStyle = '#04080a';
  g.fillRect(x, y, w, h);
  const cx = x + w / 2, cy = y + h * 0.60, R = Math.min(w, h) / 2 - 8;
  g.strokeStyle = '#1d3a30'; g.lineWidth = 2;
  for (let r = R; r > 0; r -= R / 3) { g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke(); }
  g.beginPath(); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.stroke();
  const sweep = (Date.now() / 900) % (Math.PI * 2);
  const grad = g.createConicGradient ? g.createConicGradient(sweep, cx, cy) : null;
  if (grad) {
    grad.addColorStop(0, 'rgba(80,255,160,0.25)');
    grad.addColorStop(0.12, 'rgba(80,255,160,0)');
    grad.addColorStop(1, 'rgba(80,255,160,0)');
    g.fillStyle = grad;
    g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = glowHex;
  g.fillRect(cx - 2, cy - 9, 4, 18);
  g.fillRect(cx - 9, cy - 2, 18, 4);

  const radar = aircraft.radar;
  const dispRange = radar ? Math.min(radar.range, 40000) : 12000;
  const scale = R / dispRange;
  _mfdQ.copy(aircraft.st.quat).invert();

  const plot = (e, detected) => {
    _mfdV.copy(e.st.pos).sub(aircraft.st.pos);
    _mfdV.applyQuaternion(_mfdQ);
    let px = cx + _mfdV.x * scale, py = cy - _mfdV.z * scale;
    const dc = Math.hypot(px - cx, py - cy);
    if (dc > R) return;
    const locked = aircraft.lockTarget === e;
    g.globalAlpha = detected ? 1 : 0.3;
    g.strokeStyle = locked ? '#ffffff' : '#ff5050';
    g.lineWidth = 2;
    g.strokeRect(px - 5, py - 5, 10, 10);
    if (detected && e.st.vel.lengthSq() > 100) {
      _mfdV.copy(e.st.vel).applyQuaternion(_mfdQ).multiplyScalar(0.035);
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(px + _mfdV.x, py - _mfdV.z);
      g.stroke();
    }
    g.globalAlpha = 1;
  };

  if (radar) {
    for (const tr of radar._pool) {
      if (!tr.ac || !tr.ac.alive) continue;
      plot(tr.ac, tr.detected);
    }
    g.fillStyle = '#9fb2ca'; g.font = '11px monospace'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    const lt = aircraft.lockTarget;
    const ready = lt && (aircraft.lockT >= (radar.mode === 'stt' ? 0.4 : 1.1));
    g.fillText(radar.mode.toUpperCase() + (ready ? ' LOCK' : lt ? ' DESIG' : ''), x + 8, y + 14);
    g.fillText(`RNG ${(dispRange / 1000) | 0}KM`, x + 8, y + h - 6);
  } else {
    if (game && game.player === aircraft) {
      for (const e of game.aircraft) {
        if (!e.alive || e.team === aircraft.team) continue;
        if (e.st.pos.distanceTo(aircraft.st.pos) > 12000) continue;
        plot(e, true);
      }
    }
    g.fillStyle = '#9fb2ca'; g.font = '11px monospace'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillText('IR ONLY', x + 8, y + 14);
    g.fillText('RNG 12KM', x + 8, y + h - 6);
  }
}

// ============================================================
// MFD وضعیت — درون مستطیل پنل
// ============================================================
function drawStatusMfdInto(g, x, y, w, h, aircraft, west) {
  g.fillStyle = '#04080a';
  g.fillRect(x, y, w, h);
  const bar = (yy, label, v, col) => {
    g.fillStyle = '#9fb2ca'; g.font = '10px monospace'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillText(label, x + 8, yy - 4);
    g.fillStyle = '#152028';
    g.fillRect(x + 52, yy - 13, w - 64, 11);
    g.fillStyle = col;
    g.fillRect(x + 52, yy - 13, (w - 64) * Math.max(0, Math.min(1, v)), 11);
  };
  const st = aircraft.st;
  bar(y + 22, 'THR', st.throttle, '#7dffb2');
  bar(y + 46, 'FUEL', st.fuel / aircraft.spec.fuelCap, '#ffd88a');
  bar(y + 70, 'HULL', aircraft.hp / aircraft.hpMax, aircraft.hp > aircraft.hpMax * 0.4 ? '#7dffb2' : '#ff5050');
  bar(y + 94, 'G', st.gForce / 10, '#8ac4ff');
  g.fillStyle = '#cfe3ff'; g.font = '11px monospace'; g.textAlign = 'left';
  g.fillText(`MACH ${st.mach.toFixed(2)}   ALT ${Math.round(st.pos.y)}`, x + 8, y + h - 22);
  if (st.stalled) { g.fillStyle = '#ff5050'; g.fillText('** STALL **', x + 8, y + h - 6); }
}

const _mfdV = new THREE.Vector3();
const _mfdQ = new THREE.Quaternion();
