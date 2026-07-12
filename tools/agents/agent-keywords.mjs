// AGENT 7 — Keyword-integritet
// Tjekker: (1) kws() matcher altid CARDS[id].kw + akw + aura for ikke-silenced enheder
// (2) Grounded blokerer hero-angreb konsekvent
// (3) txt↔kw-konsistens for enheder (spells der "giver" keywords er undtaget)
import { E } from "./engine.mjs";
const { mkState, autoDeck, summon, endTurn, botAction, kws, hasKw, attackTargets, CARDS, COLL, clone } = E;
let fejl=0; const bom=m=>{fejl++;console.log("  ✗",m);};
console.log("AGENT 7 — Keyword-integritet");

// ---- 1) kws() matcher kw+akw+aura for alle enheder i 500 kampe ----
let tjekket=0;
for(let r=0;r<500;r++){
  const cls=["tek","hack","over"];
  const g=mkState({mode:"bot",names:["A","B"],cids:["a","b"],
    decks:[autoDeck(cls[r%3]),autoDeck(cls[(r+1)%3])],
    classes:[cls[r%3],cls[(r+1)%3]],starter:r%2});
  for(let t=0;t<60&&g.status==="igang";t++){
    for(const s of [0,1]) for(const u of g.players[s].board){
      tjekket++;
      const d=CARDS[u.id];
      if(!u.sil && d.kw){
        const got=kws(g,s,u);
        for(const k of d.kw)
          if(!got.includes(k)) bom(`${d.n}: kw:[${k}] sil=false men kws()=[${got}]`);
      }
      for(const k of u.akw)
        if(!u.sil && !kws(g,s,u).includes(k)) bom(`${d.n}: akw har ${k} men kws() mangler det`);
    }
    while(botAction(g,g.active)){}
    endTurn(g,g.active);
  }
}
console.log(`  ${tjekket} enhedstilstande tjekket`);

// ---- 2) Grounded blokerer hero-angreb for alle Grounded-kort ----
const jordKort=COLL.filter(id=>(CARDS[id].kw||[]).includes("jord"));
for(const id of jordKort){
  const g=mkState({mode:"lokal",names:["A","B"],cids:["a","b"],
    decks:[autoDeck("tek"),autoDeck("tek")],classes:["tek","tek"],starter:0});
  summon(g,0,id); summon(g,1,"u_kampdrone"); endTurn(g,0);
  const f=g.players[1].board[0]; f.jp=false; f.atkLeft=1;
  if(attackTargets(g,1,f.uid).some(t=>t.u===null))
    bom(`${CARDS[id].n}: Grounded blokerer IKKE hero`);
}
console.log(`  ${jordKort.length} Grounded-enheder OK`);

// ---- 3) Enheder med keyword i kw:[] skal nævne det i txt ----
const kwNavn={jord:"Grounded",turbo:"Turbo",iso:"Insulated",hoj:"High Voltage",
  dob:"Dual Core",host:"Energy Harvest",skjul:"Cloaked"};
let txtWarn=0;
for(const id of COLL){
  const d=CARDS[id];
  if(d.t!=="unit" || !d.kw) continue;
  for(const k of d.kw){
    const n=kwNavn[k]; if(!n || k==="noHero") continue;
    if(!d.txt || !d.txt.includes(n)){
      console.log(`  ⚠ ${d.n} har kw:["${k}"] men txt mangler "${n}"`);
      txtWarn++;
    }
  }
}
if(txtWarn) console.log(`  ${txtWarn} enheder med keyword der ikke nævnes i txt (spilleren ser det kun som badge)`);

// ---- 4) bot omgår aldrig Grounded i 500 kampe ----
let overtraedelser=0;
for(let r=0;r<500;r++){
  const g=mkState({mode:"bot",names:["A","B"],cids:["a","b"],
    decks:[autoDeck("tek"),autoDeck("tek")],classes:["tek","tek"],starter:0});
  for(let t=0;t<60&&g.status==="igang";t++){
    if(g.active===1){
      const taunts0=g.players[0].board.filter(x=>hasKw(g,0,x,"jord")&&!x.st);
      const hp0=g.players[0].hp;
      while(botAction(g,1)){}
      if(taunts0.length>0){
        const tauntsEfter=g.players[0].board.filter(x=>taunts0.some(t=>t.uid===x.uid));
        if(tauntsEfter.length===taunts0.length && g.players[0].hp<hp0)
          overtraedelser++;
      }
    }
    endTurn(g,g.active);
  }
}
if(overtraedelser) bom(`${overtraedelser}/500 spil med Grounded-overtrædelser`);
else console.log("  500 kampe: ingen Grounded-overtrædelser");

if(fejl){ console.log(`AGENT 7: ${fejl} FEJL`); process.exit(1); }
console.log("AGENT 7: keyword-integritet OK ✓");
