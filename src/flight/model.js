// ============================================================
// فلایت‌مدل سمی‌رئال — نیروهای واقعی، استال، محدودیت G، افتربرنر
// گام ثابت (SIM.fixedDt) — بدون تخصیص حافظه در حلقه (صفر GC)
// ============================================================
import * as THREE from 'three';
import { DEG, clamp } from '../utils.js';
import { SIM } from '../config.js';

const G0 = SIM.g0;
export const airDensity = h => 1.225 * Math.exp(-Math.max(h, 0) / 8500);
export const speedOfSound = h => 340.3 - 0.0038 * Math.max(h, 0);

const _fwd = new THREE.Vector3(), _up = new THREE.Vector3(), _right = new THREE.Vector3();
const _velDir = new THREE.Vector3(), _liftDir = new THREE.Vector3();
const _aero = new THREE.Vector3();
const _dq = new THREE.Quaternion(), _eul = new THREE.Euler();

export function stepFlight(st, spec, input, dt) {
  const m = spec.mass + st.fuel;
  _fwd.set(0, 0, 1).applyQuaternion(st.quat);
  _up.set(0, 1, 0).applyQuaternion(st.quat);
  _right.set(1, 0, 0).applyQuaternion(st.quat);

  const V = st.vel.length();
  st.V = V;
  const vf = st.vel.dot(_fwd);
  const vu = st.vel.dot(_up);
  const vr = st.vel.dot(_right);

  const rho = airDensity(st.pos.y);
  const q = 0.5 * rho * V * V;
  const S = spec.wingArea;

  // زوایای حمله و لغزش
  const alpha = V > 8 ? Math.atan2(-vu, Math.max(vf, 2)) : 0;
  const beta = V > 8 ? Math.atan2(vr, Math.max(vf, 2)) : 0;
  st.alpha = alpha; st.beta = beta;
  st.mach = V / speedOfSound(st.pos.y);

  // ضریب برآر + استال
  const aStall = spec.aStall * DEG;
  const CLmax = spec.CL0 + spec.CLa * aStall;
  let CL = spec.CL0 + spec.CLa * alpha;
  st.stalled = false;
  if (!st.onGround && Math.abs(alpha) > aStall) {
    st.stalled = true;
    const over = Math.abs(alpha) - aStall;
    CL = Math.sign(alpha) * CLmax * Math.max(0.3, 1 - over / 0.45);
  }

  // پسا: القایی + سطحی + تجهیزات + موجک ترانسونیک
  let CD = spec.CD0 + spec.kInd * CL * CL;
  CD += 0.022 * st.flaps + (st.gear ? 0.020 : 0) + 0.055 * (st.brake ? 1 : 0);
  if (st.mach > 0.92) CD += 0.045 * clamp((st.mach - 0.92) / 0.16, 0, 1);

  // تراست و سوخت
  let T = 0;
  if (st.fuel > 0) {
    T = input.throttle * (input.ab ? spec.thrustAB : spec.thrustMil);
    st.fuel = Math.max(0, st.fuel - (input.ab ? spec.burnAB : spec.burnMil) * input.throttle * dt);
  }
  st.afterburner = input.ab && input.throttle > 0.98 && st.fuel > 0;

  const L = q * S * CL;
  const D = q * S * CD;
  const Yf = -q * S * 1.15 * beta;
  st.lift = L;

  if (V > 0.5) _velDir.copy(st.vel).multiplyScalar(1 / V); else _velDir.copy(_fwd);
  _liftDir.copy(_up).addScaledVector(_velDir, -_up.dot(_velDir));
  if (_liftDir.lengthSq() > 1e-6) _liftDir.normalize(); else _liftDir.copy(_up);

  // نیروی آیرودینامیک (بدون گرانش) → محاسبه G
  _aero.set(0, 0, 0)
    .addScaledVector(_fwd, T)
    .addScaledVector(_velDir, -D)
    .addScaledVector(_liftDir, L)
    .addScaledVector(_right, Yf);
  st.gForce = _aero.dot(_up) / (m * G0);
  st.gForce = dampG(st.gForce, st._gS || 1, dt);
  st._gS = st.gForce;

  // blackout / redout
  if (st.gForce > 6.5) st.blackout = clamp(st.blackout + (st.gForce - 6.5) * 0.10 * dt, 0, 1);
  else st.blackout = clamp(st.blackout - 0.35 * dt, 0, 1);
  if (st.gForce < -1.2) st.redout = clamp(st.redout + (-1.2 - st.gForce) * 0.12 * dt, 0, 1);
  else st.redout = clamp(st.redout - 0.5 * dt, 0, 1);

  // ---------- کنترل زاویه‌ای ----------
  const ctrlEff = st.onGround ? 0.12 : clamp(q / 26000, 0.10, 1);
  const fbw = input.fbw !== false;

  let pitchT = -input.pitch * spec.pitchRate * DEG * ctrlEff; // مثبت حول X = دماغه پایین
  let rollT = -input.roll * spec.rollRate * DEG * ctrlEff;    // مثبت حول Z = غلت چپ
  let yawT = input.yaw * spec.yawRate * DEG * ctrlEff;        // مثبت حول Y = دماغه راست

  // لیمیتِر FBW: جلوگیری از عبور از G و AOA مجاز
  if (fbw && V > 40 && !st.onGround) {
    const nMax = spec.maxG * 0.92, nMin = -2.5;
    const alphaMax = clamp((nMax * m * G0 / Math.max(q * S, 1) - spec.CL0) / spec.CLa, -0.05, aStall * 1.08);
    const alphaMin = clamp((nMin * m * G0 / Math.max(q * S, 1) - spec.CL0) / spec.CLa, -0.30, 0.05);
    const lead = 0.32; // ثانیه
    const aFut = alpha - pitchT * lead;
    if (aFut > alphaMax) pitchT = -(alphaMax - alpha) / lead;
    if (aFut < alphaMin) pitchT = -(alphaMin - alpha) / lead;
  }

  // رفتار استال: لرزش + افت دماغه
  if (st.stalled) {
    st.angVel.p += (Math.random() - 0.55) * SIM.stallBuffet * dt * 10;
    st.angVel.r += (Math.random() - 0.5) * SIM.stallBuffet * dt * 14;
    if (alpha > aStall * 1.2) pitchT = Math.max(pitchT, 0.2); // دماغه می‌خواهد بیفتد
  }

  // دستیار نگه‌داشتن ارتفاع وقتی خلبان کاری نمی‌کند (FBW روشن)
  if (input.fbw !== false && input.pitch === 0 && !st.onGround && V > 40) {
    pitchT += clamp(st.vel.y * 0.0025, -0.10, 0.10) * ctrlEff;
  }

  // پایداری طبیعی (وقتی FBW خاموش است)
  if (!fbw && V > 40 && !st.onGround) {
    pitchT += alpha * 1.1 * ctrlEff;
    yawT += beta * 2.2 * ctrlEff;
  }

  // میرایی نرخ (حس استیک واقعی)
  const k = 1 - Math.exp(-dt / 0.12);
  st.angVel.p += (pitchT - st.angVel.p) * k;
  st.angVel.r += (rollT - st.angVel.r) * k;
  st.angVel.y += (yawT - st.angVel.y) * k;

  // چرخش در فضای محلی
  _eul.set(st.angVel.p * dt, st.angVel.y * dt, st.angVel.r * dt, 'XYZ');
  _dq.setFromEuler(_eul);
  st.quat.multiply(_dq).normalize();

  // انتگرال‌گیری
  st.vel.addScaledVector(_aero, dt / m);
  st.vel.y -= G0 * dt;
  st.pos.addScaledVector(st.vel, dt);
}

// هموارسازی G برای جلوگیری از پرش عددی
function dampG(target, cur, dt) {
  return cur + (target - cur) * (1 - Math.exp(-dt / 0.25));
}
