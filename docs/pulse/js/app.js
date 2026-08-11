import { Engine } from "./audio/engine.js";
import { DrumMachine, kitNames, kitMeta } from "./audio/drums.js";
import { Synth, PRESETS, noteName } from "./audio/synth.js";
import { Sampler } from "./audio/sampler.js";
import {
  defaultProject,
  saveLocal,
  loadLocal,
  exportJSON,
  importJSON,
  seedDemo,
} from "./store.js";

const engine = new Engine();
const drums = new DrumMachine(engine);
const synth = new Synth(engine);
const sampler = new Sampler(engine);

let project = seedDemo(loadLocal() || defaultProject());
let octave = 3;
let currentPanel = "drums";
let arrangePos = 0;
let heldKeys = new Set();

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function toast(msg) {
  const el = $("#toast");
  el.hidden = false;
  el.textContent = msg;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (el.hidden = true), 2200);
}

function log(msg) {
  const el = $("#activity-log");
  if (el) el.textContent = msg;
}

/* ---------- boot ---------- */
function bootViz() {
  const c = $("#boot-viz");
  if (!c) return;
  const ctx = c.getContext("2d");
  const resize = () => {
    c.width = window.innerWidth;
    c.height = window.innerHeight;
  };
  resize();
  window.addEventListener("resize", resize);
  let t = 0;
  const draw = () => {
    t += 0.01;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "rgba(46,230,214,0.25)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = 0; x < c.width; x += 4) {
      const y =
        c.height * 0.55 +
        Math.sin(x * 0.01 + t) * 40 +
        Math.sin(x * 0.023 - t * 1.4) * 22;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    requestAnimationFrame(draw);
  };
  draw();
}

async function powerOn() {
  const btn = $("#boot-go");
  try {
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Booting…";
    }
    await engine.start();
    applyProjectAudio();
    const boot = $("#boot");
    boot.hidden = true;
    boot.classList.add("off");
    $("#app").hidden = false;
    buildAll();
    bindGlobal();
    startMonitor();
    toast("VOLT online");
    log("Session ready — hit play or tap pads.");
  } catch (err) {
    console.error(err);
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Power on";
    }
    const hint = $(".boot-hint");
    if (hint) {
      hint.textContent = "Could not start audio: " + (err && err.message ? err.message : String(err));
      hint.style.color = "var(--coral)";
    }
    toast("Boot failed — see message under the button");
  }
}

/* ---------- project -> audio ---------- */
function applyProjectAudio() {
  engine.bpm = project.bpm;
  engine.swing = project.swing;
  drums.setKit(project.kit);
  if (project.synth) Object.assign(synth.params, project.synth);
  for (const [name, m] of Object.entries(project.mixer)) {
    if (name === "master") {
      engine.setMasterFx({ master: m });
      continue;
    }
    if (!engine.buses[name]) continue;
    engine.setBusLevel(name, m.level);
    engine.setBusPan(name, m.pan);
    engine.setMute(name, m.mute);
    engine.setSolo(name, m.solo);
  }
  engine.setMasterFx(project.fx);
  // bake a few starter samples if empty
  sampler.pads.forEach((p, i) => {
    if (!p.buffer) {
      const kinds = ["blip", "noise", "riser", "blip"];
      sampler.bakeTone(i, kinds[i % kinds.length]);
      if (project.samplerMeta[i]) p.name = project.samplerMeta[i].name || p.name;
    }
  });
}

function snapshotProject() {
  project.bpm = engine.bpm;
  project.swing = engine.swing;
  project.kit = drums.kit;
  project.synth = { ...synth.params };
  project.fx = {
    reverb: engine.fx.reverbWet.gain.value,
    delay: engine.fx.delayWet.gain.value,
    delayTime: engine.fx.delay.delayTime.value,
    feedback: engine.fx.delayFb.gain.value,
    drive: engine.fx.distGain.gain.value,
  };
  project.mixer.master = engine.masterGain.gain.value;
  project.samplerMeta = sampler.pads.map((p) => ({
    name: p.name,
    pitch: p.pitch,
    level: p.level,
  }));
  return project;
}

/* ---------- transport UI ---------- */
function buildTransport() {
  const bank = $("#pattern-bank");
  bank.innerHTML = "";
  for (let i = 0; i < 8; i++) {
    const b = document.createElement("button");
    b.className = "pat" + (i === project.pattern ? " active" : "");
    b.textContent = String.fromCharCode(65 + i);
    b.type = "button";
    const filled = project.patterns[i].drums.some((r) => r.some(Boolean));
    if (filled) b.classList.add("filled");
    b.onclick = () => {
      project.pattern = i;
      buildTransport();
      renderActivePanel();
      log("Pattern " + b.textContent);
    };
    bank.appendChild(b);
  }
  $("#bpm").value = project.bpm;
  $("#swing").value = project.swing;
}

