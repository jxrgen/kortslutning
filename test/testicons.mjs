// Vogter over ikon-systemet:
//  1) hvert §token§ i kildekoden har et tilsvarende ikon (eller keyword-badge)
//  2) hvert <Ico n="…"/> peger på et slot der findes
//  3) der er ingen emojis tilbage i kode der rammer skærmen
//  4) krediteringen findes stadig — CC BY 3.0 kræver den
import { readFileSync } from "fs";

const src = readFileSync("kortslutning.jsx", "utf8");
let fejl = 0;
const bom = (m) => { fejl++; console.log("✗ " + m); };

// ---- 1) ikon-slots ----
const blok = src.match(/\/\* __ICONS_START__ \*\/([\s\S]*?)\/\* __ICONS_END__ \*\//);
if (!blok) bom("ICONS-blokken mangler");
const slots = new Set([...blok[1].matchAll(/^ {2}(\w+): '/gm)].map((m) => m[1]));
if (slots.size < 20) bom("kun " + slots.size + " ikon-slots — generatoren har ikke kørt?");

const kwIds = new Set([...src.matchAll(/^const KWSVG = \{|^ {2}(\w+):\s*\{\s*c:/gm)].map((m) => m[1]).filter(Boolean));

// ---- 2) <Ico n="x"/> med literal navn ----
for (const m of src.matchAll(/<Ico n="(\w+)"/g)) {
  if (!slots.has(m[1])) bom(`<Ico n="${m[1]}"/> findes ikke i ICONS`);
}
// ---- 3) §token§ i strenge ----
for (const m of src.matchAll(/§(kw_)?(\w+)§/g)) {
  if (m[1]) { if (!kwIds.size) continue; }              // keyword-badges valideres løst
  else if (!slots.has(m[2])) bom(`§${m[2]}§ findes ikke i ICONS`);
}
// ---- 4) ico:"x" på klasser og heltekræfter ----
for (const m of src.matchAll(/\bico:"(\w+)"/g)) {
  if (!slots.has(m[1])) bom(`ico:"${m[1]}" findes ikke i ICONS`);
}

// ---- 5) ingen emoji i det der renderes ----
// (danske kommentarer og pilene ← → ␣ · er ikke emoji og er tilladt)
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
src.split("\n").forEach((l, i) => {
  const t = l.trim();
  if (t.startsWith("//") || t.startsWith("/*") || t.startsWith("*")) return;
  const m = l.match(EMOJI);
  if (m) bom(`linje ${i + 1}: emoji ${JSON.stringify(m[0])} tilbage → ${t.slice(0, 60)}`);
});

// ---- 6) kreditering (licenskrav) ----
if (!/const ICON_CREDITS = \[\s*\{n:/.test(src)) bom("ICON_CREDITS mangler");
if (!/game-icons\.net/.test(src)) bom("game-icons.net nævnes ikke i spillet");
if (!/creativecommons\.org\/licenses\/by\/3\.0/.test(src)) bom("CC BY 3.0-link mangler i kreditsektionen");
for (const n of ["Lorc", "Delapouite"]) {
  if (!src.includes(`{n:"${n}"`)) bom(`forfatter ${n} mangler i ICON_CREDITS`);
}

if (fejl) { console.log(`\nIKON-TEST FEJLEDE (${fejl})`); process.exit(1); }
console.log(`IKON-TEST OK ✓ (${slots.size} slots, kreditering til stede)`);
