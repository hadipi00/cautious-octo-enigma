// ============================================================
// AIRDOM — پیکربندی کلی (نسخه کامل)
// ============================================================

export const WORLD = {
  size: 26000,
  seed: 1337,
};

export const BASES = {
  friendly: { x: -4500, z: 0,    elev: 30 },
  enemy:    { x:  4800, z: 1400, elev: 46 },
};

// پریست‌های کیفیت — تقسیم بار CPU/GPU/RAM
export const QUALITY = {
  low: {
    label: 'کم',    pixelCap: 1.0,  antialias: false, shadows: false, shadowSize: 512,
    fogNear: 1500,  fogFar: 9500,   terrainSeg: 256,  clouds: 10,  rocks: 60,   trees: 0,
    maxParticles: 250, autoRes: true,
  },
  medium: {
    label: 'متوسط', pixelCap: 1.25, antialias: true,  shadows: true,  shadowSize: 1024,
    fogNear: 2500,  fogFar: 15000,  terrainSeg: 340,  clouds: 18,  rocks: 120,  trees: 140,
    maxParticles: 500, autoRes: true,
  },
  high: {
    label: 'بالا',  pixelCap: 1.5,  antialias: true,  shadows: true,  shadowSize: 2048,
    fogNear: 3200,  fogFar: 21000,  terrainSeg: 420,  clouds: 26,  rocks: 200,  trees: 300,
    maxParticles: 900, autoRes: true,
  },
  ultra: {
    label: 'فوق',   pixelCap: 2.0,  antialias: true,  shadows: true,  shadowSize: 4096,
    fogNear: 4200,  fogFar: 27000,  terrainSeg: 512,  clouds: 38,  rocks: 320,  trees: 480,
    maxParticles: 1600, autoRes: false,
  },
};

export const CAM = {
  chaseOffset:   { back: 17, up: 4.6 },
  farOffset:     { back: 34, up: 9 },
  cockpitFov: 76, chaseFov: 70,
  smooth: 6.5, lookRecenter: 1.6, lookSens: 0.0021,
};

export const SIM = {
  fixedDt: 1 / 120,
  maxSubsteps: 5,
  g0: 9.80665,
  crashSinkRate: 9,
  stallBuffet: 0.35,
};

// تسلیحات — موشک‌ها سه نوع: IR حرارتی، SARH نیمه‌فعال راداری، ARH فعال راداری
export const WEAPONS = {
  gunMv: 1050,           // سرعت دهانه توپ
  gunDmg: 16,
  lockCone: 25,          // درجه — کون قفل حرارتی/تخصیص
  lockTime: 1.1,
  flareDecoyChance: 0.75,
  flareLife: 4.2,
  chaffDecoyChance: 0.55,
  chaffLife: 3.0,

  // مشخصات هر نوع موشک (قابل بازنویسی در JSON هر جنگنده)
  MSL: {
    ir:   { speed: 850,  turn: 4.4, dmg: 70,  life: 14, motor: 3.2 },
    sarh: { speed: 1050, turn: 3.0, dmg: 95,  life: 26, motor: 4.5 },
    arh:  { speed: 1200, turn: 3.4, dmg: 110, life: 34, motor: 6.0 },
  },
  activeRadarRange: 12000,  // برد فعال‌شدن جوینده ARH
  loftRange: 7000,          // بالاتر از این برد، موشک راداری اول اوج می‌گیرد
  notchCos: 0.45,           // ناتچینگ: سرعت هدف عمود بر خط دید → شکستن قفل
  notchMinRange: 3000,      // ناتچینگ فقط دور از فعال‌شدن جوینده
  sarhGraceT: 0.7,          // تحمل قطع روشنایی SARH (ثانیه)

  bombDmg: 140,
  bombRadius: 60,
  rocketSpeed: 620,
  rocketDmg: 45,
  rocketLife: 6,
  lockRange: 9000,
  samRange: 5200,
  samReload: 9,
  aaaRange: 2300,
  aaaReload: 1.3,
};

export const SCORE = {
  enemyKill: 100,
  hangar: 80, fuelTank: 60, radar: 120, samSite: 150, aaaSite: 100,
  landingBonus: 250,
};

const LS_KEY = 'airdom.settings.v3';
export function loadSettings() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; }
}
export function saveSettings(s) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