function bindTransport() {
  $("#btn-play").onclick = () => {
    engine.play();
    $("#btn-play").classList.toggle("on", engine.playing);
    $("#btn-play").textContent = engine.playing ? "❚❚" : "▶";
  };
  $("#btn-stop").onclick = () => {
    engine.stop();
    synth.allNotesOff();
    $("#btn-play").classList.remove("on");
    $("#btn-play").textContent = "▶";
    arrangePos = 0;
    highlightStep(0, true);
  };
  $("#btn-rec").onclick = () => {
    $("#btn-rec").classList.toggle("on");
    log($("#btn-rec").classList.contains("on") ? "Record armed (sampler mic)" : "Record disarmed");
  };
  $("#btn-metro").onclick = () => {
    engine.metro = !engine.metro;
    $("#btn-metro").classList.toggle("on", engine.metro);
  };
  $("#bpm").oninput = (e) => {
    project.bpm = +e.target.value;
    engine.bpm = project.bpm;
  };
  $("#swing").oninput = (e) => {
    project.swing = +e.target.value;
    engine.swing = project.swing;
  };
  $("#btn-save").onclick = () => {
    saveLocal(snapshotProject());
    toast("Saved to this browser");
  };
  $("#btn-load").onclick = () => {
    const p = loadLocal();
    if (!p) return toast("No saved session");
    project = p;
    applyProjectAudio();
    buildAll();
    toast("Loaded session");
  };
  $("#btn-export").onclick = () => {
    exportJSON(snapshotProject());
    toast("Exported .volt.json");
  };
  $("#file-import").onchange = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    project = await importJSON(f);
    applyProjectAudio();
    buildAll();
    toast("Imported " + f.name);
  };
  // long-press load opens file — also click load with shift = import
  $("#btn-load").addEventListener("contextmenu", (e) => {
    e.preventDefault();
    $("#file-import").click();
  });
}

/* ---------- clock / sequencing ---------- */
function currentPattern() {
  if (project.arrangeOn) {
    const idx = project.arrange[arrangePos] ?? 0;
    return project.patterns[idx];
  }
  return project.patterns[project.pattern];
}

engine.onTick = (step, time) => {
  const pat = currentPattern();
  engine.patternLen = project.arrangeOn ? 16 : pat.drumLens || 16;

  // drums
  const voices = kitMeta(drums.kit).voices;
  pat.drums.forEach((row, ri) => {
    const cell = row[step % row.length];
    if (cell) drums.trigger(voices[ri], time, cell === 2 ? 1 : 0.85);
  });

  engine.meloLen = pat.meloLens || 32;
  const meloStep = engine.meloStep;
  pat.melody.forEach((row, ri) => {
    if (row[meloStep]) {
      const m = 71 - ri;
      synth.playNote(m, time, engine.spb() * 1.5, 0.75);
    }
  });
};

engine.onStep = (step, reset) => {
  highlightStep(step, reset);
  const bars = Math.floor(step / 16) + 1;
  const beat = Math.floor((step % 16) / 4) + 1;
  const tick = (step % 4) + 1;
  $("#clock").textContent =
    String(bars).padStart(3, "0") + ":" + beat + ":" + String(tick).padStart(2, "0");
  if (reset) return;
  if (project.arrangeOn && step === 0) {
    // advanced at end of pattern — handled when step wraps: detect via previous
  }
  if (project.arrangeOn && step === 15) {
    // next pattern at end
    setTimeout(() => {
      arrangePos = (arrangePos + 1) % project.arrange.length;
      renderArrangeHighlight();
    }, engine.spb() * 900);
  }
};

function highlightStep(step, reset) {
  $$(".step.now, .ncell.now").forEach((el) => el.classList.remove("now"));
  if (reset) return;
  $$(`.step[data-step="${step % 16}"]`).forEach((el) => el.classList.add("now"));
  $$(`.ncell[data-step="${engine.meloStep % 32}"]`).forEach((el) => el.classList.add("now"));
}

/* ---------- panels ---------- */
function buildAll() {
  buildTransport();
  bindTransport();
  buildDrums();
  buildSynth();
  buildSeq();
  buildSampler();
  buildMixer();
  buildFx();
  buildArrange();
  buildKeyboard();
  renderActivePanel();
}

