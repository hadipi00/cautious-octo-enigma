// ============================================================
// AIRDOM — مغز بازی: مأموریت‌ها، موج‌ها، امتیاز، دوربین، چندنفره
// ============================================================
import * as THREE from 'three';
import { QUALITY, CAM, BASES, SCORE } from './config.js';
import { Terrain } from './world/terrain.js';
import { buildSky, buildClouds, SKY_HORIZON } from './world/sky.js';
import { Hangar } from './world/hangar.js';
import { buildJet } from './models/parametric.js';
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
import { simcore } from './wasm/simcore.js';
import { damp, clamp, lerp } from './utils.js';

const _off = new THREE.Vector3(), _aim = new THREE.Vector3(), _axis = new THREE.Vector3();
const _WORLD_UP = new THREE.Vector3(0, 1, 0);
const _eul = new THREE.Euler(), _q = new THREE.Quaternion();
const _tmp = new THREE.Vector3();
const _FLIP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI); // دوربین سه‌جی به -Z نگاه می‌کند؛ دماغه +Z است

export class Game {
  constructor(canvas, specs, opts = {}) {
    this.canvas = canvas;
    this.specs = specs;          // { id: spec }
    this.debug = !!opts.debug;
    this.settings = { quality: 'high', autoRes: true, name: 'خلبان', ...opts.settings };
    const q = this.q = QUALITY[this.settings.quality] || QUALITY.high;

    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: q.antialias, powerPreference: 'high-performance', preserveDrawingBuffer: true,
      logarithmicDepthBuffer: true, stencil: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = q.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    // مه همرنگ افق آسمان — مرز زمین/آسمان نامرئی می‌شود
    this.scene.fog = new THREE.Fog(SKY_HORIZON.clone().multiplyScalar(0.94), q.fogNear, q.fogFar);
    this.camera = new THREE.PerspectiveCamera(CAM.chaseFov, innerWidth / innerHeight, 0.5, 45000);

    this.terrain = new Terrain(this.scene, q);
    this.sky = buildSky(this.scene, q, this.renderer);
    this.clouds = buildClouds(this.scene, q);
    this.props = new Props(this.scene, this.terrain);
    this.props.setTerrainH((x, z) => this.terrain.getHeight(x, z));

    // آشیانه سه‌بعدی — منو/انتخاب جت روی این صحنه رندر می‌شود
    this.hangar = new Hangar(q, this.sky.envRT ? this.sky.envRT.texture : null);
    this.hangar.attachDrag(canvas);

    this.effects = new EffectSystem(this.scene, q);
    this.projectiles = new Projectiles(this.scene, this.effects, null);
    this.groundDefense = new GroundDefense(this.props, this.projectiles, this.effects, null);
    this.groundDefense.enabled = false;

    this.controls = new Controls(canvas);
    this.controls.sensitivity = this.settings.sens || 1;
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
    this._fpActive = null;         // وضعیت فعلی مخفی‌سازی بدنه (اول‌شخص)
    this._wreckT = 0;
    this.aircraft = [];
    this.player = null;
    this.wasm = simcore;           // هسته WASM (وضعیت: ok/fallback)
    this.rwr = { lock: [], search: [], msl: null, sam: [] };  // هشداردهنده راداری
    this._rwrT = 0;
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
    this._showHangarJet();
    this.menu.ready();
  }

  // جت انتخاب‌شده را روی سکوی آشیانه می‌گذارد
  showInHangar(specId) {
    const spec = this.specs[specId] || this.specs.f16c;
    const built = buildJet(spec.visual, spec.len, spec.wingSpan, spec.nation);
    this.hangar.setJet(built.group, spec.len / 15);
  }

