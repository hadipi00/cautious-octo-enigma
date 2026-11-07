// ============================================================
// HUD کابین — ابزارها، اهداف، قفل، RWR زنده، پیپر توپ (WASM)، امتیاز
// ============================================================
import * as THREE from 'three';
import { WEAPONS } from '../config.js';
import { simcore } from '../wasm/simcore.js';

const IDS = ['hud', 'f3', 'fpsBadge', 'hdg', 'spd', 'alt', 'gload', 'thr', 'wpn',
  'warn', 'banner', 'killfeed', 'score', 'strike', 'velMarker', 'vignette', 'dmg',
  'tgtBox', 'tgtInfo', 'camLabel', 'hitmarker', 'rwr', 'pipper'];

const GREEN = '#9dffb0', RED = '#ff5050', AMBER = '#ffb340';

const _behindTmp = new THREE.Vector3();
const _camDir = new THREE.Vector3();
function _isBehind(cam, pos) {
  _behindTmp.copy(pos).sub(cam.position);
  _camDir.set(0, 0, -1).applyQuaternion(cam.quaternion);
  return _behindTmp.dot(_camDir) < 0;
}

export class HUD {
  constructor() {
    this.el = {};
    for (const id of IDS) this.el[id] = document.getElementById(id);
    this.acc = 0; this.f3on = false;
    this._v = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._lead = new THREE.Vector3();
    this._hitT = 0;
    this.el.tgtBox.style.width = '40px';
    this.el.tgtBox.style.height = '40px';
    this._rwrCtx = this.el.rwr ? this.el.rwr.getContext('2d') : null;
  }

  show(on) { this.el.hud.style.display = on ? 'block' : 'none'; }
  toggleF3() { this.f3on = !this.f3on; this.el.f3.style.display = this.f3on ? 'block' : 'none'; }
  setCamLabel(t) { this.el.camLabel.textContent = t; }
  setBadge(t) { this.el.fpsBadge.textContent = t; }
  setF3(t) { if (this.f3on) this.el.f3.textContent = t; }
  flashDamage() { this.el.dmg.style.opacity = 0.55; }
  hitMarker() { this._hitT = 0.18; }
  banner(t, ms = 3000) {
    this.el.banner.textContent = t;
    this.el.banner.style.opacity = 1;
    clearTimeout(this._banT);
    this._banT = setTimeout(() => { this.el.banner.style.opacity = 0; }, ms);
  }
  killFeed(t) {
    const d = document.createElement('div');
    d.textContent = t;
    d.style.opacity = 1;
    this.el.killfeed.prepend(d);
    while (this.el.killfeed.children.length > 5) this.el.killfeed.lastChild.remove();
    setTimeout(() => {
      d.style.transition = 'opacity 1s';
      d.style.opacity = 0;
      setTimeout(() => d.remove(), 1000);
    }, 3500);
  }

