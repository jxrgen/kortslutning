/** Synthesized drum kits for VOLT */

const KITS = {
  analog: {
    name: "Analog",
    voices: ["Kick", "Snare", "CH", "OH", "Tom", "Clap", "Rim", "Perc"],
  },
  boom: {
    name: "808 Boom",
    voices: ["Kick", "Snare", "CH", "OH", "Tom", "Clap", "Cowbell", "Perc"],
  },
  loft: {
    name: "Loft",
    voices: ["Kick", "Snare", "CH", "OH", "Tom", "Shaker", "Rim", "Fx"],
  },
  glitch: {
    name: "Glitch",
    voices: ["Kick", "Snare", "CH", "OH", "Bit", "Zap", "Noise", "Click"],
  },
};

export function kitNames() {
  return Object.keys(KITS);
}

export function kitMeta(id) {
  return KITS[id] || KITS.analog;
}

function env(g, t, a, d, peak = 1) {
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + Math.max(0.001, a));
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

export class DrumMachine {
  constructor(engine) {
    this.engine = engine;
    this.kit = "analog";
    this.vel = 1;
  }

  setKit(id) {
    if (KITS[id]) this.kit = id;
  }

  trigger(voice, time, velocity = 1) {
    const ctx = this.engine.ctx;
    if (!ctx) return;
    const t = time ?? ctx.currentTime;
    const dest = this.engine.bus("drums");
    const v = Math.max(0.05, Math.min(1, velocity)) * this.vel;
    const fn = this._voiceFn(voice);
    if (fn) fn(ctx, dest, t, v, this.kit);
  }

  _voiceFn(voice) {
    const map = {
      Kick: kick,
      Snare: snare,
      CH: closedHat,
      OH: openHat,
      Tom: tom,
      Clap: clap,
      Rim: rim,
      Perc: perc,
      Cowbell: cowbell,
      Shaker: shaker,
      Fx: fxHit,
      Bit: bitHit,
      Zap: zap,
      Noise: noiseBurst,
      Click: click,
    };
    return map[voice] || perc;
  }
}

function kick(ctx, dest, t, v, kit) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  const f0 = kit === "boom" ? 55 : kit === "loft" ? 70 : 90;
  o.frequency.setValueAtTime(f0 * 3.2, t);
  o.frequency.exponentialRampToValueAtTime(f0, t + 0.05);
  o.type = "sine";
  const click = ctx.createOscillator();
  const cg = ctx.createGain();
  click.type = "square";
  click.frequency.value = 180;
  cg.gain.setValueAtTime(0.15 * v, t);
  cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
  env(g, t, 0.002, kit === "boom" ? 0.55 : 0.32, 0.95 * v);
  o.connect(g);
  g.connect(dest);
  click.connect(cg);
  cg.connect(dest);
  o.start(t);
  o.stop(t + 0.7);
  click.start(t);
  click.stop(t + 0.03);
}

function snare(ctx, dest, t, v, kit) {
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuf(ctx, 0.25);
  const nf = ctx.createBiquadFilter();
  nf.type = "bandpass";
  nf.frequency.value = kit === "glitch" ? 2200 : 1800;
  nf.Q.value = 0.8;
  const ng = ctx.createGain();
  env(ng, t, 0.001, kit === "loft" ? 0.28 : 0.18, 0.55 * v);

  const o = ctx.createOscillator();
  const og = ctx.createGain();
  o.type = "triangle";
  o.frequency.setValueAtTime(220, t);
  o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
  env(og, t, 0.001, 0.12, 0.35 * v);

  noise.connect(nf);
  nf.connect(ng);
  ng.connect(dest);
  o.connect(og);
  og.connect(dest);
  noise.start(t);
  noise.stop(t + 0.3);
  o.start(t);
  o.stop(t + 0.2);
}

function closedHat(ctx, dest, t, v) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf(ctx, 0.08);
  const bp = ctx.createBiquadFilter();
  bp.type = "highpass";
  bp.frequency.value = 7000;
  const g = ctx.createGain();
  env(g, t, 0.001, 0.05, 0.28 * v);
  src.connect(bp);
  bp.connect(g);
  g.connect(dest);
  src.start(t);
  src.stop(t + 0.1);
}

