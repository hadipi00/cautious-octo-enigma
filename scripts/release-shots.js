// اسکرین‌شات‌های نهایی برای ریلیز v3.2 — کابین واقعی
const { chromium } = require('playwright');
const fs = require('fs');

const OUT = '/home/z/my-project/shots/release';
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
  page.on('console', m => { if (m.type() === 'error') console.log('[console-err]', m.text().slice(0, 200)); });

  await page.addInitScript(() => localStorage.setItem('airdom.settings.v3', JSON.stringify({ quality: 'medium' })));
  await page.goto('http://localhost:8123/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.game && document.getElementById('loading').style.opacity === '0', null, { timeout: 300000 });
  await page.waitForTimeout(4000);
  const shot = async (name) => {
    await page.screenshot({ path: `${OUT}/${name}.png`, timeout: 180000 });
    console.log('shot', name);
  };
  await shot('1-hangar');

  // ---- مأموریت برتری هوایی ----
  await page.evaluate(() => game.startMission('air', 'f16c'));
  await page.waitForTimeout(3000);
  // پرواز سطح‌پایین روی بیابان — نمای کابین
  await page.evaluate(() => {
    const p = game.player;
    p.st.pos.y = 750;
    p.st.vel.set(0, 0, 250).applyQuaternion(p.st.quat);
    p.input.throttle = 0.9;
    if (p.st.gear) p.input.gear = false;
    p.st.gForce = 1; p.st.blackout = 0; p.st.redout = 0;
  });
  await page.waitForTimeout(3500);
  await shot('2-cockpit-cruise');

  // ---- داگ‌فایت از کابین: دشمن جلو + هدف روی HUD ----
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
      // چرخش نرم به سمت دشمن
      let n = 0;
      const iv = setInterval(() => {
        p.st.quat.slerp(want, 0.25).normalize();
        p.st.gForce = 1; p.st.blackout = 0; p.st.redout = 0; p.st.stalled = false;
        if (++n >= 14) clearInterval(iv);
      }, 80);
      e.st.pos.copy(p.st.pos.clone().addScaledVector(dir, 900));
      e.st.vel.copy(dir).multiplyScalar(180);
    }
  });
  await page.waitForTimeout(2600);
  await shot('3-cockpit-dogfight');

  // ---- شیرجه با نردبان HUD ----
  await page.evaluate(() => {
    const p = game.player;
    let n = 0;
    const iv = setInterval(() => {
      const q = new (p.st.quat.constructor)();
      q.setFromAxisAngle(new (p.st.pos.constructor)(1, 0, 0), -0.05);
      p.st.quat.premultiply(q);
      p.st.gForce = 1; p.st.blackout = 0; p.st.redout = 0; p.st.stalled = false;
      if (++n >= 10) clearInterval(iv);
    }, 90);
  });
  await page.waitForTimeout(1800);
  await shot('4-cockpit-hud-ladder');

  // ---- نمای تعقیبی: بدنه + بازتاب آفتاب (پرواز تراز قفل‌شده) ----
  const holdLevel = async (bank = 0.12, alt = 700) => {
    await page.evaluate(async ({ bank, alt }) => {
      const THREE = await import('./vendor/three.module.min.js');
      const p = game.player;
      window.__holdIv && clearInterval(window.__holdIv);
      const yaw = (Math.atan2(p.st.vel.x, p.st.vel.z) + Math.PI) % (Math.PI * 2);
      window.__holdIv = setInterval(() => {
        p.st.quat.setFromEuler(new THREE.Euler(0, yaw, bank, 'YXZ'));
        p.st.vel.set(0, 0, 1).applyQuaternion(p.st.quat).multiplyScalar(240);
        p.st.pos.y = Math.max(p.st.pos.y, alt);
        p.st.gForce = 1; p.st.blackout = 0; p.st.redout = 0; p.st.stalled = false;
      }, 100);
    }, { bank, alt });
  };
  const releaseHold = async () => { await page.evaluate(() => window.__holdIv && clearInterval(window.__holdIv)); };

  await holdLevel(0.12, 700);
  await page.evaluate(() => { game.camMode = 1; });
  await page.waitForTimeout(2600);
  await shot('5-chase-sun');

  // ---- پایگاه هوایی: پرواز کم‌ارتفاع روی باند ----
  await page.evaluate(async () => {
    const THREE = await import('./vendor/three.module.min.js');
    const p = game.player;
    const B = { x: -4500, z: 0 };
    p.st.pos.set(B.x + 300, 200, B.z - 2400);
    window.__yawAB = Math.atan2(0 - B.z, 0 - (B.x + 300)); // تقریباً رو به باند
  });
  await holdLevel(0.08, 200);
  await page.waitForTimeout(2200);
  await shot('6-airbase-lowpass');
  await releaseHold();

  const stats = await page.evaluate(() => ({
    state: game.state, calls: game.renderer.info.render.calls, tris: game.renderer.info.render.triangles,
  }));
  console.log('stats', JSON.stringify(stats));
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
