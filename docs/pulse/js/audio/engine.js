/** VOLT audio engine — master bus, clock, analyzers */

export class Engine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.comp = null;
    this.masterGain = null;
    this.analyser = null;
    this.analyserL = null;
    this.splitter = null;
    this.buses = {};
    this.fx = {};
    this.playing = false;
    this.bpm = 120;
    this.swing = 0;
    this.metro = false;
    this.step = 0;
    this.meloStep = 0;
    this.patternLen = 16;
    this.meloLen = 32;
    this._nextNote = 0;
    this._timer = null;
    this._lookAhead = 0.08;
    this._scheduleAhead = 0.12;
    this.onStep = null;
    this.onTick = null;
    this.started = false;
  }

  async start() {
    if (this.started) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    await this.ctx.resume();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.85;

    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.knee.value = 12;
    this.comp.ratio.value = 3.5;
    this.comp.attack.value = 0.01;
    this.comp.release.value = 0.2;

    // Master FX chain nodes (dry/wet via gains)
    this.fx.distortion = this._makeDistortion(0);
    this.fx.distGain = this.ctx.createGain();
    this.fx.distGain.gain.value = 0;

    this.fx.delay = this.ctx.createDelay(2);
    this.fx.delay.delayTime.value = 0.28;
    this.fx.delayFb = this.ctx.createGain();
    this.fx.delayFb.gain.value = 0.28;
    this.fx.delayWet = this.ctx.createGain();
    this.fx.delayWet.gain.value = 0.12;
    this.fx.delayFilter = this.ctx.createBiquadFilter();
    this.fx.delayFilter.type = "lowpass";
    this.fx.delayFilter.frequency.value = 3200;

    this.fx.convolver = this.ctx.createConvolver();
    this.fx.convolver.buffer = this._impulse(2.4, 2.0);
    this.fx.reverbWet = this.ctx.createGain();
    this.fx.reverbWet.gain.value = 0.22;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.8;

    // Graph: buses -> distortion blend -> delay send -> reverb send -> comp -> master -> analyser -> dest
    this.fx.pre = this.ctx.createGain();
    this.fx.pre.connect(this.fx.distortion);
    this.fx.distortion.connect(this.fx.distGain);
    this.fx.pre.connect(this.comp); // dry path through dist dry
    this.fx.distGain.connect(this.comp);

    this.fx.pre.connect(this.fx.delayFilter);
    this.fx.delayFilter.connect(this.fx.delay);
    this.fx.delay.connect(this.fx.delayFb);
    this.fx.delayFb.connect(this.fx.delay);
    this.fx.delay.connect(this.fx.delayWet);
    this.fx.delayWet.connect(this.comp);

    this.fx.pre.connect(this.fx.convolver);
    this.fx.convolver.connect(this.fx.reverbWet);
    this.fx.reverbWet.connect(this.comp);

    this.comp.connect(this.masterGain);
    this.masterGain.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    // Channel buses
    for (const name of ["drums", "synth", "sampler", "metro"]) {
      const g = this.ctx.createGain();
      g.gain.value = name === "metro" ? 0.35 : 0.9;
      let pan = null;
      if (this.ctx.createStereoPanner) {
        pan = this.ctx.createStereoPanner();
        pan.pan.value = 0;
        g.connect(pan);
        pan.connect(this.fx.pre);
      } else {
        g.connect(this.fx.pre);
      }
      this.buses[name] = { gain: g, pan, mute: false, solo: false, level: 0.9 };
    }

    this.started = true;
  }

  bus(name) {
    return this.buses[name]?.gain || this.masterGain;
  }

  setBusLevel(name, v) {
    const b = this.buses[name];
    if (!b) return;
    b.level = v;
    this._applyMutes();
  }

  setBusPan(name, v) {
    const b = this.buses[name];
    if (b?.pan) b.pan.pan.value = v;
  }

  setMute(name, on) {
    const b = this.buses[name];
    if (!b) return;
    b.mute = on;
    this._applyMutes();
  }

  setSolo(name, on) {
    const b = this.buses[name];
    if (!b) return;
    b.solo = on;
    this._applyMutes();
  }

  _applyMutes() {
    const anySolo = Object.values(this.buses).some((b) => b.solo && b !== this.buses.metro);
    for (const [name, b] of Object.entries(this.buses)) {
      if (name === "metro") continue;
      const silenced = b.mute || (anySolo && !b.solo);
      b.gain.gain.setTargetAtTime(silenced ? 0 : b.level, this.ctx.currentTime, 0.01);
    }
  }

  setMasterFx({ reverb, delay, delayTime, feedback, drive, master }) {
    if (reverb != null) this.fx.reverbWet.gain.setTargetAtTime(reverb, this.ctx.currentTime, 0.02);
    if (delay != null) this.fx.delayWet.gain.setTargetAtTime(delay, this.ctx.currentTime, 0.02);
    if (delayTime != null) this.fx.delay.delayTime.setTargetAtTime(delayTime, this.ctx.currentTime, 0.02);
    if (feedback != null) this.fx.delayFb.gain.setTargetAtTime(feedback, this.ctx.currentTime, 0.02);
    if (drive != null) this.fx.distGain.gain.setTargetAtTime(drive, this.ctx.currentTime, 0.02);
    if (master != null) this.masterGain.gain.setTargetAtTime(master, this.ctx.currentTime, 0.02);
  }

  _makeDistortion(amount) {
    const ws = this.ctx.createWaveShaper();
    const n = 256;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((Math.PI + 40) * x) / (Math.PI + 40 * Math.abs(x));
    }
    ws.curve = curve;
    ws.oversample = "2x";
    return ws;
  }

  _impulse(seconds, decay) {
    const rate = this.ctx.sampleRate;
    const len = rate * seconds;
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  spb() {
    return 60 / this.bpm / 4; // 16th notes
  }

  play() {
    if (!this.started) return;
    if (this.ctx.state === "suspended") this.ctx.resume();
    if (this.playing) {
      this.pause();
      return;
    }
    this.playing = true;
    this._nextNote = this.ctx.currentTime + 0.05;
    this._scheduler();
  }

  pause() {
    this.playing = false;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  stop() {
    this.pause();
    this.step = 0;
    this.meloStep = 0;
    if (this.onStep) this.onStep(0, true);
  }

  _scheduler() {
    if (!this.playing) return;
    while (this._nextNote < this.ctx.currentTime + this._scheduleAhead) {
      this._scheduleNote(this.step, this._nextNote);
      this._advance();
    }
    this._timer = setTimeout(() => this._scheduler(), this._lookAhead * 1000);
  }

  _advance() {
    let stepTime = this.spb();
    if (this.swing > 0 && this.step % 2 === 1) {
      stepTime *= 1 + this.swing / 100;
    } else if (this.swing > 0 && this.step % 2 === 0) {
      stepTime *= 1 - this.swing / 200;
    }
    this._nextNote += stepTime;
    this.step = (this.step + 1) % this.patternLen;
    this.meloStep = (this.meloStep + 1) % this.meloLen;
  }

  _scheduleNote(step, time) {
    if (this.metro && step % 4 === 0) this._click(time, step % 16 === 0);
    if (this.onTick) this.onTick(step, time);
    // Visual update slightly ahead
    const delay = Math.max(0, (time - this.ctx.currentTime) * 1000 - 10);
    setTimeout(() => {
      if (this.onStep) this.onStep(step, false);
    }, delay);
  }

  _click(time, accent) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.value = accent ? 1400 : 900;
    o.type = "square";
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(accent ? 0.25 : 0.12, time + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    o.connect(g);
    g.connect(this.bus("metro"));
    o.start(time);
    o.stop(time + 0.06);
  }

  getWaveform(buf) {
    if (!this.analyser) return buf;
    this.analyser.getByteTimeDomainData(buf);
    return buf;
  }

  getSpectrum(buf) {
    if (!this.analyser) return buf;
    this.analyser.getByteFrequencyData(buf);
    return buf;
  }

  now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }
}
