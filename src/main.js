// نقطه ورود — بارگذاری ۶ جنگنده و راه‌اندازی
import { Game } from './game.js';
import { loadSettings } from './config.js';

const canvas = document.getElementById('c');
const params = new URLSearchParams(location.search);

const PLANE_IDS = ['f16c', 'f14b', 'su27s', 'mig29a', 'mirage2000c', 'jas39c'];

async function boot() {
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
