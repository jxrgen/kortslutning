// Mount-test: renderer komponenter i et rigtigt (jsdom) DOM så useEffect KØRER.
// Fanger runtime-crashes som SSR-røgtesten (renderToString) ikke ser, fordi
// effekter ikke køres ved server-render. Fx en manglende useRef brugt i en effekt.
import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!DOCTYPE html><body><div id='root'></div></body>", { url: "https://localhost/", pretendToBeVisual: true });
global.window = dom.window; global.document = dom.window.document;
global.CSS = dom.window.CSS || { supports: () => false };
global.HTMLElement = dom.window.HTMLElement;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
dom.window.storage = { get: async () => null, set: async () => ({}), delete: async () => ({}), list: async () => ({ keys: [] }) };
dom.window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
dom.window.AudioContext = class {
  constructor() { this.state = "running"; this.currentTime = 0; this.destination = {}; }
  createGain() { return { gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
  createOscillator() { return { type: "", frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, start() {}, stop() {} }; }
  createBuffer() { return { getChannelData: () => new Float32Array(10) }; }
  createBufferSource() { return { buffer: null, connect() {}, start() {}, stop() {} }; }
  createBiquadFilter() { return { type: "", frequency: { value: 0 }, connect() {} }; }
  resume() {}
};

writeFileSync("./_m.jsx", readFileSync("kortslutning.jsx", "utf8") + "\nexport { GameView, DeckBuilder, COLL, RunView, RunClassPick, runNyt, runTilfoej, CardInfoPanel, CARDS };\n");
execSync("npx esbuild _m.jsx --loader:.jsx=jsx --jsx=automatic --format=esm --bundle --external:react --external:react/jsx-runtime --outfile=./_m.mjs");
const M = await import(process.cwd() + "/_m.mjs");
const React = (await import("react")).default;
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");

const src = readFileSync("kortslutning.jsx", "utf8");
const end = src.indexOf("/* __ENGINE_END__ */");
let code = src.slice(0, end).split("\n").filter(l => !l.startsWith("import ")).join("\n") + ";return{mkState,autoDeck,summon,endTurn,playCard,botAction};";
const E = new Function(code)();

function baseProps(g, extra) {
  return { g, seat: 0, myTurn: true, act: () => null, mode: "lokal", pos: { current: {} },
    onLeave: () => {}, onConcede: () => {}, onRematch: () => {}, onDelete: () => {}, ...extra };
}

let failed = 0;
async function mount(name, props) {
  const el = document.createElement("div");
  const root = createRoot(el);
  try {
    await act(async () => { root.render(React.createElement(M.GameView, props)); });
    // afmontér for at trigge cleanup-effekter (fx fjern listeners, stop musik)
    await act(async () => { root.unmount(); });
    console.log("mount OK: " + name);
  } catch (e) {
    failed++;
    console.log("✗ MOUNT-CRASH (" + name + "): " + e.message);
  }
}

// 1) almindeligt spil, min tur
{
  const g = E.mkState({ mode: "lokal", names: ["A", "B"], cids: ["a", "b"], decks: [E.autoDeck("tek"), E.autoDeck("tek")], classes: ["tek", "tek"], starter: 0 });
  await mount("GameView (min tur)", baseProps(g));
}
// 2) modstanderens tur
{
  const g = E.mkState({ mode: "lokal", names: ["A", "B"], cids: ["a", "b"], decks: [E.autoDeck("tek"), E.autoDeck("tek")], classes: ["tek", "tek"], starter: 1 });
  await mount("GameView (modstanderens tur)", baseProps(g, { myTurn: false }));
}
// 3) enheder på brættet med keywords
{
  const g = E.mkState({ mode: "lokal", names: ["A", "B"], cids: ["a", "b"], decks: [E.autoDeck("tek"), E.autoDeck("tek")], classes: ["tek", "tek"], starter: 0 });
  E.summon(g, 0, "u_modstand"); E.summon(g, 1, "u_spole");
  await mount("GameView (enheder på bræt)", baseProps(g));
}
// 4) spil slut — sejr (VictoryFX + win-lyd)
{
  const g = E.mkState({ mode: "lokal", names: ["A", "B"], cids: ["a", "b"], decks: [E.autoDeck("tek"), E.autoDeck("tek")], classes: ["tek", "tek"], starter: 0 });
  g.status = "slut"; g.winner = 0;
  await mount("GameView (sejr)", baseProps(g, { myTurn: false }));
}
// 5) spil slut — nederlag (BrokenNeon + lose-lyd)
{
  const g = E.mkState({ mode: "lokal", names: ["A", "B"], cids: ["a", "b"], decks: [E.autoDeck("tek"), E.autoDeck("tek")], classes: ["tek", "tek"], starter: 0 });
  g.status = "slut"; g.winner = 1;
  await mount("GameView (nederlag)", baseProps(g, { myTurn: false }));
}
// 6) online-spil med chat
{
  const g = E.mkState({ mode: "online", code: "TEST", names: ["A", "B"], cids: ["a", "b"], decks: [E.autoDeck("tek"), E.autoDeck("tek")], classes: ["tek", "tek"], starter: 0 });
  await mount("GameView (online + chat)", baseProps(g, { mode: "online", kode: "TEST" }));
}
// 7) historik-skinne med spillede kort + tastetal-cirkler i hånden
{
  const g = E.mkState({ mode: "lokal", names: ["A", "B"], cids: ["a", "b"], decks: [E.autoDeck("tek"), E.autoDeck("tek")], classes: ["tek", "tek"], starter: 0 });
  for (let t = 0; t < 14 && g.status === "igang"; t++) { while (E.botAction(g, g.active)) {} E.endTurn(g, g.active); }
  if (!g.hist || !g.hist.length) { failed++; console.log("✗ hist er tom efter 14 ture"); }
  const el = document.createElement("div");
  const root = createRoot(el);
  try {
    await act(async () => { root.render(React.createElement(M.GameView, baseProps(g))); });
    const html = el.innerHTML;
    const hkort = (html.match(/class="hkort/g) || []).length;
    const hotkeys = (html.match(/class="hotkey"/g) || []).length;
    if (!html.includes("histrail")) { failed++; console.log("✗ historik-skinnen mangler"); }
    if (hkort === 0) { failed++; console.log("✗ ingen historik-kort renderet"); }
    if (hotkeys !== g.players[0].hand.length) { failed++; console.log("✗ tastetal: " + hotkeys + " badges vs " + g.players[0].hand.length + " kort"); }
    await act(async () => { root.unmount(); });
    console.log("mount OK: GameView (historik " + hkort + " kort · " + hotkeys + " tastetal)");
  } catch (e) { failed++; console.log("✗ MOUNT-CRASH (historik): " + e.message); }
}

// 8) deckbuilder: gitter i begge faner, gruppering, klik virker, "My Deck"
{
  const el = document.createElement("div");
  const root = createRoot(el);
  try {
    await act(async () => {
      root.render(React.createElement(M.DeckBuilder, { decks: [], gemDecks() {}, onBack() {}, flash() {}, unlocked: new Set(M.COLL) }));
    });
    const bib = el.querySelectorAll(".bibkort").length;
    if (bib < 50) { failed++; console.log("✗ biblioteket viser kun " + bib + " kort"); }
    if (el.querySelectorAll(".fanepane").length !== 2) { failed++; console.log("✗ begge faner skal være monteret (billigt tab-skift)"); }
    if (!el.querySelector(".kosthd")) { failed++; console.log("✗ kortene er ikke grupperet efter energipris"); }
    const faner = [...el.querySelectorAll(".fane")].map(b => b.textContent);
    if (!faner.some(t => t.startsWith("My Deck"))) { failed++; console.log("✗ fanen hedder ikke 'My Deck': " + faner.join(" | ")); }
    // hover-panelet skal være det lette CardInfoPanel (få SVG'er), ikke det tunge StorKort
    // som browseren måtte genparse ved hver hover. Vi renderer panelet direkte og tæller.
    {
      const pe = document.createElement("div");
      const pr = createRoot(pe);
      await act(async () => { pr.render(React.createElement(M.CardInfoPanel, { id: M.COLL.find(x => M.CARDS[x].t === "unit") })); });
      const svg = pe.querySelectorAll("svg path, svg rect, svg line").length;
      if (pe.querySelector(".storart")) { failed++; console.log("✗ hover-panel bruger stadig tungt StorKort-art"); }
      if (svg > 12) { failed++; console.log("✗ hover-panel har " + svg + " SVG-elementer — for tungt til hover"); }
      if (!pe.querySelector(".hi-n")) { failed++; console.log("✗ hover-panel viser ikke kortinfo"); }
      await act(async () => { pr.unmount(); });
    }
    // matchMedia er stubbet til matches:false => touch-vej: klik åbner detaljearket
    const kort = el.querySelector(".bibkort .mkort");
    await act(async () => { kort.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
    if (!el.querySelector(".ark") && !el.querySelector(".idmark")) { failed++; console.log("✗ klik på et kort gjorde ingenting"); }
    await act(async () => { root.unmount(); });
    console.log("mount OK: DeckBuilder (" + bib + " kort i gitter, 2 faner monteret)");
  } catch (e) { failed++; console.log("✗ MOUNT-CRASH (DeckBuilder): " + e.message); }
}

// 9) Meltdown Run: klassevalg + alle faser renderer og reagerer
{
  const el = document.createElement("div");
  const root = createRoot(el);
  try {
    // klassevalg
    let valgt = null;
    await act(async () => { root.render(React.createElement(M.RunClassPick, { onPick: (c) => { valgt = c; }, onBack() {} })); });
    if (el.querySelectorAll(".rcls-card").length !== 3) { failed++; console.log("✗ run-klassevalg viser ikke 3 klasser"); }
    await act(async () => { el.querySelector(".rcls-card").dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
    if (!valgt) { failed++; console.log("✗ klik på klasse gav intet"); }

    const run0 = M.runNyt("tek");
    // fase "kort" (klar-til-kamp)
    let startet = false;
    await act(async () => { root.render(React.createElement(M.RunView, { run: run0, fase: "kort", navn: "T", onStartBattle: () => { startet = true; }, onPickCard() {}, onPickUpgrade() {}, onLeave() {}, onNewRun() {} })); });
    if (!el.querySelector(".rmap")) { failed++; console.log("✗ run-kort (map) mangler"); }
    if (el.querySelectorAll(".rnode").length !== 12) { failed++; console.log("✗ map har ikke 12 noder"); }
    if (!el.querySelector(".bibkort")) { failed++; console.log("✗ run viser ikke deck-grid"); }
    await act(async () => { el.querySelector(".knap.big").dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
    if (!startet) { failed++; console.log("✗ 'Enter battle' udløste ikke kamp"); }

    // fase "belon"
    let valgtKort = null;
    await act(async () => { root.render(React.createElement(M.RunView, { run: run0, fase: "belon", navn: "T", onStartBattle() {}, onPickCard: (id) => { valgtKort = id; }, onPickUpgrade() {}, onLeave() {}, onNewRun() {} })); });
    const rcards = el.querySelectorAll(".rcard");
    if (rcards.length < 2) { failed++; console.log("✗ belønning viser <2 kort"); }
    await act(async () => { rcards[0].dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
    await act(async () => { el.querySelector(".knap.cu.big").dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
    if (!valgtKort) { failed++; console.log("✗ kunne ikke vælge belønningskort"); }

    // fase "opgrad" (kræver et par upgrades i puljen)
    let valgtUpg = null;
    const runE = M.runNyt("tek");
    await act(async () => { root.render(React.createElement(M.RunView, { run: runE, fase: "opgrad", navn: "T", onStartBattle() {}, onPickCard() {}, onPickUpgrade: (u) => { valgtUpg = u; }, onLeave() {}, onNewRun() {} })); });
    const ucards = el.querySelectorAll(".ucard");
    if (ucards.length < 2) { failed++; console.log("✗ opgraderingsvalg viser <2 kort"); }
    await act(async () => { ucards[0].dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
    await act(async () => { el.querySelector(".knap.cu.big").dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
    if (!valgtUpg) { failed++; console.log("✗ kunne ikke vælge opgradering"); }

    // sejr + tabt renderer uden crash
    for (const f of ["sejr", "tabt"]) {
      await act(async () => { root.render(React.createElement(M.RunView, { run: { ...run0, node: f === "sejr" ? 12 : 4 }, fase: f, navn: "T", onStartBattle() {}, onPickCard() {}, onPickUpgrade() {}, onLeave() {}, onNewRun() {} })); });
      if (!el.querySelector(".rvhead")) { failed++; console.log("✗ run-fase " + f + " renderer ikke"); }
    }
    await act(async () => { root.unmount(); });
    console.log("mount OK: Meltdown Run (klassevalg + kort/belon/opgrad/sejr/tabt)");
  } catch (e) { failed++; console.log("✗ MOUNT-CRASH (run): " + e.message); }
}

execSync("rm -f ./_m.jsx ./_m.mjs");
if (failed) { console.log("MOUNT-TEST: " + failed + " FEJL"); process.exit(1); }
console.log("MOUNT-TEST OK ✓");
process.exit(0);
