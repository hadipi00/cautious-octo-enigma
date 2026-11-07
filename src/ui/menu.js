// ============================================================
// منو نسخه ۲ — آشیانه وارتاندر-سبک
//   پس‌زمینه: صحنه سه‌بعدی آشیانه با جت انتخابی روی سکو
//   چپ: انتخاب نبرد + تنظیمات + چندنفره · راست: کارت مشخصات جت
//   پایین: کاروسل ۲۴ جت · پایان: کارت نتیجه سینمایی
// ============================================================
import { loadSettings, saveSettings } from '../config.js';

const FLAGS = {
  USA: '🇺🇸 آمریکا', RUSSIA: '🇷🇺 روسیه', FRANCE: '🇫🇷 فرانسه',
  EUROPE: '🇪🇺 اروپا', SWEDEN: '🇸🇪 سوئد', UK: '🇬🇧 بریتانیا', GERMANY: '🇩🇪 آلمان',
};
const ROLES = {
  'era-korea': 'جنگنده نسل اول', dogfighter: 'جنگنده چرخشی', interceptor: 'رهگیر',
  multirole: 'چندمنظوره', strike: 'ضربتی', attack: 'تهاجمی', 'air superiority': 'برتری هوایی',
  'delta interceptor': 'دلتا رهگیر', 'multirole light': 'چندمنظوره سبک', stealth: 'پنهان‌کار',
};

export class Menu {
  constructor(game) {
    this.game = game;
    this.settings = game.settings;
    this.selIdx = 0;
    this.ids = Object.keys(game.specs);

    this.root = document.getElementById('hangarUI');
    this.results = document.getElementById('results');
    this.pauseUI = document.getElementById('pauseUI');
    this._bindHangar();
    this._bindResults();
    this._bindPause();
  }

  ready() {
    const load = document.getElementById('loading');
    load.style.opacity = '0';
    setTimeout(() => load.classList.add('hidden'), 650);
    this.root.style.display = 'block';
    // نام خلبان ذخیره‌شده
    if (this.settings.name && this.settings.name !== 'خلبان') {
      document.getElementById('mpName').value = this.settings.name;
    }
    this._refreshPilot();
  }

  selectedId() { return this.ids[this.selIdx]; }

  _refreshPilot() {
    document.getElementById('pilotName').textContent = this.game.settings.name || 'خلبان';
    document.getElementById('bestScore').textContent = String(this.game.best | 0);
  }

