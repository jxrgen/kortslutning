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

writeFileSync("./_m.jsx", readFileSync("kortslutning.jsx", "utf8") + "\nexport { GameView };\n");
execSync("npx esbuild _m.jsx --loader:.jsx=jsx --jsx=automatic --format=esm --bundle --external:react --external:react/jsx-runtime --outfile=./_m.mjs");
const M = await import(process.cwd() + "/_m.mjs");
const React = (await import("react")).default;
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");

const src = readFileSync("kortslutning.jsx", "utf8");
const end = src.indexOf("/* __ENGINE_END__ */");
let code = src.slice(0, end).split("\n").filter(l => !l.startsWith("import ")).join("\n") + ";return{mkState,autoDeck,summon,endTurn};";
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

execSync("rm -f ./_m.jsx ./_m.mjs");
if (failed) { console.log("MOUNT-TEST: " + failed + " FEJL"); process.exit(1); }
console.log("MOUNT-TEST OK ✓");
process.exit(0);
