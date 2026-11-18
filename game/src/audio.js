// Every sound is synthesised live through WebAudio — no audio files,
// no network. A looping engine hum, a wailing siren, skids, gunshots
// and the little chimes of the city. The context only starts on the
// first user gesture, as browsers require.

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = 0;
    this.skidGain = null;
    this.skidSrc = null;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      this.master.connect(this.ctx.destination);
      this._startEngine();
      this._startSiren();
      this._startSkid();
      return true;
    } catch {
      return false;
    }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.05);
    }
  }

  // The three loops (engine, siren, skid) run from the first gesture
  // and are mixed by gain only — starting and stopping nodes per frame
  // would click audibly.
  _startEngine() {
    const ctx = this.ctx;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 320;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter).connect(this.engineGain).connect(this.master);
    this.engineOsc.start();
  }

  _startSiren() {
    const ctx = this.ctx;
    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 700;
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain).connect(this.master);
    this.sirenOsc.start();
  }

  _startSkid() {
    const ctx = this.ctx;
    const len = ctx.sampleRate * 0.5;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.skidSrc = ctx.createBufferSource();
    this.skidSrc.buffer = buf;
    this.skidSrc.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1400;
    filter.Q.value = 2.5;
    this.skidGain = ctx.createGain();
    this.skidGain.gain.value = 0;
    this.skidSrc.connect(filter).connect(this.skidGain).connect(this.master);
    this.skidSrc.start();
  }

  // Each frame: engine pitch tracks speed, the siren wails with heat.
  update(speed, driving, wanted, slipping) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const target = driving ? 0.05 + Math.min(0.11, Math.abs(speed) * 0.0035) : 0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.12);
    this.engineOsc.frequency.setTargetAtTime(50 + Math.abs(speed) * 4.2, t, 0.1);
    this.engineFilter.frequency.setTargetAtTime(280 + Math.abs(speed) * 26, t, 0.1);
    if (wanted > 0) {
      this.sirenTimer += 1 / 60;
      const wail = 650 + Math.sin(this.sirenTimer * 2.6) * 220;
      this.sirenOsc.frequency.setTargetAtTime(wail, t, 0.05);
      this.sirenGain.gain.setTargetAtTime(0.028 + wanted * 0.006, t, 0.3);
    } else {
      this.sirenGain.gain.setTargetAtTime(0, t, 0.3);
    }
    this.skidGain.gain.setTargetAtTime(slipping ? 0.05 : 0, t, 0.08);
  }

  _blip(freq, dur, type, vol, slideTo) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  _noise(dur, vol, filterFreq, type) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = type || 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t);
  }

  shot() { this._noise(0.16, 0.5, 2600, 'lowpass'); this._blip(180, 0.1, 'square', 0.22, 55); }
  punch() { this._noise(0.09, 0.4, 500, 'lowpass'); }
  crash(intensity) { this._noise(0.22, Math.min(0.6, 0.2 + intensity * 0.05), 700, 'lowpass'); }
  pickup() { this._blip(660, 0.09, 'sine', 0.25); setTimeout(() => this._blip(990, 0.12, 'sine', 0.25), 70); }
  cash() { this._blip(880, 0.08, 'triangle', 0.22); setTimeout(() => this._blip(1320, 0.14, 'triangle', 0.22), 80); }
  phone() { this._blip(980, 0.12, 'sine', 0.2); setTimeout(() => this._blip(980, 0.12, 'sine', 0.2), 180); }
  missionDone() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this._blip(f, 0.18, 'triangle', 0.24), i * 110));
  }
  busted() { this._blip(320, 0.5, 'sawtooth', 0.2, 110); }
  hurt() { this._blip(140, 0.14, 'sawtooth', 0.22, 70); }
  click() { this._blip(740, 0.05, 'square', 0.12); }
  door() { this._noise(0.08, 0.3, 900, 'lowpass'); }
  checkpoint() { this._blip(1046, 0.1, 'sine', 0.25); setTimeout(() => this._blip(1568, 0.16, 'sine', 0.22), 90); }
  horn() { this._blip(370, 0.22, 'square', 0.12); this._blip(466, 0.22, 'square', 0.1); }
}