function renderActivePanel() {
  $$(".rail-btn").forEach((b) => b.classList.toggle("active", b.dataset.panel === currentPanel));
  $$(".panel").forEach((p) => p.classList.toggle("active", p.id === "panel-" + currentPanel));
  if (currentPanel === "drums") buildDrums();
  if (currentPanel === "seq") buildSeq();
  if (currentPanel === "arrange") buildArrange();
  if (currentPanel === "mixer") buildMixer();
}

function bindGlobal() {
  $$(".rail-btn").forEach((btn) => {
    btn.onclick = () => {
      currentPanel = btn.dataset.panel;
      renderActivePanel();
    };
  });

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
}

/* ---- drums panel ---- */
function buildDrums() {
  const root = $("#panel-drums");
  const pat = currentPattern();
  const meta = kitMeta(drums.kit);
  root.innerHTML = `
    <div class="ph">
      <div>
        <h1>Drum Machine</h1>
        <p>16-step · synthesized kits · tap pads to audition</p>
      </div>
      <div class="drum-kits" id="kit-list"></div>
    </div>
    <div class="card">
      <div class="drum-scroll pan"><div class="drum-grid" id="drum-grid"></div></div>
      <div class="row" style="margin-top:12px">
        <button class="ghost-btn" id="drum-clear" type="button">Clear pattern</button>
        <button class="ghost-btn" id="drum-random" type="button">Randomize hats</button>
        <span class="chip">Tip: click = on · double-click = accent</span>
      </div>
    </div>`;

  const kitList = $("#kit-list", root);
  kitNames().forEach((id) => {
    const b = document.createElement("button");
    b.className = "kit-btn" + (drums.kit === id ? " on" : "");
    b.type = "button";
    b.textContent = kitMeta(id).name;
    b.onclick = () => {
      drums.setKit(id);
      project.kit = id;
      buildDrums();
      log("Kit: " + kitMeta(id).name);
    };
    kitList.appendChild(b);
  });

  const grid = $("#drum-grid", root);
  meta.voices.forEach((name, ri) => {
    const row = document.createElement("div");
    row.className = "drum-row";
    const lab = document.createElement("div");
    lab.className = "drum-name";
    const audition = document.createElement("button");
    audition.type = "button";
    audition.textContent = "►";
    audition.onclick = () => drums.trigger(name, engine.now(), 1);
    lab.append(audition, document.createTextNode(name));
    row.appendChild(lab);
    for (let s = 0; s < 16; s++) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "step";
      cell.dataset.step = s;
      const v = pat.drums[ri][s];
      if (v === 1) cell.classList.add("on");
      if (v === 2) cell.classList.add("on", "accent");
      cell.onclick = () => {
        const cur = pat.drums[ri][s];
        pat.drums[ri][s] = cur ? 0 : 1;
        buildDrums();
      };
      cell.ondblclick = (e) => {
        e.preventDefault();
        pat.drums[ri][s] = 2;
        buildDrums();
      };
      row.appendChild(cell);
    }
    grid.appendChild(row);
  });

  $("#drum-clear", root).onclick = () => {
    pat.drums = pat.drums.map((r) => r.map(() => 0));
    buildDrums();
  };
  $("#drum-random", root).onclick = () => {
    for (let i = 0; i < 16; i++) pat.drums[2][i] = Math.random() > 0.4 ? 1 : 0;
    buildDrums();
  };
}

