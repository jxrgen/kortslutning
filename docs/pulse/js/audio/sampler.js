/** Sampler + mic recorder for VOLT */

export class Sampler {
  constructor(engine) {
    this.engine = engine;
    this.pads = Array.from({ length: 16 }, () => ({
      buffer: null,
      name: "Empty",
      start: 0,
      end: 1,
      pitch: 0,
      level: 0.9,
    }));
    this.recording = false;
    this._recChunks = [];
    this._media = null;
    this._recorder = null;
  }

  async loadFile(padIndex, file) {
    const ctx = this.engine.ctx;
    const ab = await file.arrayBuffer();
    const buffer = await ctx.decodeAudioData(ab.slice(0));
    this.pads[padIndex].buffer = buffer;
    this.pads[padIndex].name = file.name.replace(/\.[^.]+$/, "").slice(0, 18);
    this.pads[padIndex].start = 0;
    this.pads[padIndex].end = 1;
    return this.pads[padIndex];
  }

  async loadUrl(padIndex, url, name) {
    const ctx = this.engine.ctx;
    const res = await fetch(url);
    const ab = await res.arrayBuffer();
    const buffer = await ctx.decodeAudioData(ab);
    this.pads[padIndex].buffer = buffer;
    this.pads[padIndex].name = name || "Sample";
    return this.pads[padIndex];
  }

  /** Generate a short procedural sample into a pad (offline) */
  bakeTone(padIndex, kind = "blip") {
    const ctx = this.engine.ctx;
    const sr = ctx.sampleRate;
    const dur = kind === "riser" ? 1.2 : 0.35;
    const buf = ctx.createBuffer(1, Math.floor(sr * dur), sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      const env = Math.exp(-t * (kind === "riser" ? 0.8 : 8));
      if (kind === "blip") d[i] = Math.sin(2 * Math.PI * (660 - t * 200) * t) * env;
      else if (kind === "noise") d[i] = (Math.random() * 2 - 1) * env;
      else if (kind === "riser") d[i] = Math.sin(2 * Math.PI * (80 + t * 900) * t) * (t / dur);
      else d[i] = Math.sin(2 * Math.PI * 110 * t) * env;
    }
    this.pads[padIndex].buffer = buf;
    this.pads[padIndex].name = kind;
    return this.pads[padIndex];
  }

  trigger(padIndex, time, velocity = 1) {
    const pad = this.pads[padIndex];
    if (!pad?.buffer) return;
    const ctx = this.engine.ctx;
    const t = time ?? ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = pad.buffer;
    src.playbackRate.value = Math.pow(2, pad.pitch / 12);
    const g = ctx.createGain();
    const peak = pad.level * velocity;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), t + 0.005);
    const dur = pad.buffer.duration * (pad.end - pad.start);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.05, dur));
    src.connect(g);
    g.connect(this.engine.bus("sampler"));
    const offset = pad.buffer.duration * pad.start;
    src.start(t, offset, dur);
  }

  async startRecord() {
    if (this.recording) return;
    this._media = await navigator.mediaDevices.getUserMedia({ audio: true });
    this._recChunks = [];
    this._recorder = new MediaRecorder(this._media);
    this._recorder.ondataavailable = (e) => {
      if (e.data.size) this._recChunks.push(e.data);
    };
    this._recorder.start();
    this.recording = true;
  }

  async stopRecord(padIndex = 0) {
    if (!this.recording) return null;
    const ctx = this.engine.ctx;
    return new Promise((resolve) => {
      this._recorder.onstop = async () => {
        const blob = new Blob(this._recChunks, { type: "audio/webm" });
        const ab = await blob.arrayBuffer();
        try {
          const buffer = await ctx.decodeAudioData(ab.slice(0));
          this.pads[padIndex].buffer = buffer;
          this.pads[padIndex].name = "Rec " + (padIndex + 1);
          resolve(this.pads[padIndex]);
        } catch (err) {
          resolve(null);
        }
        this._media.getTracks().forEach((t) => t.stop());
        this.recording = false;
      };
      this._recorder.stop();
    });
  }
}
