// دیباگ ۳: منبع وایت‌اوت صحنه روی باند چیست؟ — خاموش/روشن کردن مظنون‌ها
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
  const page = await (await browser.newContext({ viewport: { width: 640, height: 360 } })).newPage();
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
  await page.addInitScript(() => localStorage.setItem('airdom.settings.v3', JSON.stringify({ quality: 'low' })));
  await page.goto('http://localhost:8123/?debug', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.game && document.getElementById('loading').style.opacity === '0', null, { timeout: 300000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => { game.startMission('free', 'f16c'); game.camMode = 1; });
  await page.waitForTimeout(1500);

  const canvasShot = async (name) => {
    const b64 = await page.evaluate(() => game.renderer.domElement.toDataURL('image/png').split(',')[1]);
    require('fs').writeFileSync(`/home/z/my-project/shots/probe-${name}.png`, Buffer.from(b64, 'base64'));
    console.log('probe-shot', name);
  };

  const sample = async () => page.evaluate(() => {
    // میانگین رنگ چند نقطه از فریم‌بافر — سنجش وایت‌اوت
    const gl = game.renderer.getContext();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = 0; y < h; y += 16) for (let x = 0; x < w; x += 16) {
      const i = (y * w + x) * 4; r += px[i]; g += px[i + 1]; b += px[i + 2]; n++;
    }
    return { avg: [Math.round(r / n), Math.round(g / n), Math.round(b / n)], w, h };
  });

  console.log('baseline:', await sample());
  await canvasShot('A-baseline');

  await page.evaluate(() => { game.scene.fog = null; });
  await page.waitForTimeout(300);
  console.log('no-fog:', await sample());
  await canvasShot('B-nofog');

  await page.evaluate(() => { game.scene.fog = new (Object.getPrototypeOf(game.scene.fog) || Object).constructor ? null : null; });
  // فلرها خاموش
  await page.evaluate(() => { for (const f of game.sky.flares) f.sp.visible = false; });
  await page.waitForTimeout(300);
  console.log('no-flare:', await sample());
  await canvasShot('C-noflare');

  // ابرها خاموش
  await page.evaluate(() => {
    for (const c of game.scene.children) if (c.type === 'Group') c.visible = c.visible === false ? true : c.children.length && c.children[0].type === 'Sprite' ? false : c.visible;
  });
  await page.waitForTimeout(300);
  console.log('no-clouds:', await sample());
  await canvasShot('D-noclouds');

  // آسمان خاموش
  await page.evaluate(() => { game.sky.sky.visible = false; });
  await page.waitForTimeout(300);
  console.log('no-sky:', await sample());
  await canvasShot('E-nosky');

  // نور خورشید نصف
  await page.evaluate(() => { game.sky.sky.visible = true; game.sun.intensity = 1.2; });
  await page.waitForTimeout(300);
  console.log('dim-sun:', await sample());
  await canvasShot('F-dimsun');

  await browser.close();
  console.log('PROBE3 DONE');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