  update(dt, game) {
    const p = game.player;
    if (!p) return;
    const st = p.st, spec = p.spec;
    const E = this.el;

    // ---- وینیت آسیب/G ----
    const dmgO = parseFloat(E.dmg.style.opacity || 0);
    if (dmgO > 0) E.dmg.style.opacity = Math.max(0, dmgO - dt * 1.6).toFixed(2);
    E.vignette.style.opacity = Math.max(st.blackout, st.redout * 0.9).toFixed(2);
    this._hitT = Math.max(0, this._hitT - dt);
    E.hitmarker.style.opacity = this._hitT > 0 ? 1 : 0;

    // ---- نشانگر بردار سرعت (هر فریم) ----
    const vm = E.velMarker;
    if (st.V > 30 && st.alive) {
      this._v.copy(st.pos).addScaledVector(st.vel, 3).project(game.camera);
      if (this._v.z < 1 && Math.abs(this._v.x) < 1.15 && Math.abs(this._v.y) < 1.15) {
        vm.style.display = 'block';
        vm.style.left = ((this._v.x * 0.5 + 0.5) * 100) + '%';
        vm.style.top = ((-this._v.y * 0.5 + 0.5) * 100) + '%';
      } else vm.style.display = 'none';
    } else vm.style.display = 'none';

    // ---- جعبه اهداف + پیپر توپ (هر فریم) ----
    this._updateTargets(game);

    // ---- RWR (۱۰ هرتز) ----
    if (this._rwrCtx) this._drawRwr(game);

    // ---- متن‌ها ۱۰ هرتز ----
    this.acc += dt;
    if (this.acc < 0.1) return;
    this.acc = 0;

    this._fwd.set(0, 0, 1).applyQuaternion(st.quat);
    const hdg = (Math.atan2(this._fwd.x, this._fwd.z) * 180 / Math.PI + 360) % 360;

    E.spd.textContent = `IAS ${String(Math.round(st.V * 3.6)).padStart(3, ' ')} KM/H\nMACH ${st.mach.toFixed(2)}`;
    E.alt.textContent = `ALT ${String(Math.round(st.pos.y)).padStart(5, ' ')} M\nAGL ${String(Math.max(0, Math.round(st.pos.y - st.groundY))).padStart(5, ' ')} M\nVS ${st.vel.y >= 0 ? '+' : ''}${Math.round(st.vel.y * 60)}`;
    E.hdg.textContent = `HDG ${String(Math.round(hdg)).padStart(3, '0')}°`;
    E.gload.textContent = `G ${st.gForce.toFixed(1)}   AOA ${(st.alpha * 180 / Math.PI).toFixed(1)}°`;
    E.thr.textContent =
      `THR ${Math.round(st.throttle * 100)}%${st.afterburner ? ' ●AB' : ''}\n` +
      `FUEL ${Math.round((st.fuel / spec.fuelCap) * 100)}%\n` +
      `GEAR ${st.gear ? 'DOWN' : 'UP'}   FLAP ${Math.round(st.flaps * 100)}%`;

    // ---- تسلیحات + رادار ----
    const sel = p.selectedStation();
    const rMode = p.radar ? p.radar.mode.toUpperCase() : 'IR';
    const lockTxt = !p.lockTarget ? ''
      : p.lockT >= (p.lockSource === 'radar' && sel && sel.type === 'sarh' ? WEAPONS.lockTime : (sel && sel.type === 'arh' ? 0.4 : WEAPONS.lockTime)) ? ' 🔒'
      : ' …';
    E.wpn.textContent =
      `RDR ${rMode}\n` +
      `GUN ${p.gunAmmo}\n` +
      (sel ? `MSL ${sel.name.split(' ')[0]} ${sel.left}${lockTxt}\n` : 'MSL —\n') +
      `BMB ${p.bombs}   RKT ${p.rockets}\n` +
      `FLR ${p.flares}   CHF ${p.chaff}`;

    E.score.textContent = `SCORE ${game.score}   WAVE ${game.wave}   KILLS ${game.kills}   BEST ${game.best}`;

    if (game.missionType === 'strike') {
      E.strike.textContent = `اهداف باقی‌مانده بیس: ${Math.max(0, game._strikeLeft)}`;
      E.strike.style.display = 'block';
    } else E.strike.style.display = 'none';

    // ---- هشدارها ----
    let warn = '';
    if (st.alive) {
      const msl = game.rwr.msl;
      if (msl) warn = msl.kind === 'ir' ? '!! MISSILE — فلر (C) و پیچ شدید !!' : '!! RADAR MISSILE — چف (C) و ناتچ !!';
      else if (st.stalled) warn = 'STALL';
      else if (!st.gear && st.pos.y - st.groundY < 130 && st.vel.y < -6) warn = 'GEAR!';
      else if (st.pos.y - st.groundY < 160 && st.vel.y < -14) warn = 'PULL UP';
      else if (st.fuel <= 0) warn = 'FUEL OUT';
    }
    E.warn.textContent = warn;
    E.warn.classList.toggle('blink', !!warn);
  }

