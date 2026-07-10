// Henter ikoner fra game-icons.net (CC BY 3.0 / CC0) og injicerer dem som inline
// SVG-paths i kortslutning.jsx mellem __ICONS_START__ og __ICONS_END__.
//
// Kilden er git-repoet game-icons/icons. Ikonerne er 512x512 med en sort
// baggrundsrektangel + hvid figur; vi smider baggrunden væk og lader figuren
// arve currentColor, så ikonet følger teksten.
//
//   node tools/gen-icons.mjs            (bruger ./.iconsrc, kloner hvis den mangler)
//
// Licens: hvert ikon krediteres sin ophavsmand i ICONS-CREDITS.md, som denne
// fil også genererer. Slet ikke krediteringen — CC BY 3.0 kræver den.

import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const SRC = process.env.ICONS_SRC || ".iconsrc";
const REPO = "https://github.com/game-icons/icons.git";

// slot → "forfattermappe/filnavn". Slotnavnet bruges i koden som <Ico n="bolt"/>.
const MANIFEST = {
  // ressourcer & statistik
  bolt:      "lorc/power-lightning",
  heart:     "skoll/hearts",
  sword:     "lorc/crossed-swords",
  skull:     "lorc/skull-crossed-bones",
  battery:   "sbed/battery-pack",
  signal:    "lorc/radar-sweep",
  sparkle:   "delapouite/sparkles",
  boom:      "lorc/spiky-explosion",
  shield:    "lorc/bordered-shield",
  // sjældenhed
  legendary: "delapouite/star-formation",
  rare:      "lorc/crystal-shine",
  // spilflow
  play:      "guard13007/play-button",
  cross:     "sbed/cancel",
  trophy:    "lorc/trophy",
  dice:      "delapouite/perspective-dice-six-faces-random",
  flag:      "delapouite/truce",
  hole:      "delapouite/hole",
  fire:      "carl-olsen/flame",
  cycle:     "lorc/cycle",
  warning:   "lorc/hazard-sign",
  ninja:     "lorc/ninja-mask",
  target:    "lorc/target-arrows",
  // menu & UI
  scroll:    "lorc/scroll-unfurled",
  cards:     "quoting/card-play",
  deck:      "faithtoken/card-draw",
  gear:      "lorc/gears",
  chat:      "skoll/talk",
  send:      "delapouite/paper-plane",
  lock:      "lorc/padlock",
  unlock:    "delapouite/padlock-open",
  save:      "delapouite/save-arrow",
  book:      "lorc/open-book",
  globe:     "lorc/globe",
  folder:    "delapouite/archive-register",
  gamepad:   "skoll/console-controller",
  graduate:  "delapouite/graduate-cap",
  arrow:     "delapouite/plain-arrow",
  hand:      "lorc/hand",
  // aktører & klasser
  robot:     "delapouite/robot-antennas",
  tinker:    "lorc/tinker",
  hoodie:    "delapouite/hoodie",
  heat:      "lorc/heat-haze",
  // heltekræfter
  solder:    "caro-asercion/soldering-iron",
  bug:       "delapouite/ant",
  wrench:    "lorc/spanner",
};

// forfattermappe → læsbart navn + link (fra repoets license.txt)
const AUTHORS = {
  lorc: ["Lorc", "https://lorcblog.blogspot.com"],
  delapouite: ["Delapouite", "https://delapouite.com"],
  sbed: ["Sbed", "https://opengameart.org/content/95-game-icons"],
  "carl-olsen": ["Carl Olsen", "https://twitter.com/unstoppableCarl"],
  skoll: ["Skoll", "https://game-icons.net"],
  quoting: ["Quoting", "https://game-icons.net"],
  faithtoken: ["Faithtoken", "https://fungustoken.deviantart.com"],
  guard13007: ["Guard13007", "https://guard13007.com"],
  "caro-asercion": ["Caro Asercion", "https://game-icons.net"],
};

function ensureSource() {
  if (existsSync(join(SRC, "license.txt"))) return;
  console.log("Kloner game-icons (engangs, ~22 MB) …");
  execSync(`git clone -q --depth 1 ${REPO} ${SRC}`, { stdio: "inherit" });
}

