import { readFileSync } from "fs";

const src = readFileSync("kortslutning.jsx", "utf8");
const end = src.indexOf("/* __ENGINE_END__ */");
if (end < 0) throw new Error("mangler ENGINE_END-markør");
let code = src.slice(0, end).split("\n").filter(l => !l.startsWith("import ")).join("\n");
code += `
;return { CARDS, COLL, mkState, playCard, unitAttack, heroPower, endTurn,
  targetsForCard, attackTargets, heroTargets, canPlay, validateDeck, autoDeck, clone };
`;
const E = new Function(code)();

// --- 1) antal kort ---
console.log("Samlingskort:", E.COLL.length);
if (E.COLL.length !== 100) throw new Error("Forventede 100 kort, fandt " + E.COLL.length);
const leg = E.COLL.filter(id => E.CARDS[id].r === "L").length;
console.log("Legendariske:", leg);

// --- 2) deck-validering ---
const d = E.autoDeck();
const err = E.validateDeck(d);
if (err) throw new Error("autoDeck fejler validering: " + err);
console.log("autoDeck OK");

// --- helper: frisk state ---
function fresh() {
  return E.mkState({
    mode: "lokal", names: ["P1", "P2"], cids: ["a", "b"],
    decks: [E.autoDeck(), E.autoDeck()], starter: 0,
  });
}

// --- 3) spil hvert kort mindst én gang ---
let played = 0;
for (const id of E.COLL) {
  const g = fresh();
  const p = g.players[0];
  p.cur = 20;
  // fyld lidt på brættet til mål/synergi (via engine-summon gennem playCard er bøvlet; snyd direkte)
  const mk = (side, cid) => {
    if (g.players[side].board.length >= 6) return;
    g.players[side].board.push({ uid: "t" + side + g.players[side].board.length + cid,
      id: cid, a: E.CARDS[cid].a, hM: E.CARDS[cid].h, dmg: 0, akw: [], sil: false,
      sh: false, st: (E.CARDS[cid].kw||[]).includes("skjul"), jp: false,
      atkLeft: 1 });
  };
  mk(0, "u_spole"); mk(0, "u_vagtbot");
  mk(1, "u_spole"); mk(1, "u_glitch"); mk(1, "u_spejder");
  p.hand = [{ uid: "hx", id }];
  const t = E.targetsForCard(g, 0, id, null);
  const tref = t.need && t.list.length ? t.list[0] : null;
  const e = E.playCard(g, 0, "hx", tref);
  if (e && !(E.CARDS[id].t === "program" && t.need && !t.list.length)) {
    throw new Error("Kort fejlede: " + id + " → " + e);
  }
  // kør en tur-cyklus for end/start-triggers
  if (g.status === "igang") { E.endTurn(g, g.active); if (g.status === "igang") E.endTurn(g, g.active); }
  played++;
}
console.log("Alle", played, "kort spillet uden fejl");

// --- 4) tilfældige hele spil ---
const rnd = n => Math.floor(Math.random() * n);
const pick = a => a[rnd(a.length)];
let fin = 0, maxT = 0;
for (let game = 0; game < 300; game++) {
  const g = fresh();
  let safety = 0;
  while (g.status === "igang" && safety++ < 400) {
    const s = g.active, p = g.players[s];
    // spil op til 4 tilfældige kort
    for (let k = 0; k < 4 && g.status === "igang"; k++) {
      const playable = p.hand.filter(c => E.canPlay(g, s, c.id));
      if (!playable.length || Math.random() < 0.25) break;
      const c = pick(playable);
      const t = E.targetsForCard(g, s, c.id, null);
      const tref = t.need && t.list.length ? pick(t.list) : null;
      const e = E.playCard(g, s, c.uid, tref);
      if (e) throw new Error("playCard-fejl: " + c.id + " → " + e);
    }
    // heltekraft nogle gange
    if (g.status === "igang" && !p.heroUsed && p.cur >= 2 && Math.random() < 0.4) {
      const e = E.heroPower(g, s, pick(E.heroTargets(g, s)));
      if (e) throw new Error("heroPower-fejl: " + e);
    }
    // angrib med alt der kan
    if (g.status === "igang") {
      for (const uid of p.board.map(u => u.uid)) {
        if (g.status !== "igang") break;
        const ts = E.attackTargets(g, s, uid);
        if (ts.length && Math.random() < 0.9) {
          const e = E.unitAttack(g, s, uid, pick(ts));
          if (e) throw new Error("attack-fejl: " + e);
        }
      }
    }
    if (g.status !== "igang") break;
    const e = E.endTurn(g, s);
    if (e) throw new Error("endTurn-fejl: " + e);
    // invarianter
    for (const q of g.players) {
      if (q.board.length > 6) throw new Error("bræt > 6");
      if (q.hand.length > 9) throw new Error("hånd > 9");
      if (typeof q.hp !== "number" || Number.isNaN(q.hp)) throw new Error("hp NaN");
      if (q.cur < 0) throw new Error("negativ energi: " + q.cur);
    }
  }
  if (g.status === "slut") fin++;
  maxT = Math.max(maxT, g.turn);
}
console.log("Simulerede spil færdige:", fin, "/300 · længste spil:", maxT, "ture");
console.log("ALT OK ✓");
