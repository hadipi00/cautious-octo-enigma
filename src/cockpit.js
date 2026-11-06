// ============================================================
// کابین پارامتریک سه‌بعدی — برای همه جنگنده‌ها
// داشبورد + MFD زنده (رادار/وضعیت) + استیک متحرک + چرخش سر
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

  // ---------- داشبورد و آفتاب‌گیر ----------
  const glare = new THREE.Mesh(new THREE.BoxGeometry(0.94 * s, 0.10 * s, 0.34 * s), mat(panelCol, 0.95));
  glare.position.set(0, 0.10 * s, 0.62 * s);
  g.add(glare);

  // پنل اصلی (بافت کشیده‌شده روی بوم)
  const panelCanvas = document.createElement('canvas');
  panelCanvas.width = panelCanvas.height = 256;
  drawStaticPanel(panelCanvas.getContext('2d'), panelCol, west, glowCol);
  const panelTex = new THREE.CanvasTexture(panelCanvas);
  panelTex.colorSpace = THREE.SRGBColorSpace;
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(0.92 * s, 0.40 * s),
    new THREE.MeshStandardMaterial({ map: panelTex, roughness: 0.9 })
  );
  panel.position.set(0, -0.06 * s, 0.58 * s);
  panel.rotation.set(-0.25, Math.PI, 0, 'YXZ'); // رو به خلبان
  g.add(panel);

  // ---------- MFDها (۲ صفحه زنده) ----------
  const mfds = [];
  const mfdCount = cfg.mfds ?? 2;
  for (let i = 0; i < mfdCount; i++) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 256;
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const x = mfdCount === 2 ? (i === 0 ? -0.24 * s : 0.24 * s) : (i === 0 ? 0 : 0.30 * s);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(0.26 * s, 0.26 * s),
      new THREE.MeshBasicMaterial({ map: tex })
    );
    m.position.set(x, -0.03 * s, 0.565 * s);
    m.rotation.set(-0.2, Math.PI, 0, 'YXZ'); // رو به خلبان
    g.add(m);
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.30 * s, 0.30 * s, 0.02 * s), mat(accentCol));
    bezel.position.set(x, -0.03 * s, 0.555 * s);
    bezel.rotation.x = -0.2;
    g.add(bezel);
    mfds.push({ cv, ctx: cv.getContext('2d'), tex });
  }

  // ---------- پدستال و کنسول‌های کناری + چراغ‌های چشمک‌زن ----------
  const pedestal = new THREE.Mesh(new THREE.BoxGeometry(0.34 * s, 0.34 * s, 0.5 * s), mat(panelCol));
  pedestal.position.set(0, -0.34 * s, 0.30 * s);
  g.add(pedestal);
  for (const sx of [-1, 1]) {
    const con = new THREE.Mesh(new THREE.BoxGeometry(0.22 * s, 0.10 * s, 0.72 * s), mat(panelCol));
    con.position.set(sx * 0.55 * s, -0.30 * s, 0.28 * s);
    g.add(con);
    for (let i = 0; i < 6; i++) {
      const led = new THREE.Mesh(
        new THREE.SphereGeometry(0.012 * s, 6, 4),
        new THREE.MeshBasicMaterial({ color: i % 3 === 0 ? glowCol : 0x30404a })
      );
      led.position.set(sx * (0.50 + Math.random() * 0.10) * s, -0.24 * s, 0.05 + i * 0.085 * s);
      g.add(led);
    }
  }

  // ---------- استیک (جانبی یا مرکزی) + گاز ----------
  const stickGroup = new THREE.Group();
  const side = cfg.sideStick ? 1 : 0;
  const stickX = side ? 0.42 * s : 0;
  const stickY = side ? -0.26 * s : -0.14 * s;
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.025 * s, 0.035 * s, 0.30 * s, 8), mat(0x14181d, 0.6, 0.3));
  stick.position.y = 0.15 * s;
  const grip = new THREE.Mesh(new THREE.SphereGeometry(0.05 * s, 8, 6), mat(0x0d1013, 0.5, 0.2));
  grip.position.y = 0.31 * s;
  stickGroup.add(stick, grip);
  stickGroup.position.set(stickX, stickY, 0.42 * s);
  g.add(stickGroup);
  const throttle = new THREE.Mesh(new THREE.BoxGeometry(0.05 * s, 0.05 * s, 0.16 * s), mat(0x14181d));
  throttle.position.set(stickX + (side ? -0.16 : 0.12) * s, -0.28 * s, 0.34 * s);
  g.add(throttle);

  // ---------- صندلی و خلبان ----------
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.52 * s, 0.14 * s, 0.5 * s), mat(seatCol));
  seat.position.set(0, -0.42 * s, 0.02 * s);
  g.add(seat);
  const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.52 * s, 0.62 * s, 0.12 * s), mat(seatCol));
  seatBack.position.set(0, -0.14 * s, -0.22 * s);
  seatBack.rotation.x = 0.14;
  g.add(seatBack);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.17 * s, 0.26 * s, 4, 8), mat(0x2e3a2a));
  body.position.set(0, -0.12 * s, -0.10 * s);
  body.rotation.x = 0.22;
  g.add(body);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.13 * s, 10, 8), mat(0xd8dcd4, 0.4));
  helmet.position.set(0, 0.10 * s, -0.06 * s);
  g.add(helmet);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.125 * s, 10, 6, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.35), mat(0x22262c, 0.2, 0.8));
  visor.position.copy(helmet.position);
  visor.rotation.x = 0.35;
  g.add(visor);

  // ---------- قاب کانوپی (دیده‌شدن از داخل) ----------
  for (const sx of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05 * s, 0.05 * s, 1.5 * s), mat(0x9aa4ad, 0.4, 0.7));
    rail.position.set(sx * 0.52 * s, 0.16 * s, 0.15 * s);
    g.add(rail);
  }
  const arch = new THREE.Mesh(new THREE.TorusGeometry(0.54 * s, 0.026 * s, 6, 12, Math.PI), mat(0x9aa4ad, 0.4, 0.7));
  arch.rotation.y = Math.PI / 2;
  arch.position.set(0.0, 0.16 * s, -0.60 * s);
  g.add(arch);

  return {
    group: g,
    stickGroup, throttle,
    mfds,
    mfdT: 0,
    // به‌روزرسانی: استیک با ورودی خلبان + MFD زنده
    update(dt, aircraft, game) {
      const inp = aircraft.input;
      stickGroup.rotation.z = THREE.MathUtils.clamp(inp.roll, -1, 1) * 0.45;
      stickGroup.rotation.x = THREE.MathUtils.clamp(inp.pitch, -1, 1) * 0.35;
      throttle.position.z = (0.34 + (aircraft.st.throttle - 0.5) * 0.10) * s;
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

// ---------- MFD رادار (زنده) ----------
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
  // جت خودی (مرکز) + خط بردار سرعت
  g.fillStyle = glowHex;
  g.fillRect(cx - 2, cy - 10, 4, 20);
  g.fillRect(cx - 10, cy - 2, 20, 4);
  // نشانگر قفل و برد
  if (game && game.player === aircraft) {
    for (const e of game.aircraft) {
      if (!e.alive || e.team === aircraft.team) continue;
      _mfdV.copy(e.st.pos).sub(aircraft.st.pos);
      _mfdQ.copy(aircraft.st.quat).invert();
      _mfdV.applyQuaternion(_mfdQ);
      const rx = _mfdV.x, rz = _mfdV.z; // +z جلو → بالا صفحه
      const dist = Math.hypot(rx, rz);
      if (dist > 12000) continue;
      const px = cx + (rx / 12000) * R, py = cy - (rz / 12000) * R;
      if (Math.hypot(px - cx, py - cy) > R) continue;
      g.strokeStyle = aircraft.lockTarget === e ? '#ffffff' : '#ff5050';
      g.lineWidth = 2;
      g.strokeRect(px - 6, py - 6, 12, 12);
    }
    g.fillStyle = '#9fb2ca'; g.font = '13px monospace';
    const lt = aircraft.lockTarget;
    g.fillText(lt && aircraft.lockT >= 1.1 ? 'LOCKED' : lt ? 'LOCKING' : 'SEARCH', 12, 22);
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
  g.fillText(`RKT ${aircraft.rockets}  FLR ${aircraft.flares}`, 12, 194);
  g.fillText(`MACH ${st.mach.toFixed(2)}  ALT ${Math.round(st.pos.y)}`, 12, 220);
  if (st.stalled) { g.fillStyle = '#ff5050'; g.fillText('** STALL **', 12, 244); }
  mfd.tex.needsUpdate = true;
}

const _mfdV = new THREE.Vector3();
const _mfdQ = new THREE.Quaternion();
