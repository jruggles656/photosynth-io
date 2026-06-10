// Synthesized audio — no asset files. Everything is generated with the Web Audio API.
// Client-only; never imported by game/ or ai/.

const SHIMMER_NOTES = [880, 987.8, 1174.7, 1318.5, 1568];

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
  }

  // Must be called from a user gesture (the PLAY button) so the context can start.
  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.3;
      this.master.connect(this.ctx.destination);
      this.startAmbient();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.3, this.ctx.currentTime, 0.05);
    }
  }

  // Low two-tone drone with a slow breathing LFO. Very quiet — felt more than heard.
  startAmbient() {
    const t = this.ctx.currentTime;
    const droneGain = this.ctx.createGain();
    droneGain.gain.value = 0.045;
    droneGain.connect(this.master);

    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain);
    lfoGain.connect(droneGain.gain);
    lfo.start(t);

    for (const f of [54, 81.5]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      osc.connect(droneGain);
      osc.start(t);
    }
  }

  note(freq, { dur = 0.15, type = 'sine', vol = 0.2, glideTo = null, delay = 0 } = {}) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  noise({ dur = 0.2, vol = 0.15, freq = 800, q = 1.2, delay = 0 } = {}) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const len = Math.ceil(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
  }

  eat() {
    this.note(480 + Math.random() * 260, { dur: 0.07, vol: 0.16 });
  }

  goldEat() {
    this.note(740, { dur: 0.09, vol: 0.18 });
    this.note(1108, { dur: 0.12, vol: 0.14, delay: 0.05 });
  }

  kill() {
    this.note(170, { dur: 0.28, type: 'sine', vol: 0.4, glideTo: 58 });
    this.noise({ dur: 0.15, vol: 0.08, freq: 300 });
  }

  death() {
    this.note(330, { dur: 0.9, type: 'sine', vol: 0.35, glideTo: 72 });
    this.note(415, { dur: 0.9, type: 'triangle', vol: 0.15, glideTo: 90, delay: 0.05 });
  }

  powerup() {
    [523, 659, 880].forEach((f, i) => this.note(f, { dur: 0.12, vol: 0.16, delay: i * 0.07 }));
  }

  split() {
    this.note(390, { dur: 0.06, vol: 0.18 });
    this.note(520, { dur: 0.06, vol: 0.14, delay: 0.04 });
  }

  eject() {
    this.note(260, { dur: 0.08, type: 'triangle', vol: 0.14, glideTo: 150 });
  }

  pop() {
    this.noise({ dur: 0.3, vol: 0.25, freq: 500, q: 0.8 });
    this.note(220, { dur: 0.2, vol: 0.2, glideTo: 95 });
  }

  merge() {
    this.note(310, { dur: 0.12, type: 'sine', vol: 0.1, glideTo: 420 });
  }

  shieldPop() {
    this.note(880, { dur: 0.18, type: 'triangle', vol: 0.2, glideTo: 440 });
  }

  // Soft pentatonic sparkle while photosynthesizing. Call throttled (~every 1.5s).
  shimmer() {
    const f = SHIMMER_NOTES[Math.floor(Math.random() * SHIMMER_NOTES.length)];
    this.note(f, { dur: 0.5, vol: 0.05 });
  }
}
