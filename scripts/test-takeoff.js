const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
  const page = await (await browser.newContext({ viewport: { width: 480, height: 270 } })).newPage();
  page.on('console', m => { const t = m.text(); if (t.includes('AUTOTEST')) console.log(t); });
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
  await page.addInitScript(() => localStorage.setItem('airdom.settings.v3', JSON.stringify({ quality: 'low' })));
  await page.goto('http://localhost:8123/?autotest&mission=free&plane=f16c', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.game, null, { timeout: 300000 });
  await page.waitForTimeout(400000);
  await browser.close();
  console.log('TAKEOFF-TEST END');
})().catch(e => { console.error('FAIL', String(e).slice(0,300)); process.exit(1); });
