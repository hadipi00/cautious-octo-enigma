// ============================================================
// مدل‌ساز پارامتریک جنگنده — از داده JSON، مش low-poly با سیلوئت واقعی
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
    color: v.body || '#7f8d9d', roughness: 0.55, metalness: 0.35,
  });
  const darkMat = new THREE.MeshStandardMaterial({ color: '#3a4148', roughness: 0.5, metalness: 0.55 });
  const glassMat = new THREE.MeshStandardMaterial({ color: '#152232', roughness: 0.12, metalness: 0.9 });
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

  // ---------- بال ----------
  const semi = span / 2 - 0.45 * s;
  const wp = {
    swept:   { root: 4.6 * s, tip: 1.5 * s, sweep: semi * 0.62, zLE: 1.6 * s },
    delta:   { root: 6.8 * s, tip: 1.0 * s, sweep: semi * 0.85, zLE: 0.8 * s },
    variable:{ root: 5.4 * s, tip: 2.0 * s, sweep: semi * 0.55, zLE: 1.6 * s },
  }[wingType];

  const mkWing = (sideX) => {
    const sh = new THREE.Shape();
    sh.moveTo(0, 0);
    sh.lineTo(sideX * semi, -wp.sweep);
    sh.lineTo(sideX * semi, -wp.sweep - wp.tip);
    sh.lineTo(0, -wp.root);
    sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.10 * s, bevelEnabled: false });
    const m = new THREE.Mesh(geo, bodyMat);
    m.rotation.x = Math.PI / 2; // صفحه XY → افقی، ضخامت به سمت پایین
    m.position.set(sideX * 0.42 * s, -0.12 * s, wp.zLE);
    return m;
  };
  g.add(mkWing(1), mkWing(-1));

  // ---------- دم افقی ----------
  const hSemi = span * 0.20;
  const mkStab = (sideX) => {
    const sh = new THREE.Shape();
    sh.moveTo(0, 0);
    sh.lineTo(sideX * hSemi, -hSemi * 0.55);
    sh.lineTo(sideX * hSemi, -hSemi * 0.55 - 0.8 * s);
    sh.lineTo(0, -2.0 * s);
    sh.closePath();
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.07 * s, bevelEnabled: false }), bodyMat);
    m.rotation.x = Math.PI / 2;
    m.position.set(sideX * 0.35 * s, 0.05 * s, -5.4 * s);
    return m;
  };
  g.add(mkStab(1), mkStab(-1));

  // ---------- دم عمودی ----------
  const finH = tailType === 'twin' ? 2.1 * s : 2.7 * s;
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
    m.position.set(xOff, 0.4 * s, -4.4 * s);
    return m;
  };
  if (tailType === 'twin') g.add(mkFin(0.62 * s), mkFin(-0.62 * s));
  else g.add(mkFin(0));

  // ---------- کابین ----------
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    glassMat
  );
  canopy.scale.set(0.5 * s, 0.55 * s, 1.8 * s);
  canopy.position.set(0, 0.48 * s, 2.9 * s);
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

  // ---------- چرخ فرود ----------
  const gearGroup = new THREE.Group();
  const mkGear = (x, z) => {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * s, 0.05 * s, 1.1 * s, 6), darkMat);
    strut.position.set(x, -0.7 * s - 0.55 * s, z);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.24 * s, 0.10 * s, 6, 10), darkMat);
    wheel.rotation.y = Math.PI / 2;
    wheel.position.set(x, -0.7 * s - 1.15 * s, z);
    gearGroup.add(strut, wheel);
  };
  mkGear(0, 4.6 * s);
  mkGear(1.05 * s, -0.4 * s);
  mkGear(-1.05 * s, -0.4 * s);
  g.add(gearGroup);

  // ---------- چراغ ناوبری ----------
  const mkLight = (color, x, y, z) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.09 * s, 6, 4), new THREE.MeshBasicMaterial({ color }));
    m.position.set(x, y, z);
    g.add(m);
  };
  mkLight(0xff3030, -semi - 0.45 * s, -0.12 * s, wp.zLE - wp.sweep); // چپ قرمز
  mkLight(0x30ff40, semi + 0.45 * s, -0.12 * s, wp.zLE - wp.sweep);  // راست سبز
  mkLight(0xffffff, 0, 0.6 * s, -7.4 * s);                            // دم سفید

  // ---------- ریل و موشک زیر بال ----------
  const railMat = new THREE.MeshStandardMaterial({ color: '#4a5058', roughness: 0.5, metalness: 0.4 });
  const mslMat = new THREE.MeshStandardMaterial({ color: '#c8ccd2', roughness: 0.4, metalness: 0.5 });
  for (const sx of [1, -1]) {
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.10 * s, 0.16 * s, 0.9 * s), railMat);
    pylon.position.set(sx * semi * 0.55, -0.20 * s, wp.zLE - wp.sweep * 0.55 - 0.3 * s);
    g.add(pylon);
    for (const off of [-0.28, 0.28]) {
      const mslG = new THREE.Group();
      const mbody = new THREE.Mesh(new THREE.CylinderGeometry(0.07 * s, 0.07 * s, 1.5 * s, 6), mslMat);
      mbody.rotation.x = Math.PI / 2;
      const mnose = new THREE.Mesh(new THREE.ConeGeometry(0.07 * s, 0.34 * s, 6), mslMat);
      mnose.rotation.x = -Math.PI / 2;
      mnose.position.z = -0.9 * s;
      mslG.add(mbody, mnose);
      mslG.position.set(
        sx * semi * 0.55 + off * s,
        -0.30 * s,
        wp.zLE - wp.sweep * 0.55 - 0.3 * s
      );
      g.add(mslG);
    }
  }

  // ---------- نوار رنگی دم (نشان اسکادران) ----------
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.11 * s, (tailType === 'twin' ? 2.1 : 2.7) * 0.72 * s, 0.5 * s),
    new THREE.MeshStandardMaterial({ color: v.accent || '#55606d', roughness: 0.6 }));
  stripe.position.set(tailType === 'twin' ? 0.62 * s : 0, 0.4 * s + (tailType === 'twin' ? 1.05 : 1.35) * s, -3.3 * s);
  g.add(stripe);

  g.traverse(o => { if (o.isMesh && o.material !== abMat && o.material !== abCoreMat) o.castShadow = true; });

  return { group: g, refs: { gearGroup, abGlows } };
}
