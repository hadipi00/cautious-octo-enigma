// ============================================================
// کنترل — موس = اهرم (استیک) جنگنده — دقیقاً مثل وارتاندر
//   • موس روی صفحه نشانگر «هدف پرواز» را جابه‌جا می‌کند
//   • اینستراکتور مجازی بانک/پیچ را حساب می‌کند و دماغه را به همان نقطه می‌برد
//   • نگه‌داشتن Ctrl (یا Alt) = موس می‌شود «سر خلبان» — نگاه آزاد
//   • فلش‌ها/A-D/Q-E همیشه به‌عنوان ورودی مستقیم با استیک جمع می‌شوند
// ============================================================
import * as THREE from 'three';
import { clamp } from '../utils.js';
import { CAM } from '../config.js';

const HANDLED = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyZ', 'KeyX', 'KeyG', 'KeyV',
  'KeyC', 'KeyF', 'KeyR', 'KeyB', 'KeyT', 'KeyN', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Tab', 'F3', 'Digit1', 'Digit2', 'Digit3', 'ShiftLeft', 'ShiftRight',
  'KeyI', 'KeyJ', 'KeyK', 'KeyL', 'Home',
  'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight',
]);

const _ndc = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _loc = new THREE.Vector3();
const _right = new THREE.Vector3();
const _fwdW = new THREE.Vector3();
const _qInv = new THREE.Quaternion();

export class Controls {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.queue = [];
    this.look = { yaw: 0, pitch: 0 };
    this.lastMove = 0;
    this.locked = false;
    this.lockOnClick = false;
    this.onLockChange = null;

    // ---------- استیک مجازی ----------
    // نشانگر روی صفحه (فاصله از مرکز بر حسب پیکسل) + انحراف استیک -1..1
    this.cursor = { x: 0, y: 0 };
    this.stick = { x: 0, y: 0 };     // x=راست/چپ ، y=جلو/عقب (موس پایین = دماغه بالا)
    this.lookMode = false;           // Ctrl/Alt نگه‌داشته شده
    this.deadzone = 0.055;
    this.cursorMaxR = 0;             // شعاع مجاز نشانگر (با resize به‌روز می‌شود)

    // وضعیت‌های toggle
    this.ab = false;
    this.gear = true;
    this.flapStage = 0; // 0 / 0.5 / 1
    this.throttle = 0;
    this.fbw = true;
    this.fireHeld = false;
    this.sensitivity = 1; // ضریب حساسیت موس (از تنظیمات)

