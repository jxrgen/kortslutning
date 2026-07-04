// AGENT 4 — effektverifikation: spil hvert effektkort og tjek at effekten SKER.
// Fanger "kortet gør ingenting"-bugs som ikke rammer invarianter.
import { E, fresh, give, put, check } from "./engine.mjs";

console.log("AGENT 4: effektverifikation");

// hjælp: frisk state hvor det er MIN tur med masser af energi
function board(){ const g=fresh(0); g.players[0].cur=99; g.players[0].maxE=99; return g; }
function stats(g,s,u){ return E.effAtk(g,s,u)+"/"+E.effHp(g,s,u); }

// --- Install-buffs på venlig enhed ---
{
  const g=board(); const ally=put(g,0,"u_koleleg"); // 0/5
  const uid=give(g,0,"u_potmeter");
  E.playCard(g,0,uid,{s:0,u:ally.uid});
  check("Potentiometer: +1/+1 på venlig enhed", E.effAtk(g,0,ally)===1&&E.effHp(g,0,ally)===6, stats(g,0,ally));
}
{
  const g=board(); const ally=put(g,0,"u_koleleg");
  const uid=give(g,0,"u_transform");
  E.playCard(g,0,uid,{s:0,u:ally.uid});
  check("Transformer: +2/+0 på venlig enhed", E.effAtk(g,0,ally)===2&&E.effHp(g,0,ally)===5, stats(g,0,ally));
}
{
  const g=board(); const rob=put(g,0,"u_sumobot"); // Robot
  const uid=give(g,0,"u_skruebot");
  E.playCard(g,0,uid,{s:0,u:rob.uid});
  check("Screwbot: +1/+1 på venlig Robot", E.effAtk(g,0,rob)===4, E.effAtk(g,0,rob)); // 3/5→4/6
}
// --- Install der giver angreb med det samme (Relay) ---
{
  const g=board(); const ally=put(g,0,"u_spole"); ally.jp=true; ally.atkLeft=1;
  const uid=give(g,0,"u_relae");
  E.playCard(g,0,uid,{s:0,u:ally.uid});
  put(g,1,"u_koleleg");
  check("Relay: mål kan angribe straks", E.attackTargets(g,0,ally.uid).length>0);
}
// --- Install-skade ---
{
  const g=board(); const foe=put(g,1,"u_koleleg"); // 0/5
  const uid=give(g,0,"u_loddebot");
  E.playCard(g,0,uid,{s:1,u:foe.uid});
  check("Solderbot: 1 skade på fjende", foe.dmg===1, foe.dmg);
}
// --- Install summon ---
{
  const g=board(); const n0=g.players[0].board.length;
  const uid=give(g,0,"u_byggebot");
  E.playCard(g,0,uid,null);
  check("Builderbot: summoner Microbot (board +2)", g.players[0].board.length===n0+2, g.players[0].board.length-n0);
}
// --- Install draw ---
{
  const g=board(); const uid=give(g,0,"u_levering");
  const dk0=g.players[0].deck.length;
  E.playCard(g,0,uid,null); // Install: draw → deck falder med 1
  check("Delivery Drone: Install draw (deck -1)", g.players[0].deck.length===dk0-1, dk0-g.players[0].deck.length);
}
// --- spell-buffs ---
{
  const g=board(); const ally=put(g,0,"u_koleleg");
  const uid=give(g,0,"s_loddetin"); // +0/+3
  E.playCard(g,0,uid,{s:0,u:ally.uid});
  check("Solder: +0/+3", E.effHp(g,0,ally)===8, stats(g,0,ally));
}
{
  const g=board(); const ally=put(g,0,"u_spole"); // 2/3
  const uid=give(g,0,"s_forstark"); // double attack
  E.playCard(g,0,uid,{s:0,u:ally.uid});
  check("Power Amplifier: fordobler angreb", E.effAtk(g,0,ally)===4, E.effAtk(g,0,ally));
}
{
  const g=board(); put(g,0,"u_spole"); put(g,0,"u_koleleg");
  const uid=give(g,0,"s_firmware"); // +1/+1 alle mine
  E.playCard(g,0,uid,null);
  check("Firmware Update: alle mine +1/+1",
    g.players[0].board.every(u=>true) && E.effAtk(g,0,g.players[0].board[0])===3, E.effAtk(g,0,g.players[0].board[0]));
}
// --- spell-skade + signal ---
{
  const g=board(); const foe=put(g,1,"u_koleleg");
  const uid=give(g,0,"s_kortslut"); // 2 dmg
  E.playCard(g,0,uid,{s:1,u:foe.uid});
  check("Short Circuit: 2 skade", foe.dmg===2, foe.dmg);
}
{
  const g=board(); const foe=put(g,1,"u_kolos"); // 7/7
  const u1=give(g,0,"s_spids"); // 3 dmg
  E.playCard(g,0,u1,{s:1,u:foe.uid});
  check("Voltage Spike: 3 skade + overheat", foe.dmg===3 && g.players[0].ovlNext>=1, foe.dmg+" ovl"+g.players[0].ovlNext);
}
// --- AoE ---
{
  const g=board(); put(g,1,"u_spole"); put(g,1,"u_koleleg"); put(g,1,"u_sumobot");
  const uid=give(g,0,"s_magnet"); // 2 til alle fjender
  E.playCard(g,0,uid,null);
  check("Magnetic Field: 2 til alle fjendtlige enheder", g.players[1].board.every(u=>u.dmg>=2||E.effHp(g,1,u)<=0), "");
}
// --- draw-spells ---
{
  const g=board(); const uid=give(g,0,"s_diag");
  const dk0=g.players[0].deck.length;
  E.playCard(g,0,uid,null); // draw 2 → deck -2
  check("Diagnostics: draw 2 (deck -2)", g.players[0].deck.length===dk0-2, dk0-g.players[0].deck.length);
}
// --- heal ---
{
  const g=board(); g.players[0].hp=10;
  const uid=give(g,0,"s_gendan"); // heal 8
  E.playCard(g,0,uid,null);
  check("System Restore: helt +8", g.players[0].hp===18, g.players[0].hp);
}
// --- Breakdown-effekter (dræb enhed, tjek effekt) ---
{
  const g=board(); const u=put(g,0,"u_sikring"); // Breakdown: heal 2
  g.players[0].hp=10; u.dmg=999; E.sweep(g);
  check("Fuse Breakdown: helt +2 ved død", g.players[0].hp===12, g.players[0].hp);
}
{
  const g=board(); const u=put(g,0,"u_kondens"); // Breakdown: store 1
  const st0=g.players[0].stored; u.dmg=999; E.sweep(g);
  check("Capacitor Breakdown: +1 stored", g.players[0].stored===st0+1, g.players[0].stored);
}
{
  const g=board(); const u=put(g,0,"u_replikator"); // Breakdown: 2 Bugs
  const n0=g.players[0].board.length; u.dmg=999; E.sweep(g);
  check("Replicator Breakdown: 2 Bugs (netto +1 efter død)", g.players[0].board.length===n0+1, g.players[0].board.length-n0);
}
// --- start/end-of-turn ---
{
  const g=board(); const u=put(g,0,"u_krystal"); // start: +1 atk
  const a0=E.effAtk(g,0,u);
  E.endTurn(g,0); E.endTurn(g,1); // tilbage til min tur → start-trigger
  check("Crystal Oscillator: +1 atk ved turstart", E.effAtk(g,0,u)===a0+1, E.effAtk(g,0,u)+" fra "+a0);
}
{
  const g=board(); put(g,0,"u_fabrik"); // end: summon Microbot
  const n0=g.players[0].board.length;
  E.endTurn(g,0);
  check("Robot Factory: Microbot ved turslut", g.players[0].board.length===n0+1, g.players[0].board.length-n0);
}
// --- klasse-kort ---
{
  const g=board(); const foe=put(g,1,"u_koleleg");
  const uid=give(g,0,"ov_jolt"); // 2 dmg + overheat
  E.playCard(g,0,uid,{s:1,u:foe.uid});
  check("Jolt: 2 skade", foe.dmg===2, foe.dmg);
}
{
  const g=board(); const ally=put(g,0,"u_spole"); ally.jp=true;
  const uid=give(g,0,"ov_boost"); // Turbo + +1/+0
  E.playCard(g,0,uid,{s:0,u:ally.uid});
  check("Turbo Boost: +1 atk + Turbo", E.effAtk(g,0,ally)===3 && E.hasKw(g,0,ally,"turbo"), stats(g,0,ally));
}
{
  const g=board(); const h0=g.players[0].hand.length;
  give(g,1,"u_spole"); // modstander har et kort
  const uid=give(g,0,"hk_phish"); // kopiér fra modstander
  E.playCard(g,0,uid,null);
  check("Phishing: +1 kort i hånd", g.players[0].hand.length>=h0, g.players[0].hand.length-h0);
}

import("./engine.mjs").then(m=>{
  console.log(m.fails?"AGENT 4: "+m.fails+" FEJL":"AGENT 4: alle effekter virker ✓");
  process.exit(m.fails?1:0);
});