  // ---------- RWR: صفحه هشدار راداری ----------
  _drawRwr(game) {
    const g = this._rwrCtx;
    const cv = this.el.rwr;
    const W = cv.width, H = cv.height;
    const cx = W / 2, cy = H / 2, R = W / 2 - 8;
    g.clearRect(0, 0, W, H);
    // پس‌زمینه
    g.fillStyle = 'rgba(4,10,8,0.55)';
    g.beginPath(); g.arc(cx, cy, R + 6, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#1d3a30'; g.lineWidth = 2;
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(cx, cy, R / 2, 0, Math.PI * 2); g.stroke();

    // جهت جت خودی = بالا
    const p = game.player;
    this._fwd.set(0, 0, 1).applyQuaternion(p.st.quat);
    const hdg = Math.atan2(this._fwd.x, this._fwd.z);

    const drawThreat = (bearingWorld, type, blink) => {
      const rel = bearingWorld - hdg;
      const x = cx + Math.sin(rel) * (R - 14);
      const y = cy - Math.cos(rel) * (R - 14);
      if (type === 'lock') {
        g.fillStyle = RED;
        g.beginPath();
        g.moveTo(x, y - 8); g.lineTo(x + 7, y + 6); g.lineTo(x - 7, y + 6);
        g.closePath(); g.fill();
      } else if (type === 'msl') {
        if (!blink) return;
        g.strokeStyle = RED; g.lineWidth = 3;
        g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.stroke();
      } else if (type === 'sam') {
        g.fillStyle = AMBER;
        g.save(); g.translate(x, y); g.rotate(Math.PI / 4);
        g.fillRect(-5, -5, 10, 10); g.restore();
      } else {
        g.strokeStyle = AMBER; g.lineWidth = 2;
        g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.stroke();
      }
    };

    const doBlink = (Date.now() % 440) < 220;
    for (const b of game.rwr.sam) drawThreat(b, 'sam', false);
    for (const b of game.rwr.search) drawThreat(b, 'search', false);
    for (const b of game.rwr.lock) drawThreat(b, 'lock', false);
    if (game.rwr.msl) {
      // موشک: جهت تقریبی از ناحیه تهدید اصلی یا جلو
      const b = game.rwr.lock[0] ?? game.rwr.search[0] ?? 0;
      drawThreat(b, 'msl', doBlink);
    }
  }

  _updateTargets(game) {
    const E = this.el;
    const p = game.player;
    const cam = game.camera;
    const vs = { w: innerWidth, h: innerHeight };
    // نزدیک‌ترین دشمن = جعبه اصلی؛ بقیه ساده
    let nearest = null, nd = 1e12;
    const enemies = game.aircraft.filter(a => a.alive && a.team === 'red');
    for (const e of enemies) {
      const d = e.st.pos.distanceTo(p.st.pos);
      if (d < nd) { nd = d; nearest = e; }
    }
    if (nearest && !_isBehind(cam, nearest.st.pos)) {
      this._v.copy(nearest.st.pos).project(cam);
      if (Math.abs(this._v.x) < 1.1 && Math.abs(this._v.y) < 1.1) {
        E.tgtBox.style.display = 'block';
        E.tgtBox.style.left = ((this._v.x * 0.5 + 0.5) * 100) + '%';
        E.tgtBox.style.top = ((-this._v.y * 0.5 + 0.5) * 100) + '%';
        E.tgtBox.style.borderColor = p.lockTarget === nearest ? GREEN : RED;
        E.tgtInfo.style.display = 'block';
        E.tgtInfo.style.left = ((this._v.x * 0.5 + 0.5) * 100) + '%';
        E.tgtInfo.style.top = ((-this._v.y * 0.5 + 0.5) * 100 + 26) + 'px';
        E.tgtInfo.textContent =
          `${nearest.spec.id.toUpperCase()}  ${(nd / 1000).toFixed(1)}km\n${nearest.hp}/${nearest.hpMax}`;
        if (p.lockTarget === nearest && p.lockT >= 0.4) {
          E.tgtInfo.textContent += '  🔒';
        }
        this._updatePipper(game, nearest);
        return;
      }
    }
    E.tgtBox.style.display = 'none';
    E.tgtInfo.style.display = 'none';
    E.pipper.style.display = 'none';
  }

  // پیپر توپ — حل پیش‌روی با هسته WASM
  _updatePipper(game, target) {
    const E = this.el;
    const p = game.player;
    const show = p.lockTarget === target && p.lockT >= 0.4 && p.gunAmmo > 0
      && target.st.pos.distanceTo(p.st.pos) < 2600 && target.st.vel.lengthSq() > 100;
    if (!show) { E.pipper.style.display = 'none'; return; }
    const t = simcore.lead(
      target.st.pos.x, target.st.pos.y, target.st.pos.z,
      target.st.vel.x, target.st.vel.y, target.st.vel.z,
      p.st.pos.x, p.st.pos.y, p.st.pos.z,
      WEAPONS.gunMv
    );
    if (t < 0 || t > 4) { E.pipper.style.display = 'none'; return; }
    this._lead.copy(target.st.pos).addScaledVector(target.st.vel, t).project(game.camera);
    if (Math.abs(this._lead.x) > 1 || Math.abs(this._lead.y) > 1) {
      E.pipper.style.display = 'none'; return;
    }
    E.pipper.style.display = 'block';
    E.pipper.style.left = ((this._lead.x * 0.5 + 0.5) * 100) + '%';
    E.pipper.style.top = ((-this._lead.y * 0.5 + 0.5) * 100) + '%';
  }
}
