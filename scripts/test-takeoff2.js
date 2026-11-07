// تست برخاست از باند: گاز کامل + نمونه‌برداری سرعت/ارتفاع
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
  const page = await (await browser.newContext({ viewport: { width: 480, height: 270 } })).newPage();
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
  await page.addInitScript(() => localStorage.setItem('airdom.settings.v3', JSON.stringify({ quality: 'low' })));
  await page.goto('http://localhost:8123/?debug', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.game && document.getElementById('loading').style.opacity === '0', null, { timeout: 300000 });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    game.startMission('free', 'f16c');
    game.controls.throttle = 1;
    game.controls.ab = true;
  });
  const samples = [];
  for (let i = 0; i < 26; i++) {
    await page.waitForTimeout(4000);
    const s = await page.evaluate(() => {
      const st = game.player.st;
      return {
        t: +game._t.toFixed(1), V: Math.round(st.V), alt: Math.round(st.pos.y),
        agl: Math.round(st.pos.y - st.groundY), ground: st.onGround, alive: st.alive,
        lift: Math.round(st.lift), mach: +st.mach.toFixed(2),
      };
    });
    samples.push(s);
    console.log(JSON.stringify(s));
    if (!s.alive) { console.log('CRASHED'); break; }
    if (s.agl > 120) { console.log('AIRBORNE ✓'); break; }
  }
  await browser.close();
})().catch(e => { console.error('FAIL', String(e).slice(0, 300)); process.exit(1); });
