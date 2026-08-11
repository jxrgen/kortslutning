/** Project state + persistence */

const STORAGE_KEY = "volt.project.v1";

export function defaultProject() {
  const drumSteps = () => Array.from({ length: 8 }, () => Array(16).fill(0));
  const melo = () => Array.from({ length: 24 }, () => Array(32).fill(0)); // C2..B3-ish rows
  return {
    name: "Untitled Session",
    bpm: 120,
    swing: 0,
    kit: "analog",
    pattern: 0,
    patterns: Array.from({ length: 8 }, (_, i) => ({
      id: i,
      drums: drumSteps(),
      melody: melo(),
      drumLens: 16,
      meloLens: 32,
    })),
    arrange: [0, 0, 1, 1, 2, 2, 3, 0],
    arrangeOn: false,
    synth: null, // filled from live params on save
    samplerMeta: Array.from({ length: 16 }, () => ({ name: "Empty", pitch: 0, level: 0.9 })),
    mixer: {
      drums: { level: 0.9, pan: 0, mute: false, solo: false },
      synth: { level: 0.85, pan: 0, mute: false, solo: false },
      sampler: { level: 0.9, pan: 0, mute: false, solo: false },
      master: 0.85,
    },
    fx: { reverb: 0.22, delay: 0.12, delayTime: 0.28, feedback: 0.28, drive: 0 },
    version: 1,
  };
}

export function saveLocal(project) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
}

export function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return { ...defaultProject(), ...JSON.parse(raw) };
  } catch {
    return null;
  }
}

export function exportJSON(project) {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = (project.name || "volt-session").replace(/\s+/g, "-").toLowerCase() + ".volt.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function importJSON(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  return { ...defaultProject(), ...data };
}

/** Seed a fun starter pattern */
export function seedDemo(project) {
  const p0 = project.patterns[0];
  // kick on 1,5,9,13
  [0, 4, 8, 12].forEach((i) => (p0.drums[0][i] = 1));
  // snare 5,13
  [4, 12].forEach((i) => (p0.drums[1][i] = 1));
  // hats
  for (let i = 0; i < 16; i++) p0.drums[2][i] = i % 2 === 0 ? 1 : 0;
  p0.drums[3][14] = 1;
  // clap accents
  p0.drums[5][4] = 2;
  p0.drums[5][12] = 2;

  // simple melody on row for A3 / C4 etc — rows are high=top
  // row 0 = highest note in grid; we map later
  const notes = [
    [16, 0],
    [16, 4],
    [14, 8],
    [12, 12],
    [16, 16],
    [19, 20],
    [16, 24],
    [14, 28],
  ];
  notes.forEach(([row, step]) => {
    if (p0.melody[row]) p0.melody[row][step] = 1;
  });
  return project;
}
