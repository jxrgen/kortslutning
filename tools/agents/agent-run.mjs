// AGENT 6 — Meltdown Run: fuldfører hele runs headless og vogter over både
// integritet (kortantal, HP-flow, opgraderinger) og balance (sejrsrate pr. node).
// Botten spiller SPILLERENS side, dvs. et konservativt worst case: en rigtig
// spiller passer bedre på sit HP end botten gør. Består hvis en run er vindbar
// men ikke triviel.
import { E } from "./engine.mjs";

let fejl = 0;
const bom = (m) => { fejl++; console.log("  ✗ " + m); };

function spilKamp(g) {
  let k = 0;
  while (g.status === "igang" && k++ < 250) { while (E.botAction(g, g.active)) {} E.endTurn(g, g.active); }
  return g;
}

function kørRun(cls) {
  let run = E.runNyt(cls);
  if (run.deck.length !== 20) bom("startdeck er " + run.deck.length + ", forventet 20");
  if (run.map.length !== E.RUN_LEN) bom("map-længde " + run.map.length);
  if (run.map[run.map.length - 1] !== "boss") bom("sidste node er ikke boss");

  const perNode = [];
  while (run.node < E.RUN_LEN && run.hp > 0) {
    const t = run.map[run.node];
    if (t === "repair") { E.runRepair(run); run.node++; continue; }

    const før = run.deck.length;
    const g = E.runKamp(run, "Bot");
    // integritet: spillerens kortpulje = decket
    if (g.players[0].deck.length + g.players[0].hand.length + g.players[0].board.length !== før)
      bom("kortantal ved kampstart passer ikke (node " + run.node + ")");
    // fjenden må aldrig starte svagere end en frisk 30-HP modstander på dybe noder
    if (run.node >= 6 && g.players[1].max < 30) bom("fjende for svag på node " + run.node);

    spilKamp(g);
    if (g.status !== "slut") { bom("kamp hang på node " + run.node); break; }

    perNode.push([run.node, t, g.winner === 0]);
    if (g.winner !== 0) { run.status = "tabt"; break; }

    E.runSejr(run, g.players[0].hp, t === "elite" || t === "boss");
    if (run.hp < 1) bom("HP faldt under 1 efter sejr");
    if (run.hp > run.max) bom("HP over max efter sejr");

    const bel = E.runBelonning(run);
    if (bel.length === 0) bom("ingen belønning på node " + run.node);
    // belønning respekterer kopigrænser
    for (const id of bel) {
      const antal = run.deck.filter((x) => x === id).length;
      if (antal >= (E.CARDS[id].r === "L" ? 1 : 2)) bom("belønning bryder kopigrænse: " + id);
    }
    run.deck = run.deck.concat([bel[0]]);

    if (t === "elite" || t === "boss") {
      const up = E.runOpgraderinger(run);
      if (up.length === 0) bom("ingen opgraderinger tilbudt på node " + run.node);
      const førUpg = run.upg.length;
      run = E.runTilfoej(run, up[0]);
      if (run.upg.length !== førUpg + 1) bom("opgradering blev ikke tilføjet");
    }
    run.node++;
  }
  return { run, perNode };
}

console.log("AGENT 6 — Meltdown Run");

// 1) integritet + fuldførbarhed over mange runs
const N = 150;
const vundne = new Array(E.RUN_LEN).fill(0), spillet = new Array(E.RUN_LEN).fill(0);
let fuldført = 0, dybder = [];
for (let i = 0; i < N; i++) {
  const { run, perNode } = kørRun(["tek", "hack", "over"][i % 3]);
  for (const [node, , vandt] of perNode) { spillet[node]++; if (vandt) vundne[node]++; }
  dybder.push(run.node);
  if (run.node >= E.RUN_LEN) fuldført++;
}
const snitDybde = dybder.reduce((a, b) => a + b, 0) / N;

// 2) opgraderingerne har effekt (måles på et frisk kampobjekt)
{
  const base = E.runKamp(E.runNyt("tek"), "A").players[0];
  const g = E.runKamp({ ...E.runNyt("tek"), upg: ["flux", "amp", "overflow", "selfrep"] }, "A");
  if (E.powCost(g, 0) !== base && 0) {} // no-op, powCost tjekkes nedenfor
  const p = g.players[0];
  if (E.sig(g, 0) < 1) bom("Signal Amplifier gav ingen bonus");
  if (p.eCap !== 12) bom("Overflow Bus hævede ikke energiloftet");
  if (p.regen !== 2) bom("Self-Repair Loop satte ikke regen");
  if (E.powCost(g, 0) !== E.powCost(E.runKamp(E.runNyt("tek"), "A"), 0) - 1) bom("Flux Regulator sænkede ikke prisen");
}

// 3) balance-vinduer — botten spiller spilleren (konservativt)
for (let i = 0; i < E.RUN_LEN; i++) {
  if (spillet[i] < 8) continue;
  const rate = vundne[i] / spillet[i];
  if (rate < 0.30) bom(`node ${i} er for hård for botten (${(rate * 100).toFixed(0)}% over ${spillet[i]} kampe)`);
  if (rate > 0.92) bom(`node ${i} er triviel (${(rate * 100).toFixed(0)}%)`);
}
// en run skal være vindbar for botten, men ikke ofte
if (fuldført === 0) bom("ingen af " + N + " bot-runs blev fuldført — for hårdt");
if (fuldført > N * 0.4) bom("botten fuldfører " + fuldført + "/" + N + " runs — for let");

console.log(`  ${N} runs · fuldført ${fuldført} · gns. dybde ${snitDybde.toFixed(1)}/${E.RUN_LEN}`);
console.log("  per-node sejr (bot spiller spilleren): " +
  spillet.map((s, i) => s >= 8 ? i + ":" + Math.round(100 * vundne[i] / s) + "%" : null).filter(Boolean).join("  "));

if (fejl) { console.log(`AGENT 6: ${fejl} FEJL`); process.exit(1); }
console.log("AGENT 6: run-integritet + balance OK ✓");