/* ---- synth panel ---- */
function buildSynth() {
  const root = $("#panel-synth");
  const p = synth.params;
  root.innerHTML = `
    <div class="ph"><div><h1>Synth</h1><p>Polyphonic subtractive · dual osc · filter envelope · LFO</p></div></div>
    <div class="synth-scroll pan">
      <div class="synth-presets" id="presets"></div>
      <div class="synth-layout">
        <div class="card osc-card">
          <h3>Oscillators</h3>
          <div class="row"><span class="chip">OSC 1</span><div class="wave-btns" id="w1"></div></div>
          <div class="row" style="margin-top:8px"><span class="chip">OSC 2</span><div class="wave-btns" id="w2"></div></div>
          <div class="knob-row" style="margin-top:14px">
            ${knobHTML("detune", "Detune", p.osc2Detune, -50, 50, 1)}
            ${knobHTML("mix", "OSC2 Mix", p.osc2Mix, 0, 1, 0.01)}
            ${knobHTML("oct", "OSC2 Oct", p.osc2Oct, -2, 2, 1)}
            ${knobHTML("noise", "Noise", p.noise, 0, 1, 0.01)}
            ${knobHTML("uni", "Unison", p.unison, 1, 5, 1)}
            ${knobHTML("lvl", "Level", p.level, 0, 1, 0.01)}
          </div>
        </div>
        <div class="card filt-card">
          <h3>Filter & LFO</h3>
          <div class="knob-row">
            ${knobHTML("cut", "Cutoff", p.cutoff, 80, 12000, 1)}
            ${knobHTML("res", "Res", p.res, 0.1, 18, 0.1)}
            ${knobHTML("fenv", "F.Env", p.filtEnv, 0, 6000, 10)}
            ${knobHTML("lfoR", "LFO Rate", p.lfoRate, 0.1, 20, 0.1)}
            ${knobHTML("lfoP", "LFO Pitch", p.lfoPitch, 0, 100, 1)}
            ${knobHTML("lfoC", "LFO Cut", p.lfoCut, 0, 2000, 10)}
          </div>
        </div>
        <div class="card env-card">
          <h3>Amp Envelope</h3>
          <div class="knob-row">
            ${knobHTML("aa", "A", p.ampA, 0.001, 2, 0.001)}
            ${knobHTML("ad", "D", p.ampD, 0.01, 2, 0.01)}
            ${knobHTML("as", "S", p.ampS, 0, 1, 0.01)}
            ${knobHTML("ar", "R", p.ampR, 0.01, 3, 0.01)}
          </div>
          <h3 style="margin-top:16px">Filter Envelope</h3>
          <div class="knob-row">
            ${knobHTML("fa", "A", p.filtA, 0.001, 2, 0.001)}
            ${knobHTML("fd", "D", p.filtD, 0.01, 2, 0.01)}
            ${knobHTML("fs", "S", p.filtS, 0, 1, 0.01)}
            ${knobHTML("fr", "R", p.filtR, 0.01, 3, 0.01)}
          </div>
        </div>
      </div>
    </div>`;

  const waves = ["sine", "triangle", "sawtooth", "square"];
  const mountWaves = (id, key) => {
    const box = $(id, root);
    waves.forEach((w) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = w.slice(0, 3);
      if (p[key] === w) b.classList.add("on");
      b.onclick = () => {
        p[key] = w;
        buildSynth();
      };
      box.appendChild(b);
    });
  };
  mountWaves("#w1", "osc1Type");
  mountWaves("#w2", "osc2Type");

  const presets = $("#presets", root);
  Object.keys(PRESETS).forEach((name) => {
    const b = document.createElement("button");
    b.className = "kit-btn";
    b.type = "button";
    b.textContent = name;
    b.onclick = () => {
      synth.loadPreset(name);
      buildSynth();
      log("Preset: " + name);
      // preview
      synth.playNote(60, engine.now(), 0.4, 0.8);
    };
    presets.appendChild(b);
  });

  const bind = (id, apply) => {
    const el = $("#" + id, root);
    const val = el.parentElement.querySelector(".val");
    const sync = () => {
      apply(+el.value);
      val.textContent = formatKnob(+el.value);
    };
    el.oninput = sync;
  };
  bind("detune", (v) => (p.osc2Detune = v));
  bind("mix", (v) => (p.osc2Mix = v));
  bind("oct", (v) => (p.osc2Oct = v));
  bind("noise", (v) => (p.noise = v));
  bind("uni", (v) => (p.unison = v));
  bind("lvl", (v) => (p.level = v));
  bind("cut", (v) => (p.cutoff = v));
  bind("res", (v) => (p.res = v));
  bind("fenv", (v) => (p.filtEnv = v));
  bind("lfoR", (v) => (p.lfoRate = v));
  bind("lfoP", (v) => (p.lfoPitch = v));
  bind("lfoC", (v) => (p.lfoCut = v));
  bind("aa", (v) => (p.ampA = v));
  bind("ad", (v) => (p.ampD = v));
  bind("as", (v) => (p.ampS = v));
  bind("ar", (v) => (p.ampR = v));
  bind("fa", (v) => (p.filtA = v));
  bind("fd", (v) => (p.filtD = v));
  bind("fs", (v) => (p.filtS = v));
  bind("fr", (v) => (p.filtR = v));
}

function knobHTML(id, label, value, min, max, step) {
  return `<div class="knob"><label>${label}</label>
    <input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}">
    <span class="val">${formatKnob(value)}</span></div>`;
}
function formatKnob(v) {
  if (Math.abs(v) >= 100) return Math.round(v);
  if (Math.abs(v) >= 10) return v.toFixed(1);
  return Number(v).toFixed(2);
}

