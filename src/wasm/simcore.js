// ============================================================
// پل WASM — بارگذاری simcore.wasm + پیاده‌سازی جایگزین JS
// اگر WASM در دسترس نبود (مثلاً file://)، همان ریاضی در JS اجرا می‌شود
// همه توابع دسته‌ای‌اند: بدون تخصیص حافظه در حلقه بازی (صفر GC)
//
// چیدمان اسکرچ در حافظه خطی ماژول:
//   states   @1024   (۶×f64 برای هر پرتابه — تا ۴۰۰ پرتابه)
//   lead     @20480  (۱۰×f64 برای هر آیتم)
//   contacts @65536  (۵×f64 برای هر تماس)
//   radarout @131072 (۲×f64 برای هر تماس)
// ============================================================

const STATE_OFF = 1024, LEAD_OFF = 20480, CONTACT_OFF = 65536, OUT_OFF = 131072;
const MAX_ITEMS = 400, MAX_CONTACTS = 64;

class SimCore {
  constructor() {
    this.ok = false;
    this._mem = null;       // DataView
    this._u8 = null;        // Uint8Array برای کپی سریع
    this.ex = null;
  }

  async init(url = './src/wasm/simcore.wasm') {
    try {
      let bytes;
      if (WebAssembly.instantiateStreaming) {
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error('http ' + res.status);
          const r = await WebAssembly.instantiateStreaming(res, {});
          this.ex = r.instance.exports;
        } catch {
          bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
          const r = await WebAssembly.instantiate(bytes, {});
          this.ex = r.instance.exports;
        }
      } else {
        bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
        const r = await WebAssembly.instantiate(bytes, {});
        this.ex = r.instance.exports;
      }
      this._u8 = new Uint8Array(this.ex.memory.buffer);
      this._f64 = new Float64Array(this.ex.memory.buffer);   // نمای f64 برای کپی دسته‌ای
      this.ok = true;
    } catch (e) {
      console.warn('[simcore] WASM unavailable → JS fallback:', e && e.message);
      this.ok = false;
    }
    return this.ok;
  }

  // ---------- بالستیک دسته‌ای ----------
  // arr: Float64Array با n×۶ مؤلفه [x,y,z,vx,vy,vz] — در جا اصلاح می‌شود
  ballisticBatch(arr, n, dt, g, drag) {
    if (this.ok && n > 0) {
      // کپی بایت‌به‌بایت با نمای f64 (STATE_OFF/۸ = اندیس المان)
      this._f64.set(arr.subarray(0, n * 6), STATE_OFF / 8);
      this.ex.ballistic_batch(STATE_OFF, n, dt, g, drag);
      arr.set(this._f64.subarray(STATE_OFF / 8, STATE_OFF / 8 + n * 6));
      return n;
    }
    // fallback JS — همان اویلر نیمه‌ضمنی
    for (let i = 0; i < n; i++) {
      const o = i * 6;
      const d = Math.max(0, 1 - drag * dt);
      arr[o + 3] *= d;
      arr[o + 5] *= d;
      arr[o + 4] = (arr[o + 4] - g * dt) * d;
      arr[o] += arr[o + 3] * dt;
      arr[o + 1] += arr[o + 4] * dt;
      arr[o + 2] += arr[o + 5] * dt;
    }
    return n;
  }

  // ---------- رادار دسته‌ای ----------
  // contacts: Float64Array با n×۵ [x,y,z,rcs,mult] (موقعیت مطلق)
  // out: Float64Array با n×۲ [detect, snr] — تعداد شناسایی‌شده برمی‌گردد
  radarScan(rx, ry, rz, fx, fy, fz, gimbalCos, range, thresh, contacts, n, out) {
    if (this.ok && n > 0) {
      // موقعیت تماس‌ها مطلق است — در WAT نسبی محاسبه می‌شود؛ مستقیم کپی
      this._f64.set(contacts.subarray(0, n * 5), CONTACT_OFF / 8);
      const count = this.ex.radar_scan(rx, ry, rz, fx, fy, fz,
        gimbalCos, range, thresh, CONTACT_OFF, n, OUT_OFF);
      out.set(this._f64.subarray(OUT_OFF / 8, OUT_OFF / 8 + n * 2));
      return count;
    }
    // fallback JS
    let count = 0;
    const fl = Math.max(1e-6, Math.hypot(fx, fy, fz));
    for (let i = 0; i < n; i++) {
      const o = i * 5;
      const dx = contacts[o] - rx, dy = contacts[o + 1] - ry, dz = contacts[o + 2] - rz;
      const r = Math.max(1, Math.hypot(dx, dy, dz));
      const dot = (fx * dx + fy * dy + fz * dz) / fl / r;
      out[i * 2] = 0; out[i * 2 + 1] = 0;
      if (dot <= gimbalCos) continue;
      let snr = (contacts[o + 3] / Math.max(1, r * r * r * r)) * contacts[o + 4] * 1e12;
      snr *= dot;
      out[i * 2 + 1] = snr;
      if (snr > thresh && r < range) { out[i * 2] = 1; count++; }
    }
    return count;
  }

  // ---------- حل‌گر پیش‌روی تکی ----------
  lead(tx, ty, tz, vx, vy, vz, px, py, pz, mv) {
    if (this.ok) return this.ex.lead_solve(tx, ty, tz, vx, vy, vz, px, py, pz, mv);
    let ax = tx - px, ay = ty - py, az = tz - pz;
    let t = Math.hypot(ax, ay, az) / Math.max(1, mv);
    for (let i = 0; i < 7; i++) {
      ax = tx + vx * t - px; ay = ty + vy * t - py; az = tz + vz * t - pz;
      t = Math.hypot(ax, ay, az) / Math.max(1, mv);
    }
    return t;
  }
}

export const simcore = new SimCore();
export { MAX_ITEMS, MAX_CONTACTS, STATE_OFF, LEAD_OFF, CONTACT_OFF, OUT_OFF };
