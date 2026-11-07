// دیباگ ۲: ستون داخل کابین چیست؟ — ری‌کست با ماتریس تازه
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
  const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
  await page.addInitScript(() => localStorage.setItem('airdom.settings.v3', JSON.stringify({ quality: 'low' })));
  await page.goto('http://localhost:8123/?debug', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.game && document.getElementById('loading').style.opacity === '0', null, { timeout: 240000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => game.startMission('air', 'f16c'));
  await page.waitForTimeout(1500);

  const hits = await page.evaluate(() => {
    const g = game;
    g.scene.updateMatrixWorld(true);
    const origin = g.camera.position.clone();
    const dir = new THREE_V(0, 0, -1);
    function THREE_V(x, y, z) { // از quaternion دوربین جهت بگیر بدون import three
      const v = new Float32Array(3);
      const q = g.camera.quaternion;
      // چرخش برد (0,0,-1) با q
      const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
      const vx = 0, vy = 0, vz = -1;
      // v' = q * v * q^-1
      const ix = qw * vx + qy * vz - qz * vy;
      const iy = qw * vy + qz * vx - qx * vz;
      const iz = qw * vz + qx * vy - qy * vx;
      const w = -qx * vx - qy * vy - qz * vz;
      const rx = ix * qw + w * -qx + iy * -qz - iz * -qy;
      const ry = iy * qw + w * -qy + iz * -qx - ix * -qz;
      const rz = iz * qw + w * -qz + ix * -qy - iy * -qx;
      return { x: rx, y: ry, z: rz };
    }
    const d = THREE_V();
    const dirv = g.camera.position.constructor && null; // noop
    // ساختن Vector3 واقعی از روی st.pos
    const V3 = g.player.st.pos.constructor;
    const dv = new V3(d.x, d.y, d.z).normalize();
    const ray = { o: origin, d: dv };
    // ری‌کست دستی روی همه مش‌های نزدیک (فاصله تا خط < نیم‌عرض)
    const out = [];
    const meshes = [];
    g.player.group.traverse(o => { if (o.isMesh) meshes.push(o); });
    for (const m of meshes) {
      m.updateMatrixWorld(true);
    }
    // از Raycaster خود three استفاده می‌کنیم — import دینامیک مجاز است
    return null;
  });

  // راه ساده‌تر: import three داخل صفحه
  const hits2 = await page.evaluate(async () => {
    const THREE = await import('./vendor/three.module.min.js');
    const g = game;
    g.scene.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    ray.near = 0.05; ray.far = 2.5;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(g.camera.quaternion);
    ray.set(g.camera.position.clone(), dir);
    const targets = [];
    g.player.group.traverse(o => { if (o.isMesh) targets.push(o); });
    const hits = ray.intersectObjects(targets, false);
    return hits.slice(0, 10).map(h => ({
      d: +h.distance.toFixed(2),
      chain: (() => { let c = h.object, s = []; while (c && s.length < 3) { s.push(c.name || c.type); c = c.parent; } return s.join('<'); })(),
      // موقعیت محلی نسبت به کابین برای شناسایی قطعه
      local: (() => {
        const p = g.player.cockpit.group.worldToLocal(h.point.clone());
        return p.toArray().map(v => +v.toFixed(2));
      })(),
      geom: h.object.geometry && h.object.geometry.parameters ? JSON.stringify(h.object.geometry.parameters).slice(0, 120) : '',
    }));
  });
  console.log('FP close hits:', JSON.stringify(hits2, null, 1));
  await browser.close();
  console.log('PROBE2 DONE');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
