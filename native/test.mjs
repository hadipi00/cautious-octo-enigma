// ============================================================
// تست واحد هسته WASM — مستقل از مرورگر (node test.mjs)
// ============================================================
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const bytes = readFileSync(join(here, '..', 'src', 'wasm', 'simcore.wasm'));
const { instance } = await WebAssembly.instantiate(bytes, {});
const e = instance.exports;
const mem = new DataView(e.memory.buffer);

let fails = 0;
function check(name, cond, info = '') {
  if (cond) console.log(`  ✔ ${name} ${info}`);
  else { console.error(`  ✘ ${name} ${info}`); fails++; }
}

// ---------- ۱) ballistic_batch ----------
{
  const ptr = 1024;
  // یک پرتابه: از (0,1000,0) با سرعت (100,0,0) — بدون درگ، گرانش 9.81
  mem.setFloat64(ptr, 0, true);       mem.setFloat64(ptr + 8, 1000, true); mem.setFloat64(ptr + 16, 0, true);
  mem.setFloat64(ptr + 24, 100, true); mem.setFloat64(ptr + 32, 0, true);  mem.setFloat64(ptr + 40, 0, true);
  const dt = 0.1;
  e.ballistic_batch(ptr, 1, dt, 9.81, 0);
  const x = mem.getFloat64(ptr, true), y = mem.getFloat64(ptr + 8, true);
  const vy = mem.getFloat64(ptr + 32, true);
  check('ballistic: x += v*dt', Math.abs(x - 10) < 1e-9, `x=${x.toFixed(4)}`);
  // اویلر نیمه‌ضمنی: اول سرعت، بعد موقعیت → y = 1000 - g*dt²
  check('ballistic: y semi-implicit', Math.abs(y - (1000 - 9.81 * dt * dt)) < 1e-9, `y=${y.toFixed(4)}`);
  check('ballistic: vy -= g*dt', Math.abs(vy + 0.981) < 1e-9, `vy=${vy.toFixed(4)}`);

  // درگ خطی: سرعت باید کاهش یابد
  mem.setFloat64(ptr + 24, 100, true);
  e.ballistic_batch(ptr, 1, 0.1, 0, 0.5);
  const vx2 = mem.getFloat64(ptr + 24, true);
  check('ballistic: linear drag', Math.abs(vx2 - 100 * 0.95) < 1e-9, `vx=${vx2.toFixed(4)}`);

  // دسته‌ای: ۳ پرتابه مستقل
  for (let i = 0; i < 3; i++) {
    mem.setFloat64(ptr + i * 48, i, true);
    mem.setFloat64(ptr + i * 48 + 24, 10 * (i + 1), true);
  }
  e.ballistic_batch(ptr, 3, 0.05, 0, 0);
  // آیتم سوم: x = 2 + 30*0.05 = 3.5
  check('ballistic: batch of 3', Math.abs(mem.getFloat64(ptr + 96, true) - 3.5) < 1e-9,
    `x3=${mem.getFloat64(ptr + 96, true).toFixed(4)}`);
}

// ---------- ۲) radar_scan ----------
{
  // رادار در مبدأ رو به +Z
  const ptr = 65536, out = 131072;
  // تماس ۱: جلو ۵۰۰۰م، RCS=5، mult=1 → باید شناسایی شود (snr=5e12/6.25e14=8e-3؟ نه: 5/5000^4*1e12=5/625=0.008)
  // آستانه را 0.004 می‌گذاریم → detect
  mem.setFloat64(ptr, 0, true); mem.setFloat64(ptr + 8, 1000, true); mem.setFloat64(ptr + 16, 5000, true);
  mem.setFloat64(ptr + 24, 5, true); mem.setFloat64(ptr + 32, 1, true);
  // تماس ۲: پشت رادار (z=-5000) → خارج کون
  mem.setFloat64(ptr + 40, 0, true); mem.setFloat64(ptr + 48, 1000, true); mem.setFloat64(ptr + 56, -5000, true);
  mem.setFloat64(ptr + 64, 5, true); mem.setFloat64(ptr + 72, 1, true);
  // تماس ۳: جلو ولی خیلی دور ۴۰۰۰۰م → snr=5e12/2.56e21*… تقریباً صفر → شناسایی نشود
  mem.setFloat64(ptr + 80, 0, true); mem.setFloat64(ptr + 88, 1000, true); mem.setFloat64(ptr + 96, 40000, true);
  mem.setFloat64(ptr + 104, 5, true); mem.setFloat64(ptr + 112, 1, true);

  const count = e.radar_scan(0, 0, 0, 0, 0, 1, 0.5, 20000, 0.004, ptr, 3, out);
  check('radar: detects front contact', mem.getFloat64(out, true) === 1, `count=${count}`);
  check('radar: rejects behind contact', mem.getFloat64(out + 16, true) === 0, '');
  check('radar: rejects far contact', mem.getFloat64(out + 32, true) === 0, '');
  check('radar: detected count = 1', count === 1, `count=${count}`);

  // ناتچینگ: mult=0.05 → snr مؤثر کم → شناسایی نشود
  mem.setFloat64(ptr + 32, 0.05, true);
  const c2 = e.radar_scan(0, 0, 0, 0, 0, 1, 0.5, 20000, 0.004, ptr, 1, out);
  check('radar: notched contact undetected', c2 === 0, `count=${c2}`);
}

// ---------- ۳) lead_solve ----------
{
  // هدف در (0,0,5000) با سرعت (100,0,0)، شلیک‌کننده در مبدأ، mv=1000
  // حل دقیق: t از |(100t, 0, 5000)| = 1000t → 10000t²+25e6 = 1e6 t² → t=√(25e6/990000)≈5.025
  const t = e.lead_solve(0, 0, 5000, 100, 0, 0, 0, 0, 0, 1000);
  check('lead: converges to analytic', Math.abs(t - 5.0252) < 0.01, `t=${t.toFixed(4)}`);

  // هدف ثابت → t = d/mv
  const t2 = e.lead_solve(0, 0, 3000, 0, 0, 0, 0, 0, 0, 1500);
  check('lead: static target t=d/mv', Math.abs(t2 - 2) < 1e-9, `t=${t2.toFixed(4)}`);
}

// ---------- ۴) lead_batch ----------
{
  const ptr = 4096;
  mem.setFloat64(ptr, 0, true); mem.setFloat64(ptr + 8, 0, true); mem.setFloat64(ptr + 16, 3000, true);
  mem.setFloat64(ptr + 72, 0, true);
  e.lead_batch(ptr, 1, 1500);
  const t = mem.getFloat64(ptr + 72, true);
  check('lead_batch writes result', Math.abs(t - 2) < 1e-9, `t=${t.toFixed(4)}`);
}

if (fails) { console.error(`\n${fails} TEST(S) FAILED`); process.exit(1); }
console.log('\nALL WASM TESTS PASSED ✔');
