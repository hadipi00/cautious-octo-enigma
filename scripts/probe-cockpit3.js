// پروب کابین نسخه ۳ — عکس‌های نمای خلبان + چک خطاها
const { chromium } = require('playwright');
const fs = require('fs');

const OUT = '/home/z/my-project/shots';
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 500)));
  page.on('console', m => { if (m.type() === 'error') console.log('[console-err]', m.text().slice(0, 400)); });

  await page.addInitScript(() => localStorage.setItem('airdom.settings.v3', JSON.stringify({ quality: 'low' })));
  await page.goto('http://localhost:8123/?debug', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.game && document.getElementById('loading').style.opacity === '0', null, { timeout: 300000 });
  await page.waitForTimeout(2500);
  console.log('boot ok');

  await page.evaluate(() => game.startMission('air', 'f16c'));
  await page.waitForTimeout(4500);

  // استیت پروازی پایدار: ارتفاع + سرعت (و ریست G تا وینیت سیاه نیاید)
  await page.evaluate(() => {
    const p = game.player;
    p.st.pos.y = Math.max(p.st.pos.y, 900);
    p.st.vel.set(0, 0, 240).applyQuaternion(p.st.quat);
    p.input.throttle = 0.9;
    if (p.st.gear) p.input.gear = false;
    p.st.gForce = 1; p.st.blackout = 0; p.st.redout = 0; p.st.stalled = false;
  });
  await page.waitForTimeout(2500);
  console.log('state', JSON.stringify(await page.evaluate(() => ({
    compact: game.hud._compact, spd: document.getElementById('spd').style.display, mode: game.camMode,
  }))));
  await page.screenshot({ path: `${OUT}/c31-cockpit-level.png` });
  console.log('shot level');

  // غلتش نرم به راست — افق مصنوعی + نردبان HUD
  await page.evaluate(() => {
    const p = game.player;
    let n = 0;
    const iv = setInterval(() => {
      const q = new (p.st.quat.constructor)();
      q.setFromAxisAngle(new (p.st.pos.constructor)(0, 0, 1), 0.035);
      p.st.quat.multiply(q);
      p.st.gForce = 1; p.st.blackout = 0; p.st.redout = 0; p.st.stalled = false;
      if (++n >= 14) clearInterval(iv);
    }, 90);
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/c32-cockpit-roll.png`, timeout: 180000 });
  console.log('shot roll');

  // شیرجه‌ی نرم برای نردبان منفی
  await page.evaluate(() => {
    const p = game.player;
    let n = 0;
    const iv = setInterval(() => {
      const q = new (p.st.quat.constructor)();
      q.setFromAxisAngle(new (p.st.pos.constructor)(1, 0, 0), -0.09);
      p.st.quat.premultiply(q);
      p.st.gForce = 1; p.st.blackout = 0; p.st.redout = 0; p.st.stalled = false;
      if (++n >= 18) clearInterval(iv);
    }, 90);
  });
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `${OUT}/c33-cockpit-dive.png`, timeout: 180000 });
  console.log('shot dive');

  // نمای بیرونی برای سالم ماندن بقیه بازی
  await page.evaluate(() => { game.camMode = 1; });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/c34-chase.png`, timeout: 180000 });
  console.log('shot chase');

  // خطاهای بعدی؟
  await page.waitForTimeout(2500);
  const stats = await page.evaluate(() => ({
    fps: game._fpsBadge || '', mode: game.camMode, state: game.state,
    calls: game.renderer.info.render.calls, tris: game.renderer.info.render.triangles,
  }));
  console.log('stats', JSON.stringify(stats));
  await browser.close();
})().catch(e => { console.error('PROBE FAIL', e); process.exit(1); });
