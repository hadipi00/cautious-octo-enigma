// نقطه ورود — بارگذاری ۲۴ جنگنده + هسته WASM و راه‌اندازی
import { Game } from './game.js';
import { loadSettings } from './config.js';
import { simcore } from './wasm/simcore.js';

const canvas = document.getElementById('c');
const params = new URLSearchParams(location.search);

const PLANE_IDS = [
  // نسل اول
  'mig15bis', 'f5e', 'f104s', 'mig21bis',
  // جنگ سرد
  'f4e', 'mig23ml', 'miragef1', 'tornado', 'su24m',
  // ضربتی/تهاجمی
  'a10a', 'su25',
  // نسل چهارم
  'f14b', 'f15c', 'f16c', 'fa18c', 'mig29a', 'mirage2000c', 'su27s', 'su30sm',
  // دلتا-کانارد اروپا
  'jas39c', 'rafale', 'typhoon',
  // نسل پنجم/رهگیر سنگین
  'f22a', 'mig31bm',
];

async function boot() {
  // هسته محاسبات سنگین WASM — اگر لود نشد، بازی با fallback JS اجرا می‌شود
  await simcore.init();

  const specs = {};
  await Promise.all(PLANE_IDS.map(async (id) => {
    specs[id] = await (await fetch(`./src/aircraft/${id}.json`)).json();
  }));
  const game = new Game(canvas, specs, {
    debug: params.has('debug'),
    urlParams: [...params.keys()],
    settings: loadSettings(),
  });
  window.game = game;
  if (params.has('autotest') || params.has('sim')) {
    const mission = params.get('mission') || 'air';
    const plane = params.get('plane') || 'f16c';
    setTimeout(() => game.startMission(mission, plane), 400);
  }
}
boot().catch(err => {
  console.error(err);
  document.getElementById('loadMsg').textContent = 'خطا در بارگذاری: ' + err.message;
  document.getElementById('loadMsg').classList.remove('hidden');
});
