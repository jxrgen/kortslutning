// AGENT 1 — regelverifikation: hver mekanik testes isoleret
import { E, fresh, give, put, check, fails } from "./engine.mjs";

console.log("AGENT 1: regelverifikation");

// 1. Grounded tvinger targeting
{
  const g = fresh(0);
  put(g, 1, "u_vagtbot");           // Grounded 2/4
  put(g, 1, "u_spole");             // alm. 2/3
  const mig = put(g, 0, "u_spole");
  const ts = E.attackTargets(g, 0, mig.uid);
  check("Grounded: kun jordede enheder kan angribes", ts.length === 1 && ts[0].u != null
    && E.CARDS[E.refUnit(g, ts[0]).id].kw?.includes("jord"), JSON.stringify(ts));
}
// 2. Insulated absorberer præcis én gang
{
  const g = fresh(0);
  const p = put(g, 1, "u_panserbot"); // iso
  E.dmg(g, { s: 1, u: p.uid }, 3, null);
  check("Insulated: første skade absorberes", p.dmg === 0 && p.sh === false);
  E.dmg(g, { s: 1, u: p.uid }, 3, null);
  check("Insulated: anden skade virker", p.dmg === 3);
}
// 3. High Voltage dræber ved trade
{
  const g = fresh(0);
  const mide = put(g, 0, "u_datamide"); // 1/1 hoj
  const stor = put(g, 1, "u_kolos");    // 7/7
  E.unitAttack(g, 0, mide.uid, { s: 1, u: stor.uid });
  check("High Voltage: stor enhed dør af 1 skade", !g.players[1].board.some(x => x.uid === stor.uid));
}
// 4. Dual Core: to angreb, ikke tre
{
  const g = fresh(0);
  const b = put(g, 0, "u_boksebot"); // dob
  put(g, 1, "u_koleleg"); put(g, 1, "u_koleleg"); // 0/5 tanke at slå på
  const t1 = E.attackTargets(g, 0, b.uid);
  const e1 = E.unitAttack(g, 0, b.uid, t1.find(r => r.u != null));
  const t2 = E.attackTargets(g, 0, b.uid);
  const e2 = t2.length ? E.unitAttack(g, 0, b.uid, t2.find(r => r.u != null) || t2[0]) : "ingen mål";
  const t3 = E.attackTargets(g, 0, b.uid);
  check("Dual Core: angreb 1+2 lovlige, 3. afvist", !e1 && !e2 && t3.length === 0,
    JSON.stringify({ e1, e2, t3len: t3.length }));
}
// 5. Energy Harvest healer helten
{
  const g = fresh(0);
  g.players[0].hp = 20;
  const v = put(g, 0, "u_snylter"); // 3/3 host
  put(g, 1, "u_koleleg");
  E.unitAttack(g, 0, v.uid, { s: 1, u: g.players[1].board[0].uid });
  check("Energy Harvest: helt healet 3", g.players[0].hp === 23, g.players[0].hp);
}
// 6. Cloaked kan ikke targetes — før den angriber
{
  const g = fresh(0);
  const sd = put(g, 1, "u_spejder"); // skjul
  const mig = put(g, 0, "u_spole");
  const atk = E.attackTargets(g, 0, mig.uid);
  const spellT = E.targetsForCard(g, 0, "s_kortslut", null); // any-target spell
  const kanRammes = atk.some(r => r.u === sd.uid) || spellT.list.some(r => r.u === sd.uid);
  check("Cloaked: usynlig for angreb og spells", !kanRammes);
  // botten (spiller 1) angriber med den → afsløret
  g.active = 1; g.turn++;
  sd.jp = false; sd.atkLeft = 1;
  E.unitAttack(g, 1, sd.uid, { s: 0, u: mig.uid });
  g.active = 0;
  const atk2 = E.attackTargets(g, 0, g.players[0].board[0] ? g.players[0].board[0].uid : "x");
  check("Cloaked: kan targetes efter eget angreb", sd.st === false);
}
// 7. Overheat låser energi næste tur
{
  const g = fresh(0);
  const uid = give(g, 0, "s_nodstrom", 5);
  E.playCard(g, 0, uid, null);
  E.endTurn(g, 0); E.endTurn(g, 1);
  const p = g.players[0];
  check("Overheat: 2 låst næste tur", p.ovlShown === 2, p.ovlShown);
}
// 8. Kondensatorbank capper på MAXSTORED
{
  const g = fresh(0);
  g.players[0].cur = 9;
  E.endTurn(g, 0);
  check("Capacitor bank: gemmer maks " + E.MAXSTORED, g.players[0].stored === E.MAXSTORED, g.players[0].stored);
  E.endTurn(g, 1);
  const p = g.players[0];
  check("Capacitor bank: udbetales næste tur", p.cur === p.maxE - p.ovlShown + E.MAXSTORED, p.cur);
}
// 9. Fatigue eskalerer
{
  const g = fresh(0);
  g.players[0].deck = [];
  const hp0 = g.players[0].hp;
  E.draw(g, 0, 1); E.draw(g, 0, 1); E.draw(g, 0, 1);
  check("Fatigue: 1+2+3 = 6 skade", g.players[0].hp === hp0 - 6, hp0 - g.players[0].hp);
}
// 10. Hand burn ved 9
{
  const g = fresh(0);
  const p = g.players[0];
  while (p.hand.length < E.MAXHAND) p.hand.push({ uid: "f" + p.hand.length, id: "u_spole" });
  const dk = p.deck.length;
  E.draw(g, 0, 1);
  check("Hand burn: hånd forbliver 9, kort brændt", p.hand.length === 9 && p.deck.length === dk - 1);
}
// 11. Board cap 6
{
  const g = fresh(0);
  for (let i = 0; i < 6; i++) put(g, 0, "u_spole");
  const uid = give(g, 0, "u_vagtbot");
  check("Board cap: 7. enhed kan ikke spilles", !E.canPlay(g, 0, "u_vagtbot"));
}
// 12. Turbo: enheder ja, helt nej — første tur
{
  const g = fresh(0);
  const t = E.summon(g, 0, "u_nano");   // turbo, jp=true fra summon? mkUnit sætter jp
  t.jp = true; t.atkLeft = 1;
  put(g, 1, "u_spole");
  const ts = E.attackTargets(g, 0, t.uid);
  check("Turbo: kan angribe enhed første tur", ts.some(r => r.u != null));
  check("Turbo: kan IKKE angribe helt første tur", !ts.some(r => r.u == null), JSON.stringify(ts));
}
// 13. Alm. enhed sover første tur
{
  const g = fresh(0);
  const u = E.summon(g, 0, "u_spole"); u.atkLeft = 1;
  check("Sleeping: ingen mål turen den spilles", E.attackTargets(g, 0, u.uid).length === 0);
}
// 14. noHero
{
  const g = fresh(0);
  const d = put(g, 0, "u_diode");
  const ts = E.attackTargets(g, 0, d.uid);
  check("Units only: helt aldrig et mål", !ts.some(r => r.u == null));
}
// 15. Reset fjerner alt
{
  const g = fresh(0);
  const u = put(g, 0, "u_panserbot"); // jord+iso 4/6
  u.a += 3; u.hM += 3; u.akw.push("turbo");
  const uid = give(g, 1, "s_nulstil", 9); g.active = 1;
  E.playCard(g, 1, uid, { s: 0, u: u.uid });
  check("Reset: basestats og ingen keywords", u.sil && E.effAtk(g, 0, u) === 4 && E.kws(g, 0, u).length === 0,
    JSON.stringify({ a: E.effAtk(g, 0, u), kws: E.kws(g, 0, u) }));
}
// 16. Hack: kun ≤2 atk, kræver plads
{
  const g = fresh(0);
  put(g, 1, "u_kolos");   // 7 atk
  put(g, 1, "u_spole");   // 2 atk
  const t = E.targetsForCard(g, 0, "s_hack", null);
  check("Hack: kun lav-atk-mål", t.list.length === 1 && E.effAtk(g, 1, E.refUnit(g, t.list[0])) <= 2);
  for (let i = 0; i < 6; i++) put(g, 0, "u_spole");
  const t2 = E.targetsForCard(g, 0, "s_hack", null);
  check("Hack: ingen mål ved fuldt bræt", t2.list.length === 0, t2.list.length);
}
// 17. Cable Spaghetti swapper korrekt
{
  const g = fresh(0);
  const u = put(g, 0, "u_psu"); // 2/5
  u.dmg = 1;                    // hp nu 4
  const uid = give(g, 0, "s_kabels");
  E.playCard(g, 0, uid, { s: 0, u: u.uid });
  check("Cable Spaghetti: 2/5(-1) → 4/2", E.effAtk(g, 0, u) === 4 && E.effHp(g, 0, u) === 2,
    E.effAtk(g, 0, u) + "/" + E.effHp(g, 0, u));
}
// 18. Signal Strength booster spells
{
  const g = fresh(0);
  put(g, 0, "u_transistor"); // sig 1
  const f = put(g, 1, "u_koleleg"); // 0/5
  const uid = give(g, 0, "s_stod"); // 1 dmg
  E.playCard(g, 0, uid, { s: 1, u: f.uid });
  check("Signal Strength: 1+1 = 2 skade", f.dmg === 2, f.dmg);
}
// 19. Win-condition + samtidig død
{
  const g = fresh(0);
  g.players[1].hp = 1;
  E.dmg(g, { s: 1, u: null }, 1, null);
  check("Win: status slut, korrekt vinder", g.status === "slut" && g.winner === 0);
  const g2 = fresh(0);
  g2.players[0].hp = 2; g2.players[1].hp = 2;
  const uid = give(g2, 0, "s_nedsmelt", 20); // 4 til alle helte
  E.playCard(g2, 0, uid, null);
  check("Draw: dobbelt nedsmeltning = uafgjort", g2.status === "slut" && g2.winner === 2,
    JSON.stringify({ st: g2.status, w: g2.winner }));
}
// 20. GDPR Bot: symmetrisk hånd-udskiftning
{
  const g = fresh(0);
  const h0 = g.players[0].hand.length + 1, h1 = g.players[1].hand.length;
  const uid = give(g, 0, "l_gdpr");
  E.playCard(g, 0, uid, null);
  check("GDPR Bot: begge trækker deres håndstørrelse", g.players[0].hand.length === h0 - 1
    && g.players[1].hand.length === h1, g.players[0].hand.length + "/" + g.players[1].hand.length);
}

