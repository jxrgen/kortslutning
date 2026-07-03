import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import { pathToFileURL } from "url";
import { resolve } from "path";

// 1) lav test-entry med ekstra exports af de interne komponenter
const src = readFileSync("kortslutning.jsx", "utf8");
writeFileSync("_entry.jsx", src + `
export { GameView, DeckBuilder, Regler, StorKort, MiniCard, Pips, UnitTile,
  mkState, playCard, unitAttack, attackTargets, endTurn, autoDeck, CARDS, COLL, clone };
`);
execSync("npx esbuild _entry.jsx --loader:.jsx=jsx --jsx=automatic --format=esm --bundle --external:react --external:react/jsx-runtime --outfile=_entry.mjs", { stdio: "inherit" });

const M = await import(pathToFileURL(resolve("_entry.mjs")).href);
const React = (await import("react")).default;
const { renderToString } = await import("react-dom/server");
const h = React.createElement;

function ok(name, el) {
  const out = renderToString(el);
  if (!out || out.length < 10) throw new Error(name + ": tomt output");
  console.log("render OK:", name, "(" + out.length + " tegn)");
}

// 2) App (viser indlæsningsskærm — mount-effekt kører ikke i SSR)
ok("App", h(M.default));

// 3) rigtig spilstate med lidt handling
const g = M.mkState({ mode: "lokal", names: ["Alice", "Bo"], cids: ["a", "b"],
  decks: [M.autoDeck(), M.autoDeck()], starter: 0 });
// giv aktiv spiller energi + spil nogle enheder over et par ture
for (let t = 0; t < 6; t++) {
  const s = g.active, p = g.players[s];
  p.cur = 10;
  for (const c of p.hand.slice()) {
    if (M.CARDS[c.id].t !== "unit" || M.CARDS[c.id].c > 10) continue;
    if (p.board.length >= 6) break;
    const e = M.playCard(g, s, c.uid, null);
    if (e) break;
  }
  // et angreb hvis muligt
  for (const u of p.board) {
    const ts = M.attackTargets(g, s, u.uid);
    if (ts.length) { M.unitAttack(g, s, u.uid, ts[0]); break; }
  }
  if (g.status !== "igang") break;
  M.endTurn(g, s);
}

// læg enheder med alle keywords på brættet (direkte) så ikon-koden rammes
const kwCards = {};
for (const id of M.COLL) {
  const d = M.CARDS[id];
  if (d.t !== "unit" || !d.kw) continue;
  for (const k of d.kw) if (!kwCards[k]) kwCards[k] = id;
}
let n = 0;
for (const k in kwCards) {
  const side = n % 2, b = g.players[side].board;
  if (b.length >= 6) continue;
  const id = kwCards[k], d = M.CARDS[id];
  b.push({ uid: "kw" + n++, id, a: d.a, hM: d.h, dmg: k === "iso" ? 0 : 1,
    akw: [], sil: k === "dob", sh: k === "iso", st: k === "skjul", jp: side === 0, atkLeft: 1 });
}
const noop = () => {};
ok("GameView (i gang, min tur)", h(M.GameView, { g, seat: 0, myTurn: true, act: noop,
  mode: "lokal", onLeave: noop, onConcede: noop, onRematch: noop, onDelete: noop }));
ok("GameView (modstanderens tur)", h(M.GameView, { g, seat: 1, myTurn: false, act: noop,
  mode: "online", onLeave: noop, onConcede: noop, onRematch: noop, onDelete: noop }));

// 4) slut-tilstande
const g2 = M.clone(g); g2.status = "slut"; g2.winner = 0; g2.rematch = [false, true];
ok("GameView (sejr, online, modstander klar til revanche)", h(M.GameView, { g: g2, seat: 0,
  myTurn: false, act: noop, mode: "online", onLeave: noop, onConcede: noop, onRematch: noop, onDelete: noop }));
const g3 = M.clone(g); g3.status = "slut"; g3.winner = 2; g3.rematch = [false, false];
ok("GameView (uafgjort, lokal)", h(M.GameView, { g: g3, seat: 1, myTurn: false, act: noop,
  mode: "lokal", onLeave: noop, onConcede: noop, onRematch: noop, onDelete: noop }));

// 5) øvrige skærme
ok("DeckBuilder", h(M.DeckBuilder, { decks: [{ name: "Test", cards: M.autoDeck() }],
  gemDecks: noop, onBack: noop, flash: noop }));
ok("Regler", h(M.Regler, { onBack: noop }));
const u0 = g.players[0].board[0];
if (u0) ok("StorKort (levende enhed)", h(M.StorKort, { id: u0.id, unitInfo: { s: 0, uid: u0.uid }, g }));
ok("StorKort (legendarisk)", h(M.StorKort, { id: M.COLL.find(i => M.CARDS[i].r === "L") }));

console.log("UI-RØGTEST OK ✓");
