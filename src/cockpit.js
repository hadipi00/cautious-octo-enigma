// ============================================================
// کابین پارامتریک سه‌بعدی — برای همه جنگنده‌ها
// داشبورد در ارتفاع چشم خلبان + MFD زنده (رادار/وضعیت) + استیک متحرک
// سر خلبان با نگاه می‌چرخد + شیشه کانوپی نیمه‌شفاف
// سبک غربی/روسی از روی داده هر جنگنده
// ============================================================
import * as THREE from 'three';

export function buildCockpit(spec) {
  const cfg = spec.cockpit || {};
  const style = cfg.style || 'west';
  const s = spec.len / 15;
  const west = style === 'west';

  const panelCol = cfg.panel || (west ? 0x2b3138 : 0x1e3b34);
  const seatCol = cfg.seat || 0x1b1f25;
  const accentCol = west ? 0x3a4550 : 0x274a3f;
  const glowCol = west ? 0x66d9a0 : 0xffd070;

  const g = new THREE.Group();
  g.name = 'Cockpit';
  // کابین نزدیک دماغه، داخل بدنه
  g.position.set(0, 0.02 * s, 1.62 * s);

  const mat = (c, rough = 0.85, metal = 0.1) =>
    new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal });

  // ---------- کف/تُب کابین — پایین دید را پر می‌کند ----------
  const tub = new THREE.Mesh(new THREE.BoxGeometry(0.94 * s, 0.5 * s, 1.15 * s), mat(0x14181e, 0.95, 0.05));
  tub.position.set(0, -0.40 * s, 0.28 * s);
  g.add(tub);

  // ---------- داشبورد و آفتاب‌گیر (در ارتفاع چشم) ----------
  const glare = new THREE.Mesh(new THREE.BoxGeometry(0.94 * s, 0.07 * s, 0.30 * s), mat(0x181c22, 0.95));
  glare.position.set(0, 0.17 * s, 0.66 * s);
  g.add(glare);

  const panelCanvas = document.createElement('canvas');
  panelCanvas.width = panelCanvas.height = 256;
  drawStaticPanel(panelCanvas.getContext('2d'), panelCol, west, glowCol);
  const panelTex = new THREE.CanvasTexture(panelCanvas);
  panelTex.colorSpace = THREE.SRGBColorSpace;
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(0.92 * s, 0.34 * s),
    new THREE.MeshStandardMaterial({ map: panelTex, roughness: 0.9 })
  );
  panel.position.set(0, 0.01 * s, 0.63 * s);
  panel.rotation.set(-0.42, Math.PI, 0, 'YXZ'); // رو به خلبان
  g.add(panel);

  // ---------- MFDها (۲ صفحه زنده) ----------
  const mfds = [];
  const mfdCount = cfg.mfds ?? 2;
  for (let i = 0; i < mfdCount; i++) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 256;
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const x = mfdCount === 2 ? (i === 0 ? 0.21 * s : -0.21 * s) : (i === 0 ? 0 : 0.30 * s); // x معکوس: صفحه با rotY(π) آینه می‌شود
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(0.25 * s, 0.25 * s),
      new THREE.MeshBasicMaterial({ map: tex })
    );
    m.position.set(x, 0.02 * s, 0.60 * s);
    m.rotation.set(-0.38, Math.PI, 0, 'YXZ'); // رو به خلبان
    g.add(m);
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.29 * s, 0.29 * s, 0.02 * s), mat(accentCol));
    bezel.position.set(x, 0.02 * s, 0.592 * s);
    bezel.rotation.x = -0.38;
    g.add(bezel);
    mfds.push({ cv, ctx: cv.getContext('2d'), tex });
  }

  // ---------- پدستال و کنسول‌های کناری + چراغ‌های چشمک‌زن ----------
  const pedestal = new THREE.Mesh(new THREE.BoxGeometry(0.30 * s, 0.44 * s, 0.42 * s), mat(panelCol));
  pedestal.position.set(0, -0.24 * s, 0.36 * s);
  g.add(pedestal);
  const leds = [];
  for (const sx of [-1, 1]) {
    const con = new THREE.Mesh(new THREE.BoxGeometry(0.20 * s, 0.12 * s, 0.80 * s), mat(panelCol));
    con.position.set(sx * 0.53 * s, -0.08 * s, 0.22 * s);
    g.add(con);
    for (let i = 0; i < 6; i++) {
      const led = new THREE.Mesh(
        new THREE.SphereGeometry(0.011 * s, 6, 4),
        new THREE.MeshBasicMaterial({ color: i % 3 === 0 ? glowCol : 0x30404a })
      );
      led.position.set(sx * (0.49 + Math.random() * 0.08) * s, -0.02 * s, -0.10 + i * 0.085 * s);
      g.add(led);
      leds.push(led);
    }
  }

  // ---------- استیک (جانبی یا مرکزی) + گاز ----------
  // توجه: +X قاب هواپیما = چپِ خلبان — استیک جانبی سمت راست خلبان است (−X)
  const stickGroup = new THREE.Group();
  const side = cfg.sideStick ? 1 : 0;
  const stickX = side ? -0.40 * s : 0;
  const stickY = side ? -0.14 * s : -0.12 * s;
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.024 * s, 0.034 * s, 0.28 * s, 8), mat(0x14181d, 0.6, 0.3));
  stick.position.y = 0.13 * s;
  const grip = new THREE.Mesh(new THREE.SphereGeometry(0.05 * s, 8, 6), mat(0x0d1013, 0.5, 0.2));
  grip.position.y = 0.28 * s;
  stickGroup.add(stick, grip);
  stickGroup.position.set(stickX, stickY, 0.40 * s);
  g.add(stickGroup);
  const throttleLever = new THREE.Mesh(new THREE.BoxGeometry(0.05 * s, 0.05 * s, 0.16 * s), mat(0x14181d));
  throttleLever.position.set(side ? 0.20 * s : 0.14 * s, -0.10 * s, 0.30 * s); // گاز سمت چپ خلبان
  g.add(throttleLever);

  // ---------- صندلی و خلبان (از نمای بیرونی دیده می‌شود) ----------
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.50 * s, 0.13 * s, 0.48 * s), mat(seatCol));
  seat.position.set(0, -0.16 * s, 0.02 * s);
  g.add(seat);
  const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.50 * s, 0.60 * s, 0.12 * s), mat(seatCol));
  seatBack.position.set(0, 0.12 * s, -0.24 * s);
  seatBack.rotation.x = 0.14;
  g.add(seatBack);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.16 * s, 0.24 * s, 4, 8), mat(0x2e3a2a));
  body.position.set(0, 0.08 * s, -0.12 * s);
  body.rotation.x = 0.22;
  g.add(body);
  // سر خلبان — گروه مجزا برای چرخش با نگاه
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.17 * s, -0.16 * s);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.125 * s, 10, 8), mat(0xd8dcd4, 0.4));
  const visor = new THREE.Mesh(
    new THREE.SphereGeometry(0.12 * s, 10, 6, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.35),
    mat(0x22262c, 0.2, 0.8)
  );
  visor.rotation.x = 0.35;
  headGroup.add(helmet, visor);
  g.add(headGroup);

  // ---------- قاب کانوپی (اطراف دید) ----------
  for (const sx of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05 * s, 0.05 * s, 1.5 * s), mat(0x9aa4ad, 0.4, 0.7));
    rail.position.set(sx * 0.52 * s, 0.20 * s, 0.15 * s);
    g.add(rail);
  }
  const arch = new THREE.Mesh(new THREE.TorusGeometry(0.54 * s, 0.026 * s, 6, 12, Math.PI), mat(0x9aa4ad, 0.4, 0.7));
  arch.rotation.y = Math.PI / 2;
  arch.position.set(0.0, 0.20 * s, -0.55 * s);
  g.add(arch);

  return {
    group: g,
    stickGroup, throttle: throttleLever,
    mfds, leds, headGroup,
    mfdT: 0,
    // به‌روزرسانی: استیک/گاز با ورودی خلبان + سر با نگاه + MFD زنده
    update(dt, aircraft, game) {
      const inp = aircraft.input;
      stickGroup.rotation.z = THREE.MathUtils.clamp(inp.roll, -1, 1) * 0.45;
      stickGroup.rotation.x = THREE.MathUtils.clamp(inp.pitch, -1, 1) * 0.35;
      throttleLever.position.z = (0.30 + (aircraft.st.throttle - 0.5) * 0.10) * s;
      // چرخش سر خلبان با نگاه (Ctrl + موس)
      if (game && game.controls) {
        const look = game.controls.look;
        headGroup.rotation.y = THREE.MathUtils.clamp(look.yaw, -1.2, 1.2) * 0.75;
        headGroup.rotation.x = THREE.MathUtils.clamp(-look.pitch, -0.6, 0.6) * 0.7;
      }
      // چراغ‌های هشدار — چشمک زنده
      const blink = (Date.now() / 400 | 0) % 2 === 0;
      const warn = aircraft.st.stalled || aircraft.hp < aircraft.hpMax * 0.3;
      for (let i = 0; i < leds.length; i++) {
        const isWarn = warn && i % 3 === 0;
        leds[i].material.color.setHex(isWarn ? (blink ? 0xff3030 : 0x551010) : (i % 3 === 0 ? glowCol : 0x30404a));
      }
      this.mfdT -= dt;
      if (this.mfdT <= 0) {
        this.mfdT = 0.2;
        if (mfds[0]) drawRadarMfd(mfds[0], aircraft, game, west, glowCol);
        if (mfds[1]) drawStatusMfd(mfds[1], aircraft, west, glowCol);
      }
    },
  };
}