// game-icons-filerne er: <svg viewBox="0 0 512 512"><path d="M0 0h512v512H0z"/><path fill="#fff" d="…"/></svg>
// Første path er baggrunden. Vi beholder resten og fjerner fill="#fff".
function extract(file) {
  const raw = readFileSync(file, "utf8");
  const paths = [...raw.matchAll(/<path\b[^>]*\/>/g)].map((m) => m[0]);
  if (!paths.length) throw new Error("ingen <path> i " + file);
  const body = paths
    .filter((p) => !/d="M0 0h512v512H0z"/.test(p))
    .map((p) => p.replace(/\s*fill="#fff"/g, "").replace(/\s+/g, " "))
    .join("");
  if (!body) throw new Error("kun baggrund i " + file);
  return body;
}

ensureSource();

const out = [];
const used = new Map(); // forfattermappe → Set(ikonnavne)
let bytes = 0;
for (const [slot, path] of Object.entries(MANIFEST)) {
  const [author, name] = path.split("/");
  const file = join(SRC, author, name + ".svg");
  if (!existsSync(file)) throw new Error("mangler: " + file);
  if (!AUTHORS[author]) throw new Error("ukendt forfatter: " + author + " (tilføj i AUTHORS)");
  const body = extract(file);
  bytes += body.length;
  out.push(`  ${slot}: '${body.replace(/'/g, "\\'")}',`);
  if (!used.has(author)) used.set(author, new Set());
  used.get(author).add(name);
}

const credits = [...used]
  .sort()
  .map(([a]) => `  {n:"${AUTHORS[a][0]}", u:"${AUTHORS[a][1]}"},`)
  .join("\n");

const block =
  "/* __ICONS_START__ */\n" +
  "// GENERERET af tools/gen-icons.mjs — rediger ikke i hånden.\n" +
  "// Ikoner fra game-icons.net, CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/).\n" +
  "// Ændret: baggrundspladen fjernet, figuren arver currentColor. Se ICONS-CREDITS.md.\n" +
  "// Krediteringen er et licenskrav — fjern ikke ICON_CREDITS eller kreditsektionen i Rules.\n" +
  "const ICON_CREDITS = [\n" +
  credits +
  "\n];\n" +
  "const ICONS = {\n" +
  out.join("\n") +
  "\n};\n" +
  "/* __ICONS_END__ */";

const target = "kortslutning.jsx";
const src = readFileSync(target, "utf8");
const re = /\/\* __ICONS_START__ \*\/[\s\S]*?\/\* __ICONS_END__ \*\//;
if (!re.test(src)) throw new Error("markørerne __ICONS_START__/__ICONS_END__ mangler i " + target);
writeFileSync(target, src.replace(re, block));

// ---- kreditering (CC BY 3.0 kræver "Icons made by {author}") ----
const lines = [
  "# Icon credits",
  "",
  "The interface icons in Cardware Crash come from [game-icons.net](https://game-icons.net)",
  "and are used under the [Creative Commons Attribution 3.0 Unported licence (CC BY 3.0)](https://creativecommons.org/licenses/by/3.0/).",
  "",
  "The icons have been modified: the background plate was removed and the artwork",
  "recoloured to inherit the surrounding text colour.",
  "",
  "Icons made by:",
  "",
];
for (const [author, names] of [...used].sort()) {
  const [n, url] = AUTHORS[author];
  lines.push(`- **${n}** (${url}) — ${[...names].sort().join(", ")}`);
}
lines.push(
  "",
  "The card artwork, keyword badges and hero-power icons are original work and are",
  "not part of the game-icons.net set.",
  ""
);
writeFileSync("ICONS-CREDITS.md", lines.join("\n"));

// læsbar liste til kreditskærmen i spillet
mkdirSync("tools", { recursive: true });
console.log(
  `Ikoner OK → ${Object.keys(MANIFEST).length} slots, ${(bytes / 1024).toFixed(1)} kB path-data, ` +
    `${used.size} forfattere. ICONS-CREDITS.md skrevet.`
);
