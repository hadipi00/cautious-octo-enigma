// اسکرین‌شات‌گیری از بازی AIRDOM — بعد از رفع باگ قاب کابین
const { chromium } = require('playwright');
const fs = require('fs');

const OUT = '/home/z/my-project/shots';
const URL = 'http://localhost:8123/?debug';
const SHOT_TIMEOUT = 240000;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 400)));
  page.on('console', m => { if (m.type() === 'error') console.log('[console-err]', m.text().slice(0, 300)); });

  await page.addInitScript(() => localStorage.setItem('airdom.settings.v3', JSON.stringify({ quality: 'medium' })));
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.game && window.game.menu && document.getElementById('loading').style.opacity === '0', null, { timeout: 300000 });
  await page.waitForTimeout(3000);
  console.log('boot ok');

  const shot = async (name) => {
    try {
      await page.screenshot({ path: `${OUT}/${name}.png`, timeout: SHOT_TIMEOUT });
      console.log('shot', name, '(page)');
    } catch (e) {
      const b64 = await page.evaluate(() => game.renderer.domElement.toDataURL('image/png').split(',')[1]);
      fs.writeFileSync(`${OUT}/${name}.png`, Buffer.from(b64, 'base64'));
      console.log('shot', name, '(canvas fallback)');
    }
  };

  await shot('01-hangar');

  // ===== مأموریت برتری هوایی =====
  await page.evaluate(() => game.startMission('air', 'f16c'));
  await page.waitForTimeout(2000);
  await shot('02-cockpit');

  await page.evaluate(() => { game.camMode = 1; });
  await page.waitForTimeout(1500);
  await shot('03-chase');

  // داگ‌فایت سینمایی: دشمن ۸۵۰ متری جلو + شلیک
  await page.evaluate(async () => {
    const THREE = await import('./vendor/three.module.min.js');
    const p = game.player;
    let e = null, bd = 1e12;
    for (const ac of game.aircraft) {
      if (!ac.alive || ac.team === 'blue') continue;
      const d = ac.st.pos.distanceTo(p.st.pos);
      if (d < bd) { bd = d; e = ac; }
    }
    if (e) {
      const dir = e.st.pos.clone().sub(p.st.pos).normalize();
      const want = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
      p.st.quat.slerp(want, 1).normalize();
      e.st.pos.copy(p.st.pos.clone().addScaledVector(dir, 750));
      e.st.vel.multiplyScalar(0.4);
      p.input.throttle = 1;
      (p.controls || game.controls).fireHeld = true;
    }
  });
  await page.waitForTimeout(1200);
  await shot('04-dogfight');
  await page.evaluate(() => { (game.player.controls || game.controls).fireHeld = false; });

  // ===== پرواز آزاد: شروع روی باند (واتاندر-استایل) =====
  await page.evaluate(() => {
    game.toMenu();
    game.startMission('free', 'f16c');
    game.camMode = 1;
    game._snapChaseCamera();
  });
  await page.waitForTimeout(1500);
  await shot('05-runway-takeoff');

  // کمی جلوتر در برخاست — جت روی باند با سرعت
  await page.evaluate(async () => {
    const THREE = await import('./vendor/three.module.min.js');
    const p = game.player;
    p.st.vel.set(0, 0, 95);
    p.st.throttle = 1;
  });
  await page.waitForTimeout(2500);
  await shot('06-takeoff-roll');

  // ===== عبور از فرودگاه =====
  await page.evaluate(() => {
    const p = game.player;
    p.st.pos.set(-4500, 320, -2600);
    p.st.quat.identity();
    p.st.vel.set(0, 0, 210);
    game.camMode = 2;
    game._snapChaseCamera();
  });
  await page.waitForTimeout(1800);
  await shot('07-airbase');

  // ===== سینمایی بالای کوه‌ها =====
  await page.evaluate(async () => {
    const THREE = await import('./vendor/three.module.min.js');
    const p = game.player;
    p.st.pos.set(3000, 3800, -6000);
    p.st.quat.setFromEuler(new THREE.Euler(-0.10, 0.75, 0.06, 'YXZ'));
    p.st.vel.set(0, 0, 240).applyQuaternion(p.st.quat);
    game.camMode = 1;
    game._snapChaseCamera();
  });
  await page.waitForTimeout(1800);
  await shot('08-cinematic');

  await browser.close();
  console.log('ALL DONE');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