/* ---- melody sequencer ---- */
function buildSeq() {
  const root = $("#panel-seq");
  const pat = currentPattern();
  root.innerHTML = `
    <div class="ph"><div><h1>Melodic Sequencer</h1><p>32-step piano grid · plays through the synth</p></div>
      <button class="ghost-btn" id="melo-clear" type="button">Clear</button>
    </div>
    <div class="card"><div class="note-grid" id="note-grid"></div></div>`;
  const grid = $("#note-grid", root);
  for (let r = 0; r < 24; r++) {
    const row = document.createElement("div");
    row.className = "note-row";
    const midi = 71 - r;
    const lab = document.createElement("div");
    lab.className = "note-lab";
    lab.textContent = noteName(midi);
    row.appendChild(lab);
    for (let s = 0; s < 32; s++) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "ncell" + (pat.melody[r][s] ? " on" : "");
      cell.dataset.step = s;
      cell.onclick = () => {
        pat.melody[r][s] = pat.melody[r][s] ? 0 : 1;
        if (pat.melody[r][s]) synth.playNote(midi, engine.now(), 0.15, 0.7);
        cell.classList.toggle("on");
      };
      row.appendChild(cell);
    }
    grid.appendChild(row);
  }
  $("#melo-clear", root).onclick = () => {
    pat.melody = pat.melody.map((r) => r.map(() => 0));
    buildSeq();
  };
}

/* ---- sampler ---- */
function buildSampler() {
  const root = $("#panel-sampler");
  root.innerHTML = `
    <div class="ph"><div><h1>Sampler</h1><p>16 pads · drop audio · mic record · procedural tones</p></div>
      <div class="row">
        <button class="ghost-btn" id="sam-rec" type="button">● Record to pad 1</button>
        <button class="ghost-btn" id="sam-bake" type="button">Bake tones</button>
      </div>
    </div>
    <div class="pad-grid" id="pads"></div>
    <div class="dropzone" id="drop">Drop WAV/MP3/OGG on a pad (or here for pad 1) · click pad to play</div>
    <div class="card" style="margin-top:12px">
      <div class="row">
        <label class="chip">Selected pad <select id="pad-sel">${sampler.pads.map((_, i) => `<option value="${i}">${i + 1}</option>`).join("")}</select></label>
        ${knobHTML("spitch", "Pitch", 0, -12, 12, 1)}
        ${knobHTML("slevel", "Level", 0.9, 0, 1, 0.01)}
        <input id="sam-file" type="file" accept="audio/*" hidden>
        <button class="ghost-btn" id="sam-load" type="button">Load file…</button>
      </div>
    </div>`;

  const pads = $("#pads", root);
  sampler.pads.forEach((pad, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pad" + (pad.buffer ? " loaded" : "");
    b.innerHTML = `<span class="pad-ico">${pad.buffer ? "◎" : "○"}</span><span>${pad.name}</span><span style="opacity:.6">${i + 1}</span>`;
    b.onmousedown = () => {
      b.classList.add("hot");
      sampler.trigger(i, engine.now(), 1);
    };
    b.onmouseup = b.onmouseleave = () => b.classList.remove("hot");
    b.ondragover = (e) => {
      e.preventDefault();
      b.classList.add("hot");
    };
    b.ondragleave = () => b.classList.remove("hot");
    b.ondrop = async (e) => {
      e.preventDefault();
      b.classList.remove("hot");
      const f = e.dataTransfer.files?.[0];
      if (f) {
        await sampler.loadFile(i, f);
        buildSampler();
        toast("Loaded into pad " + (i + 1));
      }
    };
    pads.appendChild(b);
  });

  const drop = $("#drop", root);
  drop.ondragover = (e) => {
    e.preventDefault();
    drop.classList.add("over");
  };
  drop.ondragleave = () => drop.classList.remove("over");
  drop.ondrop = async (e) => {
    e.preventDefault();
    drop.classList.remove("over");
    const f = e.dataTransfer.files?.[0];
    if (f) {
      await sampler.loadFile(0, f);
      buildSampler();
    }
  };

  $("#sam-load", root).onclick = () => $("#sam-file", root).click();
  $("#sam-file", root).onchange = async (e) => {
    const f = e.target.files?.[0];
    const idx = +$("#pad-sel", root).value;
    if (f) {
      await sampler.loadFile(idx, f);
      buildSampler();
    }
  };
  $("#spitch", root).oninput = (e) => {
    const idx = +$("#pad-sel", root).value;
    sampler.pads[idx].pitch = +e.target.value;
  };
  $("#slevel", root).oninput = (e) => {
    const idx = +$("#pad-sel", root).value;
    sampler.pads[idx].level = +e.target.value;
  };
  $("#sam-bake", root).onclick = () => {
    ["blip", "noise", "riser", "blip", "noise", "riser"].forEach((k, i) => sampler.bakeTone(i, k));
    buildSampler();
    toast("Procedural tones baked");
  };
  $("#sam-rec", root).onclick = async () => {
    if (!sampler.recording) {
      try {
        await sampler.startRecord();
        $("#sam-rec", root).textContent = "■ Stop & save";
        $("#sam-rec", root).style.color = "var(--coral)";
        log("Recording mic…");
      } catch {
        toast("Mic permission denied");
      }
    } else {
      await sampler.stopRecord(0);
      buildSampler();
      toast("Recording saved to pad 1");
    }
  };
}

