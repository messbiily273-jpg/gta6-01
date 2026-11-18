// audio — every sound is synthesized with WebAudio: no audio files, no
// network. Engine hum, gunshots, sirens, pickups and a low-key bass groove.
// Created lazily on the first user gesture; silent until then.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let musicTimer = null;
  let muted = false;
  let musicStep = 0;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      // engine: a low sawtooth whose pitch follows the car speed
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      startMusic();
      return true;
    } catch {
      ctx = null;
      return false;
    }
  }

  function noiseBurst(duration, filterFreq, gainValue) {
    if (!ctx || muted) return;
    const len = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.value = gainValue;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start();
  }

  function blip(freq, duration, gainValue, type) {
    if (!ctx || muted) return;
    const osc = ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  // a slow bass groove: A minor walk, one note per beat, quiet under the game
  const BASSLINE = [55, 0, 55, 65.41, 0, 55, 49, 0, 55, 0, 55, 65.41, 73.42, 65.41, 49, 0];
  function startMusic() {
    if (musicTimer) return;
    musicTimer = setInterval(() => {
      if (!ctx || muted) return;
      const note = BASSLINE[musicStep % BASSLINE.length];
      musicStep += 1;
      if (note > 0) {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = note;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.42);
        osc.connect(gain);
        gain.connect(master);
        osc.start();
        osc.stop(ctx.currentTime + 0.45);
      }
    }, 300);
  }

  let sirenOsc = null;
  let sirenGain = null;
  function setSiren(on) {
    if (!ctx) return;
    if (on && !sirenOsc) {
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 720;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0.05;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.9;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 220;
      lfo.connect(lfoGain);
      lfoGain.connect(sirenOsc.frequency);
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      lfo.start();
    } else if (!on && sirenOsc) {
      try { sirenOsc.stop(); } catch { /* already stopped */ }
      sirenOsc = null;
      sirenGain = null;
    }
  }

  return {
    ensure,
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = value ? 0 : 0.5;
      if (value) setSiren(false);
    },
    isMuted() { return muted; },
    setEngine(speed01) {
      if (!ctx || !engineGain) return;
      engineGain.gain.value = muted ? 0 : 0.02 + speed01 * 0.09;
      engineOsc.frequency.value = 50 + speed01 * 130;
    },
    shot() { noiseBurst(0.12, 2400, 0.5); blip(160, 0.08, 0.25, 'square'); },
    enemyShot() { noiseBurst(0.1, 1600, 0.2); },
    pickup() { blip(660, 0.12, 0.25); setTimeout(() => blip(990, 0.18, 0.25), 90); },
    crash() { noiseBurst(0.25, 500, 0.5); },
    missionComplete() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => blip(f, 0.25, 0.3), i * 120)); },
    fail() { [330, 262, 196].forEach((f, i) => setTimeout(() => blip(f, 0.3, 0.3, 'sawtooth'), i * 160)); },
    setSiren,
  };
}
