// ============================================================
// منوها — اصلی با آشیانه، مولتی‌پلایر، توقف، پایان
// ============================================================
import { QUALITY, loadSettings, saveSettings } from '../config.js';

export class Menu {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('menu');
    this.settings = game.settings;
    this.selIdx = 0;
    this.ids = Object.keys(game.specs);
    this._buildMain();
    this._buildPause();
    this._buildEnd();
    this.show('main');
  }

  ready() { /* برای همگام‌سازی بعد از لود اسپک‌ها */ }

  // ---------- منوی اصلی ----------
  _buildMain() {
    const g = this.game;
    document.getElementById('loadMsg').classList.add('hidden');
    document.getElementById('menuBody').classList.remove('hidden');

    // آشیانه
    const car = document.getElementById('hangarCar');
    const prev = document.getElementById('hangarPrev');
    const render = () => {
      const spec = g.specs[this.ids[this.selIdx]];
      const s = spec.stats || {};
      const msl0 = (spec.missiles && spec.missiles[0]) ? spec.missiles[0].count : 0;
      const bar = (v) => {
        let out = '';
        for (let i = 0; i < 10; i++) out += i < Math.round(v * 10) ? '▰' : '▱';
        return out;
      };
      prev.innerHTML = `
        <div class="planeName">${spec.name}</div>
        <div class="planeMeta">${spec.nation} · ${spec.role}</div>
        <div class="statRow"><span>سرعت</span><b>${bar(s.speed || 0.8)}</b></div>
        <div class="statRow"><span>چابکی</span><b>${bar(s.agility || 0.8)}</b></div>
        <div class="statRow"><span>آتش</span><b>${bar(s.firepower || 0.7)}</b></div>
        <div class="statRow"><span>بدنه</span><b>${bar(s.armor || 0.8)}</b></div>
        <div class="planeArm">توپ ${spec.guns[0].ammo} · موشک ${msl0} · بمب ${spec.bombs || 0} · فلر ${spec.flares}</div>`;
      car.textContent = `◀  ${this.selIdx + 1} / ${this.ids.length}  ▶`;
      car.dataset.id = spec.id;
    };
    document.getElementById('hangarLeft').onclick = () => {
      this.selIdx = (this.selIdx + this.ids.length - 1) % this.ids.length; render();
    };
    document.getElementById('hangarRight').onclick = () => {
      this.selIdx = (this.selIdx + 1) % this.ids.length; render();
    };
    render();

    // دکمه‌های مأموریت
    const sel = () => car.dataset.id;
    document.getElementById('btnFree').onclick = () => { g.audio.init(); g.startMission('free', sel()); };
    document.getElementById('btnAir').onclick = () => { g.audio.init(); g.startMission('air', sel()); };
    document.getElementById('btnBvr').onclick = () => { g.audio.init(); g.startMission('bvr', sel()); };
    document.getElementById('btnStrike').onclick = () => { g.audio.init(); g.startMission('strike', sel()); };
    document.getElementById('btnTeam').onclick = () => { g.audio.init(); g.startMission('team', sel()); };
    document.getElementById('btnMp').onclick = () => { g.audio.init(); this._openMp(); };

    // تنظیمات
    const qs = document.getElementById('qualitySel');
    const rs = document.getElementById('resScaleSel');
    qs.value = this.settings.quality; rs.value = this.settings.autoRes ? '1' : '0';
    qs.onchange = () => { saveSettings({ ...this.settings, quality: qs.value }); location.reload(); };
    rs.onchange = () => { saveSettings({ ...this.settings, autoRes: rs.value === '1' }); location.reload(); };
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
        setTimeout(() => g.startMission('air', this.ids[this.selIdx], true), 600);
      } else {
        status.textContent = '❌ اتصال ناموفق: ' + err;
      }
    });
  }

  // ---------- توقف ----------
  _buildPause() {
    const g = this.game;
    this.pausePanel = this._panel([
      ['ادامه پرواز', 'primary', () => g.resume()],
      ['شروع دوباره مأموریت', '', () => g.restart()],
      ['منوی اصلی', '', () => g.toMenu()],
    ], 'توقف', 'Esc ادامه');
  }

  // ---------- پایان ----------
  _buildEnd() {
    this.endPanel = this._panel([], 'پایان مأموریت', '');
    this.endTitle = this.endPanel.querySelector('.ptitle');
    this.endReason = document.createElement('div');
    this.endReason.className = 'reason';
    this.endPanel.insertBefore(this.endReason, this.endPanel.querySelector('.btn'));
    this.endStats = document.createElement('div');
    this.endStats.className = 'endStats';
    this.endPanel.insertBefore(this.endStats, this.endPanel.querySelector('.btn'));
    const g = this.game;
    const b1 = document.createElement('button');
    b1.className = 'btn primary'; b1.textContent = 'پرواز دوباره';
    b1.onclick = () => g.restart();
    const b2 = document.createElement('button');
    b2.className = 'btn'; b2.textContent = 'منوی اصلی';
    b2.onclick = () => g.toMenu();
    this.endPanel.appendChild(b1);
    this.endPanel.appendChild(b2);
  }

  showEnd(win, reason, stats) {
    this.endTitle.textContent = win ? '🏆 مأموریت موفق' : 'مأموریت پایان یافت';
    this.endTitle.style.color = win ? '#9dffb0' : '#ff8a7a';
    this.endReason.textContent = reason || '';
    this.endStats.innerHTML =
      `<span>امتیاز <b>${stats.score}</b></span>` +
      `<span>سرنگونی <b>${stats.kills}</b></span>` +
      `<span>موج <b>${stats.wave}</b></span>` +
      `<span>رکورد <b>${stats.best}</b></span>`;
    this.show('end');
  }

  _panel(buttons, title, hint) {
    const p = document.createElement('div');
    p.className = 'panel hidden';
    const h = document.createElement('div');
    h.className = 'ptitle';
    h.style.direction = 'rtl';
    h.textContent = title;
    p.appendChild(h);
    for (const [txt, cls, fn] of buttons) {
      const b = document.createElement('button');
      b.className = 'btn ' + cls;
      b.textContent = txt;
      b.onclick = fn;
      p.appendChild(b);
    }
    if (hint) {
      const d = document.createElement('div');
      d.className = 'hint';
      d.textContent = hint;
      p.appendChild(d);
    }
    this.root.appendChild(p);
    return p;
  }

  show(which) {
    document.getElementById('menuPanel').classList.toggle('hidden', which !== 'main');
    if (this.pausePanel) this.pausePanel.classList.toggle('hidden', which !== 'pause');
    if (this.endPanel) this.endPanel.classList.toggle('hidden', which !== 'end');
    this.root.style.display = which ? 'flex' : 'none';
  }
}