/* ---- mixer ---- */
function buildMixer() {
  const root = $("#panel-mixer");
  const chans = ["drums", "synth", "sampler"];
  root.innerHTML = `
    <div class="ph"><div><h1>Mixer</h1><p>Level · pan · mute · solo</p></div></div>
    <div class="mixer" id="mixer"></div>`;
  const box = $("#mixer", root);
  chans.forEach((name) => {
    const m = project.mixer[name];
    const el = document.createElement("div");
    el.className = "ch";
    el.innerHTML = `<h4>${name}</h4>
      <input class="fader" type="range" min="0" max="1" step="0.01" value="${m.level}">
      <input type="range" min="-1" max="1" step="0.01" value="${m.pan}" title="Pan">
      <div class="ms">
        <button type="button" class="mute${m.mute ? " on" : ""}">M</button>
        <button type="button" class="solo${m.solo ? " on" : ""}">S</button>
      </div>`;
    const fader = el.querySelector(".fader");
    const pan = el.querySelectorAll("input")[1];
    fader.oninput = () => {
      m.level = +fader.value;
      engine.setBusLevel(name, m.level);
    };
    pan.oninput = () => {
      m.pan = +pan.value;
      engine.setBusPan(name, m.pan);
    };
    el.querySelector(".mute").onclick = (e) => {
      m.mute = !m.mute;
      e.target.classList.toggle("on", m.mute);
      engine.setMute(name, m.mute);
    };
    el.querySelector(".solo").onclick = (e) => {
      m.solo = !m.solo;
      e.target.classList.toggle("on", m.solo);
      engine.setSolo(name, m.solo);
    };
    box.appendChild(el);
  });
  const master = document.createElement("div");
  master.className = "ch";
  master.innerHTML = `<h4>Master</h4><input class="fader" type="range" min="0" max="1" step="0.01" value="${project.mixer.master}">`;
  master.querySelector("input").oninput = (e) => {
    project.mixer.master = +e.target.value;
    engine.setMasterFx({ master: project.mixer.master });
  };
  box.appendChild(master);
}

/* ---- FX ---- */
function buildFx() {
  const root = $("#panel-fx");
  const fx = project.fx;
  root.innerHTML = `
    <div class="ph"><div><h1>Master FX</h1><p>Space · echo · grit · glue</p></div></div>
    <div class="chain"><span>Input</span><span>Drive</span><span>Delay</span><span>Reverb</span><span>Comp</span><span>Out</span></div>
    <div class="fx-grid">
      <div class="card fx-card"><h3>Reverb</h3>${knobHTML("rv", "Mix", fx.reverb, 0, 0.8, 0.01)}</div>
      <div class="card fx-card"><h3>Delay</h3>
        <div class="knob-row">
          ${knobHTML("dw", "Mix", fx.delay, 0, 0.8, 0.01)}
          ${knobHTML("dt", "Time", fx.delayTime, 0.05, 1.2, 0.01)}
          ${knobHTML("df", "Feedback", fx.feedback, 0, 0.9, 0.01)}
        </div>
      </div>
      <div class="card fx-card"><h3>Drive</h3>${knobHTML("dr", "Amount", fx.drive, 0, 0.8, 0.01)}</div>
    </div>`;
  const apply = () => engine.setMasterFx(project.fx);
  const bind = (id, key) => {
    const el = $("#" + id, root);
    el.oninput = () => {
      project.fx[key] = +el.value;
      el.parentElement.querySelector(".val").textContent = formatKnob(+el.value);
      apply();
    };
  };
  bind("rv", "reverb");
  bind("dw", "delay");
  bind("dt", "delayTime");
  bind("df", "feedback");
  bind("dr", "drive");
}

