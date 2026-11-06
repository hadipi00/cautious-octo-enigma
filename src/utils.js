// ریاضیات کمکی — نویز سیددار و توابع کاربردی (بدون وابستگی)

export const DEG = Math.PI / 180;
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
// میرایی مستقل از فریم‌ریت
export const damp = (cur, target, lambda, dt) => lerp(cur, target, 1 - Math.exp(-lambda * dt));

export function makeRand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Perlin-style gradient noise دوبعدی
export function makeNoise2D(seed) {
  const rand = makeRand(seed);
  const perm = new Uint8Array(512);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = (rand() * (i + 1)) | 0;
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  const grad = (h, x, y) => {
    switch (h & 7) {
      case 0: return  x + y; case 1: return  x - y;
      case 2: return -x + y; case 3: return -x - y;
      case 4: return  x;     case 5: return -x;
      case 6: return  y;     default: return -y;
    }
  };
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);

  return (x, y) => {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    const u = fade(x), v = fade(y);
    const a = perm[perm[X] + Y],     b = perm[perm[X + 1] + Y];
    const c = perm[perm[X] + Y + 1], d = perm[perm[X + 1] + Y + 1];
    const n00 = grad(a, x, y),     n10 = grad(b, x - 1, y);
    const n01 = grad(c, x, y - 1), n11 = grad(d, x - 1, y - 1);
    const nx0 = n00 + u * (n10 - n00);
    const nx1 = n01 + u * (n11 - n01);
    return nx0 + v * (nx1 - nx0); // ~ [-1, 1]
  };
}

export function fbm(noise, x, y, oct = 4, lac = 2, gain = 0.5) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * noise(x * freq, y * freq);
    norm += amp;
    amp *= gain; freq *= lac;
  }
  return sum / norm;
}