function openHat(ctx, dest, t, v) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf(ctx, 0.4);
  const bp = ctx.createBiquadFilter();
  bp.type = "highpass";
  bp.frequency.value = 6500;
  const g = ctx.createGain();
  env(g, t, 0.001, 0.32, 0.25 * v);
  src.connect(bp);
  bp.connect(g);
  g.connect(dest);
  src.start(t);
  src.stop(t + 0.45);
}

function tom(ctx, dest, t, v) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(220, t);
  o.frequency.exponentialRampToValueAtTime(110, t + 0.15);
  env(g, t, 0.002, 0.28, 0.55 * v);
  o.connect(g);
  g.connect(dest);
  o.start(t);
  o.stop(t + 0.4);
}

function clap(ctx, dest, t, v) {
  for (let i = 0; i < 3; i++) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf(ctx, 0.08);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1200;
    const g = ctx.createGain();
    const tt = t + i * 0.012;
    env(g, tt, 0.001, 0.08, 0.35 * v);
    src.connect(bp);
    bp.connect(g);
    g.connect(dest);
    src.start(tt);
    src.stop(tt + 0.12);
  }
}

function rim(ctx, dest, t, v) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "square";
  o.frequency.value = 800;
  env(g, t, 0.001, 0.04, 0.2 * v);
  o.connect(g);
  g.connect(dest);
  o.start(t);
  o.stop(t + 0.06);
}

function perc(ctx, dest, t, v) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "triangle";
  o.frequency.setValueAtTime(640, t);
  o.frequency.exponentialRampToValueAtTime(220, t + 0.1);
  env(g, t, 0.001, 0.14, 0.35 * v);
  o.connect(g);
  g.connect(dest);
  o.start(t);
  o.stop(t + 0.2);
}

function cowbell(ctx, dest, t, v) {
  const f = [560, 845];
  f.forEach((freq) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "square";
    o.frequency.value = freq;
    env(g, t, 0.001, 0.22, 0.12 * v);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + 0.3);
  });
}

function shaker(ctx, dest, t, v) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf(ctx, 0.12);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 8000;
  bp.Q.value = 2;
  const g = ctx.createGain();
  env(g, t, 0.005, 0.1, 0.22 * v);
  src.connect(bp);
  bp.connect(g);
  g.connect(dest);
  src.start(t);
  src.stop(t + 0.15);
}

function fxHit(ctx, dest, t, v) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(120, t);
  o.frequency.exponentialRampToValueAtTime(40, t + 0.4);
  env(g, t, 0.01, 0.45, 0.3 * v);
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.setValueAtTime(4000, t);
  f.frequency.exponentialRampToValueAtTime(200, t + 0.4);
  o.connect(f);
  f.connect(g);
  g.connect(dest);
  o.start(t);
  o.stop(t + 0.5);
}

function bitHit(ctx, dest, t, v) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "square";
  o.frequency.setValueAtTime(90 + Math.random() * 400, t);
  env(g, t, 0.001, 0.08, 0.25 * v);
  o.connect(g);
  g.connect(dest);
  o.start(t);
  o.stop(t + 0.1);
}

function zap(ctx, dest, t, v) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(1800, t);
  o.frequency.exponentialRampToValueAtTime(80, t + 0.15);
  env(g, t, 0.001, 0.15, 0.28 * v);
  o.connect(g);
  g.connect(dest);
  o.start(t);
  o.stop(t + 0.2);
}

function noiseBurst(ctx, dest, t, v) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf(ctx, 0.2);
  const g = ctx.createGain();
  env(g, t, 0.001, 0.15, 0.3 * v);
  src.connect(g);
  g.connect(dest);
  src.start(t);
  src.stop(t + 0.25);
}

function click(ctx, dest, t, v) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.value = 2400;
  env(g, t, 0.0005, 0.02, 0.2 * v);
  o.connect(g);
  g.connect(dest);
  o.start(t);
  o.stop(t + 0.03);
}

const _noiseCache = new Map();
function noiseBuf(ctx, seconds) {
  const key = ctx.sampleRate + ":" + seconds;
  if (_noiseCache.has(key)) return _noiseCache.get(key);
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  _noiseCache.set(key, buf);
  return buf;
}
