// AGENT 8 — FX-position-integritet
// Hvert visuelt fx-event (dmg, boom, heal, pop, zap, ...) skal kunne stedfæstes,
// ellers havner animationen i det tomme rum (som Magnetic Field gjorde: enheder
// forsvandt, og skaden blev vist for langt til højre på noget der ikke var der).
//
// Denne agent spiller HVERT spell og HVER enhed med en battlecry/summon-effekt
// mod en fuld tavle og tjekker at alle genererede fx-events refererer til enheder
// hvis position kendes: enten stadig på brættet (levende), netop død (i posRef-
// snapshottet taget FØR handlingen), eller nytilkaldt (fallback til bræt-midte).
import { E } from "./engine.mjs";
const { mkState, autoDeck, summon, playCard, CARDS, COLL } = E;

let fejl=0; const bom=m=>{fejl++;console.log("  ✗",m);};
console.log("AGENT 8 — FX-position-integritet");

// Modellér FX-pipelinens posOf: DOM (levende) → snapshot (død) → fallback (ny).
// Her uden DOM: "levende" = stadig på brættet, "snapshot" = fanget før handlingen.
function stedfæst(fx, brætFør, brætEfter){
  const kanFindes=new Set();
  // enheder der var på brættet FØR handlingen (snapshot fanger deres position)
  for(const s of [0,1]) for(const uid of brætFør[s]) kanFindes.add(uid);
  // enheder der er på brættet EFTER (levende, i DOM)
  for(const s of [0,1]) for(const uid of brætEfter[s]) kanFindes.add(uid);
  const problemer=[];
  for(const e of fx){
    const tjek=(uid)=>{
      if(uid==null) return; // helt — altid stedfæstelig
      // nytilkaldte enheder (pop) falder tilbage til bræt-midte i pipelinen → OK
      if(e.t==="pop") return;
      if(!kanFindes.has(uid)) problemer.push(e.t+" u="+uid+" (ukendt position)");
    };
    if(e.t==="dmg"||e.t==="heal"||e.t==="boom"||e.t==="skjold") tjek(e.u);
    else if(e.t==="zap"){ tjek(e.fu); tjek(e.tu); }
  }
  return problemer;
}

function snapshot(g){ return [g.players[0].board.map(u=>u.uid), g.players[1].board.map(u=>u.uid)]; }

let testet=0;
// 1) alle spells
for(const id of COLL.filter(x=>CARDS[x].t==="spell")){
  const d=CARDS[id];
  const g=mkState({mode:"solo",names:["A","B"],cids:["a","b"],
    decks:[autoDeck("tek"),autoDeck("tek")],classes:["tek","tek"],starter:0});
  summon(g,0,"u_nano"); summon(g,0,"u_datamide"); summon(g,0,"u_spole");
  summon(g,1,"u_nano"); summon(g,1,"u_datamide"); summon(g,1,"u_spole");
  let tref=null;
  if(d.tgt){ if(d.tgt==="funit") tref={s:0,u:g.players[0].board[0].uid};
    else tref={s:1,u:g.players[1].board[0].uid}; }
  g.players[0].hand=[{uid:"sp",id}]; g.players[0].cur=10; g.players[0].played=0;
  const brætFør=snapshot(g);
  g.fx=[]; g.fxk=0;
  if(playCard(g,0,"sp",tref)) continue;
  testet++;
  const probs=stedfæst(g.fx, brætFør, snapshot(g));
  for(const p of probs) bom(d.n+": "+p);
}

// 2) alle enheder med battlecry (bc)/summon-effekter
for(const id of COLL.filter(x=>CARDS[x].t==="unit" && (CARDS[x].bc||CARDS[x].f))){
  const d=CARDS[id];
  const g=mkState({mode:"solo",names:["A","B"],cids:["a","b"],
    decks:[autoDeck("tek"),autoDeck("tek")],classes:["tek","tek"],starter:0});
  summon(g,1,"u_nano"); summon(g,1,"u_datamide");
  let tref=null;
  if(d.bcTgt){ if(d.bcTgt==="funit") { summon(g,0,"u_nano"); tref={s:0,u:g.players[0].board[0].uid}; }
    else tref={s:1,u:g.players[1].board[0].uid}; }
  g.players[0].hand=[{uid:"sp",id}]; g.players[0].cur=10; g.players[0].played=0;
  const brætFør=snapshot(g);
  g.fx=[]; g.fxk=0;
  if(playCard(g,0,"sp",tref)) continue;
  testet++;
  const probs=stedfæst(g.fx, brætFør, snapshot(g));
  for(const p of probs) bom(d.n+": "+p);
}

console.log("  testede "+testet+" kort med FX");
if(fejl){ console.log("AGENT 8: "+fejl+" FEJL"); process.exit(1); }
console.log("AGENT 8: alle fx-events kan stedfæstes OK ✓");
