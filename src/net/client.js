// ============================================================
// چندنفره LAN — کلاینت WebSocket
// میزبان: AI و فیزیک همه غیربازیکن‌ها را شبیه‌سازی و پخش می‌کند
// مهمان: وضعیت را دریافت و رندر می‌کند + ضربه‌هایش را گزارش می‌دهد
// ============================================================
import * as THREE from 'three';
import { buildJet } from '../models/parametric.js';

const SEND_RATE = 1 / 12;   // وضعیت خود بازیکن
const WORLD_RATE = 1 / 10;  // اسنپ‌شات دنیا (میزبان)

export class NetClient {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.ws = null;
    this.myId = null;
    this.isHost = false;
    this.hostId = null;
    this.remote = new Map();   // id -> {jet, name, pos, quat, targetPos, targetQuat, planeId, hp}
    this.sendT = 0;
    this.worldT = 0;
    this.nextNetId = 1;
  }

  connect(ip, name, cb) {
    try {
      this.ws = new WebSocket(`ws://${ip}:9090`);
    } catch (e) {
      cb && cb(false, e.message);
      return;
    }
    const timer = setTimeout(() => {
      if (!this.active) { try { this.ws.close(); } catch { /* ignore */ } cb && cb(false, 'timeout'); }
    }, 4000);
    this.ws.onopen = () => {
      this.active = true;
      clearTimeout(timer);
      this.send({ t: 'join', name });
      cb && cb(true);
    };
    this.ws.onerror = () => {
      clearTimeout(timer);
      if (!this.active) cb && cb(false, 'network');
    };
    this.ws.onclose = () => {
      if (this.active) this.game.hud.killFeed('اتصال چندنفره قطع شد');
      this.active = false;
      this._clearRemote();
    };
    this.ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      this._onMessage(msg);
    };
  }

  connectIfNeeded() {
    if (this.active && !this.missionJoined) {
      this.send({ t: 'join', name: this.game.settings.name, plane: this.game.player.spec.id });
      this.missionJoined = true;
    }
  }

  beginMission() { this.missionJoined = false; }

  leaveMission() {
    this.missionJoined = false;
    this._clearRemote();
  }

  send(obj) {
    if (this.ws && this.ws.readyState === 1) {
      try { this.ws.send(JSON.stringify(obj)); } catch { /* ignore */ }
    }
  }

  sendEvent(ev) { this.send({ t: 'ev', ev }); }

  _onMessage(msg) {
    const g = this.game;
    if (msg.t === 'welcome') {
      this.myId = msg.id;
      this.hostId = msg.host;
      this.isHost = msg.host === msg.id;
      g.hud.killFeed(this.isHost ? '🌐 تو میزبان این نبردی' : '🌐 به نبرد گروهی وصل شدی');
    } else if (msg.t === 'host') {
      this.hostId = msg.id;
      const was = this.isHost;
      this.isHost = msg.id === this.myId;
      if (this.isHost && !was) g.hud.killFeed('🌐 حالا میزبان شبیه‌سازی هستی');
      // اگر مهمان شدیم، AI محلی خاموش و اسنپ‌شات روشن می‌شود
      for (const ac of g.aircraft) {
        if (!ac.isPlayer) ac.remoteDriven = this.isHost ? false : true;
      }
    } else if (msg.t === 's') {
      this._applyPlayers(msg.pl);
    } else if (msg.t === 'w') {
      this._applyWorld(msg);
    } else if (msg.t === 'ev') {
      if (msg.ev.k === 'kill') g.hud.killFeed(`💀 ${msg.ev.name} سرنگون شد`);
      if (msg.ev.k === 'join') g.hud.killFeed(`🛩 ${msg.ev.name} به نبرد پیوست`);
    }
  }

  // ---------- رندر بازیکنان دور ----------
  _getRemote(id, name, planeId) {
    let r = this.remote.get(id);
    if (!r) {
      const spec = this.game.specs[planeId] || this.game.specs.f16c;
      const built = buildJet(spec.visual, spec.len, spec.wingSpan);
      this.game.scene.add(built.group);
      // برچسب اسم
      const cv = document.createElement('canvas');
      cv.width = 256; cv.height = 64;
      const c2 = cv.getContext('2d');
      c2.font = 'bold 34px Tahoma';
      c2.textAlign = 'center';
      c2.fillStyle = 'rgba(0,0,0,0.45)';
      c2.fillRect(0, 8, 256, 48);
      c2.fillStyle = '#9dffb0';
      c2.fillText(name || 'خلبان', 128, 42);
      const tex = new THREE.CanvasTexture(cv);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      sp.scale.set(26, 6.5, 1);
      sp.position.y = 7;
      built.group.add(sp);
      r = {
        jet: built.group, name, planeId,
        pos: new THREE.Vector3(), quat: new THREE.Quaternion(),
        tPos: new THREE.Vector3(), tQuat: new THREE.Quaternion(),
        hp: 100,
      };
      this.remote.set(id, r);
      this.game.hud.killFeed(`🛩 ${name} در آسمان است`);
    }
    return r;
  }

  _clearRemote() {
    for (const r of this.remote.values()) this.game.scene.remove(r.jet);
    this.remote.clear();
  }

  _applyPlayers(list) {
    const seen = new Set();
    for (const pl of list) {
      if (pl.id === this.myId) continue;
      seen.add(pl.id);
      const r = this._getRemote(pl.id, pl.name, pl.plane);
      r.tPos.fromArray(pl.p);
      r.tQuat.fromArray(pl.q);
      r.hp = pl.hp;
      r.ab = pl.ab;
    }
    for (const id of [...this.remote.keys()]) {
      if (!seen.has(id)) {
        this.game.scene.remove(this.remote.get(id).jet);
        this.remote.delete(id);
      }
    }
  }

  // ---------- دنیای میزبان ----------
  _applyWorld(msg) {
    const g = this.game;
    if (this.isHost || g.state !== 'flying') return;
    // همگام‌سازی غیربازیکن‌ها با اسنپ‌شات میزبان
    if (msg.en) {
      for (const es of msg.en) {
        let ac = g.aircraft.find(a => a.netId === es.id);
        if (!ac && es.alive) {
          ac = g._makeEnemy(es.plane, new THREE.Vector3().fromArray(es.p), 0, 1);
          ac.netId = es.id;
          ac.remoteDriven = true;
          ac.ai = null;
        }
        if (!ac) continue;
        if (!es.alive && ac.alive) {
          ac.die(null);
          continue;
        }
        ac.st.pos.fromArray(es.p);
        ac.st.quat.fromArray(es.q);
        ac.st.vel.fromArray(es.v);
        ac.hp = es.hp;
      }
    }
    if (msg.ev) for (const ev of msg.ev) {
      if (ev.k === 'kill') g.hud.killFeed(`💀 ${ev.name} سرنگون شد`);
    }
  }

  // ---------- حلقه ----------
  update(dt) {
    const g = this.game;
    // رندر نرم بازیکنان دور
    for (const r of this.remote.values()) {
      r.pos.lerp(r.tPos, Math.min(1, dt * 10));
      r.quat.slerp(r.tQuat, Math.min(1, dt * 10));
      r.jet.position.copy(r.pos);
      r.jet.quaternion.copy(r.quat);
      if (r.ab !== undefined) r.jet.visible = true;
    }

    this.sendT -= dt;
    if (this.sendT <= 0 && this.game.player) {
      this.sendT = SEND_RATE;
      const p = this.game.player;
      this.send({
        t: 'p', id: this.myId, name: this.game.settings.name, plane: p.spec.id,
        p: p.st.pos.toArray(), q: p.st.quat.toArray(), hp: p.hp, ab: p.st.afterburner,
      });
    }

    if (this.isHost) {
      this.worldT -= dt;
      if (this.worldT <= 0) {
        this.worldT = WORLD_RATE;
        const en = [];
        for (const ac of this.game.aircraft) {
          if (ac.isPlayer) continue;
          if (ac.netId === undefined) ac.netId = this.nextNetId++;
          en.push({
            id: ac.netId, plane: ac.spec.id, alive: ac.alive, hp: ac.hp,
            p: ac.st.pos.toArray(), q: ac.st.quat.toArray(), v: ac.st.vel.toArray(),
          });
        }
        this.send({ t: 'w', en });
      }
    }
  }
}
