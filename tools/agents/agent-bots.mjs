// AGENT 3 — botduel: 400 bot-vs-bot-spil, balance- og stabilitetsstatistik
import { E, fresh, KL } from "./engine.mjs";
console.log("AGENT 3: botduel — 400 spil");
let w = [0, 0, 0], ture = [], crash = 0;
for (let game = 0; game < 400; game++) {
  const g = fresh(game % 2, KL[game % 3], KL[(game + 1) % 3]);
  let safety = 0;
  try {
    while (g.status === "igang" && safety++ < 400) {
      const s = g.active;
      let steps = 0;
      while (g.status === "igang" && steps++ < 40 && E.botAction(g, s)) {}
      if (g.status === "igang") E.endTurn(g, s);
    }
  } catch (e) { crash++; console.log("  ✗ crash:", e.message); }
  if (g.status === "slut") { w[g.winner === 2 ? 2 : g.winner]++; ture.push(g.turn); }
}
ture.sort((a, b) => a - b);
const snit = (ture.reduce((a, b) => a + b, 0) / ture.length).toFixed(1);
console.log("  sejre: spiller0=" + w[0] + " spiller1=" + w[1] + " uafgjort=" + w[2]);
console.log("  ture: snit=" + snit + " median=" + ture[Math.floor(ture.length / 2)] + " maks=" + ture[ture.length - 1]);
const fp = w[0] / (w[0] + w[1]);
console.log("  first-player-fordel (starter skifter): " + (fp * 100).toFixed(1) + "% til seat 0");
if (crash) { console.log("AGENT 3: " + crash + " CRASHES"); process.exit(1); }
console.log("AGENT 3: stabil ✓");