/* ---- arrange ---- */
function buildArrange() {
  const root = $("#panel-arrange");
  root.innerHTML = `
    <div class="ph"><div><h1>Arrange</h1><p>Chain patterns A–H into a song</p></div>
      <label class="chip"><input id="arr-on" type="checkbox" ${project.arrangeOn ? "checked" : ""}> Follow arrange while playing</label>
    </div>
    <div class="card">
      <div class="arr-row" id="arr-row"><div class="arr-cell" style="border:none;background:transparent;color:var(--dim)">Slot</div></div>
    </div>`;
  const row = $("#arr-row", root);
  for (let i = 0; i < 8; i++) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "arr-cell on";
    cell.textContent = String.fromCharCode(65 + project.arrange[i]);
    if (i === arrangePos && project.arrangeOn) cell.classList.add("now");
    cell.onclick = () => {
      project.arrange[i] = (project.arrange[i] + 1) % 8;
      buildArrange();
    };
    row.appendChild(cell);
  }
  $("#arr-on", root).onchange = (e) => {
    project.arrangeOn = e.target.checked;
    log(project.arrangeOn ? "Arrange mode on" : "Pattern mode");
  };
}

function renderArrangeHighlight() {
  if (currentPanel === "arrange") buildArrange();
}

/* ---- keyboard ---- */
const WHITE = [0, 2, 4, 5, 7, 9, 11];
const KEY_MAP = {
  a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12,
};

function buildKeyboard() {
  const root = $("#keyboard");
  root.innerHTML = "";
  const start = 12 + octave * 12; // C
  // 14 white keys
  let whiteIndex = 0;
  for (let i = 0; i < 18; i++) {
    const midi = start + i;
    const isBlack = [1, 3, 6, 8, 10].includes(midi % 12);
    if (isBlack) continue;
    const key = document.createElement("button");
    key.type = "button";
    key.className = "key";
    key.dataset.midi = midi;
    key.style.flex = "1";
    const down = () => noteDown(midi, key);
    const up = () => noteUp(midi, key);
    key.onmousedown = down;
    key.onmouseup = up;
    key.onmouseleave = up;
    root.appendChild(key);
    // black key after this white?
    const next = midi + 1;
    if ([1, 3, 6, 8, 10].includes(next % 12) && i < 17) {
      const blk = document.createElement("button");
      blk.type = "button";
      blk.className = "key black";
      blk.dataset.midi = next;
      blk.style.left = `calc(${(whiteIndex + 1)} * (100% / 11) - 14px)`;
      // position via grid flow — simpler absolute within flex
      blk.onmousedown = (e) => {
        e.stopPropagation();
        noteDown(next, blk);
      };
      blk.onmouseup = () => noteUp(next, blk);
      blk.onmouseleave = () => noteUp(next, blk);
      key.style.position = "relative";
      // append blacks to container absolutely
      root.appendChild(blk);
    }
    whiteIndex++;
  }
  // Fix black key layout: rebuild cleaner
  root.innerHTML = "";
  root.style.display = "flex";
  const whites = [];
  for (let i = 0; i < 14; i++) {
    const midi = start + WHITE[i % 7] + Math.floor(i / 7) * 12;
    const key = document.createElement("button");
    key.type = "button";
    key.className = "key";
    key.dataset.midi = midi;
    key.onmousedown = () => noteDown(midi, key);
    key.onmouseup = () => noteUp(midi, key);
    key.onmouseleave = () => noteUp(midi, key);
    root.appendChild(key);
    whites.push({ el: key, midi });
  }
  // blacks
  const blackOffsets = [
    { w: 0, n: 1 },
    { w: 1, n: 3 },
    { w: 3, n: 6 },
    { w: 4, n: 8 },
    { w: 5, n: 10 },
    { w: 7, n: 13 },
    { w: 8, n: 15 },
    { w: 10, n: 18 },
    { w: 11, n: 20 },
    { w: 12, n: 22 },
  ];
  requestAnimationFrame(() => {
    const rect = root.getBoundingClientRect();
    blackOffsets.forEach(({ w, n }) => {
      if (w >= whites.length - 1) return;
      const midi = start + n;
      const leftWhite = whites[w].el.getBoundingClientRect();
      const blk = document.createElement("button");
      blk.type = "button";
      blk.className = "key black";
      blk.dataset.midi = midi;
      blk.style.position = "absolute";
      blk.style.left = leftWhite.right - rect.left - 14 + "px";
      blk.style.top = "0";
      blk.onmousedown = (e) => {
        e.preventDefault();
        noteDown(midi, blk);
      };
      blk.onmouseup = () => noteUp(midi, blk);
      blk.onmouseleave = () => noteUp(midi, blk);
      root.appendChild(blk);
    });
  });

  $("#oct-label").textContent = octave;
  $("#oct-down").onclick = () => {
    octave = Math.max(1, octave - 1);
    buildKeyboard();
  };
  $("#oct-up").onclick = () => {
    octave = Math.min(6, octave + 1);
    buildKeyboard();
  };
}

