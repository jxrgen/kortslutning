// AGENT 5 — fuld kortdækning: spiller HVERT collectible kort i en kontrolleret
// situation og verificerer at det ændrer spiltilstanden meningsfuldt.
// Ingen hardcodede forventninger pr. kort — i stedet et generisk "skete der noget?"
// fingeraftryk, så nye kort automatisk dækkes uden at tilføje testkode.
import { E, fresh, give, put, check } from "./engine.mjs";

console.log("AGENT 5: fuld kortdækning (" + E.COLL.length + " kort)");

// fingeraftryk af hele tilstanden — ændrer et kort intet af dette, er noget galt
function snap(g) {
  const P = g.players.map(p => ({
    hp: p.hp, cur: p.cur, stored: p.stored, ovlNext: p.ovlNext,
    hand: p.hand.length, deck: p.deck.length, grave: p.grave,
    board: p.board.map(u => u.id + ":" + E.effAtk(g, g.players.indexOf(p), u) + "/" + E.effHp(g, g.players.indexOf(p), u) + ":" + u.dmg + ":" + u.akw.join(",") + ":" + u.sil + ":" + u.sh + ":" + u.st).join("|"),
    bcount: p.board.length,
  }));
  return JSON.stringify(P);
}

// byg en rig testtilstand: begge sider har enheder, energi, kort i deck/hånd
function rig(cls) {
  const g = fresh(0, cls, "tek");
  const me = g.players[0], op = g.players[1];
  me.cur = 99; me.maxE = 99;
  // venlige enheder at buffe/interagere med
  put(g, 0, "u_koleleg");        // 0/5 tank
  put(g, 0, "u_sumobot");        // 3/5 robot
  // fjendtlige enheder at skade/stjæle/bounce
  const foe1 = put(g, 1, "u_spole");   // 2/3
  const foe2 = put(g, 1, "u_kolos");   // 7/7 stor
  foe2.dmg = 2;                        // let skadet (til "destroy damaged" osv.)
  put(g, 1, "u_datamide");             // 1/1 hoj (lav-atk, hackbar)
  // sørg for kort i deck + modstanderhånd
  if (me.deck.length < 5) me.deck.push("u_spole", "s_stod", "u_led", "u_nano", "s_diag");
  give(g, 1, "u_spole"); give(g, 1, "s_stod"); // modstanderhånd til kopi/phishing
  return g;
}

let touched = 0, silent = [];
for (const id of E.COLL) {
  const d = E.CARDS[id];
  const cls = d.cls || "tek";
  const g = rig(cls);
  const before = snap(g);
  // giv kortet på hånden og vælg et lovligt mål hvis nødvendigt
  const uid = give(g, 0, id, 99);
  const spec = d.t === "spell" ? d.tgt : d.bcTgt;
  let tref = null;
  if (spec) {
    const list = E.targetsForCard(g, 0, id, null).list;
    // foretræk et fjendtligt mål for skade-kort, ellers bare første lovlige
    tref = list.find(r => r.s === 1) || list[0] || null;
  }
  const err = E.playCard(g, 0, uid, tref);
  if (err) { silent.push(id + " (" + d.n + "): playCard-fejl: " + err); continue; }
  // nogle kort virker først ved end-of-turn/start — trig en fuld turcyklus
  let after = snap(g);
  if (after === before) {
    E.endTurn(g, 0); E.endTurn(g, 1);
    after = snap(g);
  }
  if (after === before) {
    // sidste udvej: kortet kan være en vanilla-enhed (ingen tekst) — så tæller
    // board-tilføjelsen i sig selv. Tjek om det er en effektløs enhed.
    const harEffekt = d.txt && d.txt.trim() && !/^["\u201C]/.test(d.txt.trim());
    if (harEffekt) silent.push(id + " (" + d.n + "): ingen målbar effekt");
    else touched++; // vanilla-enhed uden tekst — OK
  } else touched++;
}

check("alle " + E.COLL.length + " kort gør noget målbart", silent.length === 0, silent.length + " tavse");
if (silent.length) {
  console.log("  TAVSE KORT:");
  silent.slice(0, 20).forEach(x => console.log("    ✗ " + x));
}
console.log("  virksomme: " + touched + "/" + E.COLL.length);

import("./engine.mjs").then(m => {
  console.log(m.fails ? "AGENT 5: " + m.fails + " FEJL" : "AGENT 5: fuld dækning OK ✓");
  process.exit(m.fails ? 1 : 0);
});
