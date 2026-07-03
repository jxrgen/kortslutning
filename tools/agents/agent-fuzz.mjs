// AGENT 2 — fuzzer: 1000 tilfældige spil med dybe invarianter efter hver handling
import { E, fresh } from "./engine.mjs";
const rnd = n => Math.floor(Math.random() * n);
const pick = a => a[rnd(a.length)];

let fejl = [];
function invarianter(g, hvor) {
  const uids = new Set();
  for (const s of [0, 1]) {
    const p = g.players[s];
    if (p.cur < 0) fejl.push(hvor + ": negativ energi " + p.cur);
    if (p.stored < 0 || p.stored > E.MAXSTORED) fejl.push(hvor + ": stored " + p.stored);
    if (p.board.length > E.MAXBOARD) fejl.push(hvor + ": board " + p.board.length);
    if (p.hand.length > E.MAXHAND) fejl.push(hvor + ": hand " + p.hand.length);
    if (!Number.isFinite(p.hp)) fejl.push(hvor + ": hp " + p.hp);
    for (const u of p.board) {
      if (uids.has(u.uid)) fejl.push(hvor + ": dublet-uid " + u.uid);
      uids.add(u.uid);
      if (u.atkLeft < 0) fejl.push(hvor + ": atkLeft " + u.atkLeft);
      if (u.dmg < 0) fejl.push(hvor + ": negativ dmg " + u.dmg);
      if (E.effHp(g, s, u) <= 0 && g.status === "igang") fejl.push(hvor + ": død enhed på bræt " + u.id);
    }
  }
  let last = 0;
  for (const e of (g.fx || [])) { if (e.k <= last) fejl.push(hvor + ": fx-k ikke voksende"); last = e.k; }
}

console.log("AGENT 2: fuzzer — 1000 spil");
let done = 0, maxT = 0;
for (let game = 0; game < 1000; game++) {
  const g = fresh(rnd(2));
  let safety = 0;
  while (g.status === "igang" && safety++ < 400) {
    const s = g.active, p = g.players[s];
    for (let k = 0; k < 5 && g.status === "igang"; k++) {
      const playable = p.hand.filter(c => E.canPlay(g, s, c.id));
      if (!playable.length || Math.random() < 0.2) break;
      const c = pick(playable);
      const t = E.targetsForCard(g, s, c.id, null);
      const e = E.playCard(g, s, c.uid, t.need && t.list.length ? pick(t.list) : null);
      if (e) fejl.push("playCard(" + c.id + "): " + e);
      invarianter(g, "efter " + c.id);
    }
    if (g.status === "igang" && !p.heroUsed && p.cur >= 2 && Math.random() < 0.35) {
      const e = E.heroPower(g, s, pick(E.heroTargets(g, s)));
      if (e) fejl.push("heroPower: " + e);
      invarianter(g, "efter heroPower");
    }
    if (g.status === "igang") for (const uid of p.board.map(u => u.uid)) {
      if (g.status !== "igang") break;
      const ts = E.attackTargets(g, s, uid);
      if (ts.length && Math.random() < 0.85) {
        const e = E.unitAttack(g, s, uid, pick(ts));
        if (e) fejl.push("attack: " + e);
        invarianter(g, "efter angreb");
      }
    }
    if (g.status !== "igang") break;
    E.endTurn(g, s);
    invarianter(g, "efter endTurn");
    if (fejl.length > 20) break;
  }
  if (g.status === "slut") done++;
  maxT = Math.max(maxT, g.turn);
  if (fejl.length > 20) break;
}
console.log("  spil afsluttet:", done, "· længste:", maxT, "ture");
if (fejl.length) {
  console.log("AGENT 2: " + fejl.length + " FEJL:");
  [...new Set(fejl)].slice(0, 12).forEach(f => console.log("  ✗", f));
  process.exit(1);
}
console.log("AGENT 2: ingen invariant-brud ✓");
