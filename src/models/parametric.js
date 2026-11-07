// ============================================================
// مدل‌ساز پارامتریک جنگنده — نسخه ۲ «PBR»
//   • MeshPhysicalMaterial با کلیرکوت → بازتاب آفتاب روی بدنه
//   • بافت خطوط پنل + پرچ + لکه‌های کمو فلای (بافت بدنه واقعی)
//   • شیشه کانوپی براق با انعکاس محیط
//   • جزئیات: پیتوت، آنتن، چراغ فرمیشن، رادوم تیره
// انیمیشن‌ها: سکان‌ها، کانارد، بال متغیر، چرخ فرود، ترمز، شعله AB
// محورها: دماغه +Z ، بالا +Y ، راست +X
// ============================================================
import * as THREE from 'three';

export function buildJet(v = {}, len = 15, span = 10, nation = 'USA') {
  const s = len / 15; // مقیاس مرجع F-16
  const wingType = v.wingType || 'swept';
  const tailType = v.tailType || 'single';
  const engines = v.engines || 1;

  const g = new THREE.Group();

  // ---------- بافت بدنه — خطوط پنل + پرچ + لکه‌های محو ----------
  const camoTex = _camoTexture(v.body || '#7f8d9d', v.accent || '#5a6470', nation);
  const camoTexWing = camoTex.clone();
  camoTexWing.repeat.set(0.16, 0.16);
  camoTexWing.offset.set(0.37, 0.11);
  camoTexWing.needsUpdate = true;

  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,                       // رنگ از بافت می‌آید
    map: camoTex,
    metalness: 0.72,
    roughness: 0.36,
    clearcoat: 0.55,
    clearcoatRoughness: 0.30,
    envMapIntensity: 1.55,
  });
  const wingMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: camoTexWing,
    metalness: 0.72,
    roughness: 0.38,
    clearcoat: 0.5,
    clearcoatRoughness: 0.32,
    envMapIntensity: 1.5,
  });
  const darkMat = new THREE.MeshPhysicalMaterial({
    color: '#33383e', roughness: 0.5, metalness: 0.6, envMapIntensity: 0.9,
  });
  const radomeMat = new THREE.MeshPhysicalMaterial({
    color: '#4a4f52', roughness: 0.62, metalness: 0.35, envMapIntensity: 0.8,
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x1c3a50, roughness: 0.05, metalness: 0.1,
    transparent: true, opacity: 0.34, depthWrite: false,
    clearcoat: 1.0, clearcoatRoughness: 0.04, envMapIntensity: 2.4,
  });
  const abMat = new THREE.MeshBasicMaterial({
    color: 0xff8c2a, transparent: true, opacity: 0.75,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const abCoreMat = new THREE.MeshBasicMaterial({
    color: 0xa8ccff, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });

  // ---------- بدنه (لاته — پروفیل از دم به دماغه، نرم‌شده) ----------
  const prof = [
    [0.30, -7.5], [0.46, -6.4], [0.58, -4.8], [0.64, -2.8], [0.66, -1.2],
    [0.66, 0.8], [0.62, 2.0], [0.52, 3.8], [0.38, 5.4], [0.22, 6.6],
    [0.10, 7.2], [0.0, 7.5],
  ];
  const pts = prof.map(([r, z]) => new THREE.Vector2(r * s * (v.fusW || 1), z * s));
  const fus = new THREE.Mesh(new THREE.LatheGeometry(pts, 22), bodyMat);
  fus.rotation.x = Math.PI / 2; // محور Y لاته → +Z
  fus.castShadow = true;
  g.add(fus);

  // رادوم تیره نوک دماغه
  const radome = new THREE.Mesh(new THREE.ConeGeometry(0.20 * s, 0.9 * s, 12), radomeMat);
  radome.rotation.x = Math.PI / 2;
  radome.position.set(0, 0.02 * s, 6.95 * s);
  g.add(radome);

  // پیتوت + پروب زاویه حمله
  const pitot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022 * s, 0.022 * s, 0.85 * s, 6), darkMat);
  pitot.rotation.x = Math.PI / 2;
  pitot.position.set(0, 0.02 * s, 7.85 * s);
  g.add(pitot);

  // آنتن تیغه‌ای پشت کانوپی + زیر بدنه
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.035 * s, 0.20 * s, 0.30 * s), darkMat);
  blade.position.set(0, 0.55 * s, 0.6 * s);
  blade.rotation.x = 0.25;
  g.add(blade);
  const blade2 = blade.clone();
  blade2.position.set(0, -0.62 * s, -2.6 * s);
  blade2.rotation.x = -0.2;
  g.add(blade2);

  // چراغ فرمیشن (نوارهای سبز کدر دو طرف دماغه)
  const formMat = new THREE.MeshBasicMaterial({ color: 0x2f5c46 });
  for (const sx of [1, -1]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.02 * s, 0.06 * s, 0.9 * s), formMat);
    strip.position.set(sx * 0.53 * s, 0.12 * s, 3.4 * s);
    strip.rotation.y = sx * 0.18;
    g.add(strip);
  }

  // ---------- بال (پیوت‌دار — برای جاروب متغیر و سکان‌ها) ----------
  const semi = span / 2 - 0.45 * s;
  const wp = {
    swept:   { root: 4.6 * s, tip: 1.5 * s, sweepAng: 0.56, zLE: 1.6 * s },
    delta:   { root: 6.8 * s, tip: 1.0 * s, sweepAng: 0.70, zLE: 0.8 * s },
    variable:{ root: 5.4 * s, tip: 2.0 * s, sweepAng: 0.50, zLE: 1.6 * s },
    straight:{ root: 5.2 * s, tip: 2.4 * s, sweepAng: 0.10, zLE: 1.1 * s },
  }[wingType] || { root: 4.6 * s, tip: 1.5 * s, sweepAng: 0.56, zLE: 1.6 * s };
  const isVariable = wingType === 'variable';

  const sweepPivots = [];
  const ailPivots = [];
  const flapPivots = [];
  const navLights = [];
  const mkNavLight = (color) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.09 * s, 6, 4), new THREE.MeshBasicMaterial({ color }));
    navLights.push(m);
    return m;
  };

  const mkWing = (sideX) => {
    const sh = new THREE.Shape();
    sh.moveTo(0, 0);
    sh.lineTo(sideX * semi, 0);
    sh.lineTo(sideX * semi, -wp.tip);
    sh.lineTo(0, -wp.root);
    sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.10 * s, bevelEnabled: false });
    const m = new THREE.Mesh(geo, wingMat);
    m.rotation.x = Math.PI / 2; // صفحه XY → افقی، ضخامت به سمت پایین
    m.castShadow = true;
    const pivot = new THREE.Group();
    pivot.position.set(sideX * 0.42 * s, -0.12 * s, wp.zLE);
    pivot.rotation.y = sideX * wp.sweepAng;
    pivot.add(m);
    g.add(pivot);
    sweepPivots.push({ pivot, sideX });

    // لبه حمله بال — نوار گرد (حجم بیشتر از اکسترود تخت)
    const le = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05 * s, 0.05 * s, semi * 0.98, 6),
      wingMat
    );
    le.rotation.z = Math.PI / 2;
    le.rotation.y = sideX * (Math.atan2(wp.tip, semi) * 0.9);
    le.position.set(sideX * semi * 0.5, -0.05 * s, 0.06 * s);
    pivot.add(le);

    // --- ایلرون ---
    const ail = new THREE.Group();
    ail.position.set(sideX * semi * 0.72, -0.16 * s, -wp.root + 0.10 * s);
    const ailMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.30 * semi, 0.045 * s, 1.05 * s),
      darkMat
    );
    ailMesh.position.z = -0.55 * s;
    ail.add(ailMesh);
    pivot.add(ail);
    ailPivots.push({ pivot: ail, sideX });

    // --- فلپ ---
    const flp = new THREE.Group();
    flp.position.set(sideX * semi * 0.30, -0.16 * s, -wp.root + 0.10 * s);
    const flpMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.36 * semi, 0.04 * s, 1.15 * s),
      darkMat
    );
    flpMesh.position.z = -0.60 * s;
    flp.add(flpMesh);
    pivot.add(flp);
    flapPivots.push(flp);

    const nl = mkNavLight(sideX > 0 ? 0x30ff40 : 0xff3030);
    nl.position.set(sideX * (semi - 0.02), -0.06 * s, -wp.tip * 0.55);
    pivot.add(nl);
    return pivot;
  };
  g.add(mkWing(1), mkWing(-1));

  // ---------- کانارد ----------
  const canardPivots = [];
  if (v.canards) {
    for (const sx of [1, -1]) {
      const sh = new THREE.Shape();
      sh.moveTo(0, 0.55 * s);
      sh.lineTo(sx * 1.55 * s, -0.25 * s);
      sh.lineTo(sx * 1.55 * s, -0.75 * s);
      sh.lineTo(0, -0.55 * s);
      sh.closePath();
      const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.06 * s, bevelEnabled: false });
      const m = new THREE.Mesh(geo, wingMat);
      m.rotation.x = Math.PI / 2;
      const pivot = new THREE.Group();
      pivot.position.set(sx * 0.30 * s, 0.02 * s, 3.6 * s);
      pivot.add(m);
      g.add(pivot);
      canardPivots.push(pivot);
    }
  }

  // ---------- دم افقی (پیوت اورلات) ----------
  const hSemi = span * 0.20;
  const elevPivots = [];
  const mkStab = (sideX) => {
    const sh = new THREE.Shape();
    sh.moveTo(0, 0);
    sh.lineTo(sideX * hSemi, -hSemi * 0.55);
    sh.lineTo(sideX * hSemi, -hSemi * 0.55 - 0.8 * s);
    sh.lineTo(0, -2.0 * s);
    sh.closePath();
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.07 * s, bevelEnabled: false }), wingMat);
    m.rotation.x = Math.PI / 2;
    m.castShadow = true;
    const pivot = new THREE.Group();
    pivot.position.set(sideX * 0.35 * s, 0.05 * s, -5.4 * s);
    pivot.add(m);
    g.add(pivot);
    elevPivots.push(pivot);
  };
  mkStab(1); mkStab(-1);

  // ---------- دم عمودی (پیوت ردر) ----------
  const finH = tailType === 'twin' ? 2.1 * s : 2.7 * s;
  const rudderPivots = [];
  const mkFin = (xOff) => {
    const sh = new THREE.Shape();
    sh.moveTo(0, 0);
    sh.lineTo(1.6 * s, finH);
    sh.lineTo(1.6 * s + 1.0 * s, finH);
    sh.lineTo(3.1 * s, 0);
    sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.09 * s, bevelEnabled: false });
    geo.rotateY(Math.PI / 2);
    geo.translate(-0.045 * s, 0, 0);
    const m = new THREE.Mesh(geo, wingMat);
    m.castShadow = true;
    const pivot = new THREE.Group();
    pivot.position.set(xOff, 0.4 * s, -4.4 * s);
    pivot.add(m);
    g.add(pivot);
    rudderPivots.push(pivot);
  };
  if (tailType === 'twin') { mkFin(0.62 * s); mkFin(-0.62 * s); }
  else mkFin(0);

  // ---------- ترمز هوایی ----------
  const brakePivot = new THREE.Group();
  brakePivot.position.set(0, 0.36 * s, -1.2 * s);
  const brakePanel = new THREE.Mesh(new THREE.BoxGeometry(0.52 * s, 0.035 * s, 1.1 * s), darkMat);
  brakePanel.position.z = -0.55 * s;
  brakePivot.add(brakePanel);
  brakePivot.rotation.x = 0.02;
  g.add(brakePivot);

  // ---------- کانوپی ----------
  const bubble = v.canopy !== 'tandem';
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(1, 18, 12, 0, Math.PI * 2, 0, bubble ? Math.PI / 2 : Math.PI * 0.42),
    glassMat
  );
  canopy.scale.set(0.5 * s, (bubble ? 0.55 : 0.48) * s, 1.8 * s);
  canopy.position.set(0, 0.48 * s, 2.9 * s);
  canopy.renderOrder = 5;
  g.add(canopy);

  // قاب کانوپی — دو کمان فلزی + لبه جلو (نیم‌حلقه عرضی؛ بدون چرخش Y تا حلقه
  // طولی از وسط کانوپی عبور نکند)
  const frameMat = new THREE.MeshPhysicalMaterial({ color: '#6d747b', roughness: 0.4, metalness: 0.75, envMapIntensity: 1.1 });
  const archF = new THREE.Mesh(new THREE.TorusGeometry(0.49 * s, 0.028 * s, 6, 14, Math.PI), frameMat);
  archF.position.set(0, 0.47 * s, 4.05 * s);
  g.add(archF);
  const archR = archF.clone();
  archR.position.z = 1.7 * s;
  archR.scale.setScalar(1.06);
  g.add(archR);

  // ---------- ورودی هوا ----------
  if (engines === 2) {
    for (const sx of [1, -1]) {
      const it = new THREE.Mesh(new THREE.BoxGeometry(0.55 * s, 0.85 * s, 3.4 * s), bodyMat);
      it.position.set(sx * 0.75 * s, -0.12 * s, 1.8 * s);
      it.castShadow = true;
      g.add(it);
    }
  } else {
    const it = new THREE.Mesh(new THREE.BoxGeometry(0.9 * s, 0.7 * s, 2.4 * s), darkMat);
    it.position.set(0, -0.44 * s, 2.6 * s);
    g.add(it);
  }

  // ---------- نازل + شعله افتربرنر ----------
  const abGlows = [];
  const nzR = (engines === 2 ? 0.30 : 0.34) * s;
  const nzXs = engines === 2 ? [0.55 * s, -0.55 * s] : [0];
  for (const nx of nzXs) {
    const noz = new THREE.Mesh(new THREE.CylinderGeometry(nzR, nzR * 0.88, 0.85 * s, 12, 1, true), darkMat);
    noz.rotation.x = Math.PI / 2;
    noz.position.set(nx, 0, -7.2 * s);
    g.add(noz);

    const glow = new THREE.Mesh(new THREE.ConeGeometry(nzR * 0.9, 2.6 * s, 12, 1, true), abMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(nx, 0, -7.6 * s - 1.3 * s);
    glow.visible = false;
    g.add(glow);
    abGlows.push(glow);

    const core = new THREE.Mesh(new THREE.ConeGeometry(nzR * 0.42, 1.4 * s, 10, 1, true), abCoreMat);
    core.rotation.x = -Math.PI / 2;
    core.position.set(nx, 0, -7.6 * s - 0.7 * s);
    core.visible = false;
    g.add(core);
    abGlows.push(core);
  }

  // ---------- چرخ فرود (پیوت‌دار — تاشو) ----------
  const gearGroup = new THREE.Group();
  const gearPivots = [];
  const wheelMat = new THREE.MeshStandardMaterial({ color: '#1c1e20', roughness: 0.9 });
  const mkGear = (x, z) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, -0.7 * s, z);
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * s, 0.05 * s, 1.1 * s, 6), darkMat);
    strut.position.y = -0.55 * s;
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.26 * s, 0.26 * s, 0.16 * s, 12), wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.y = -1.15 * s;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.10 * s, 0.10 * s, 0.18 * s, 8), darkMat);
    hub.rotation.z = Math.PI / 2;
    hub.position.y = -1.15 * s;
    pivot.add(strut, wheel, hub);
    gearGroup.add(pivot);
    gearPivots.push(pivot);
  };
  mkGear(0, 4.6 * s);
  mkGear(1.05 * s, -0.4 * s);
  mkGear(-1.05 * s, -0.4 * s);
  g.add(gearGroup);

  // ---------- چراغ دُم ----------
  const mkLight = (color, x, y, z) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.09 * s, 6, 4), new THREE.MeshBasicMaterial({ color }));
    m.position.set(x, y, z);
    g.add(m);
  };
  mkLight(0xffffff, 0, 0.6 * s, -7.4 * s);

  // ---------- ریل و موشک زیر بال ----------
  const railMat = new THREE.MeshPhysicalMaterial({ color: '#4a5058', roughness: 0.5, metalness: 0.45, envMapIntensity: 0.9 });
  const mslMat = new THREE.MeshPhysicalMaterial({ color: '#c8ccd2', roughness: 0.38, metalness: 0.55, envMapIntensity: 1.2 });
  const mslZ = wp.zLE - wp.root * 0.55 - 0.3 * s;
  for (const sx of [1, -1]) {
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.10 * s, 0.16 * s, 0.9 * s), railMat);
    pylon.position.set(sx * semi * 0.55, -0.20 * s, mslZ);
    g.add(pylon);
    for (const off of [-0.28, 0.28]) {
      const mslG = new THREE.Group();
      const mbody = new THREE.Mesh(new THREE.CylinderGeometry(0.07 * s, 0.07 * s, 1.5 * s, 8), mslMat);
      mbody.rotation.x = Math.PI / 2;
      const mnose = new THREE.Mesh(new THREE.ConeGeometry(0.07 * s, 0.34 * s, 8), mslMat);
      mnose.rotation.x = -Math.PI / 2;
      mnose.position.z = -0.9 * s;
      const mfin = new THREE.Mesh(new THREE.BoxGeometry(0.30 * s, 0.02 * s, 0.16 * s), mslMat);
      mfin.position.z = 0.55 * s;
      mslG.add(mbody, mnose, mfin);
      mslG.position.set(sx * semi * 0.55 + off * s, -0.30 * s, mslZ);
      g.add(mslG);
    }
  }

  // ---------- نوار رنگی دم ----------
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.11 * s, (tailType === 'twin' ? 2.1 : 2.7) * 0.72 * s, 0.5 * s),
    new THREE.MeshPhysicalMaterial({ color: v.accent || '#55606d', roughness: 0.5, metalness: 0.4, envMapIntensity: 1.0 })
  );
  stripe.position.set(tailType === 'twin' ? 0.62 * s : 0, 0.4 * s + (tailType === 'twin' ? 1.05 : 1.35) * s, -3.3 * s);
  g.add(stripe);

  g.traverse(o => {
    if (o.isMesh && o.material !== abMat && o.material !== abCoreMat && o.material !== glassMat) {
      o.castShadow = true;
    }
  });

  return {
    group: g,
    refs: {
      gearGroup, gearPivots, abGlows,
      sweepPivots, isVariable,
      ailPivots, flapPivots, elevPivots, rudderPivots,
      canardPivots, brakePivot,
    },
  };
}