  // ---------- آشیانه ----------
  _bindHangar() {
    const g = this.game;

    const renderCard = () => {
      const spec = g.specs[this.ids[this.selIdx]];
      const s = spec.stats || {};
      document.getElementById('jetTier').textContent = FLAGS[spec.nation] || spec.nation;
      document.getElementById('jetName').textContent = spec.name;
      document.getElementById('jetMeta').textContent = `${ROLES[spec.role] || spec.role} · ${spec.nation}`;
      document.getElementById('stSpeed').style.width = `${Math.round((s.speed || 0.8) * 100)}%`;
      document.getElementById('stAgility').style.width = `${Math.round((s.agility || 0.8) * 100)}%`;
      document.getElementById('stFire').style.width = `${Math.round((s.firepower || 0.7) * 100)}%`;
      document.getElementById('stArmor').style.width = `${Math.round((s.armor || 0.8) * 100)}%`;
      const msl = (spec.missiles || []).map(m => `${m.name}×${m.count}`).join(' · ');
      document.getElementById('jetArm').innerHTML =
        `🔫 ${spec.guns[0].name} — ${spec.guns[0].ammo} گل<br>` +
        `🚀 ${msl || '—'}<br>` +
        `💣 بمب ${spec.bombs || 0} · راکت ${spec.rockets || 0} · فلر ${spec.flares}`;
      document.getElementById('jetCarName').textContent = spec.name;
      document.getElementById('jetCarIdx').textContent = `${this.selIdx + 1} / ${this.ids.length}`;
      g.showInHangar(spec.id);
    };
    this._renderCard = renderCard;

    document.getElementById('hangarLeft').onclick = () => {
      this.selIdx = (this.selIdx + 1) % this.ids.length; renderCard();
      g.audio.uiClick && g.audio.uiClick();
    };
    document.getElementById('hangarRight').onclick = () => {
      this.selIdx = (this.selIdx + this.ids.length - 1) % this.ids.length; renderCard();
      g.audio.uiClick && g.audio.uiClick();
    };
    renderCard();

    // دکمه‌های نبرد
    const go = (type) => {
      g.audio.init();
      const name = document.getElementById('mpName').value.trim();
      if (name) { g.settings.name = name; saveSettings({ ...this.settings, name }); this._refreshPilot(); }
      g.startMission(type, this.selectedId());
    };
    document.getElementById('btnAir').onclick = () => go('air');
    document.getElementById('btnBvr').onclick = () => go('bvr');
    document.getElementById('btnStrike').onclick = () => go('strike');
    document.getElementById('btnTeam').onclick = () => go('team');
    document.getElementById('btnFree').onclick = () => go('free');

    // تنظیمات
    const qs = document.getElementById('qualitySel');
    const rs = document.getElementById('resScaleSel');
    qs.value = this.settings.quality || 'high';
    rs.value = this.settings.autoRes === false ? '0' : '1';
    qs.onchange = () => { saveSettings({ ...this.settings, quality: qs.value }); location.reload(); };
    rs.onchange = () => { saveSettings({ ...this.settings, autoRes: rs.value === '1' }); location.reload(); };

    const sr = document.getElementById('sensRange');
    sr.value = Math.round((this.settings.sens || 1) * 100);
    document.getElementById('sensVal').textContent = `${sr.value}٪`;
    sr.oninput = () => {
      const v = sr.value / 100;
      document.getElementById('sensVal').textContent = `${sr.value}٪`;
      g.controls.sensitivity = v;
      saveSettings({ ...this.settings, sens: v });
    };

    // چندنفره
    document.getElementById('btnMp').onclick = () => { g.audio.init(); this._openMp(); };
  }

  _openMp() {
    const g = this.game;
    const name = document.getElementById('mpName').value.trim() || 'خلبان';
    const ip = document.getElementById('mpIp').value.trim();
    const status = document.getElementById('mpStatus');
    if (!ip) { status.textContent = 'آدرس IP میزبان را وارد کن (مثلاً 192.168.1.5)'; return; }
    saveSettings({ ...this.settings, name, mpHost: ip });
    g.settings.name = name; g.settings.mpHost = ip;
    status.textContent = 'در حال اتصال…';
    g.net.connect(ip, name, (ok, err) => {
      if (ok) {
        status.textContent = `✅ متصل شد (${g.net.remote.size + 1} خلبان)`;
        setTimeout(() => g.startMission('air', this.selectedId(), true), 600);
      } else {
        status.textContent = '❌ اتصال ناموفق: ' + err;
      }
    });
  }

  // ---------- پایان مأموریت ----------
  _bindResults() {
    const g = this.game;
    document.getElementById('btnAgain').onclick = () => g.restart();
    document.getElementById('btnHangar').onclick = () => g.toMenu();
  }

  showEnd(win, reason, stats) {
    const t = document.getElementById('resTitle');
    t.textContent = win ? 'VICTORY' : 'DEFEAT';
    t.className = win ? 'win' : 'lose';
    document.getElementById('resReason').textContent = reason || '';
    document.getElementById('rsScore').textContent = stats.score | 0;
    document.getElementById('rsKills').textContent = stats.kills | 0;
    document.getElementById('rsWave').textContent = stats.wave | 0;
    document.getElementById('rsBest').textContent = stats.best | 0;
    this._refreshPilot();
    this.show('end');
  }

  // ---------- توقف ----------
  _bindPause() {
    const g = this.game;
    document.getElementById('btnResume').onclick = () => g.resume();
    document.getElementById('btnRestart').onclick = () => g.restart();
    document.getElementById('btnToHangar').onclick = () => g.toMenu();
  }

  show(which) {
    this.root.style.display = which === 'main' ? 'block' : 'none';
    this.results.style.display = which === 'end' ? 'flex' : 'none';
    this.pauseUI.style.display = which === 'pause' ? 'flex' : 'none';
  }
}
