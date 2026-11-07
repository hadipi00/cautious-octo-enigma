// ============================================================
// آشیانه سه‌بعدی — دقیقاً حس وارتاندر: جت روی سکو، نورپردازی استودیویی،
// درِ باز رو به آسمان، ستون‌های نور، گردوغبار معلق
// صحنه جدا از صحنه پرواز است؛ منو/آشیانه اینجا رندر می‌شود.
// دوربین: مدار آهسته + درگ موس برای چرخش + اسکرول برای زوم
// ============================================================
import * as THREE from 'three';

export class Hangar {
  constructor(quality, envTex) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05070b);
    this.scene.fog = new THREE.Fog(0x05070b, 60, 140);
    if (envTex) {
      this.scene.environment = envTex;
      this.scene.environmentIntensity = 0.45; // r163+ — بازتاب محیطی ملایم داخل آشیانه
    }

    this.az = 0.9; this.azTarget = 0.9;       // زاویه مدار
    this.polar = 0.30; this.polarTarget = 0.30; // زاویه ارتفاع از افق (داخل آشیانه)
    this.radius = 24; this.radiusTarget = 24;
    this._drag = null;
    this._t = 0;

    this._buildLights(quality);
    this._buildShell();
    this._buildPlatform();
    this._buildProps();
    this._buildDust();
  }

  // ---------- نورپردازی استودیویی ----------
  _buildLights(quality) {
    this.scene.add(new THREE.HemisphereLight(0x9db4d8, 0x1a1410, 0.35));

    // اسپات اصلی گرم از بالا-جلو (سایه‌دار) — واحد فیزیکی: کندلا
    const key = new THREE.SpotLight(0xffe6c0, 26000, 90, 0.55, 0.45, 2.0);
    key.position.set(14, 15, 16);
    key.castShadow = quality.shadows;
    if (quality.shadows) {
      key.shadow.mapSize.set(Math.min(quality.shadowSize, 2048), Math.min(quality.shadowSize, 2048));
      key.shadow.bias = -0.0003;
      key.shadow.camera.near = 4;
      key.shadow.camera.far = 70;
    }
    key.target.position.set(0, 2.5, 0);
    this.scene.add(key, key.target);
    this.key = key;

    // اسپات آبی سرد از پشت (rim — لبه‌های بدنه را می‌تراشد)
    const rim = new THREE.SpotLight(0x7ea4ff, 15000, 90, 0.6, 0.5, 2.0);
    rim.position.set(-16, 12, -14);
    rim.target.position.set(0, 3, 0);
    this.scene.add(rim, rim.target);

    // پرکننده خیلی ملایم از بغل
    const fill = new THREE.PointLight(0xffd9a8, 3500, 60, 2.0);
    fill.position.set(-10, 8, 10);
    this.scene.add(fill);

    // نور درِ باز — روز بیرون
    const door = new THREE.DirectionalLight(0xfff2dc, 1.1);
    door.position.set(0, 10, -30);
    door.target.position.set(0, 2, 6);
    this.scene.add(door, door.target);
  }

  // ---------- پوسته آشیانه ----------
  _buildShell() {
    const W = 44, D = 52, H = 16;

    // کف بتن
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(W + 20, D + 20),
      new THREE.MeshStandardMaterial({ map: _concreteTex(), roughness: 0.85, metalness: 0.05 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // دیوارهای موج‌دار
    const wallTex = _corrugatedTex();
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.7, metalness: 0.45 });
    const mkWall = (w, h, x, y, z, ry) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
      m.position.set(x, y, z);
      m.rotation.y = ry;
      m.receiveShadow = true;
      this.scene.add(m);
      return m;
    };
    mkWall(W, H, 0, H / 2, -D / 2, 0);            // عقب
    mkWall(D, H, -W / 2, H / 2, 0, Math.PI / 2);  // چپ
    mkWall(D, H, W / 2, H / 2, 0, -Math.PI / 2);  // راست
    // جلو: دو پنل کنار درِ بزرگ باز
    mkWall(W * 0.28, H, -W * 0.36, H / 2, D / 2, Math.PI);
    mkWall(W * 0.28, H, W * 0.36, H / 2, D / 2, Math.PI);
    mkWall(W * 0.44, H * 0.30, 0, H - H * 0.15, D / 2, Math.PI); // بالای در

    // سقف تیرکشی‌دار
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x22262c, roughness: 0.8, metalness: 0.5 });
    const roof = new THREE.Mesh(new THREE.BoxGeometry(W, 0.6, D), roofMat);
    roof.position.set(0, H + 0.3, 0);
    this.scene.add(roof);
    for (let i = -2; i <= 2; i++) {
      const truss = new THREE.Mesh(new THREE.BoxGeometry(W * 0.96, 0.7, 0.5), roofMat);
      truss.position.set(0, H - 1.2, i * D / 6);
      this.scene.add(truss);
    }
    // اسکای‌لایت — نوار نور سقف
    const sky = new THREE.Mesh(
      new THREE.PlaneGeometry(W * 0.5, D * 0.5),
      new THREE.MeshBasicMaterial({ color: 0xdfeaff })
    );
    sky.rotation.x = Math.PI / 2;
    sky.position.set(0, H - 0.25, 0);
    this.scene.add(sky);

    // ستون‌های نور از اسکای‌لایت (حجم کاذب سینمایی)
    const shaftMat = new THREE.MeshBasicMaterial({
      color: 0xbfd4ff, transparent: true, opacity: 0.045,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    for (const [x, z, w, tilt] of [[-6, -6, 7, 0.5], [4, 2, 9, 0.35], [-2, 9, 6, 0.25]]) {
      const shaft = new THREE.Mesh(new THREE.PlaneGeometry(w, H * 1.25), shaftMat);
      shaft.position.set(x, H / 2, z);
      shaft.rotation.set(tilt, Math.random() * 0.8, 0, 'YXZ');
      this.scene.add(shaft);
    }

    // درِ باز رو به آسمان (چهارگوش درخشان)
    const doorSky = new THREE.Mesh(
      new THREE.PlaneGeometry(W * 0.42, H * 0.7),
      new THREE.MeshBasicMaterial({ map: _doorSkyTex(), fog: false })
    );
    doorSky.position.set(0, H * 0.35, D / 2 - 0.2);
    doorSky.rotation.y = Math.PI;
    this.scene.add(doorSky);

    // چراغ‌های سقفی (دیسک‌های نورانی + هاله)
    for (const [x, z] of [[-12, -14], [12, -14], [-12, 8], [12, 8], [0, -2]]) {
      const lamp = new THREE.Mesh(
        new THREE.CylinderGeometry(0.9, 1.1, 0.4, 10),
        new THREE.MeshBasicMaterial({ color: 0xfff4d8 })
      );
      lamp.position.set(x, H - 1.6, z);
      this.scene.add(lamp);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: _glowTex(), color: 0xfff0d0, transparent: true, opacity: 0.35,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      halo.scale.setScalar(4.5);
      halo.position.set(x, H - 1.8, z);
      this.scene.add(halo);
    }
  }

  // ---------- سکوی نمایش ----------
  _buildPlatform() {
    const pod = new THREE.Mesh(
      new THREE.CylinderGeometry(11.5, 12.2, 0.55, 48),
      new THREE.MeshStandardMaterial({ map: _podiumTex(), roughness: 0.82, metalness: 0.04 })
    );
    pod.position.y = 0.28;
    pod.receiveShadow = true;
    this.scene.add(pod);
    // حلقه نورانی دور سکو
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(11.9, 0.07, 6, 64),
      new THREE.MeshBasicMaterial({ color: 0x86c5ff })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.56;
    this.scene.add(ring);
    this.platformY = 0.56;
  }

  // ---------- اکسسوری‌های آشیانه (زندگی) ----------
  _buildProps() {
    const drumMat = new THREE.MeshStandardMaterial({ color: 0x7a3b2a, roughness: 0.55, metalness: 0.5 });
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x6b5a3e, roughness: 0.9 });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x1a1b1d, roughness: 0.95 });
    const boxMat = new THREE.MeshStandardMaterial({ color: 0x8a2f2f, roughness: 0.6, metalness: 0.3 });

    const add = (mesh, x, z, ry = 0) => {
      mesh.position.x = x; mesh.position.z = z;
      mesh.rotation.y = ry;
      mesh.castShadow = true; mesh.receiveShadow = true;
      this.scene.add(mesh);
    };

    // بشکه‌ها ×۳
    for (const [x, z] of [[-17, -18], [-15.6, -18.8], [-16.4, -16.9]]) {
      const d = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 2.2, 14), drumMat);
      d.position.y = 1.1; add(d, x, z);
    }
    // جعبه‌ها ×۲ روی هم
    const c1 = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.4, 1.6), crateMat);
    c1.position.y = 0.7; add(c1, 16.5, -16, 0.3);
    const c2 = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.1, 1.3), crateMat);
    c2.position.y = 1.95; add(c2, 16.3, -16.2, 0.75);
    // لاستی‌ها
    for (let i = 0; i < 4; i++) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.4, 8, 18), tireMat);
      t.rotation.x = Math.PI / 2;
      t.position.set(15.8, 0.4 + i * 0.8, 14.5);
      t.castShadow = true;
      this.scene.add(t);
    }
    // میز کار + جعبه ابزار قرمز
    const bench = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.2, 1.5), crateMat);
    bench.position.set(-16.5, 1.05, 6);
    add(bench, -16.5, 6, 0.06);
    for (const lx of [-18.2, -14.8]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.0, 1.4), tireMat);
      leg.position.set(lx, 0.5, 6);
      this.scene.add(leg);
    }
    const toolbox = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.55, 0.6), boxMat);
    toolbox.position.set(-16.2, 1.45, 6);
    add(toolbox, -16.2, 6, -0.2);
    // کپسول آتش‌نشانی
    const ext = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.9, 10), boxMat);
    ext.position.set(-14.2, 0.85, 6.4);
    this.scene.add(ext);
  }

  // ---------- گردوغبار معلق در نور ----------
  _buildDust() {
    const N = 90;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() * 2 - 1) * 16;
      pos[i * 3 + 1] = Math.random() * 12 + 1;
      pos[i * 3 + 2] = (Math.random() * 2 - 1) * 16;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xfff2d8, size: 0.09, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    this.dust = new THREE.Points(geo, mat);
    this.scene.add(this.dust);
  }

  // ---------- جت روی سکو ----------
  setJet(group, scale) {
    if (this._jet) this.scene.remove(this._jet);
    this._jet = group;
    if (!group) return;
    group.rotation.y = 0.35;
    group.position.set(0, this.platformY + 2.12 * scale, 0);
    group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
    this.scene.add(group);
  }

  attachDrag(dom) {
    dom.addEventListener('pointerdown', (e) => {
      this._drag = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('pointermove', (e) => {
      if (!this._drag) return;
      const dx = e.clientX - this._drag.x, dy = e.clientY - this._drag.y;
      this._drag = { x: e.clientX, y: e.clientY };
      this.azTarget += dx * 0.006;
      this.polarTarget = THREE.MathUtils.clamp(this.polarTarget - dy * 0.003, 0.10, 0.58);
    });
    window.addEventListener('pointerup', () => { this._drag = null; });
    dom.addEventListener('wheel', (e) => {
      this.radiusTarget = THREE.MathUtils.clamp(this.radiusTarget + e.deltaY * 0.02, 15, 40);
    }, { passive: true });
  }

  update(dt, camera) {
    this._t += dt;
    // مدار آهسته خودکار + ورودی کاربر
    this.azTarget += dt * 0.05;
    this.az += (this.azTarget - this.az) * Math.min(1, dt * 4);
    this.polar += (this.polarTarget - this.polar) * Math.min(1, dt * 4);
    this.radius += (this.radiusTarget - this.radius) * Math.min(1, dt * 4);
    const y = Math.sin(this.polar) * this.radius;
    const r = Math.cos(this.polar) * this.radius;
    camera.position.set(Math.cos(this.az) * r, y, Math.sin(this.az) * r);
    camera.lookAt(0, 3.2, 0);
    if (camera.fov !== 46) { camera.fov = 46; camera.updateProjectionMatrix(); }
    // غبار معلق
    if (this.dust) {
      this.dust.rotation.y += dt * 0.02;
      const p = this.dust.geometry.attributes.position;
      for (let i = 0; i < p.count; i += 7) {
        let yy = p.getY(i) + dt * 0.12;
        if (yy > 13) yy = 1;
        p.setY(i, yy);
      }
      p.needsUpdate = true;
    }
    // چشمک خیلی ملایم اسپات کلید (حس پروژکتور)
    this.key.intensity = 26000 * (0.97 + Math.sin(this._t * 7.3) * 0.02 + Math.sin(this._t * 13.7) * 0.015);
  }
}

// ---------- بافت‌ها ----------
function _concreteTex() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 512;
  const g = cv.getContext('2d');
  g.fillStyle = '#5a5d61';
  g.fillRect(0, 0, 512, 512);
  // دانه بتن
  for (let i = 0; i < 5200; i++) {
    const v = 74 + (Math.random() * 40) | 0;
    g.fillStyle = `rgba(${v},${v},${v + 2},${0.10 + Math.random() * 0.14})`;
    g.fillRect(Math.random() * 512, Math.random() * 512, 1.6, 1.6);
  }
  // درزهای بتن (کاشی‌بندی ۴تایی)
  g.strokeStyle = 'rgba(24,26,28,0.85)';
  g.lineWidth = 3;
  for (const p of [0, 256, 512]) {
    g.beginPath(); g.moveTo(p, 0); g.lineTo(p, 512); g.stroke();
    g.beginPath(); g.moveTo(0, p); g.lineTo(512, p); g.stroke();
  }
  // لکه روغن
  for (let i = 0; i < 7; i++) {
    const x = Math.random() * 512, y = Math.random() * 512, r = 16 + Math.random() * 50;
    const gr = g.createRadialGradient(x, y, 2, x, y, r);
    gr.addColorStop(0, 'rgba(20,18,16,0.4)');
    gr.addColorStop(1, 'rgba(20,18,16,0)');
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // خط راهنمای زرد
  g.strokeStyle = 'rgba(226,190,70,0.55)';
  g.lineWidth = 8;
  g.setLineDash([60, 34]);
  g.beginPath(); g.moveTo(0, 256); g.lineTo(512, 256); g.stroke();
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function _corrugatedTex() {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = '#4a5158';
  g.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 16) {
    const gr = g.createLinearGradient(x, 0, x + 16, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0.10)');
    gr.addColorStop(0.5, 'rgba(255,255,255,0.02)');
    gr.addColorStop(1, 'rgba(0,0,0,0.22)');
    g.fillStyle = gr;
    g.fillRect(x, 0, 16, 256);
  }
  // زنگ‌زدگی پراکنده
  for (let i = 0; i < 16; i++) {
    const x = Math.random() * 256, y = Math.random() * 256, r = 3 + Math.random() * 12;
    const gr = g.createRadialGradient(x, y, 1, x, y, r);
    gr.addColorStop(0, 'rgba(122,70,40,0.22)');
    gr.addColorStop(1, 'rgba(122,70,40,0)');
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function _podiumTex() {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 512;
  const g = cv.getContext('2d');
  g.fillStyle = '#3b4046';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 1800; i++) {
    const v = 52 + (Math.random() * 30) | 0;
    g.fillStyle = `rgba(${v},${v + 2},${v + 5},0.2)`;
    g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
  }
  // نشان AIRDOM وسط سکو
  g.strokeStyle = 'rgba(150,190,230,0.5)';
  g.lineWidth = 5;
  g.beginPath(); g.arc(256, 256, 190, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(256, 256, 176, 0, Math.PI * 2); g.stroke();
  g.fillStyle = 'rgba(150,190,230,0.65)';
  g.font = 'bold 52px Arial';
  g.textAlign = 'center';
  g.fillText('AIRDOM', 256, 242);
  g.font = '26px Arial';
  g.fillText('FLIGHT TEST HANGAR 07', 256, 292);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function _doorSkyTex() {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 256;
  const g = cv.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#8fc3ee');
  grad.addColorStop(0.65, '#d8e4ea');
  grad.addColorStop(1, '#efe9d8');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  // خورشید کم‌رنگ + زمین دور
  const sun = g.createRadialGradient(180, 60, 4, 180, 60, 60);
  sun.addColorStop(0, 'rgba(255,250,230,0.95)');
  sun.addColorStop(1, 'rgba(255,250,230,0)');
  g.fillStyle = sun;
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = 'rgba(140,125,100,0.5)';
  g.fillRect(0, 236, 256, 20);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function _glowTex() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}