// ------------------------------------------------------------
// بافت کمو/پنل‌لاین — پس‌زمینه رنگ بدنه + خطوط پنل افقی (رینگ دور بدنه
// به‌خاطر UV لاته) + پرچ + لکه‌های محو + تیره‌شدن ستون فقرات
// ------------------------------------------------------------
const _camoCache = new Map();
function _camoTexture(bodyHex, accentHex, nation) {
  const key = `${bodyHex}|${accentHex}|${nation}`;
  if (_camoCache.has(key)) return _camoCache.get(key);

  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 512;
  const g = cv.getContext('2d');

  const base = new THREE.Color(bodyHex);
  const accent = new THREE.Color(accentHex);
  const hex = (c, mul = 1) => {
    const cc = c.clone().multiplyScalar(mul);
    return '#' + cc.getHexString();
  };

  // زمینه
  g.fillStyle = hex(base, 1.0);
  g.fillRect(0, 0, 512, 512);

  // لکه‌های کمو ملایم (رنگ مکمل — بسته به ملت)
  const nat = (nation || 'USA').toUpperCase();
  const patchCol = nat === 'USA' ? hex(accent, 0.9)
    : (nat === 'RUSSIA' || nat === 'USSR' || nat === 'RU') ? hex(accent, 1.05)
    : hex(base, 0.82);
  g.globalAlpha = 0.20;
  for (let i = 0; i < 10; i++) {
    const px = Math.random() * 512, py = Math.random() * 512;
    const pw = 60 + Math.random() * 150, ph = 26 + Math.random() * 70;
    g.fillStyle = patchCol;
    g.beginPath();
    g.ellipse(px, py, pw / 2, ph / 2, Math.random() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;

  // گرادیان ستون فقرات (بالای بدنه کمی تیره‌تر — عمق حجمی)
  const spine = g.createLinearGradient(0, 0, 0, 512);
  spine.addColorStop(0, 'rgba(0,0,0,0.16)');
  spine.addColorStop(0.28, 'rgba(0,0,0,0.02)');
  spine.addColorStop(0.55, 'rgba(255,255,255,0.05)');
  spine.addColorStop(1, 'rgba(0,0,0,0.12)');
  g.fillStyle = spine;
  g.fillRect(0, 0, 512, 512);

  // خطوط پنل افقی (رینگ دور بدنه)
  const lines = [0.10, 0.22, 0.33, 0.46, 0.58, 0.70, 0.82, 0.92];
  for (const ly of lines) {
    const y = ly * 512;
    g.strokeStyle = 'rgba(0,0,0,0.28)';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.10)';
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, y + 2); g.lineTo(512, y + 2); g.stroke();
    // پرچ‌ها
    g.fillStyle = 'rgba(0,0,0,0.22)';
    for (let x = 6; x < 512; x += 14) {
      g.fillRect(x, y - 4, 1.6, 1.6);
      g.fillRect(x + 7, y + 4, 1.6, 1.6);
    }
  }
  // درزهای طولی (دو نصف بدنه)
  for (const lx of [0.16, 0.5, 0.84]) {
    g.strokeStyle = 'rgba(0,0,0,0.16)';
    g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(lx * 512, 0); g.lineTo(lx * 512, 512); g.stroke();
  }

  // لکه‌های فرسودگی + رگه‌های دود پشت درزها
  g.globalAlpha = 0.10;
  for (let i = 0; i < 22; i++) {
    const x = Math.random() * 512, y = Math.random() * 512;
    const gr = g.createRadialGradient(x, y, 1, x, y, 8 + Math.random() * 26);
    gr.addColorStop(0, 'rgba(30,30,32,0.8)');
    gr.addColorStop(1, 'rgba(30,30,32,0)');
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, 34, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  _camoCache.set(key, tex);
  return tex;
}
