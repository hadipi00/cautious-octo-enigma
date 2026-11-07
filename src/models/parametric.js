// ============================================================
// مدل‌ساز پارامتریک جنگنده — از داده JSON، مش low-poly با سیلوئت واقعی
// انیمیشن‌ها: سکان‌ها (ایلرون/اورلات/ردر/فلپ)، کانارد، بال متغیر،
// چرخ فرود تاشو، ترمز هوایی، شعله AB
// محورها: دماغه +Z ، بالا +Y ، راست +X
// ============================================================
import * as THREE from 'three';

export function buildJet(v = {}, len = 15, span = 10) {
  const s = len / 15; // مقیاس مرجع F-16
  const wingType = v.wingType || 'swept';
  const tailType = v.tailType || 'single';
  const engines = v.engines || 1;

  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: v.body || '#7f8d9d', roughness: 0.45, metalness: 0.5,
  });
  const darkMat = new THREE.MeshStandardMaterial({ color: '#3a4148', roughness: 0.5, metalness: 0.55 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x8fc3e8, roughness: 0.06, metalness: 0.7,
    transparent: true, opacity: 0.30, depthWrite: false,
  });
  const abMat = new THREE.MeshBasicMaterial({
    color: 0xff8c2a, transparent: true, opacity: 0.75,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const abCoreMat = new THREE.MeshBasicMaterial({
    color: 0xffd9a0, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });

  // ---------- بدنه (لاته — پروفیل از دم به دماغه) ----------
  const prof = [
    [0.30, -7.5], [0.44, -6.2], [0.58, -4.0], [0.66, -1.5], [0.66, 0.8],
    [0.58, 3.2], [0.42, 5.6], [0.20, 6.9], [0.04, 7.42], [0.0, 7.5],
  ];
  const pts = prof.map(([r, z]) => new THREE.Vector2(r * s * (v.fusW || 1), z * s));
  const fus = new THREE.Mesh(new THREE.LatheGeometry(pts, 14), bodyMat);
  fus.rotation.x = Math.PI / 2; // محور Y لاته → +Z
  g.add(fus);

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
    // بال بدون جاروب — جاروب با چرخش پیوت (برای انیمیشن بال متغیر)
    const sh = new THREE.Shape();
    sh.moveTo(0, 0);
    sh.lineTo(sideX * semi, 0);
    sh.lineTo(sideX * semi, -wp.tip);
    sh.lineTo(0, -wp.root);
    sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.10 * s, bevelEnabled: false });
    const m = new THREE.Mesh(geo, bodyMat);
    m.rotation.x = Math.PI / 2; // صفحه XY → افقی، ضخامت به سمت پایین
    const pivot = new THREE.Group();
    pivot.position.set(sideX * 0.42 * s, -0.12 * s, wp.zLE);
    pivot.rotation.y = sideX * wp.sweepAng; // جاروب ثابت اولیه
    pivot.add(m);
    g.add(pivot);
    sweepPivots.push({ pivot, sideX });

    // --- ایلرون (لبه فرود بیرونی) — با بال جاروب می‌شود ---
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

    // --- فلپ (لبه فرود داخلی) ---
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

    // چراغ ناوبری نوک بال — داخل پیوت تا با جاروب حرکت کند
    const nl = mkNavLight(sideX > 0 ? 0x30ff40 : 0xff3030);
    nl.position.set(sideX * (semi - 0.02), -0.06 * s, -wp.tip * 0.55);
    pivot.add(nl);
    return pivot;
  };
  g.add(mkWing(1), mkWing(-1));

  // ---------- کانارد (اگر مشخص شده) ----------
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
      const m = new THREE.Mesh(geo, bodyMat);
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
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.07 * s, bevelEnabled: false }), bodyMat);
    m.rotation.x = Math.PI / 2;
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
    geo.rotateY(Math.PI / 2); // صفحه XY → ZY ، ضخامت به +X
    geo.translate(-0.045 * s, 0, 0);
    const m = new THREE.Mesh(geo, bodyMat);
    const pivot = new THREE.Group();
    pivot.position.set(xOff, 0.4 * s, -4.4 * s);
    pivot.add(m);
    g.add(pivot);
    rudderPivots.push(pivot);
  };
  if (tailType === 'twin') { mkFin(0.62 * s); mkFin(-0.62 * s); }
  else mkFin(0);

  // ---------- ترمز هوایی (پنل پشتی) ----------
  const brakePivot = new THREE.Group();
  brakePivot.position.set(0, 0.36 * s, -1.2 * s);
  const brakePanel = new THREE.Mesh(new THREE.BoxGeometry(0.52 * s, 0.035 * s, 1.1 * s), darkMat);
  brakePanel.position.z = -0.55 * s;
  brakePivot.add(brakePanel);
  brakePivot.rotation.x = 0.02;
  g.add(brakePivot);

  // ---------- کابین ----------
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    glassMat
  );
  canopy.scale.set(0.5 * s, 0.55 * s, 1.8 * s);
  canopy.position.set(0, 0.48 * s, 2.9 * s);
  canopy.renderOrder = 5;
  g.add(canopy);

  // ---------- ورودی هوا ----------
  if (engines === 2) {
    for (const sx of [1, -1]) {
      const it = new THREE.Mesh(new THREE.BoxGeometry(0.55 * s, 0.85 * s, 3.4 * s), bodyMat);
      it.position.set(sx * 0.75 * s, -0.12 * s, 1.8 * s);
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
    const noz = new THREE.Mesh(new THREE.CylinderGeometry(nzR, nzR * 0.9, 0.8 * s, 10, 1, true), darkMat);
    noz.rotation.x = Math.PI / 2;
    noz.position.set(nx, 0, -7.2 * s);
    g.add(noz);

    const glow = new THREE.Mesh(new THREE.ConeGeometry(nzR * 0.9, 2.6 * s, 10, 1, true), abMat);
    glow.rotation.x = -Math.PI / 2; // نوک مخروط به −Z (عقب)
    glow.position.set(nx, 0, -7.6 * s - 1.3 * s);
    glow.visible = false;
    g.add(glow);
    abGlows.push(glow);

    const core = new THREE.Mesh(new THREE.ConeGeometry(nzR * 0.45, 1.4 * s, 8, 1, true), abCoreMat);
    core.rotation.x = -Math.PI / 2;
    core.position.set(nx, 0, -7.6 * s - 0.7 * s);
    core.visible = false;
    g.add(core);
    abGlows.push(core);
  }

  // ---------- چرخ فرود (پیوت‌دار — تاشو) ----------
  const gearGroup = new THREE.Group();
  const gearPivots = [];
  const mkGear = (x, z) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, -0.7 * s, z);
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * s, 0.05 * s, 1.1 * s, 6), darkMat);
    strut.position.y = -0.55 * s;
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.24 * s, 0.10 * s, 6, 10), darkMat);
    wheel.rotation.y = Math.PI / 2;
    wheel.position.y = -1.15 * s;
    pivot.add(strut, wheel);
    gearGroup.add(pivot);
    gearPivots.push(pivot);
  };
  mkGear(0, 4.6 * s);
  mkGear(1.05 * s, -0.4 * s);
  mkGear(-1.05 * s, -0.4 * s);
  g.add(gearGroup);

  // ---------- چراغ دُم (قرمز/سبز داخل پیوت بال‌هاست — با جاروب حرکت می‌کنند) ----------
  const mkLight = (color, x, y, z) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.09 * s, 6, 4), new THREE.MeshBasicMaterial({ color }));
    m.position.set(x, y, z);
    g.add(m);
  };
  mkLight(0xffffff, 0, 0.6 * s, -7.4 * s); // دم سفید

  // ---------- ریل و موشک زیر بال ----------
  const railMat = new THREE.MeshStandardMaterial({ color: '#4a5058', roughness: 0.5, metalness: 0.4 });
  const mslMat = new THREE.MeshStandardMaterial({ color: '#c8ccd2', roughness: 0.4, metalness: 0.5 });
  const mslZ = wp.zLE - wp.root * 0.55 - 0.3 * s;
  for (const sx of [1, -1]) {
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.10 * s, 0.16 * s, 0.9 * s), railMat);
    pylon.position.set(sx * semi * 0.55, -0.20 * s, mslZ);
    g.add(pylon);
    for (const off of [-0.28, 0.28]) {
      const mslG = new THREE.Group();
      const mbody = new THREE.Mesh(new THREE.CylinderGeometry(0.07 * s, 0.07 * s, 1.5 * s, 6), mslMat);
      mbody.rotation.x = Math.PI / 2;
      const mnose = new THREE.Mesh(new THREE.ConeGeometry(0.07 * s, 0.34 * s, 6), mslMat);
      mnose.rotation.x = -Math.PI / 2;
      mnose.position.z = -0.9 * s;
      mslG.add(mbody, mnose);
      mslG.position.set(sx * semi * 0.55 + off * s, -0.30 * s, mslZ);
      g.add(mslG);
    }
  }

  // ---------- نوار رنگی دم (نشان اسکادران) ----------
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.11 * s, (tailType === 'twin' ? 2.1 : 2.7) * 0.72 * s, 0.5 * s),
    new THREE.MeshStandardMaterial({ color: v.accent || '#55606d', roughness: 0.6 }));
  stripe.position.set(tailType === 'twin' ? 0.62 * s : 0, 0.4 * s + (tailType === 'twin' ? 1.05 : 1.35) * s, -3.3 * s);
  g.add(stripe);

  g.traverse(o => { if (o.isMesh && o.material !== abMat && o.material !== abCoreMat && o.material !== glassMat) o.castShadow = true; });

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