    window.addEventListener('keydown', (e) => {
      if (HANDLED.has(e.code)) e.preventDefault();
      if (!e.repeat) this.queue.push(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear(); this.fireHeld = false;
      this.lookMode = false;
    });

    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas) return;
      const sens = this.sensitivity || 1;
      this.lookMode = this._wantLook();
      if (this.lookMode) {
        // حالت سر خلبان — موس فقط نگاه را می‌چرخاند
        this.look.yaw = clamp(this.look.yaw - e.movementX * CAM.lookSens * sens, -2.5, 2.5);
        this.look.pitch = clamp(this.look.pitch - e.movementY * CAM.lookSens * sens, -1.15, 1.15);
      } else {
        // حالت اهرم — موس نشانگر هدف پرواز را جابه‌جا می‌کند
        this._moveCursor(e.movementX * sens, e.movementY * sens);
      }
      this.lastMove = performance.now();
    });
    // اسکرول = گاز (مثل وارتاندر)
    window.addEventListener('wheel', (e) => {
      if (document.pointerLockElement !== canvas) return;
      this.throttle = clamp(this.throttle - Math.sign(e.deltaY) * 0.06, 0, 1);
    }, { passive: true });
    document.addEventListener('mousedown', (e) => {
      if (document.pointerLockElement === canvas && e.button === 0) this.fireHeld = true;
      else if (this.lockOnClick && !this.locked && e.button === 0) this.requestLock();
    });
    document.addEventListener('mouseup', (e) => { if (e.button === 0) this.fireHeld = false; });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) this.fireHeld = false;
      this.onLockChange && this.onLockChange(this.locked);
    });
    window.addEventListener('resize', () => this._cursorRadius());
    this._cursorRadius();

    // عناصر UI استیک/نشانگر (در index.html)
    this.ui = {
      reticle: document.getElementById('aimReticle'),
      dot: document.getElementById('stickDot'),
      stick: document.getElementById('stickUI'),
      look: document.getElementById('lookBadge'),
    };
  }

  _wantLook() {
    return this.keys.has('ControlLeft') || this.keys.has('ControlRight') ||
           this.keys.has('AltLeft') || this.keys.has('AltRight');
  }

  _cursorRadius() {
    this.cursorMaxR = Math.min(innerWidth, innerHeight) * 0.46;
  }

  _moveCursor(dx, dy) {
    const R = this.cursorMaxR || 400;
    this.cursor.x = clamp(this.cursor.x + dx, -R, R);
    this.cursor.y = clamp(this.cursor.y + dy, -R, R);
  }

  // برگرداندن استیک و نشانگر به مرکز (Home)
  recenter() {
    this.cursor.x = 0; this.cursor.y = 0;
    this.stick.x = 0; this.stick.y = 0;
    this.look.yaw = 0; this.look.pitch = 0;
  }

  requestLock() {
    try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* ignore */ }
  }
  releaseLock() { if (this.locked) document.exitPointerLock(); }

  reset() {
    this.ab = false; this.gear = true; this.flapStage = 0;
    this.throttle = 0; this.fireHeld = false;
    this.recenter();
  }

  drainQueue() { const q = this.queue; this.queue = []; return q; }

  // منحنی استیک: ناحیه مرده + پاسخ نرم مرکز‌گرا (حس اهرم واقعی)
  _curve(v) {
    const s = Math.sign(v), a = Math.abs(v);
    if (a < this.deadzone) return 0;
    const n = (a - this.deadzone) / (1 - this.deadzone);
    return s * Math.pow(n, 1.35);
  }

  // ---------- اینستراکتور مجازی (مغز وارتاندر) ----------
  // جهت هدف از نشانگر موس → دستور بانک/پیچ برای هم‌تراز شدن دماغه با همان نقطه
  _instructor(player, camera) {
    const st = player.st;

    // حالت نشانگر وسط: نگه‌داشتن پرواز صاف (بال صاف + دماغه تراز) — مثل رها کردن اهرم
    const cursorR = Math.hypot(this.cursor.x, this.cursor.y);
    if (cursorR < this.cursorMaxR * 0.055) {
      _fwdW.set(0, 0, 1).applyQuaternion(st.quat);
      _right.set(1, 0, 0).applyQuaternion(st.quat);
      const bank = Math.asin(clamp(_right.y, -1, 1)); // + = چپ‌بانک
      let pitch = -_fwdW.y * 2.4 - st.vel.y * 0.0022;
      // محافظت سرعت: نزدیک استال، دماغه را آرام پایین می‌دهد تا سرعت برگردد
      if (st.V < 150 && !st.onGround) pitch -= (150 - st.V) * 0.005;
      pitch = clamp(pitch, -0.6, 0.6);
      const roll = clamp(bank * 1.7 + st.angVel.r * 0.14, -1, 1);
      this._inst = { pitch, roll, yaw: 0 };
      this.stick.x = roll;
      this.stick.y = -pitch;
      return;
    }

    // ۱) برد جهانِ نشانگر: unproject نقطه صفحه به یک جهت
    const w = innerWidth, h = innerHeight;
    const nx = (this.cursor.x / (w / 2));
    const ny = (-this.cursor.y / (h / 2));
    _ndc.set(clamp(nx, -1, 1), clamp(ny, -1, 1), 0.5).unproject(camera);
    _dir.copy(_ndc).sub(camera.position);
    if (_dir.lengthSq() < 1e-6) return;
    _dir.normalize();

    // ۲) جهت هدف در قاب هواپیما
    _qInv.copy(st.quat).invert();
    _loc.copy(_dir).applyQuaternion(_qInv);
    const flat = Math.hypot(_loc.x, _loc.z);
    const azim = Math.atan2(_loc.x, _loc.z);          // + = هدف سمت راست دماغه
    const elev = Math.atan2(_loc.y, Math.max(flat, 0.01)); // + = هدف بالای دماغه

    // ۳) بانک مطلوب — هرچه هدف جوانب‌تر، بانک تندتر (تا ۸۰ درجه)
    const bank = Math.asin(clamp(_right.set(1, 0, 0).applyQuaternion(st.quat).y, -1, 1));
    const bankSign = bank; // + = چپ‌بانک (بال راست بالا) — طبق قرارداد مدل
    const desiredBank = clamp(-azim * 1.5, -1.42, 1.42);
    let roll = clamp((bankSign - desiredBank) * 1.9 + st.angVel.r * 0.14, -1, 1);
    // وقتی هدف تقریباً جلو است، بال‌ها را صاف کن
    if (Math.abs(azim) < 0.06) roll = clamp(bankSign * 1.6 + st.angVel.r * 0.14, -1, 1);

    // ۴) پیچ — بستن زاویه ارتفاع + میرایی نرخ (بدون نوسان)
    let pitch = clamp(elev * 2.3 + st.angVel.p * 0.32, -1, 1);

    // ۵) دُم هماهنگ — کمی یَو برای تعقیب نرم دماغه
    const yaw = clamp(azim * 0.28, -0.5, 0.5);

    this.stick.x = roll;
    this.stick.y = -pitch; // قرارداد ذخیره: y منفی = دماغه بالا
    this._inst = { pitch, roll, yaw };
  }

  // نگه‌داشتن پرواز صاف هنگام نگاه به اطراف (Ctrl) — همان منطق نشانگرِ وسط
  _instructorHold(player) {
    const st = player.st;
    _fwdW.set(0, 0, 1).applyQuaternion(st.quat);
    _right.set(1, 0, 0).applyQuaternion(st.quat);
    const bank = Math.asin(clamp(_right.y, -1, 1));
    let pitch = -_fwdW.y * 2.4 - st.vel.y * 0.0022;
    if (st.V < 150 && !st.onGround) pitch -= (150 - st.V) * 0.005; // محافظت استال
    pitch = clamp(pitch, -0.6, 0.6);
    const roll = clamp(bank * 1.7 + st.angVel.r * 0.14, -1, 1);
    this._inst = { pitch, roll, yaw: 0 };
    this.stick.x = roll;
    this.stick.y = -pitch;
  }

  getIntent(dt, player, camera) {
    const k = this.keys;
    if (k.has('KeyW')) this.throttle = clamp(this.throttle + dt * 0.45, 0, 1);
    if (k.has('KeyS')) this.throttle = clamp(this.throttle - dt * 0.45, 0, 1);
    this.lookMode = this._wantLook();

    let pitch = 0, roll = 0, yaw = 0;
    if (player && camera) {
      if (this.lookMode) {
        // حالت سر خلبان — هواپیما صاف و تراز ادامه می‌دهد (مثل وارتاندر)
        this._instructorHold(player);
        pitch = this._inst.pitch;
        roll = this._inst.roll;
        yaw = 0;
      } else {
        this._instructor(player, camera);
        pitch = this._inst.pitch;
        roll = this._inst.roll;
        yaw = this._inst.yaw;
      }
    }
    // ورودی مستقیم کیبورد همیشه جمع می‌شود (خلبان قدیمی هم راحت است)
    pitch += (k.has('ArrowDown') ? 1 : 0) - (k.has('ArrowUp') ? 1 : 0);
    roll += (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    yaw += (k.has('KeyE') ? 1 : 0) - (k.has('KeyQ') ? 1 : 0);

    return {
      pitch: clamp(pitch, -1, 1),
      roll: clamp(roll, -1, 1),
      yaw: clamp(yaw, -1, 1),
      throttle: this.throttle,
      ab: this.ab,
      gear: this.gear,
      flaps: [0, 0.5, 1][this.flapStage],
      brake: k.has('KeyX'),
      fbw: this.fbw,
      fire: this.fireHeld || k.has('Space'),
    };
  }

  // ---------- UI استیک و نشانگر — هر فریم ----------
  updateUI(game) {
    const u = this.ui;
    if (!u.reticle) return;
    const show = this.locked && game.state === 'flying';
    const w = innerWidth, h = innerHeight;

    if (show) {
      // نشانگر هدف پرواز (مثل وارتاندر) — دور نشانگر موس
      const cx = w / 2 + this.cursor.x;
      const cy = h / 2 + this.cursor.y;
      u.reticle.style.display = 'block';
      u.reticle.style.left = cx + 'px';
      u.reticle.style.top = cy + 'px';
      u.reticle.classList.toggle('look', this.lookMode);
      // نقطه استیک
      const sx = clamp(this.stick.x, -1, 1);
      const sy = clamp(this.stick.y, -1, 1);
      u.dot.style.transform = `translate(calc(-50% + ${sx * 26}px), calc(-50% + ${sy * 26}px))`;
      u.stick.style.opacity = this.lookMode ? 0.35 : 0.9;
      u.look.style.display = this.lookMode ? 'block' : 'none';
    } else {
      u.reticle.style.display = 'none';
      u.look.style.display = 'none';
      u.stick.style.opacity = 0.35;
    }
  }
}
