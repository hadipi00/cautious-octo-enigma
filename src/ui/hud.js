// ============================================================
// HUD کابین — کامل: ابزارها، اهداف، قفل، RWR، کشتن‌ها، امتیاز
// ============================================================
import * as THREE from 'three';
import { WEAPONS } from '../config.js';

const IDS = ['hud', 'f3', 'fpsBadge', 'hdg', 'spd', 'alt', 'gload', 'thr', 'wpn',
  'warn', 'banner', 'killfeed', 'score', 'strike', 'velMarker', 'vignette', 'dmg',
  'tgtBox', 'tgtInfo', 'camLabel', 'hitmarker'];

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
    this._hitT = 0;
    this.el.tgtBox.style.width = '40px';
    this.el.tgtBox.style.height = '40px';
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

    // ---- جعبه اهداف (هر فریم) ----
    this._updateTargets(game);

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
    E.wpn.textContent =
      `GUN ${p.gunAmmo}\nMSL ${p.missiles}${p.lockT >= WEAPONS.lockTime ? ' 🔒' : ''}\n` +
      `BMB ${p.bombs}   RKT ${p.rockets}\nFLR ${p.flares}`;

    E.score.textContent = `SCORE ${game.score}   WAVE ${game.wave}   KILLS ${game.kills}   BEST ${game.best}`;

    if (game.missionType === 'strike') {
      E.strike.textContent = `اهداف باقی‌مانده بیس: ${Math.max(0, game._strikeLeft)}`;
      E.strike.style.display = 'block';
    } else E.strike.style.display = 'none';

    // ---- هشدارها ----
    let warn = '';
    if (st.alive) {
      if (game.projectiles.missileInbound(p)) warn = '!! MISSILE — فلر (C) و پیچ شدید !!';
      else if (st.stalled) warn = 'STALL';
      else if (!st.gear && st.pos.y - st.groundY < 130 && st.vel.y < -6) warn = 'GEAR!';
      else if (st.pos.y - st.groundY < 160 && st.vel.y < -14) warn = 'PULL UP';
      else if (st.fuel <= 0) warn = 'FUEL OUT';
    }
    E.warn.textContent = warn;
    E.warn.classList.toggle('blink', !!warn);
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
        // نشانگر پیش‌روی داخل خود جعبه: offset کوچک
        if (p.lockTarget === nearest && p.lockT >= WEAPONS.lockTime) {
          E.tgtInfo.textContent += '  🔒';
        }
        return;
      }
    }
    E.tgtBox.style.display = 'none';
    E.tgtInfo.style.display = 'none';
  }
}