  _showHangarJet() {
    const id = this.menu ? this.menu.selectedId() : null;
    this.showInHangar(id);
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
    // همه اسپاون‌ها هوایی‌اند — چرخ فرود باید بالا باشد
    this.controls.gear = false;

    this.wave = 0; this.kills = 0; this.score = 0;
    this._nextWave = false; this._waveTimer = 0;
    this._landingScored = false;
    this.groundDefense.enabled = (type === 'strike');

    if (type === 'free') {
      // شروع واقعی وارتاندر: روی باند فرودگاه متفقین — برخاست با گاز کامل
      this.player.spawnRunway();
      this.controls.gear = true;
      this.controls.flapStage = 1;
      this.hud.banner('روی باند ۲۷ — گاز را کامل کن (W یا اسکرول)، در ~۲۲۰km/h موس را عقب بکش تا بلند شوی', 9000);
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
    } else if (type === 'bvr') {
      this.player.spawnAir(1500, 90, -2600, 0);
      this._spawnBvr(4);
      this.hud.banner('نبرد فراتر از دید — با رادار (N) قفل کن و موشک راداری شلیک کن', 6000);
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
    // دوربین تعقیبی همان اول پشت هواپیما — نه با فاصله کیلومتری از جای قبلی
    this._snapChaseCamera();
  }

  // دوربین تعقیبی را فوراً پشت موقعیت فعلی بازیکن می‌گذارد (بدون لگ بزرگ)
  _snapChaseCamera() {
    const st = this.player.st;
    const o = this.camMode === 2 ? CAM.farOffset : CAM.chaseOffset;
    _off.set(0, o.up, -o.back).applyQuaternion(st.quat).add(st.pos);
    this.camPos.copy(_off);
    _aim.copy(st.pos).addScaledVector(_tmp.set(0, 0, 1).applyQuaternion(st.quat), 45);
    this.camAim.copy(_aim);
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

  // ---------- مأموریت BVR: دشمنان خیلی دور، رو در رو ----------
  _spawnBvr(n) {
    this.wave = 1;
    // فقط جت‌هایی که موشک راداری دارند (نبرد فراتر از برد دید واقعی)
    const roster = Object.keys(this.specs).filter(k => {
      const s = this.specs[k];
      return !!s.radar && (s.missiles || []).some(m => m.type && m.type !== 'ir');
    });
    const pool = roster.length ? roster : Object.keys(this.specs);
    const pz = this.player ? this.player.st.pos.z : -2600;
    for (let i = 0; i < n; i++) {
      const pos = new THREE.Vector3(
        (i - (n - 1) / 2) * 1800 + (Math.random() - 0.5) * 900,
        3400 + Math.random() * 1400,
        pz + 21000 + Math.random() * 5000
      );
      const id = pool[(Math.random() * pool.length) | 0];
      // رو به جنوب (به سمت بازیکن): heading 180
      this._makeEnemy(id, pos, 180, 0.95 + Math.random() * 0.2);
    }
    this.hud.banner(`${n} جت دشمن در ~۲۵ کیلومتری شمالی — به سمتت می‌آیند`, 5000);
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
    if (!this.simMode) {
      if (this.state === 'menu') this.renderer.render(this.hangar.scene, this.camera);
      else this.renderer.render(this.scene, this.camera);
    }
    this._perf(dt);
  }

  _updateFlying(dt) {
    // ورودی بازیکن — موس = اهرم (اینستراکتور مجازی)، Ctrl = سر خلبان
    const input = this.controls.getIntent(dt, this.player, this.camera);
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

    // هواپیماها: رادار + AI + فیزیک
    const ctx = {
      aircraft: this.aircraft,
      props: this.props,
      terrain: this.terrain,
      projectiles: this.projectiles,
    };
    for (const ac of this.aircraft) {
      ac.distToPlayer = ac.st.pos.distanceTo(p.st.pos);
      if (ac.radar) ac.radar.update(dt, ctx);
    }
    for (const ac of this.aircraft) {
      if (ac.ai) ac.ai.update(dt, ctx);
      ac.update(dt);
    }
    this.projectiles.update(dt, ctx);
    this.groundDefense.update(dt, this.aircraft);
    this.effects.update(dt);
    this.clouds.update(this.camera.position);
    this.sky.update(p.st.pos, this.camera);

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
    this._updateRwr(dt);
    this.hud.update(dt, this);
    this.controls.updateUI(this);   // نشانگر اهرم + استیک مجازی

    // موج بعدی / پایان مأموریت‌ها
    const redAlive = this.aircraft.filter(a => a.team === 'red' && a.alive).length;
    if (this.missionType === 'bvr' && redAlive === 0 && !this._nextWave) {
      this._endMission(true, 'همه دشمنان بی‌آر سرنگون شدند!');
    } else if ((this.missionType === 'air' || this.missionType === 'team') && redAlive === 0 && !this._nextWave) {
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

  // ---------- RWR: هشداردهنده راداری بازیکن ----------
  _updateRwr(dt) {
    this._rwrT -= dt;
    if (this._rwrT > 0) return;
    this._rwrT = 0.15;
    const p = this.player;
    const rwr = this.rwr;
    rwr.lock.length = 0; rwr.search.length = 0; rwr.sam.length = 0;
    const pf = _tmp.set(0, 0, 1).applyQuaternion(p.st.quat);
    for (const ac of this.aircraft) {
      if (!ac.alive || ac.team === 'blue' || !ac.radar) continue;
      const d = ac.st.pos.distanceTo(p.st.pos);
      if (d > ac.radar.range * 1.1) continue;
      const bearing = Math.atan2(ac.st.pos.x - p.st.pos.x, ac.st.pos.z - p.st.pos.z);
      if (ac.lockTarget === p && ac.lockSource === 'radar' && ac.lockT > 0.4) {
        rwr.lock.push(bearing);
      } else {
        // اسکن رادار دشمن به سمت ما؟
        const toUs = _aim.copy(p.st.pos).sub(ac.st.pos).normalize();
        const f = _axis.set(0, 0, 1).applyQuaternion(ac.st.quat);
        if (f.dot(toUs) > Math.cos(ac.radar.gimbal + 0.35)) {
          rwr.search.push(bearing);
        }
      }
    }
    // SAMها
    if (this.groundDefense.enabled) {
      for (const site of this.props.samSites) {
        if (site.destroyed) continue;
        if (site.pos.distanceTo(p.st.pos) < 6500) {
          rwr.sam.push(Math.atan2(site.pos.x - p.st.pos.x, site.pos.z - p.st.pos.z));
        }
      }
    }
    const inbound = this.projectiles.missileInboundInfo(p);
    rwr.msl = inbound ? { kind: inbound.kind, dist: inbound.dist } : null;
    // صدا: اولویت MSL > LOCK > SEARCH
    if (rwr.msl) this.audio.setRwrMode(3);
    else if (rwr.lock.length) this.audio.setRwrMode(2);
    else if (rwr.search.length || rwr.sam.length) this.audio.setRwrMode(1);
    else this.audio.setRwrMode(0);
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
      case 'KeyN':
        if (p.radar) {
          const m = p.radar.cycleMode();
          this.hud.setCamLabel('RADAR: ' + m.toUpperCase());
          this.audio.uiClick();
        } else {
          this.hud.setCamLabel('NO RADAR');
        }
        break;
      case 'Digit1': this.camMode = 0; this.hud.setCamLabel('COCKPIT'); break;
      case 'Digit2': this.camMode = 1; this.hud.setCamLabel('CHASE'); break;
      case 'Digit3': this.camMode = 2; this.hud.setCamLabel('FAR'); break;
      case 'F3': this.hud.toggleF3(); break;
      case 'KeyT': this.net.chatToggle && this.net.chatToggle(); break;
    }
  }

  _updateCamera(dt) {
    const st = this.player.st;
    const p = this.player;
    // نمای اول‌شخص: بدنه بیرونی مخفی + near کوچک (رفع کامل کابین-تو-دیواره)
    const fp = this.camMode === 0;
    const wantNear = fp ? 0.07 : 0.5;
    if (this.camera.near !== wantNear) {
      this.camera.near = wantNear;
      this.camera.updateProjectionMatrix();
    }
    if (this._fpActive !== fp) {
      this._fpActive = fp;
      p.setExteriorVisible(!fp);
      p.setFirstPerson(fp);
      this.hud.setCompactMode(fp); // در کابین، نوارهای DOM مخفی — HUD روی شیشه است
    }
    const look = this.controls.look;
    if (performance.now() - this.controls.lastMove > CAM.lookRecenter * 1000) {
      look.yaw = damp(look.yaw, 0, 4, dt);
      look.pitch = damp(look.pitch, 0, 4, dt);
    }
    // چرخش سر با دکمه‌ها (I/J/K/L) — وسط کردن با Home (استیک + سر)
    const K = this.controls.keys;
    if (K.has('KeyJ')) { look.yaw += 2.0 * dt; this.controls.lastMove = performance.now(); }
    if (K.has('KeyL')) { look.yaw -= 2.0 * dt; this.controls.lastMove = performance.now(); }
    if (K.has('KeyI')) { look.pitch += 1.6 * dt; this.controls.lastMove = performance.now(); }
    if (K.has('KeyK')) { look.pitch -= 1.6 * dt; this.controls.lastMove = performance.now(); }
    if (K.has('Home')) this.controls.recenter();
    if (this.camMode === 0) {
      const head = this.player.cockpitHead || new THREE.Vector3(0, 0.85, 4.4);
      _off.copy(head).applyQuaternion(st.quat).add(st.pos);
      // حرکت سر خلبان: G (فرورفتن در صندلی) + لرزش موتور/افتربرنر/پس‌زنی توپ
      if (p.cockpit && p.cockpit.camOffset) {
        _off.add(_tmp.copy(p.cockpit.camOffset).applyQuaternion(st.quat));
      }
      this.camera.position.copy(_off);
      _eul.set(look.pitch, look.yaw, 0, 'YXZ');
      _q.setFromEuler(_eul);
      // فلیپ π: دوربین رو به دماغه (قبلاً رو به دم بود!) + نگاه سر خلبان
      this.camera.quaternion.copy(st.quat).multiply(_FLIP).multiply(_q);
    } else {
      const o = this.camMode === 2 ? CAM.farOffset : CAM.chaseOffset;
      _off.set(0, o.up, -o.back).applyQuaternion(st.quat).add(st.pos);
      // اگر دوربین خیلی عقب افتاد (فریم‌کندی/تلپورت) فوراً بپر — نه خزش کیلومتری
      if (this.camPos.distanceTo(_off) > 80) this.camPos.copy(_off);
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
    // حس سرعت — FOV با سرعت/افتربرنر کمی باز می‌شود (روانی و هیجان)
    const baseFov = this.camMode === 0 ? CAM.cockpitFov : CAM.chaseFov;
    const targetFov = baseFov
      + clamp((st.V - 260) / 780, 0, 1) * 9
      + (st.afterburner ? 2.5 : 0);
    if (Math.abs(this.camera.fov - targetFov) > 0.1) {
      this.camera.fov = damp(this.camera.fov, targetFov, 4.5, dt);
      this.camera.updateProjectionMatrix();
    }
  }

  _updateMenuCam(dt) {
    // دوربین مداری آشیانه (درگ موس = چرخش، اسکرول = زوم)
    this.hangar.update(dt, this.camera);
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
    this._fpActive = null;
    this.net.leaveMission();
    this.audio.suspend();
    this._showHangarJet();
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
      // رادار را در STT بگذار تا مأموریت BVR هم قفل راداری را تست کند
      if (this._t > 3 && p.radar) p.radar.mode = 'stt';
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
          if (this._t > 6 && p.lockT >= 1.1 && p.missiles > 0) p.fireMissile();
        }
      } else {
        p.input.fire = false;
      }
    }
    for (const mark of [3, 6, 9, 12, 20, 28]) {
      if (this._t >= mark && !this._shots.includes(mark)) {
        this._shots.push(mark);
        const st = this.mslStationInfo();
        console.log(`AUTOTEST t=${this._t.toFixed(1)} v=${Math.round(this.player.st.V)} pos=${this.player.st.pos.x | 0},${this.player.st.pos.y | 0},${this.player.st.pos.z | 0} kills=${this.kills} enemies=${this.aircraft.filter(a => a.team === 'red' && a.alive).length} wasm=${this.wasm.ok} radar=${this.player.radar ? this.player.radar.mode + '/' + this.player.radar._pool.filter(t => t.detected).length + 'trk' : 'none'} msl=${st}`);
      }
    }
    if (this._t > 34) {
      console.log(`AUTOTEST-DONE kills=${this.kills} score=${this.score} wasm=${this.wasm.ok}`);
      setTimeout(() => window.close(), 300);
    }
  }

  mslStationInfo() {
    const p = this.player;
    if (!p) return '-';
    return p.mslStations.map(s => `${s.type}:${s.left}`).join(',');
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
