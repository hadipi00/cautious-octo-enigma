// ============================================================
// AIRDOM — مغز بازی: مأموریت‌ها، موج‌ها، امتیاز، دوربین، چندنفره
// ============================================================
import * as THREE from 'three';
import { QUALITY, CAM, BASES, SCORE } from './config.js';
import { Terrain } from './world/terrain.js';
import { buildSky, buildClouds } from './world/sky.js';
import { Props } from './world/props.js';
import { Controls } from './flight/controls.js';
import { Aircraft } from './flight/aircraft.js';
import { PilotAI } from './combat/ai.js';
import { Projectiles } from './combat/projectiles.js';
import { EffectSystem } from './combat/effects.js';
import { GroundDefense } from './combat/ground.js';
import { HUD } from './ui/hud.js';
import { Menu } from './ui/menu.js';
import { GameAudio } from './audio/engine.js';
import { NetClient } from './net/client.js';
import { damp, clamp, lerp } from './utils.js';

const _off = new THREE.Vector3(), _aim = new THREE.Vector3(), _axis = new THREE.Vector3();
const _WORLD_UP = new THREE.Vector3(0, 1, 0);
const _eul = new THREE.Euler(), _q = new THREE.Quaternion();
const _tmp = new THREE.Vector3();

export class Game {
  constructor(canvas, specs, opts = {}) {
    this.canvas = canvas;
    this.specs = specs;          // { id: spec }
    this.debug = !!opts.debug;
    this.settings = { quality: 'high', autoRes: true, name: 'خلبان', ...opts.settings };
    const q = this.q = QUALITY[this.settings.quality] || QUALITY.high;

    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: q.antialias, powerPreference: 'high-performance', preserveDrawingBuffer: true,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = q.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xcfc9bd, q.fogNear, q.fogFar);
    this.camera = new THREE.PerspectiveCamera(CAM.chaseFov, innerWidth / innerHeight, 0.5, 45000);

    this.terrain = new Terrain(this.scene, q);
    this.sky = buildSky(this.scene, q);
    this.clouds = buildClouds(this.scene, q);
    this.props = new Props(this.scene, this.terrain);
    this.props.setTerrainH((x, z) => this.terrain.getHeight(x, z));

    this.effects = new EffectSystem(this.scene, q);
    this.projectiles = new Projectiles(this.scene, this.effects, null);
    this.groundDefense = new GroundDefense(this.props, this.projectiles, this.effects, null);
    this.groundDefense.enabled = false;

    this.controls = new Controls(canvas);
    this.audio = new GameAudio();
    this.hud = new HUD();
    this.net = new NetClient(this);
    this.menu = new Menu(this);

    // کال‌بک‌های پرتابه
    this.projectiles.audio = this.audio;
    this.projectiles.onAircraftHit = (ac, dmg, attacker) => ac.takeHit(dmg, attacker);
    this.projectiles.onGroundTargetHit = (t, dmg) => this._onGroundTargetHit(t, dmg);
    this.projectiles.onSamHit = (site, dmg) => this._onSamHit(site, dmg);
    this.groundDefense.audio = this.audio;

    this.state = 'menu';           // menu | flying | paused | dead | victory
    this.missionType = null;
    this.camMode = 0;              // کابین پیش‌فرض
    this._wreckT = 0;
    this.aircraft = [];
    this.player = null;
    this.camMode = 0;
    this.camPos = new THREE.Vector3(0, 500, 1200);
    this.camAim = new THREE.Vector3();
    this.wave = 0; this.kills = 0; this.score = 0;
    this.best = Number(localStorage.getItem('airdom.best') || 0);
    this._waveTimer = 0; this._nextWave = false;
    this._strikeLeft = 0;
    this._landingScored = false;
    this._autotest = (opts.urlParams || []).includes('autotest');
    this.simMode = (opts.urlParams || []).includes('sim');   // بدون رندر — برای تست سریع منطق
    this._t = 0; this._shots = [];

    this.resScale = 1;
    this.frameEMA = 16.7;
    this._resT = 0;
    this._applyRes();
    this._menuT = 0;