// 21. Hacker: Breach summoner en Bug, gated ved fuldt bræt
{
  const g = fresh(0, "hack", "tek");
  g.players[0].cur = 5;
  E.heroPower(g, 0, E.heroTargets(g, 0)[0]);
  check("Breach: 1/1 Bug på brættet", g.players[0].board.length === 1 && g.players[0].board[0].id === "t_bug");
  for (let i = 0; i < 5; i++) put(g, 0, "u_spole");
  check("Breach: ingen mål ved fuldt bræt", E.heroTargets(g, 0).length === 0);
}
// 22. Overclocker: Charge gemmer 2, capper på MAXSTORED
{
  const g = fresh(0, "over", "tek");
  g.players[0].cur = 9;
  E.heroPower(g, 0, E.heroTargets(g, 0)[0]);
  check("Charge: stored = 2", g.players[0].stored === 2, g.players[0].stored);
  g.players[0].heroUsed = false;
  E.heroPower(g, 0, E.heroTargets(g, 0)[0]);
  check("Charge: capper på " + E.MAXSTORED, g.players[0].stored === E.MAXSTORED, g.players[0].stored);
  g.players[0].heroUsed = false;
  check("Charge: ingen mål ved fuld bank", E.heroTargets(g, 0).length === 0);
}
// 23. Coolant Flush refunderer låst energi
{
  const g = fresh(0, "over", "tek");
  const p = g.players[0];
  p.maxE = 6; p.ovlShown = 2; p.cur = 4; p.ovlNext = 1;
  const uid = give(g, 0, "ov_coolant", p.cur);
  E.playCard(g, 0, uid, null);
  check("Coolant: +2 refunderet, alt lås ryddet", p.cur === 4 && p.ovlShown === 0 && p.ovlNext === 0,
    JSON.stringify({ cur: p.cur, ovlS: p.ovlShown, ovlN: p.ovlNext }));
}
// 24. Klassevalidering: hack-kort afvises i tek-deck
{
  const d = E.autoDeck("tek");
  d[0] = "hk_root";
  const err = E.validateDeck(d, "tek");
  check("validateDeck: klassekort afvises på tværs", !!err, err);
}

import("./engine.mjs").then(m => {
  console.log(m.fails ? "AGENT 1: " + m.fails + " FEJL FUNDET" : "AGENT 1: alle regler OK ✓");
  process.exit(m.fails ? 1 : 0);
});