function noteDown(midi, el) {
  if (heldKeys.has(midi)) return;
  heldKeys.add(midi);
  el?.classList.add("on");
  synth.noteOn(midi, 0.9);
  // record to melody if armed? skip
  if ($("#btn-rec")?.classList.contains("on")) {
    // place on current step of melody
    const pat = currentPattern();
    const row = 71 - midi;
    if (row >= 0 && row < 24) pat.melody[row][engine.step % 32] = 1;
  }
}

function noteUp(midi, el) {
  heldKeys.delete(midi);
  el?.classList.remove("on");
  synth.noteOff(midi);
}

function onKeyDown(e) {
  if (e.repeat || e.target.matches("input,textarea,select")) return;
  if (e.code === "Space") {
    e.preventDefault();
    $("#btn-play").click();
    return;
  }
  if (e.key === "z") {
    octave = Math.max(1, octave - 1);
    buildKeyboard();
    return;
  }
  if (e.key === "x") {
    octave = Math.min(6, octave + 1);
    buildKeyboard();
    return;
  }
  const off = KEY_MAP[e.key.toLowerCase()];
  if (off == null) return;
  const midi = 12 + octave * 12 + off;
  const el = $(`.key[data-midi="${midi}"]`);
  noteDown(midi, el);
}

function onKeyUp(e) {
  const off = KEY_MAP[e.key.toLowerCase()];
  if (off == null) return;
  const midi = 12 + octave * 12 + off;
  const el = $(`.key[data-midi="${midi}"]`);
  noteUp(midi, el);
}

/* ---- monitors ---- */
function startMonitor() {
  const scope = $("#scope");
  const spectrum = $("#spectrum");
  const sctx = scope.getContext("2d");
  const xctx = spectrum.getContext("2d");
  const wave = new Uint8Array(engine.analyser.fftSize);
  const freq = new Uint8Array(engine.analyser.frequencyBinCount);

  const draw = () => {
    if (!engine.analyser) return requestAnimationFrame(draw);
    engine.getWaveform(wave);
    engine.getSpectrum(freq);
    // scope
    sctx.fillStyle = "#0a0e14";
    sctx.fillRect(0, 0, scope.width, scope.height);
    sctx.strokeStyle = "#2ee6d6";
    sctx.lineWidth = 2;
    sctx.beginPath();
    const slice = scope.width / wave.length;
    for (let i = 0; i < wave.length; i++) {
      const y = (wave[i] / 255) * scope.height;
      if (i === 0) sctx.moveTo(0, y);
      else sctx.lineTo(i * slice, y);
    }
    sctx.stroke();
    // spectrum
    xctx.fillStyle = "#0a0e14";
    xctx.fillRect(0, 0, spectrum.width, spectrum.height);
    const bw = spectrum.width / 64;
    for (let i = 0; i < 64; i++) {
      const v = freq[i] / 255;
      const h = v * spectrum.height;
      xctx.fillStyle = `rgba(255,179,71,${0.35 + v * 0.65})`;
      xctx.fillRect(i * bw, spectrum.height - h, bw - 1, h);
    }
    // meters
    let sum = 0;
    for (let i = 0; i < wave.length; i++) {
      const n = (wave[i] - 128) / 128;
      sum += n * n;
    }
    const rms = Math.sqrt(sum / wave.length);
    const pct = Math.min(100, rms * 280);
    $("#meter-l").style.width = pct + "%";
    $("#meter-r").style.width = pct * 0.92 + "%";
    requestAnimationFrame(draw);
  };
  draw();
}

/* ---------- init ---------- */
try {
  bootViz();
} catch (e) {
  console.warn("boot viz", e);
}
const bootBtn = $("#boot-go");
if (bootBtn) {
  bootBtn.addEventListener("click", (e) => {
    e.preventDefault();
    powerOn();
  });
} else {
  console.error("VOLT: #boot-go missing");
}