// ---------- پنل استاتیک ----------
function drawStaticPanel(g, panelCol, west, glow) {
  const hex = '#' + new THREE.Color(panelCol).getHexString();
  g.fillStyle = hex;
  g.fillRect(0, 0, 256, 256);
  // صفحه‌های گرد ابزار
  const dial = (x, y, r, label) => {
    g.fillStyle = '#0a0d10';
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = west ? '#3d4a55' : '#3f5c4c'; g.lineWidth = 4;
    g.stroke();
    g.strokeStyle = glow; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + r * 0.6, y - r * 0.45); g.stroke();
    g.fillStyle = '#8895a3'; g.font = '11px monospace'; g.textAlign = 'center';
    g.fillText(label, x, y + r + 12);
  };
  dial(52, 70, 26, 'ASI');
  dial(128, 70, 26, 'ATT');
  dial(204, 70, 26, 'ALT');
  dial(90, 168, 20, 'VSI');
  dial(166, 168, 20, 'RPM');
  // کلیدها و سوئیچ‌ها
  for (let i = 0; i < 14; i++) {
    g.fillStyle = i % 4 === 0 ? glow : '#465059';
    g.fillRect(18 + i * 16, 208, 9, 14);
  }
}

// ---------- MFD رادار (زنده — از ترک‌های واقعی رادار) ----------
function drawRadarMfd(mfd, aircraft, game, west, glow) {
  const g = mfd.ctx;
  const W = 256;
  const glowHex = west ? '#7dffb2' : '#ffd88a';
  g.fillStyle = '#04080a';
  g.fillRect(0, 0, W, W);
  const cx = W / 2, cy = W / 2 + 30, R = 108;
  // دایره‌های برد
  g.strokeStyle = '#1d3a30'; g.lineWidth = 2;
  for (let r = R; r > 0; r -= R / 3) { g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke(); }
  g.beginPath(); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.stroke();
  // پرچوی چرخان
  const sweep = (Date.now() / 900) % (Math.PI * 2);
  const grad = g.createConicGradient ? g.createConicGradient(sweep, cx, cy) : null;
  if (grad) {
    grad.addColorStop(0, 'rgba(80,255,160,0.25)');
    grad.addColorStop(0.12, 'rgba(80,255,160,0)');
    grad.addColorStop(1, 'rgba(80,255,160,0)');
    g.fillStyle = grad;
    g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
  }
  // جت خودی (مرکز)
  g.fillStyle = glowHex;
  g.fillRect(cx - 2, cy - 10, 4, 20);
  g.fillRect(cx - 10, cy - 2, 20, 4);

  const radar = aircraft.radar;
  const dispRange = radar ? Math.min(radar.range, 40000) : 12000;
  const scale = R / dispRange;
  _mfdQ.copy(aircraft.st.quat).invert();

  const plot = (e, detected, closure) => {
    _mfdV.copy(e.st.pos).sub(aircraft.st.pos);
    _mfdV.applyQuaternion(_mfdQ);
    const rx = _mfdV.x, rz = _mfdV.z; // +z جلو → بالا صفحه
    let px = cx + rx * scale, py = cy - rz * scale;
    const dc = Math.hypot(px - cx, py - cy);
    if (dc > R) return;
    const locked = aircraft.lockTarget === e;
    g.globalAlpha = detected ? 1 : 0.3;
    g.strokeStyle = locked ? '#ffffff' : '#ff5050';
    g.lineWidth = 2;
    g.strokeRect(px - 6, py - 6, 12, 12);
    // بردار نسبی سرعت (تصویر سرعت هدف در قاب خودی)
    if (detected && e.st.vel.lengthSq() > 100) {
      _mfdV.copy(e.st.vel).applyQuaternion(_mfdQ).multiplyScalar(0.04);
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(px + _mfdV.x, py - _mfdV.z);
      g.stroke();
    }
    g.globalAlpha = 1;
  };

  if (radar) {
    for (const tr of radar._pool) {
      if (!tr.ac || !tr.ac.alive) continue;
      plot(tr.ac, tr.detected, tr.closure);
    }
    g.fillStyle = '#9fb2ca'; g.font = '13px monospace';
    const lt = aircraft.lockTarget;
    const ready = lt && (aircraft.lockT >= (radar.mode === 'stt' ? 0.4 : 1.1));
    g.fillText(radar.mode.toUpperCase() + (ready ? ' LOCK' : lt ? ' DESIG' : ''), 12, 22);
    g.fillText(`RNG ${(dispRange / 1000) | 0}KM`, 12, W - 12);
  } else {
    // بدون رادار — فقط دید چشمی/IR
    if (game && game.player === aircraft) {
      for (const e of game.aircraft) {
        if (!e.alive || e.team === aircraft.team) continue;
        if (e.st.pos.distanceTo(aircraft.st.pos) > 12000) continue;
        plot(e, true, 0);
      }
    }
    g.fillStyle = '#9fb2ca'; g.font = '13px monospace';
    g.fillText('IR ONLY', 12, 22);
    g.fillText('RNG 12KM', 12, W - 12);
  }
  mfd.tex.needsUpdate = true;
}