    this.controls.onLockChange = (locked) => {
      if (!locked && this.state === 'flying' && !this.debug && !this._autotest) this.pause();
    };
    addEventListener('resize', () => this._resize());
    this._resize();
    this.clock = new THREE.Clock();
    this._rafAlive = performance.now();
    this.renderer.setAnimationLoop(() => {
      this._rafAlive = performance.now();
      this._frame();
    });
    // نگهبان: وقتی تب پنهان است rAF متوقف می‌شود — حلقه را زنده نگه می‌دارد
    this._watchdog = setInterval(() => {
      if (performance.now() - this._rafAlive > 300) {
        this._rafAlive = performance.now();
        this._frame();
      }
    }, 33);
    this.menu.ready();
  }

  // ---------- شروع مأموریت ----------
  startMission(type, aircraftId, multiplayer = false) {
    this.missionType = type;
    this.missionMulti = multiplayer;
    // پاکسازی
    for (const ac of this.aircraft) {
      this.scene.remove(ac.group);
    }
    this.aircraft = [];
    this.net.beginMission();

    const spec = this.specs[aircraftId] || this.specs.f16c;
    this.player = new Aircraft(spec, this.scene, this.terrain, {
      effects: this.effects, projectiles: this.projectiles,
      audio: this.audio, game: this, team: 'blue', isPlayer: true,
      name: this.settings.name,
    });
    this.aircraft.push(this.player);
    this.controls.reset();

    this.wave = 0; this.kills = 0; this.score = 0;
    this._nextWave = false; this._waveTimer = 0;
    this._landingScored = false;
    this.groundDefense.enabled = (type === 'strike');

    if (type === 'free') {
      this.player.spawnAir(1400, 90, -2000, 0);
      this.hud.banner('پرواز آزاد — باند فرود در شرق نقشه است');
    } else if (type === 'strike') {
      this.player.spawnAir(1200, 90, -2800, 800);
      this._strikeLeft = this.props.targets.filter(t => t.alive).length;
      this.hud.banner('حمله به بیس دشمن — همه اهداف را نابود کن! مواظب SAM باش');
      this._spawnWave(1);
    } else if (type === 'team') {
      this.player.spawnAir(1500, 90, -2400, -400);
      this._spawnAlly(2);
      this._spawnWave(2);
      this.hud.banner('نبرد تیمی — با متحدانت در حالتن');
    } else if (type === 'air') {
      this.player.spawnAir(1500, 90, -2400, 0);
      this._spawnWave(1);
      this.hud.banner('برتری هوایی — موج اول در راه است');
    }

    if (multiplayer) {
      this.net.connectIfNeeded();
    }

    this.state = 'flying';
    this.menu.show(null);
    this.hud.show(true);
    this.controls.lockOnClick = true;
    if (!this.debug && !this._autotest) this.controls.requestLock();
    this.audio.resume();
  }

  _makeEnemy(specId, pos, headingDeg, skill) {
    const spec = this.specs[specId] || this.specs.mig29a;
    const ac = new Aircraft(spec, this.scene, this.terrain, {
      effects: this.effects, projectiles: this.projectiles,
      audio: this.audio, game: this, team: 'red', name: spec.name,
    });
    ac.spawnAir(0, headingDeg, pos.x, pos.z);
    ac.st.pos.y = pos.y;
    ac.ai = new PilotAI(ac, { skill });
    this.aircraft.push(ac);
    return ac;
  }

  _spawnWave(n) {
    this.wave = n || (this.wave + 1);
    const count = Math.min(2 + this.wave, 6);
    const roster = Object.keys(this.specs).filter(k => k !== (this.player && this.player.spec.id));
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 1.2 + Math.PI * 0.9;
      const pos = new THREE.Vector3(
        BASES.enemy.x + Math.cos(ang) * 1100,
        1300 + Math.random() * 1100,
        BASES.enemy.z + Math.sin(ang) * 1100
      );
      const id = roster[(Math.random() * roster.length) | 0];
      const skill = Math.min(1.25, 0.65 + this.wave * 0.09 + Math.random() * 0.15);
      this._makeEnemy(id, pos, 250, skill);
    }
    if (this.wave > 0) this.hud.banner(`موج ${this.wave} — ${count} جت دشمن وارد شد`);
  }

  _spawnAlly(n) {
    for (let i = 0; i < n; i++) {
      const roster = Object.keys(this.specs);
      const id = roster[(Math.random() * roster.length) | 0];
      const spec = this.specs[id];
      const ac = new Aircraft(spec, this.scene, this.terrain, {
        effects: this.effects, projectiles: this.projectiles,
        audio: this.audio, game: this, team: 'blue', name: 'متحد ' + (i + 1),
      });
      ac.spawnAir(1400 + i * 250, 90, -2200 + i * 400, 200);
      ac.ai = new PilotAI(ac, { skill: 0.9 });
      this.aircraft.push(ac);
    }
  }

  // ---------- رویدادها ----------
  onAircraftKilled(ac, attacker, reason) {
    if (ac.isPlayer) {
      const why = reason || 'سرنگون شدی';
      this._endMission(false, why);
      return;
    }
    if (ac.team === 'red') {
      this.kills++;
      this.score += SCORE.enemyKill;
      const byPlayer = attacker && attacker.isPlayer;
      this.hud.killFeed(byPlayer ? '🎯 جت دشمن سرنگون شد +۱۰۰' : 'متحدت یک دشمن را زد');
      this.audio.beep(880, 0.1, 0.2);
    } else {
      this.hud.killFeed('متحد ' + ac.name + ' سرنگون شد');
    }
    if (this.net.active) this.net.sendEvent({ k: 'kill', name: ac.name });
  }

  _onGroundTargetHit(t, dmg) {
    const res = this.props.damageTarget(t, dmg);
    if (res && res.killed) {
      this.effects.explosion(res.pos, 1.6);
      this.audio.explosion(1);
      this.score += res.score;
      this._strikeLeft--;
      this.hud.killFeed(`💥 ${_targetName(res.type)} نابود شد +${res.score}`);
      if (this.missionType === 'strike' && this._strikeLeft <= 0) {
        this._endMission(true, 'بیس دشمن به‌طور کامل نابود شد!');
      }
    }
  }

  _onSamHit(site, dmg) {
    const killed = this.groundDefense.damageSite(site, dmg);
    if (killed) {
      this.effects.explosion(site.pos, 1.4);
      this.audio.explosion(0.9);
      this.score += SCORE.samSite;
      const isSam = this.props.samSites.includes(site);
      this.hud.killFeed(`💥 ${isSam ? 'سایت SAM' : 'توپ ضدهوایی'} نابود شد +${isSam ? SCORE.samSite : SCORE.aaaSite}`);
    }
  }

  onPlayerEvent(txt) { this.hud.banner(txt); }

  onTouchdown() {
    if (this._landingScored) return;
    const B = BASES.friendly;
    const d = Math.hypot(this.player.st.pos.x - B.x, this.player.st.pos.z - B.z);
    if (d < 400 && Math.hypot(this.player.st.vel.x, this.player.st.vel.z) < 60) {
      this._landingScored = true;
      this.score += SCORE.landingBonus;
      this.hud.banner(`فرود موفق! +${SCORE.landingBonus}`);
    }
  }

  _endMission(win, reason) {
    if (this.state === 'dead' || this.state === 'victory') return;
    this.state = win ? 'victory' : 'dead';
    this.best = Math.max(this.best, this.score);
    localStorage.setItem('airdom.best', String(this.best));
    this.controls.releaseLock();
    this.menu.showEnd(win, reason, {
      score: this.score, kills: this.kills, wave: this.wave, best: this.best,
    });
  }

  // ---------- حلقه ----------
  _frame() {
    const dt = this.fixedStep ? (1 / 30) : Math.min(this.clock.getDelta(), 0.06);
    if (this.state === 'flying') this._updateFlying(dt);
    else if (this.state === 'menu') this._updateMenuCam(dt);
    else this._updateEndCam(dt);
    if (!this.simMode) this.renderer.render(this.scene, this.camera);
    this._perf(dt);
  }

  _updateFlying(dt) {
    // ورودی بازیکن
    const input = this.controls.getIntent(dt);
    for (const code of this.controls.drainQueue()) this._action(code);
    const p = this.player;
    p.input.pitch = input.pitch;
    p.input.roll = input.roll;
    p.input.yaw = input.yaw;
    p.input.throttle = input.throttle;
    p.input.ab = input.ab;
    p.input.gear = input.gear;
    p.input.flaps = input.flaps;
    p.input.brake = input.brake;
    p.input.fbw = true;
    p.input.fire = input.fire;

    // تست خودکار — قبل از به‌روزرسانی هواپیماها تا ورودی‌هایش اعمال شوند
    if (this._autotest) this._autotestStep(dt);

    // هواپیماها: AI + فیزیک
    const ctx = {
      aircraft: this.aircraft,
      props: this.props,
      terrain: this.terrain,
      projectiles: this.projectiles,
    };
    for (const ac of this.aircraft) {
      ac.distToPlayer = ac.st.pos.distanceTo(p.st.pos);
    }
    for (const ac of this.aircraft) {
      if (ac.ai) ac.ai.update(dt, ctx);
      ac.update(dt);
    }
    this.projectiles.update(dt, ctx);
    this.groundDefense.update(dt, this.aircraft);
    this.effects.update(dt);
    this.clouds.update(this.camera.position);
    this.sky.update(p.st.pos);

    // لاشه‌های در حال سوختن روی زمین
    this._wreckT -= dt;
    if (this._wreckT <= 0) {
      this._wreckT = 0.18;
      for (const t of this.props.targets) {
        if (!t.alive) {
          t.smokeT = (t.smokeT ?? 45) - 0.18;
          if (t.smokeT > 0) {
            _tmp.copy(t.pos).add(_axis.set((Math.random() - 0.5) * 10, 4, (Math.random() - 0.5) * 10));
            this.effects.puff(_tmp, _axis.set(0, 7, 0), 9, 2.6, 0x1e1c1a, 0.5);
            if (Math.random() < 0.3) this.effects.puff(_tmp, _axis.set(0, 3, 0), 4.5, 0.6, 0xff7020, 0.6);
          }
        }
      }
    }

    this._updateCamera(dt);
    this.audio.updateEngine(p.st);
    this.audio.setRwr(this.projectiles.missileInbound(p));
    this.hud.update(dt, this);

    // موج بعدی
    const redAlive = this.aircraft.filter(a => a.team === 'red' && a.alive).length;
    if ((this.missionType === 'air' || this.missionType === 'team') && redAlive === 0 && !this._nextWave) {
      this._nextWave = true;
      this._waveTimer = 6;
      if (this.wave > 0) this.hud.banner('موج پاکسازی شد — موج بعدی تا ۶ ثانیه…');
    }
    if (this._nextWave) {
      this._waveTimer -= dt;
      if (this._waveTimer <= 0) {
        this._nextWave = false;
        this._spawnWave();
      }
    }

    // چندنفره
    if (this.net.active) this.net.update(dt);
  }

  _action(code) {
    const c = this.controls;
    const p = this.player;
    switch (code) {
      case 'KeyZ': c.ab = !c.ab; break;
      case 'KeyG': c.gear = !c.gear; break;
      case 'KeyV': c.flapStage = (c.flapStage + 1) % 3; break;
      case 'KeyF': p.fireMissile(); break;
      case 'KeyB': p.dropBomb(); break;
      case 'KeyR': p.fireRockets(); break;
      case 'KeyC': p.dropFlares(); break;
      case 'Digit1': this.camMode = 0; this.hud.setCamLabel('COCKPIT'); break;
      case 'Digit2': this.camMode = 0; this.hud.setCamLabel('CHASE'); break;
      case 'Digit3': this.camMode = 2; this.hud.setCamLabel('FAR'); break;
      case 'F3': this.hud.toggleF3(); break;
      case 'KeyT': this.net.chatToggle && this.net.chatToggle(); break;
    }
  }

  _updateCamera(dt) {
    const st = this.player.st;
    const look = this.controls.look;
    if (performance.now() - this.controls.lastMove > CAM.lookRecenter * 1000) {
      look.yaw = damp(look.yaw, 0, 4, dt);
      look.pitch = damp(look.pitch, 0, 4, dt);
    }
    const targetFov = this.camMode === 0 ? CAM.cockpitFov : CAM.chaseFov;
    // چرخش سر با دکمه‌ها (I/J/K/L) — وسط کردن با Home
    const K = this.controls.keys;
    if (K.has('KeyJ')) { look.yaw += 2.0 * dt; this.controls.lastMove = performance.now(); }
    if (K.has('KeyL')) { look.yaw -= 2.0 * dt; this.controls.lastMove = performance.now(); }
    if (K.has('KeyI')) { look.pitch += 1.6 * dt; this.controls.lastMove = performance.now(); }
    if (K.has('KeyK')) { look.pitch -= 1.6 * dt; this.controls.lastMove = performance.now(); }
    if (K.has('Home')) { look.yaw = 0; look.pitch = 0; }
    if (this.camMode === 0) {
      const head = this.player.cockpitHead || new THREE.Vector3(0, 0.85, 4.4);
      _off.copy(head).applyQuaternion(st.quat).add(st.pos);
      this.camera.position.copy(_off);
      _eul.set(look.pitch, look.yaw, 0, 'YXZ');
      _q.setFromEuler(_eul);
      this.camera.quaternion.copy(st.quat).multiply(_q);
    } else {
      const o = this.camMode === 2 ? CAM.farOffset : CAM.chaseOffset;
      _off.set(0, o.up, -o.back).applyQuaternion(st.quat).add(st.pos);
      if (look.yaw !== 0) _off.sub(st.pos).applyAxisAngle(_WORLD_UP, -look.yaw).add(st.pos);
      if (look.pitch !== 0) {
        _axis.set(1, 0, 0).applyQuaternion(st.quat);
        _off.sub(st.pos).applyAxisAngle(_axis, -look.pitch).add(st.pos);
      }
      this.camPos.set(
        damp(this.camPos.x, _off.x, CAM.smooth, dt),
        damp(this.camPos.y, _off.y, CAM.smooth, dt),
        damp(this.camPos.z, _off.z, CAM.smooth, dt)
      );
      this.camera.position.copy(this.camPos);
      _aim.copy(st.pos).addScaledVector(_tmp.set(0, 0, 1).applyQuaternion(st.quat), 45);
      this.camAim.set(
        damp(this.camAim.x, _aim.x, CAM.smooth, dt),
        damp(this.camAim.y, _aim.y, CAM.smooth, dt),
        damp(this.camAim.z, _aim.z, CAM.smooth, dt)
      );
      this.camera.lookAt(this.camAim);
    }
    const shake = (st.stalled ? 0.22 : 0) + Math.max(0, st.gForce - 6.5) * 0.05;
    if (shake > 0.001) {
      this.camera.position.add(_tmp.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(shake));
    }
    if (Math.abs(this.camera.fov - targetFov) > 0.1) {
      this.camera.fov = damp(this.camera.fov, targetFov, 6, dt);
      this.camera.updateProjectionMatrix();
    }
  }

  _updateMenuCam(dt) {
    this._menuT += dt * 0.04;
    const B = BASES.friendly;
    this.camera.position.set(B.x + Math.cos(this._menuT) * 2600, 560, B.z + Math.sin(this._menuT) * 2600);
    this.camera.lookAt(B.x, 60, B.z);
    this.sky.update(this.camera.position);
    this.clouds.update(this.camera.position);
    if (this.camera.fov !== 62) { this.camera.fov = 62; this.camera.updateProjectionMatrix(); }
  }

  _updateEndCam(dt) {
    if (this.player) {
      this._menuT += dt * 0.3;
      const p = this.player.st.pos;
      this.camera.position.set(p.x + Math.cos(this._menuT) * 90, p.y + 22, p.z + Math.sin(this._menuT) * 90);
      this.camera.lookAt(p);
    }
  }

  pause() {
    if (this.state !== 'flying') return;
    this.state = 'paused';
    this.menu.show('pause');
    this.audio.suspend();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'flying';
    this.menu.show(null);
    this.audio.resume();
    this.controls.requestLock();
  }

  toMenu() {
    this.state = 'menu';
    this.menu.show('main');
    this.hud.show(false);
    this.controls.releaseLock();
    this.controls.reset();
    for (const ac of this.aircraft) this.scene.remove(ac.group);
    this.aircraft = [];
    this.player = null;
    this.net.leaveMission();
    this.audio.suspend();
  }

  restart() {
    this.startMission(this.missionType, this.player ? this.player.spec.id : 'f16c', this.missionMulti);
  }

  // ---------- تست خودکار ----------
  _autotestStep(dt) {
    this._t += dt;
    const p = this.player;
    if (p && p.st.alive) {
      p.input.throttle = 1;
      p.input.ab = this._t > 2;
      if (this._t > 3 && this.missionType !== 'free') {
        let e = null, bd = 1e12;
        for (const ac of this.aircraft) {
          if (!ac.alive || ac.team === 'blue') continue;
          const d = ac.st.pos.distanceTo(p.st.pos);
          if (d < bd) { bd = d; e = ac; }
        }
        if (e) {
          _tmp.copy(e.st.pos).sub(p.st.pos).normalize();
          const want = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), _tmp);
          p.st.quat.slerp(want, Math.min(1, 4 * dt)).normalize();
          p.input.fire = true;
          if (this._t > 6 && p.lockT >= 1.1 && p.missiles === p.spec.missiles[0].count) p.fireMissile();
        }
      } else {
        p.input.fire = false;
      }
    }
    for (const mark of [3, 6, 9, 12, 20, 28]) {
      if (this._t >= mark && !this._shots.includes(mark)) {
        this._shots.push(mark);
        console.log(`AUTOTEST t=${this._t.toFixed(1)} v=${Math.round(this.player.st.V)} pos=${this.player.st.pos.x | 0},${this.player.st.pos.y | 0},${this.player.st.pos.z | 0} kills=${this.kills} enemies=${this.aircraft.filter(a => a.team === 'red' && a.alive).length}`);
      }
    }
    if (this._t > 34) {
      console.log(`AUTOTEST-DONE kills=${this.kills} score=${this.score}`);
      setTimeout(() => window.close(), 300);
    }
  }

  _screenshot(name) {
    try {
      const img = this.renderer.domElement.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = img;
      a.download = `${name}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) { /* ignore */ }
  }

  // ---------- کارایی ----------
  _applyRes() {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, this.q.pixelCap) * this.resScale);
  }

  _perf(dt) {
    this.frameEMA = lerp(this.frameEMA, dt * 1000, 0.06);
    this._resT += dt;
    const fps = Math.round(1000 / this.frameEMA);
    if (this._resT > 0.6) {
      this._resT = 0;
      if (this.q.autoRes && this.settings.autoRes && this.state === 'flying') {
        if (this.frameEMA > 18.5 && this.resScale > 0.55) {
          this.resScale = Math.max(0.55, this.resScale - 0.1);
          this._applyRes();
        } else if (this.frameEMA < 15 && this.resScale < 1) {
          this.resScale = Math.min(1, this.resScale + 0.06);
          this._applyRes();
        }
      }
      this.hud.setBadge(`${fps} FPS${this.resScale < 1 ? ` ·${Math.round(this.resScale * 100)}%` : ''}`);
    }
    if (this.hud.f3on) {
      const i = this.renderer.info.render;
      this.hud.setF3(
        `FPS ${fps}  frame ${this.frameEMA.toFixed(1)}ms  res ${Math.round(this.resScale * 100)}%\n` +
        `tris ${i.triangles}  calls ${i.calls}  quality ${this.settings.quality}`
      );
    }
  }

  _resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }
}

function _targetName(type) {
  return { hangar: 'هانگار', fuelTank: 'مخزن سوخت', radar: 'رادار' }[type] || type;
}
