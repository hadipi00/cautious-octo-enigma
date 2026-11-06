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
    fogNear: 1500,  fogFar: 9500,   terrainSeg: 256,  clouds: 10,  rocks: 60,
    maxParticles: 250, autoRes: true,
  },
  medium: {
    label: 'متوسط', pixelCap: 1.25, antialias: true,  shadows: true,  shadowSize: 1024,
    fogNear: 2500,  fogFar: 15000,  terrainSeg: 340,  clouds: 18,  rocks: 120,
    maxParticles: 500, autoRes: true,
  },
  high: {
    label: 'بالا',  pixelCap: 1.5,  antialias: true,  shadows: true,  shadowSize: 2048,
    fogNear: 3200,  fogFar: 21000,  terrainSeg: 420,  clouds: 26,  rocks: 200,
    maxParticles: 900, autoRes: true,
  },
  ultra: {
    label: 'فوق',   pixelCap: 2.0,  antialias: true,  shadows: true,  shadowSize: 4096,
    fogNear: 4200,  fogFar: 27000,  terrainSeg: 512,  clouds: 38,  rocks: 320,
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

// تسلیحات (مشترک بین جنگنده‌ها؛ تعدادها در JSON هر جنگنده)
export const WEAPONS = {
  gunMv: 1050,           // سرعت دهانه توپ
  gunDmg: 5,
  missileSpeed: 980,
  missileTurn: 3.2,      // rad/s
  missileDmg: 65,
  missileLife: 14,
  bombDmg: 120,
  bombRadius: 60,
  rocketSpeed: 620,
  rocketDmg: 28,
  rocketLife: 6,
  lockCone: 25,          // درجه
  lockRange: 9000,
  lockTime: 1.1,
  flareDecoyChance: 0.75,
  flareLife: 4.2,
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

const LS_KEY = 'airdom.settings.v2';
export function loadSettings() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; }
}
export function saveSettings(s) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
