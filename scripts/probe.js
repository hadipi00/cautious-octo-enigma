// دیباگ: چرا جت بازیکن در نمای تعقیبی دیده نمی‌شود؟
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
  const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
  await page.addInitScript(() => localStorage.setItem('airdom.settings.v3', JSON.stringify({ quality: 'low' })));
  await page.goto('http://localhost:8123/?debug', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.game && document.getElementById('loading').style.opacity === '0', null, { timeout: 240000 });
  await page.waitForTimeout(1500);

  await page.evaluate(() => game.startMission('air', 'f16c'));
  await page.waitForTimeout(1500);

  const report = await page.evaluate(() => {
    const g = game, p = g.player;
    const kids = p.group.children.map(c => ({
      name: c.name || c.type, vis: c.visible, pos: c.position.toArray().map(v => +v.toFixed(2)),
    }));
    // ری‌کست از دوربین به جلو
    const rc = new (p.st.pos.constructor)();
    const ray = g.raycaster || null;
    return {
      camMode: g.camMode, fpActive: g._fpActive,
      camPos: g.camera.position.toArray().map(v => +v.toFixed(1)),
      camQuat: g.camera.quaternion.toArray().map(v => +v.toFixed(2)),
      playerPos: p.st.pos.toArray().map(v => +v.toFixed(1)),
      groupVisible: p.group.visible,
      cockpitHead: p.cockpitHead.toArray(),
      kids,
    };
  });
  console.log(JSON.stringify(report, null, 1));

  // ری‌کست واقعی با three از داخل صفحه
  const hit = await page.evaluate(async () => {
    const THREE = await import('./vendor/three.module.min.js');
    const g = game;
    const ray = new THREE.Raycaster();
    ray.near = 0.05; ray.far = 400;
    const origin = g.camera.position.clone();
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(g.camera.quaternion);
    ray.set(origin, dir);
    const targets = [];
    g.scene.traverse(o => { if (o.isMesh && o.visible && o.geometry) targets.push(o); });
    const hits = ray.intersectObjects(targets, false).slice(0, 8);
    return hits.map(h => ({
      d: +h.distance.toFixed(2),
      obj: h.object.name || h.object.type,
      chain: (() => { let c = h.object, s = []; while (c && s.length < 4) { s.push(c.name || c.type); c = c.parent; } return s.join('<'); })(),
      pt: h.point.toArray().map(v => +v.toFixed(1)),
    }));
  });
  console.log('FP ray hits:', JSON.stringify(hit));

  // حالت تعقیبی + فورس نمایش
  await page.evaluate(() => {
    game.camMode = 1;
    game.player.setExteriorVisible(true);
  });
  await page.waitForTimeout(1200);
  const vis2 = await page.evaluate(() => {
    const p = game.player;
    return {
      camPos: game.camera.position.toArray().map(v => +v.toFixed(1)),
      playerPos: p.st.pos.toArray().map(v => +v.toFixed(1)),
      groupVisible: p.group.visible,
      kidsVis: p.group.children.map(c => (c.name || c.type) + ':' + c.visible).join(' | '),
    };
  });
  console.log('CHASE:', JSON.stringify(vis2, null, 1));
  await page.screenshot({ path: '/home/z/my-project/shots/debug-chase-forced.png', timeout: 120000 });

  await browser.close();
  console.log('PROBE DONE');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
