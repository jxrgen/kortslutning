// Fælles headless motor-loader for testagenterne
import { readFileSync } from "fs";
const src = readFileSync("kortslutning.jsx", "utf8");
const end = src.indexOf("/* __ENGINE_END__ */");
let code = src.slice(0, end).split("\n").filter(l => !l.startsWith("import ")).join("\n");
code += `
;return { CARDS, COLL, KWINFO, CLASSES, mkState, playCard, unitAttack, heroPower, endTurn,
  targetsForCard, attackTargets, heroTargets, canPlay, validateDeck, autoDeck, clone,
  botAction, refUnit, effAtk, effHp, effMax, hasKw, kws, summon, draw, dmg, sweep,
  MAXBOARD, MAXHAND, DECKSIZE, MAXSTORED };
`;
export const E = new Function(code)();
export function fresh(starter = 0) {
  return E.mkState({ mode: "local", names: ["P1", "P2"], cids: ["a", "b"],
    decks: [E.autoDeck(), E.autoDeck()], starter });
}
// tving et kort på hånden og giv energi
export function give(g, s, id, energy = 20) {
  g.players[s].cur = energy;
  const c = { uid: "gx" + (g.n++), id };
  g.players[s].hand.push(c);
  return c.uid;
}
// læg en enhed direkte på brættet (via motorens summon for korrekt init)
export function put(g, s, id) {
  const u = E.summon(g, s, id);
  if (u) { u.jp = false; u.atkLeft = E.hasKw(g, s, u, "dob") ? 2 : 1; }
  return u;
}
export let fails = 0;
export function check(navn, ok, detalje) {
  if (ok) { console.log("  ✓", navn); }
  else { fails++; console.log("  ✗ FEJL:", navn, detalje !== undefined ? "→ " + detalje : ""); }
}
