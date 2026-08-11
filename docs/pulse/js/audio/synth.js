/** Polyphonic subtractive synth for VOLT */

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function midiToFreq(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export function noteName(midi) {
  return NOTE_NAMES[midi % 12] + (Math.floor(midi / 12) - 1);
}

export const PRESETS = {
  Init: {},
  Brass: { osc1Type: "sawtooth", osc2Type: "square", osc2Detune: 7, cutoff: 1800, res: 4, ampA: 0.05, ampD: 0.2, ampS: 0.7, ampR: 0.25, filtA: 0.08, filtD: 0.3, filtS: 0.3, filtR: 0.2 },
  Pad: { osc1Type: "sawtooth", osc2Type: "triangle", osc2Detune: -8, cutoff: 900, res: 1.5, ampA: 0.4, ampD: 0.5, ampS: 0.85, ampR: 1.2, filtA: 0.5, filtD: 0.8, filtS: 0.5, filtR: 1.0, unison: 3 },
  Pluck: { osc1Type: "triangle", osc2Type: "square", osc2Mix: 0.3, cutoff: 3200, res: 6, ampA: 0.005, ampD: 0.25, ampS: 0.05, ampR: 0.2, filtA: 0.005, filtD: 0.2, filtS: 0.1, filtR: 0.15 },
  Bass: { osc1Type: "sawtooth", osc2Type: "square", osc2Detune: 0, osc2Oct: -1, cutoff: 600, res: 5, ampA: 0.01, ampD: 0.2, ampS: 0.6, ampR: 0.15, filtA: 0.01, filtD: 0.25, filtS: 0.25, filtR: 0.1 },
  Keys: { osc1Type: "sine", osc2Type: "triangle", osc2Detune: 3, cutoff: 4500, res: 0.5, ampA: 0.01, ampD: 0.4, ampS: 0.3, ampR: 0.35, filtA: 0.01, filtD: 0.5, filtS: 0.4, filtR: 0.4 },
  Acid: { osc1Type: "sawtooth", osc2Type: "sawtooth", osc2Detune: 12, cutoff: 400, res: 12, ampA: 0.01, ampD: 0.15, ampS: 0.4, ampR: 0.1, filtA: 0.01, filtD: 0.2, filtS: 0.1, filtR: 0.1, lfoRate: 0.1, lfoCut: 800 },
};

export class Synth {
  constructor(engine) {
    this.engine = engine;
    this.voices = new Map();
    this.maxVoices = 10;
    this.params = {
      osc1Type: "sawtooth",
      osc2Type: "square",
      osc2Detune: 5,
      osc2Oct: 0,
      osc2Mix: 0.45,
      noise: 0,
      cutoff: 2400,
      res: 2.5,
      ampA: 0.01,
      ampD: 0.2,
      ampS: 0.7,
      ampR: 0.3,
      filtA: 0.01,
      filtD: 0.25,
      filtS: 0.4,
      filtR: 0.3,
      filtEnv: 1800,
      lfoRate: 4,
      lfoPitch: 0,
      lfoCut: 0,
      unison: 1,
      drive: 0,
      level: 0.7,
    };
  }

  loadPreset(name) {
    const p = PRESETS[name];
    if (!p) return;
    Object.assign(this.params, {
      osc1Type: "sawtooth",
      osc2Type: "square",
      osc2Detune: 5,
      osc2Oct: 0,
      osc2Mix: 0.45,
      noise: 0,
      cutoff: 2400,
      res: 2.5,
      ampA: 0.01,
      ampD: 0.2,
      ampS: 0.7,
      ampR: 0.3,
      filtA: 0.01,
      filtD: 0.25,
      filtS: 0.4,
      filtR: 0.3,
      filtEnv: 1800,
      lfoRate: 4,
      lfoPitch: 0,
      lfoCut: 0,
      unison: 1,
      drive: 0,
      level: 0.7,
    }, p);
  }

  noteOn(midi, velocity = 0.85, time) {
    const ctx = this.engine.ctx;
    if (!ctx) return;
    const t = time ?? ctx.currentTime;
    if (this.voices.has(midi)) this.noteOff(midi, t);
    while (this.voices.size >= this.maxVoices) {
      const oldest = this.voices.keys().next().value;
      this.noteOff(oldest, t);
    }

    const p = this.params;
    const dest = this.engine.bus("synth");
    const voiceGain = ctx.createGain();
    voiceGain.gain.value = 0.0001;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = p.res;
    filter.frequency.setValueAtTime(Math.max(40, p.cutoff), t);

    const mix = ctx.createGain();
    mix.gain.value = p.level * velocity;

    const oscs = [];
    const unison = Math.max(1, Math.min(5, p.unison | 0));
    for (let u = 0; u < unison; u++) {
      const det = unison === 1 ? 0 : (u - (unison - 1) / 2) * 8;
      const o1 = ctx.createOscillator();
      o1.type = p.osc1Type;
      o1.frequency.value = midiToFreq(midi);
      o1.detune.value = det;
      const g1 = ctx.createGain();
      g1.gain.value = 0.35 / Math.sqrt(unison);
      o1.connect(g1);
      g1.connect(mix);
      o1.start(t);
      oscs.push(o1);

      const o2 = ctx.createOscillator();
      o2.type = p.osc2Type;
      o2.frequency.value = midiToFreq(midi + p.osc2Oct * 12);
      o2.detune.value = p.osc2Detune + det;
      const g2 = ctx.createGain();
      g2.gain.value = (0.35 * p.osc2Mix) / Math.sqrt(unison);
      o2.connect(g2);
      g2.connect(mix);
      o2.start(t);
      oscs.push(o2);
    }

    if (p.noise > 0.01) {
      const ns = ctx.createBufferSource();
      ns.buffer = white(ctx);
      ns.loop = true;
      const ng = ctx.createGain();
      ng.gain.value = p.noise * 0.2;
      ns.connect(ng);
      ng.connect(mix);
      ns.start(t);
      oscs.push(ns);
    }

    // LFO
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = p.lfoRate;
    const lfoGainP = ctx.createGain();
    lfoGainP.gain.value = p.lfoPitch;
    const lfoGainC = ctx.createGain();
    lfoGainC.gain.value = p.lfoCut;
    lfo.connect(lfoGainP);
    lfo.connect(lfoGainC);
    for (const o of oscs) {
      if (o.detune) lfoGainP.connect(o.detune);
    }
    lfoGainC.connect(filter.frequency);
    lfo.start(t);

    mix.connect(filter);
    filter.connect(voiceGain);
    voiceGain.connect(dest);

    // Amp env
    const a = Math.max(0.002, p.ampA);
    const d = Math.max(0.01, p.ampD);
    const s = Math.max(0.0001, p.ampS);
    voiceGain.gain.setValueAtTime(0.0001, t);
    voiceGain.gain.exponentialRampToValueAtTime(1, t + a);
    voiceGain.gain.exponentialRampToValueAtTime(s, t + a + d);

    // Filter env
    const fa = Math.max(0.002, p.filtA);
    const fd = Math.max(0.01, p.filtD);
    const base = Math.max(40, p.cutoff);
    const peak = Math.min(18000, base + p.filtEnv);
    const susF = Math.max(40, base + p.filtEnv * p.filtS);
    filter.frequency.setValueAtTime(base, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(base + 1, peak), t + fa);
    filter.frequency.exponentialRampToValueAtTime(Math.max(base + 1, susF), t + fa + fd);

    this.voices.set(midi, { oscs, lfo, filter, voiceGain, started: t });
  }

  noteOff(midi, time) {
    const ctx = this.engine.ctx;
    const v = this.voices.get(midi);
    if (!v || !ctx) return;
    const t = Math.max(time ?? ctx.currentTime, v.started + 0.01);
    const p = this.params;
    const r = Math.max(0.02, p.ampR);
    try {
      v.voiceGain.gain.cancelScheduledValues(t);
      v.voiceGain.gain.setValueAtTime(Math.max(0.0001, v.voiceGain.gain.value), t);
      v.voiceGain.gain.exponentialRampToValueAtTime(0.0001, t + r);
      const base = Math.max(40, p.cutoff);
      v.filter.frequency.cancelScheduledValues(t);
      v.filter.frequency.setValueAtTime(Math.max(40, v.filter.frequency.value), t);
      v.filter.frequency.exponentialRampToValueAtTime(base, t + Math.max(0.02, p.filtR));
    } catch (_) {}
    const stopAt = t + r + 0.05;
    for (const o of v.oscs) {
      try {
        o.stop(stopAt);
      } catch (_) {}
    }
    try {
      v.lfo.stop(stopAt);
    } catch (_) {}
    this.voices.delete(midi);
  }

  allNotesOff() {
    for (const m of [...this.voices.keys()]) this.noteOff(m);
  }

  /** Schedule a short note for sequencer */
  playNote(midi, time, dur = 0.2, vel = 0.8) {
    this.noteOn(midi, vel, time);
    this.noteOff(midi, time + dur);
  }
}

function white(ctx) {
  const len = ctx.sampleRate * 1;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}