// ---------- MFD وضعیت (زنده) ----------
function drawStatusMfd(mfd, aircraft, west, glow) {
  const g = mfd.ctx;
  const W = 256;
  g.fillStyle = '#04080a';
  g.fillRect(0, 0, W, W);
  const bar = (y, label, v, col) => {
    g.fillStyle = '#9fb2ca'; g.font = '13px monospace';
    g.fillText(label, 12, y - 6);
    g.fillStyle = '#152028';
    g.fillRect(90, y - 16, 150, 14);
    g.fillStyle = col;
    g.fillRect(90, y - 16, 150 * Math.max(0, Math.min(1, v)), 14);
  };
  const st = aircraft.st;
  bar(34, 'THR', st.throttle, '#7dffb2');
  bar(62, 'FUEL', st.fuel / aircraft.spec.fuelCap, '#ffd88a');
  bar(90, 'HULL', aircraft.hp / aircraft.hpMax, aircraft.hp > aircraft.hpMax * 0.4 ? '#7dffb2' : '#ff5050');
  bar(118, 'G', st.gForce / 10, '#8ac4ff');
  g.fillStyle = '#cfe3ff'; g.font = '15px monospace';
  g.fillText(`GUN ${aircraft.gunAmmo}`, 12, 150);
  g.fillText(`MSL ${aircraft.missiles}  BMB ${aircraft.bombs}`, 12, 172);
  g.fillText(`RKT ${aircraft.rockets}  FLR ${aircraft.flares}  CHF ${aircraft.chaff}`, 12, 194);
  g.fillText(`MACH ${st.mach.toFixed(2)}  ALT ${Math.round(st.pos.y)}`, 12, 220);
  if (st.stalled) { g.fillStyle = '#ff5050'; g.fillText('** STALL **', 12, 244); }
  mfd.tex.needsUpdate = true;
}

const _mfdV = new THREE.Vector3();
const _mfdQ = new THREE.Quaternion();
