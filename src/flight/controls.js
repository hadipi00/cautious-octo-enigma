// کنترل کیبورد + موس — طرح War Thunder: W/S گاز، فلش‌ها پیچ، A/D غلت، Q/E دُم
import { clamp } from '../utils.js';
import { CAM } from '../config.js';

const HANDLED = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyZ', 'KeyX', 'KeyG', 'KeyV',
  'KeyC', 'KeyF', 'KeyR', 'KeyB', 'KeyT', 'KeyN', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Tab', 'F3', 'Digit1', 'Digit2', 'Digit3', 'ShiftLeft', 'ShiftRight',
  'KeyI', 'KeyJ', 'KeyK', 'KeyL', 'Home',
]);

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

    // وضعیت‌های toggle
    this.ab = false;
    this.gear = true;
    this.flapStage = 0; // 0 / 0.5 / 1
    this.throttle = 0;
    this.fbw = true;
    this.fireHeld = false;

    window.addEventListener('keydown', (e) => {
      if (HANDLED.has(e.code)) e.preventDefault();
      if (!e.repeat) this.queue.push(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.fireHeld = false; });

    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas) return;
      this.look.yaw = clamp(this.look.yaw - e.movementX * CAM.lookSens, -2.5, 2.5);
      this.look.pitch = clamp(this.look.pitch - e.movementY * CAM.lookSens, -1.15, 1.15);
      this.lastMove = performance.now();
    });
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
  }

  requestLock() {
    try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* ignore */ }
  }
  releaseLock() { if (this.locked) document.exitPointerLock(); }

  reset() {
    this.ab = false; this.gear = true; this.flapStage = 0;
    this.throttle = 0; this.fireHeld = false;
    this.look.yaw = 0; this.look.pitch = 0;
  }

  drainQueue() { const q = this.queue; this.queue = []; return q; }

  getIntent(dt) {
    const k = this.keys;
    if (k.has('KeyW')) this.throttle = clamp(this.throttle + dt * 0.45, 0, 1);
    if (k.has('KeyS')) this.throttle = clamp(this.throttle - dt * 0.45, 0, 1);
    return {
      pitch: (k.has('ArrowDown') ? 1 : 0) - (k.has('ArrowUp') ? 1 : 0), // +1 = دماغه بالا
      roll: (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0),          // +1 = غلت راست
      yaw: (k.has('KeyE') ? 1 : 0) - (k.has('KeyQ') ? 1 : 0),           // +1 = دماغه راست
      throttle: this.throttle,
      ab: this.ab,
      gear: this.gear,
      flaps: [0, 0.5, 1][this.flapStage],
      brake: k.has('KeyX'),
      fbw: this.fbw,
      fire: this.fireHeld || k.has('Space'),
    };
  }
}
