// All sound in Solmarina is synthesised live with WebAudio: engine hum,
// sirens, gunshots, punches, pickups, phone buzzes and a small music loop.
// No audio files, no network. Everything is guarded so a missing or
// suspended AudioContext can never throw or break the game loop.

export function createAudio() {
  const audio = {
    ctx: null,
    master: null,
    musicGain: null,
    engineOsc: null,
    engineGain: null,
    sirenOsc: null,
    sirenGain: null,
    sirenLfo: null,
    started: false,
    musicTimer: null,
    muted: false,
  };

  audio.init = function init() {
    if (audio.ctx) {
      if (audio.ctx.state === 'suspended') audio.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audio.ctx = new AC();
      audio.master = audio.ctx.createGain();
      audio.master.gain.value = 0.55;
      audio.master.connect(audio.ctx.destination);
      audio.musicGain = audio.ctx.createGain();
      audio.musicGain.gain.value = 0.16;
      audio.musicGain.connect(audio.master);
      audio.started = true;
    } catch (err) {
      audio.ctx = null;
    }
  };

  audio.setMuted = function setMuted(muted) {
    audio.muted = muted;
    if (audio.master && audio.ctx) {
      audio.master.gain.setTargetAtTime(muted ? 0 : 0.55, audio.ctx.currentTime, 0.05);
    }
  };

  function now() {
    return audio.ctx ? audio.ctx.currentTime : 0;
  }

  function tone(freq, dur, type, vol, dest, slideTo) {
    if (!audio.ctx) return;
    try {
      const t = now();
      const osc = audio.ctx.createOscillator();
      const gain = audio.ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain);
      gain.connect(dest || audio.master);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    } catch (err) { /* sound is cosmetic */ }
  }

  function noiseBurst(dur, vol, filterFreq, type) {
    if (!audio.ctx) return;
    try {
      const t = now();
      const len = Math.max(1, Math.floor(audio.ctx.sampleRate * dur));
      const buffer = audio.ctx.createBuffer(1, len, audio.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = audio.ctx.createBufferSource();
      src.buffer = buffer;
      const filter = audio.ctx.createBiquadFilter();
      filter.type = type || 'lowpass';
      filter.frequency.value = filterFreq || 800;
      const gain = audio.ctx.createGain();
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(audio.master);
      src.start(t);
    } catch (err) { /* sound is cosmetic */ }
  }

  audio.gunshot = function gunshot() {
    noiseBurst(0.14, 0.5, 2400, 'bandpass');
    tone(160, 0.1, 'square', 0.18, null, 60);
  };

  audio.punch = function punch() {
    noiseBurst(0.09, 0.4, 300);
    tone(120, 0.08, 'sine', 0.3, null, 55);
  };

  audio.crash = function crash(strength) {
    noiseBurst(0.25, Math.min(0.6, 0.2 + strength * 0.02), 500);
    tone(90, 0.2, 'sawtooth', 0.2, null, 40);
  };

  audio.pickup = function pickup() {
    tone(660, 0.09, 'sine', 0.25);
    setTimeout(() => tone(990, 0.12, 'sine', 0.25), 70);
  };

  audio.phoneBuzz = function phoneBuzz() {
    tone(220, 0.09, 'square', 0.12);
    setTimeout(() => tone(220, 0.09, 'square', 0.12), 130);
  };

  audio.missionJingle = function missionJingle() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => setTimeout(() => tone(f, 0.22, 'triangle', 0.28), i * 110));
  };

  audio.failSting = function failSting() {
    tone(330, 0.3, 'sawtooth', 0.16, null, 220);
    setTimeout(() => tone(220, 0.45, 'sawtooth', 0.16, null, 130), 180);
  };

  audio.doorSlam = function doorSlam() {
    noiseBurst(0.08, 0.35, 400);
  };

  audio.buyBlip = function buyBlip() {
    tone(880, 0.08, 'sine', 0.22);
    setTimeout(() => tone(1175, 0.1, 'sine', 0.22), 80);
  };

  // Continuous engine hum: pitch and volume follow the driven car's speed.
  audio.setEngine = function setEngine(active, speedNorm) {
    if (!audio.ctx) return;
    try {
      if (active && !audio.engineOsc) {
        audio.engineOsc = audio.ctx.createOscillator();
        audio.engineOsc.type = 'sawtooth';
        audio.engineGain = audio.ctx.createGain();
        audio.engineGain.gain.value = 0;
        const filter = audio.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 420;
        audio.engineOsc.connect(filter);
        filter.connect(audio.engineGain);
        audio.engineGain.connect(audio.master);
        audio.engineOsc.start();
      }
      if (!audio.engineOsc) return;
      const t = now();
      const target = active ? 0.05 + speedNorm * 0.1 : 0;
      audio.engineGain.gain.setTargetAtTime(target, t, 0.1);
      audio.engineOsc.frequency.setTargetAtTime(55 + speedNorm * 130, t, 0.1);
    } catch (err) { /* sound is cosmetic */ }
  };

  // Two-tone police siren while any police unit is active.
  audio.setSiren = function setSiren(active) {
    if (!audio.ctx) return;
    try {
      if (active && !audio.sirenOsc) {
        audio.sirenOsc = audio.ctx.createOscillator();
        audio.sirenOsc.type = 'triangle';
        audio.sirenOsc.frequency.value = 750;
        audio.sirenGain = audio.ctx.createGain();
        audio.sirenGain.gain.value = 0;
        audio.sirenLfo = audio.ctx.createOscillator();
        audio.sirenLfo.frequency.value = 0.9;
        const lfoGain = audio.ctx.createGain();
        lfoGain.gain.value = 160;
        audio.sirenLfo.connect(lfoGain);
        lfoGain.connect(audio.sirenOsc.frequency);
        audio.sirenOsc.connect(audio.sirenGain);
        audio.sirenGain.connect(audio.master);
        audio.sirenOsc.start();
        audio.sirenLfo.start();
      }
      if (!audio.sirenOsc) return;
      audio.sirenGain.gain.setTargetAtTime(active ? 0.05 : 0, now(), 0.2);
    } catch (err) { /* sound is cosmetic */ }
  };

  // A lazy sunset groove: soft bass pulse plus a sparse pentatonic line.
  audio.startMusic = function startMusic() {
    if (!audio.ctx || audio.musicTimer) return;
    const bassNotes = [110, 110, 131, 98, 110, 147, 131, 98];
    const leadNotes = [440, 0, 523, 0, 587, 0, 523, 659, 0, 587, 523, 0];
    let step = 0;
    audio.musicTimer = setInterval(() => {
      if (!audio.ctx || audio.ctx.state !== 'running') return;
      try {
        const bass = bassNotes[step % bassNotes.length];
        tone(bass, 0.32, 'sine', 0.5, audio.musicGain);
        const lead = leadNotes[step % leadNotes.length];
        if (lead) tone(lead, 0.26, 'triangle', 0.22, audio.musicGain);
        step++;
      } catch (err) { /* sound is cosmetic */ }
    }, 340);
  };

  return audio;
}
