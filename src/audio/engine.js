// ============================================================
// صدای سینتیز کامل — موتور، باد، توپ، انفجار، قفل، RWR، موشک، فلر
// ============================================================
export class GameAudio {
  constructor() {
    this.ok = false;
    this._lastGun = 0;
    this._rwr = false;
    this._rwrT = 0;
  }

  init() {
    if (this.ok) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(ctx.destination);

    // موتور
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 340;
    this.o1 = ctx.createOscillator(); this.o1.type = 'sawtooth';
    this.o2 = ctx.createOscillator(); this.o2.type = 'sawtooth';
    this.o1.connect(lp); this.o2.connect(lp);
    lp.connect(this.engGain); this.engGain.connect(this.master);
    this.o1.start(); this.o2.start();

    // نویز مشترک
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this._noiseBuf = buf;

    // باد
    this.windSrc = ctx.createBufferSource(); this.windSrc.buffer = buf; this.windSrc.loop = true;
    this.windF = ctx.createBiquadFilter(); this.windF.type = 'bandpass'; this.windF.Q.value = 0.4;
    this.windG = ctx.createGain(); this.windG.gain.value = 0;
    this.windSrc.connect(this.windF); this.windF.connect(this.windG); this.windG.connect(this.master);
    this.windSrc.start();

    // افتربرنر
    this.abSrc = ctx.createBufferSource(); this.abSrc.buffer = buf; this.abSrc.loop = true;
    this.abF = ctx.createBiquadFilter(); this.abF.type = 'lowpass'; this.abF.frequency.value = 150;
    this.abG = ctx.createGain(); this.abG.gain.value = 0;
    this.abSrc.connect(this.abF); this.abF.connect(this.abG); this.abG.connect(this.master);
    this.abSrc.start();

    // پخش‌کننده‌های چندگانه
    this._gunP = this._mkPlayers(4, this._wavGun(), -7);
    this._boomP = this._mkPlayers(3, this._wavExplosion(), -4);
    this._smallBoomP = this._mkPlayers(2, this._wavSmallBoom(), -8);
    this._whooshP = this._mkPlayers(2, this._wavWhoosh(), -6);
    this.ok = true;
  }

  _mkPlayers(n, stream, vol) {
    const arr = [];
    for (let i = 0; i < n; i++) {
      const p = new AudioStreamPlayer(this.ctx, stream, vol);
      arr.push(p);
    }
    return { arr, i: 0 };
  }

  _play(group, rate = 1) {
    const p = group.arr[group.i];
    group.i = (group.i + 1) % group.arr.length;
    p.play(rate);
  }

  updateEngine(st) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const f = 40 + st.throttle * 58 + (st.afterburner ? 16 : 0);
    this.o1.frequency.setTargetAtTime(f, t, 0.08);
    this.o2.frequency.setTargetAtTime(f * 1.014, t, 0.08);
    this.engGain.gain.setTargetAtTime(0.028 + st.throttle * 0.07, t, 0.1);
    this.windG.gain.setTargetAtTime(Math.min(0.15, st.V / 900), t, 0.15);
    this.windF.frequency.setTargetAtTime(280 + st.V * 0.9, t, 0.2);
    this.abG.gain.setTargetAtTime(st.afterburner ? 0.13 : 0, t, 0.12);
  }

  gun() {
    if (!this.ok) return;
    const now = performance.now();
    if (now - this._lastGun < 85) return;
    this._lastGun = now;
    this._play(this._gunP, 0.9 + Math.random() * 0.2);
  }

  explosion(scale = 1) {
    if (!this.ok) return;
    this._play(scale > 0.8 ? this._boomP : this._smallBoomP, 0.85 + Math.random() * 0.3);
  }

  missileLaunch(friendly) {
    if (!this.ok) return;
    this._play(this._whooshP, friendly ? 1 : 0.8);
    if (!friendly) this.beep(1400, 0.14, 0.25);
  }

  flarePop() { this.beep(300, 0.06, 0.2); }

  lockTone(locked) {
    this.beep(locked ? 1300 : 850, 0.09, 0.18);
  }

  setRwr(active) {
    this._rwr = active;
    if (!this.ok || !active) return;
    this._rwrT -= 1 / 60;
    if (this._rwrT <= 0) {
      this._rwrT = 0.32;
      this.beep(650, 0.1, 0.22);
    }
  }

  uiClick() { this.beep(950, 0.04, 0.12); }

  beep(freq, dur, vol) {
    if (!this.ok) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.setValueAtTime(vol, t + dur);
    g.gain.setValueAtTime(0, t + dur + 0.01);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  suspend() { if (this.ok && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ok && this.ctx.state === 'suspended') this.ctx.resume(); }

  // ---------- تولید نمونه‌ها ----------
  _wav(samples, rate = 22050) {
    const wav = new AudioBuffer({ length: samples.length, sampleRate: rate, numberOfChannels: 1 });
    wav.getChannelData(0).set(samples);
    return wav;
  }

  _wavGun() {
    const rate = 22050, n = (0.14 * rate) | 0;
    const s = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / rate;
      s[i] = ((Math.random() * 2 - 1) * 0.8 + 0.5 * Math.sin(6.283 * 95 * t)) * Math.exp(-t * 26);
    }
    return this._wav(s, rate);
  }

  _wavExplosion() {
    const rate = 22050, n = (1.5 * rate) | 0;
    const s = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / rate;
      s[i] = ((Math.random() * 2 - 1) * 0.75 + 0.6 * Math.sin(6.283 * 46 * t * (1 - t * 0.3))) * Math.exp(-t * 2.6);
    }
    return this._wav(s, rate);
  }

  _wavSmallBoom() {
    const rate = 22050, n = (0.5 * rate) | 0;
    const s = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / rate;
      s[i] = ((Math.random() * 2 - 1) * 0.6 + 0.3 * Math.sin(6.283 * 70 * t)) * Math.exp(-t * 6);
    }
    return this._wav(s, rate);
  }

  _wavWhoosh() {
    const rate = 22050, n = (0.7 * rate) | 0;
    const s = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / rate;
      const env = Math.sin(Math.PI * Math.min(1, t / 0.7)) ** 2;
      s[i] = (Math.random() * 2 - 1) * 0.5 * env;
    }
    return this._wav(s, rate);
  }
}

// پوشش ساده روی AudioBufferSourceNode
class AudioStreamPlayer {
  constructor(ctx, buffer, volDb) {
    this.ctx = ctx;
    this.buffer = buffer;
    this.volDb = volDb;
    this.node = null;
  }
  play(rate = 1) {
    if (this.node) { try { this.node.stop(); } catch { /* ignore */ } }
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    const g = this.ctx.createGain();
    g.gain.value = Math.pow(10, this.volDb / 20);
    src.connect(g); g.connect(this.ctx.destination);
    src.playbackRate.value = rate;
    src.start();
    this.node = src;
  }
}
