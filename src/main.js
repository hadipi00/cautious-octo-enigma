// نقطه ورود — بارگذاری ۲۴ جنگنده + هسته WASM با نوار پیشرفت، سپس آشیانه
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

const TIPS = [
  'موس = اهرم پرواز؛ دماغه همیشه به سمت نشانگر می‌رود',
  'نگه‌داشتن Ctrl موس را به «سر خلبان» تبدیل می‌کند — اطرافت را ببین',
  'اسکرول موس = گاز · Z = افتربرنر',
  'در نبرد بی‌آر با N رادار را روشن و از ۲۵ کیلومتری شلیک کن',
  'فلر (C) موشک حرارتی را فریب می‌دهد؛ چف رادار را قطع می‌کند',
  'پشت دشمن بمان تا موشک حرارتی گرمای موتورش را بگیرد',
  'با G چرخ فرود را جمع کن — مقاومت کمتر، سرعت بیشتر',
  'گردباد نوک بال (G بالا) نشانه چرخش تند است — عالی برای داگ‌فایت',
];

const loadBar = document.getElementById('loadBar');
const loadTip = document.getElementById('loadTip');
const TOTAL = PLANE_IDS.length + 2; // specs + wasm + سازه
let loaded = 0;
let tipIdx = (Math.random() * TIPS.length) | 0;
const tipTimer = setInterval(() => {
  tipIdx = (tipIdx + 1) % TIPS.length;
  loadTip.textContent = '💡 ' + TIPS[tipIdx];
}, 2600);
loadTip.textContent = '💡 ' + TIPS[tipIdx];

function progress() {
  loaded++;
  loadBar.style.width = Math.min(100, (loaded / TOTAL) * 100) + '%';
}

async function boot() {
  // هسته محاسبات سنگین WASM — اگر لود نشد، بازی با fallback JS اجرا می‌شود
  loadTip.textContent = '⚙ بارگذاری هسته WASM…';
  await simcore.init();
  progress();

  const specs = {};
  await Promise.all(PLANE_IDS.map(async (id) => {
    specs[id] = await (await fetch(`./src/aircraft/${id}.json`)).json();
    progress();
  }));

  loadTip.textContent = '🏗 ساخت آشیانه…';
  const game = new Game(canvas, specs, {
    debug: params.has('debug'),
    urlParams: [...params.keys()],
    settings: loadSettings(),
  });
  window.game = game;
  clearInterval(tipTimer);
  if (params.has('autotest') || params.has('sim')) {
    const mission = params.get('mission') || 'air';
    const plane = params.get('plane') || 'f16c';
    setTimeout(() => game.startMission(mission, plane), 400);
  }
}
boot().catch(err => {
  console.error(err);
  clearInterval(tipTimer);
  loadTip.textContent = '❌ خطا در بارگذاری: ' + err.message;
});
