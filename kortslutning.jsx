import { useState, useEffect, useRef, useMemo, useCallback, memo } from "react";

/* ============================================================
   KORTSLUTNING — dansk elektronik-kortspil (Hearthstone-stil)
   Klasse: Teknikeren · 100 kort · online via delt lager
   ============================================================ */

/* __ENGINE_START__ */

// ---------- småting ----------
function rnd(n){ return Math.floor(Math.random()*n); }
function pick(a){ return a.length ? a[rnd(a.length)] : null; }
function shuffle(a){ const b=a.slice(); for(let i=b.length-1;i>0;i--){ const j=rnd(i+1); [b[i],b[j]]=[b[j],b[i]]; } return b; }
function clone(o){ return JSON.parse(JSON.stringify(o)); }

const MAXBOARD = 6, MAXHAND = 9, DECKSIZE = 25, MAXSTORED = 3;

// forklaringer på alle mekanik-termer der optræder i korttekster + keywords.
const GLOSSARY = {
  "Grounded":       "Enemies must attack your Grounded units before they can hit other units or your hero.",
  "Turbo":          "Can attack the same turn it is played (no summoning sickness).",
  "Insulated":      "Ignores the very first instance of damage it would take.",
  "High Voltage":   "Destroys any unit it damages, no matter how much health that unit had.",
  "Dual Core":      "Can attack twice per turn instead of once.",
  "Energy Harvest": "Whenever this unit deals damage, your hero is repaired for the same amount.",
  "Cloaked":        "Can’t be targeted by attacks or effects until it attacks for the first time.",
  "Units only":     "This unit can attack enemy units, but not the enemy hero.",
  "Signal Strength":"Boosts the power of your Spells while this unit is in play.",
  "Install":        "A one-time effect that triggers the moment the unit is played.",
  "Breakdown":      "A one-time effect that triggers when the unit is defeated (destroyed).",
  "Overheat":       "Locks the shown amount of your energy on your NEXT turn (it can’t be spent).",
  "Backup":         "Leaves behind a smaller token unit when it is defeated.",
  "Chain":          "A bonus effect that triggers if you already played another card this turn.",
};

const KWINFO = {
  jord:   { n:"Grounded",      d:"Enemies must attack Grounded units first." },
  turbo:  { n:"Turbo",         ico:"»",  d:"Can attack units the turn it is played." },
  iso:    { n:"Insulated",     d:"Ignores the first damage it takes." },
  hoj:    { n:"High Voltage",  d:"Destroys any unit it damages." },
  dob:    { n:"Dual Core",     ico:"×2", d:"Can attack twice per turn." },
  host:   { n:"Energy Harvest",d:"Damage dealt by this unit repairs your hero for the same amount." },
  skjul:  { n:"Cloaked",       d:"Can’t be targeted until it attacks." },
  noHero: { n:"Units only",    ico:"⊘",  d:"Can’t attack heroes." },
};

// ---------- KORTDATABASE ----------
// t: 'enhed'|'program' · tr: stamme · r: 'A' alm / 'L' legendarisk
// fx(g,s,t): program-effekt · bc: Installation · dr: Nedbrud · end/start: tur-triggers
// tgt/bcTgt: 'any'|'eany'|'unit'|'eunit'|'funit'|'funitO' (+ f: ekstra filter)

const CARDS = {

// ===== PROGRAMMER (33) =====
s_stod:{ n:"Static Shock", c:0, t:"spell", txt:"Deal 1 damage.", tgt:"any",
  fx(g,s,t){ dmg(g,t,1+sig(g,s),null); } },
s_nodstrom:{ n:"Emergency Power", c:0, t:"spell", txt:"Gain 2 energy this turn. Overheat (2).",
  fx(g,s){ g.players[s].cur+=2; g.players[s].ovlNext+=2; } },
s_kortslut:{ n:"Short Circuit", c:1, t:"spell", txt:"Deal 2 damage.", tgt:"any",
  fx(g,s,t){ dmg(g,t,2+sig(g,s),null); } },
s_loddetin:{ cls:"tek", n:"Solder", c:1, t:"spell", txt:"Give a friendly unit +0/+3.", tgt:"funit",
  fx(g,s,t){ buff(g,t,0,3); } },
s_overclock:{ n:"Overclock", c:1, t:"spell", txt:"Give a friendly unit +2/+0. It can attack immediately.", tgt:"funit",
  fx(g,s,t){ buff(g,t,2,0); const u=refUnit(g,t); if(u){ u.jp=false; u.atk=Math.max(u.atk,1); } } },
s_stoj:{ n:"Signal Noise", c:1, t:"spell", txt:"Give an enemy unit -2 Attack.", tgt:"eunit",
  fx(g,s,t){ const u=refUnit(g,t); if(u) u.a=Math.max(0,u.a-2); } },
s_datalak:{ n:"Data Leak", c:1, t:"spell", txt:"Draw a card. Chain: Draw 2 instead.",
  fx(g,s,t,combo){ draw(g,s,combo?2:1); } },
s_lynafleder:{ n:"Lightning Rod", c:2, t:"spell", txt:"Give a friendly unit Grounded and +0/+2.", tgt:"funit",
  fx(g,s,t){ buff(g,t,0,2); const u=refUnit(g,t); if(u&&!u.akw.includes("jord")) u.akw.push("jord"); } },
s_genstart:{ n:"Reboot", c:2, t:"spell", txt:"Return a unit to its owner’s hand.", tgt:"unit",
  fx(g,s,t){ bounce(g,t); } },
s_diag:{ n:"Diagnostics", c:2, t:"spell", txt:"Draw 2 cards.",
  fx(g,s){ draw(g,s,2); } },
s_nulstil:{ n:"Reset", c:2, t:"spell", txt:"Reset a unit (removes all text and buffs).", tgt:"unit",
  fx(g,s,t){ const u=refUnit(g,t); if(u) silence(g,u); } },
s_lysbue:{ n:"Arc Flash", c:2, t:"spell", txt:"Deal 2 damage to an enemy unit and 1 to its neighbors.", tgt:"eunit",
  fx(g,s,t){ const b=sig(g,s); const adj=neighbors(g,t); dmg(g,t,2+b,null); for(const r of adj) dmg(g,r,1+b,null); } },
s_spids:{ n:"Voltage Spike", c:2, t:"spell", txt:"Deal 3 damage. Overheat (1).", tgt:"any",
  fx(g,s,t){ dmg(g,t,3+sig(g,s),null); g.players[s].ovlNext+=1; } },
s_kabels:{ cls:"tek", n:"Cable Spaghetti", c:2, t:"spell", txt:"Swap a unit’s Attack and Health.", tgt:"unit",
  fx(g,s,t){ const u=refUnit(g,t); if(!u) return; const hpNow=Math.max(0,u.hM-u.dmg); const oldA=u.a;
    u.a=hpNow; u.hM=oldA; u.dmg=0; if(u.hM<=0){ u.dmg=999; } } },
s_reserve:{ cls:"tek", n:"Spare Parts", c:2, t:"spell", txt:"Add 2 random Components to your hand.",
  fx(g,s){ for(let i=0;i<2;i++){ const id=pick(POOL_KOMP); if(id) addHand(g,s,id); } } },
s_firmware:{ cls:"tek", n:"Firmware Update", c:3, t:"spell", txt:"Give all your units +1/+1.",
  fx(g,s){ for(const u of g.players[s].board){ u.a+=1; u.hM+=1; } } },
s_genoplad:{ cls:"tek", n:"Recharge", c:3, t:"spell", txt:"Repair your hero and all friendly units for 3.",
  fx(g,s){ healHero(g,s,3); for(const u of g.players[s].board) u.dmg=Math.max(0,u.dmg-3); } },
s_hack:{ n:"Hack", c:3, t:"spell", txt:"Take control of an enemy unit with 2 or less Attack.",
  tgt:"eunit", f:(g,s,r,u)=>effAtk(g,r.s,u)<=2 && g.players[s].board.length<MAXBOARD,
  fx(g,s,t){ takeControl(g,s,t); } },
s_induk:{ n:"Induction", c:3, t:"spell", txt:"Gain 1 energy this turn. Draw a card.",
  fx(g,s){ g.players[s].cur+=1; draw(g,s,1); } },
s_backup:{ cls:"tek", n:"Backup", c:3, t:"spell", txt:"Add a copy of a friendly unit to your hand.", tgt:"funit",
  fx(g,s,t){ const u=refUnit(g,t); if(u) addHand(g,s,u.id); } },
s_kompil:{ n:"Compile", c:3, t:"spell", txt:"Draw a random Spell from your deck.",
  fx(g,s){ tutor(g,s,id=>CARDS[id].t==="spell"); } },
s_kadelyn:{ n:"Chain Lightning", c:4, t:"spell", txt:"Deal 3 damage to an enemy unit and 2 to its neighbors.", tgt:"eunit",
  fx(g,s,t){ const b=sig(g,s); const adj=neighbors(g,t); dmg(g,t,3+b,null); for(const r of adj) dmg(g,r,2+b,null); } },
s_magnet:{ n:"Magnetic Field", c:4, t:"spell", txt:"Deal 2 damage to all enemy units.",
  fx(g,s){ aoe(g,1-s,2+sig(g,s)); } },
s_forstark:{ n:"Power Amplifier", c:4, t:"spell", txt:"Double a friendly unit’s Attack.", tgt:"funit",
  fx(g,s,t){ const u=refUnit(g,t); if(u) u.a*=2; } },
s_gendan:{ cls:"tek", n:"System Restore", c:4, t:"spell", txt:"Repair your hero for 8.",
  fx(g,s){ healHero(g,s,8); } },
s_overbel:{ n:"Overload", c:4, t:"spell", txt:"Deal 5 damage. Overheat (2).", tgt:"any",
  fx(g,s,t){ dmg(g,t,5+sig(g,s),null); g.players[s].ovlNext+=2; } },
s_ransom:{ n:"Ransomware", c:5, t:"spell", txt:"Destroy an enemy unit. Your opponent draws a card.", tgt:"eunit",
  fx(g,s,t){ const u=refUnit(g,t); if(u){ u.dmg=999; sweep(g); draw(g,1-s,1); } } },
s_printer:{ cls:"tek", n:"3D Printer", c:5, t:"spell", txt:"Summon a copy of a friendly unit (base version).", tgt:"funit",
  fx(g,s,t){ const u=refUnit(g,t); if(u) summon(g,s,u.id); } },
s_uvejr:{ n:"Server Room Storm", c:5, t:"spell", txt:"Deal 2 damage to a random enemy, 4 times.",
  fx(g,s){ const b=sig(g,s); for(let i=0;i<4;i++){ const r=randEnemyRef(g,s); if(!r) break; dmg(g,r,2+b,null); } } },
s_oversp:{ n:"Power Surge", c:6, t:"spell", txt:"Deal 4 damage to all enemy units.",
  fx(g,s){ aoe(g,1-s,4+sig(g,s)); } },
s_massep:{ n:"Mass Production", c:6, t:"spell", txt:"Fill your board with 1/1 Microbots.",
  fx(g,s){ while(g.players[s].board.length<MAXBOARD){ if(!summon(g,s,"t_mikrobot")) break; } } },
s_emp:{ n:"EMP", c:7, t:"spell", txt:"Destroy all units.",
  fx(g){ for(const p of g.players) for(const u of p.board) u.dmg=999; sweep(g); } },
s_nedsmelt:{ n:"Total Meltdown", c:8, t:"spell", txt:"Deal 4 damage to all heroes and units.",
  fx(g,s){ const n=4+sig(g,s);
    g.players[0].hp-=n; fxPush(g,{t:"dmg",s:0,u:null,n});
    g.players[1].hp-=n; fxPush(g,{t:"dmg",s:1,u:null,n});
    aoe(g,0,n); aoe(g,1,n); checkWin(g); } },

// ===== KOMPONENTER (18) =====
u_modstand:{ n:"Resistor", c:1, t:"unit", tr:"Component", a:0, h:3, kw:["jord"], txt:"Grounded." },
u_led:{ n:"LED", c:1, t:"unit", tr:"Component", a:1, h:1, txt:"Breakdown: Give a random friendly unit +1/+0.",
  dr(g,s){ const u=pick(g.players[s].board); if(u) u.a+=1; } },
u_kontakt:{ n:"Switch", c:1, t:"unit", tr:"Component", a:1, h:2, txt:"Install — Chain: Draw a card.",
  bc(g,s,u,t,combo){ if(combo) draw(g,s,1); } },
u_sikring:{ n:"Fuse", c:1, t:"unit", tr:"Component", a:0, h:2, kw:["jord"], txt:"Grounded. Breakdown: Repair your hero for 2.",
  dr(g,s){ healHero(g,s,2); } },
u_piezo:{ n:"Piezo Buzzer", c:1, t:"unit", tr:"Component", a:1, h:1, txt:"Breakdown: Deal 1 damage to a random enemy unit.",
  dr(g,s){ const u=pick(g.players[1-s].board); if(u) dmg(g,{s:1-s,u:u.uid},1,null); } },
u_transistor:{ n:"Transistor", c:2, t:"unit", tr:"Component", a:2, h:2, sig:1, txt:"Signal Strength +1 (your Spells deal +1 damage)." },
u_diode:{ n:"Diode", c:2, t:"unit", tr:"Component", a:3, h:2, kw:["noHero"], txt:"Can’t attack heroes." },
u_kondens:{ n:"Capacitor", c:2, t:"unit", tr:"Component", a:1, h:3, txt:"Breakdown: Store 1 energy in the capacitor bank.",
  dr(g,s){ addStored(g,s,1); } },
u_koleleg:{ n:"Heat Sink", c:2, t:"unit", tr:"Component", a:0, h:5, kw:["jord"], txt:"Grounded." },
u_spole:{ n:"Coil", c:2, t:"unit", tr:"Component", a:2, h:3, txt:"“Hums a bit, but it holds.”" },
u_potmeter:{ n:"Potentiometer", c:2, t:"unit", tr:"Component", a:1, h:1, txt:"Install: Give another friendly unit +1/+1.",
  bcTgt:"funitO", bc(g,s,u,t){ if(t) buff(g,t,1,1); } },
u_krystal:{ n:"Crystal Oscillator", c:3, t:"unit", tr:"Component", a:2, h:2, txt:"At the start of your turn: +1 Attack.",
  start(g,s,u){ u.a+=1; } },
u_printplade:{ n:"Circuit Board", c:3, t:"unit", tr:"Component", a:0, h:4, txt:"Your other Components have +1/+1.",
  aura:{ others:true, tribe:"Component", a:1, h:1 } },
u_transform:{ n:"Transformer", c:3, t:"unit", tr:"Component", a:2, h:4, txt:"Install: Give another friendly unit +2/+0.",
  bcTgt:"funitO", bc(g,s,u,t){ if(t) buff(g,t,2,0); } },
u_relae:{ cls:"tek", n:"Relay", c:3, t:"unit", tr:"Component", a:2, h:3, txt:"Install: Another friendly unit can attack immediately.",
  bcTgt:"funitO", bc(g,s,u,t){ const x=refUnit(g,t); if(x){ x.jp=false; x.atkLeft=Math.max(x.atkLeft,1); } } },
u_solpanel:{ n:"Solar Panel", c:4, t:"unit", tr:"Component", a:1, h:5, txt:"At the start of your turn: Gain 1 energy this turn.",
  start(g,s){ g.players[s].cur+=1; } },
u_psu:{ n:"Power Supply", c:4, t:"unit", tr:"Component", a:2, h:5, kw:["jord"], txt:"Grounded. Breakdown: Store 1 energy.",
  dr(g,s){ addStored(g,s,1); } },
u_superkond:{ n:"Supercapacitor", c:5, t:"unit", tr:"Component", a:3, h:5, txt:"Install: Store 2 energy in the capacitor bank.",
  bc(g,s){ addStored(g,s,2); } },

// ===== ROBOTTER (16) =====
u_skruebot:{ n:"Screwbot", c:1, t:"unit", tr:"Robot", a:1, h:1, txt:"Install: Give another friendly Robot +1/+1.",
  bcTgt:"funitO", bcF:(g,s,r,u)=>CARDS[u.id].tr==="Robot", bc(g,s,u,t){ if(t) buff(g,t,1,1); } },
u_loddebot:{ cls:"tek", n:"Solderbot", c:2, t:"unit", tr:"Robot", a:2, h:1, txt:"Install: Deal 1 damage.",
  bcTgt:"any", bc(g,s,u,t){ if(t) dmg(g,t,1,null); } },
u_skraldebot:{ n:"Garbagebot", c:2, t:"unit", tr:"Robot", a:2, h:3, txt:"Breakdown: Add a random Component to your hand.",
  dr(g,s){ const id=pick(POOL_KOMP); if(id) addHand(g,s,id); } },
u_vagtbot:{ n:"Guardbot", c:3, t:"unit", tr:"Robot", a:2, h:4, kw:["jord"], txt:"Grounded." },
u_byggebot:{ n:"Builderbot", c:3, t:"unit", tr:"Robot", a:2, h:2, txt:"Install: Summon a 1/1 Microbot.",
  bc(g,s){ summon(g,s,"t_mikrobot"); } },
u_speederbot:{ n:"Speedbot", c:3, t:"unit", tr:"Robot", a:3, h:2, kw:["turbo"], txt:"Turbo." },
u_sumobot:{ n:"Sumobot", c:4, t:"unit", tr:"Robot", a:3, h:5, kw:["jord"], txt:"Grounded." },
u_svejsebot:{ n:"Weldbot", c:4, t:"unit", tr:"Robot", a:3, h:4, txt:"Install: Deal 2 damage. Chain: Deal 4 instead.",
  bcTgt:"any", bc(g,s,u,t,combo){ if(t) dmg(g,t,combo?4:2,null); } },
u_sergent:{ n:"Robo-Sergeant", c:4, t:"unit", tr:"Robot", a:3, h:3, txt:"Your other Robots have +1 Attack.",
  aura:{ others:true, tribe:"Robot", a:1 } },
u_repbot:{ cls:"tek", n:"Repairbot", c:4, t:"unit", tr:"Robot", a:2, h:5, txt:"At the end of your turn: Repair a random damaged friendly unit for 2.",
  end(g,s){ const c=g.players[s].board.filter(x=>x.dmg>0); const u=pick(c); if(u) u.dmg=Math.max(0,u.dmg-2); } },
u_boksebot:{ n:"Boxerbot", c:5, t:"unit", tr:"Robot", a:3, h:5, kw:["dob"], txt:"Dual Core." },
u_fabrik:{ n:"Robot Factory", c:5, t:"unit", tr:"Robot", a:0, h:6, txt:"At the end of your turn: Summon a 1/1 Microbot.",
  end(g,s){ summon(g,s,"t_mikrobot"); } },
u_kranbot:{ n:"Cranebot", c:5, t:"unit", tr:"Robot", a:4, h:5, kw:["jord"], txt:"Grounded." },
u_nedriver:{ n:"Demolition Bot", c:6, t:"unit", tr:"Robot", a:5, h:5, txt:"Install: Deal 2 damage to all other units.",
  bc(g,s,u){ for(const p of [0,1]) for(const x of g.players[p].board.map(v=>v.uid)){ if(x!==u.uid) dmg(g,{s:p,u:x},2,null); } } },
u_panserbot:{ n:"Armorbot", c:6, t:"unit", tr:"Robot", a:4, h:6, kw:["jord","iso"], txt:"Grounded. Insulated." },
u_kolos:{ n:"Mech Colossus", c:7, t:"unit", tr:"Robot", a:7, h:7, txt:"Overheat (1).",
  bc(g,s){ g.players[s].ovlNext+=1; } },

// ===== DRONER (12) =====
u_nano:{ n:"Nanodrone", c:1, t:"unit", tr:"Drone", a:1, h:1, kw:["turbo"], txt:"Turbo." },
u_spejder:{ n:"Scout Drone", c:1, t:"unit", tr:"Drone", a:1, h:2, kw:["skjul"], txt:"Cloaked." },
u_kampdrone:{ n:"Combat Drone", c:2, t:"unit", tr:"Drone", a:2, h:1, kw:["turbo"], txt:"Turbo." },
u_svarm:{ n:"Swarm Drone", c:2, t:"unit", tr:"Drone", a:1, h:1, txt:"Install: Summon a 1/1 Nanodrone with Turbo.",
  bc(g,s){ summon(g,s,"u_nano"); } },
u_kamikaze:{ n:"Kamikaze Drone", c:2, t:"unit", tr:"Drone", a:2, h:1, txt:"Breakdown: Deal 2 damage to a random enemy unit.",
  dr(g,s){ const u=pick(g.players[1-s].board); if(u) dmg(g,{s:1-s,u:u.uid},2,null); } },
u_levering:{ n:"Delivery Drone", c:3, t:"unit", tr:"Drone", a:2, h:2, txt:"Install: Draw a card.",
  bc(g,s){ draw(g,s,1); } },
u_forer:{ n:"Drone Pilot", c:3, t:"unit", tr:"Drone", a:2, h:3, txt:"Your other Drones have Turbo.",
  aura:{ others:true, tribe:"Drone", kw:["turbo"] } },
u_jager:{ n:"Fighter Drone", c:4, t:"unit", tr:"Drone", a:4, h:3, kw:["turbo"], txt:"Turbo." },
u_dronebase:{ n:"Drone Base", c:4, t:"unit", tr:"Drone", a:1, h:5, txt:"Your other Drones have +1 Attack.",
  aura:{ others:true, tribe:"Drone", a:1 } },
u_fragt:{ n:"Cargo Drone", c:5, t:"unit", tr:"Drone", a:3, h:4, txt:"Install: Summon two 1/1 Nanodrones with Turbo.",
  bc(g,s){ summon(g,s,"u_nano"); summon(g,s,"u_nano"); } },
u_stealthdrone:{ n:"Stealth Drone", c:5, t:"unit", tr:"Drone", a:4, h:4, kw:["skjul"], txt:"Cloaked." },
u_hyper:{ n:"Hyperdrone", c:6, t:"unit", tr:"Drone", a:3, h:4, kw:["turbo","dob"], txt:"Turbo. Dual Core." },

// ===== VIRUS (11) =====
u_datamide:{ n:"Data Mite", c:1, t:"unit", tr:"Virus", a:1, h:1, kw:["hoj"], txt:"High Voltage." },
u_glitch:{ n:"Glitch", c:1, t:"unit", tr:"Virus", a:2, h:1, txt:"“Have you tried turning it off and on again?”" },
u_adware:{ n:"Adware", c:2, t:"unit", tr:"Virus", a:3, h:2, txt:"Breakdown: Your opponent draws a card.",
  dr(g,s){ draw(g,1-s,1); } },
u_spion:{ n:"Spyware", c:2, t:"unit", tr:"Virus", a:1, h:3, txt:"Install: Copy a random card from your opponent’s hand to yours.",
  bc(g,s){ const h=g.players[1-s].hand; const c=pick(h); if(c) addHand(g,s,c.id); } },
u_snylter:{ n:"Data Leech", c:3, t:"unit", tr:"Virus", a:3, h:3, kw:["host"], txt:"Energy Harvest." },
u_logikbombe:{ n:"Logic Bomb", c:3, t:"unit", tr:"Virus", a:0, h:4, kw:["jord"], txt:"Grounded. Breakdown: Deal 2 damage to all enemy units.",
  dr(g,s){ aoe(g,1-s,2); } },
u_trojan:{ n:"Trojan Horse", c:4, t:"unit", tr:"Virus", a:4, h:4, kw:["skjul"], txt:"Cloaked." },
u_replikator:{ n:"Replicator", c:4, t:"unit", tr:"Virus", a:3, h:3, txt:"Breakdown: Summon two 1/1 Bugs.",
  dr(g,s){ summon(g,s,"t_bug"); summon(g,s,"t_bug"); } },
u_ormen:{ n:"The Worm", c:5, t:"unit", tr:"Virus", a:4, h:4, txt:"At the end of your turn: +1/+1.",
  end(g,s,u){ u.a+=1; u.hM+=1; } },
u_rootkit:{ n:"Rootkit", c:5, t:"unit", tr:"Virus", a:4, h:5, txt:"Install: Reset an enemy unit.",
  bcTgt:"eunit", bc(g,s,u,t){ const x=refUnit(g,t); if(x) silence(g,x); } },
u_botnet:{ n:"Botnet Brain", c:6, t:"unit", tr:"Virus", a:4, h:6, txt:"At the end of your turn: Summon a 1/1 Bug.",
  end(g,s){ summon(g,s,"t_bug"); } },

// ===== LEGENDARISKE (10) =====
l_praktikant:{ n:"The Intern", c:2, t:"unit", tr:null, r:"L", a:2, h:3, txt:"Install: Deal 2 damage to a COMPLETELY random target (anything can be hit).",
  bc(g,s,u){ const pool=[]; for(const p of [0,1]){ pool.push({s:p,u:null}); for(const x of g.players[p].board) if(x.uid!==u.uid) pool.push({s:p,u:x.uid}); }
    const t=pick(pool); if(t) dmg(g,t,2,null); } },
l_roomba:{ n:"ROOMBA PRIME", c:5, t:"unit", tr:"Robot", r:"L", a:3, h:3, kw:["turbo","hoj"], txt:"Turbo. High Voltage. Vacuums up everything." },
l_gdpr:{ n:"GDPR Bot", c:6, t:"unit", tr:"Robot", r:"L", a:4, h:5, txt:"Install: Both players delete their hands and draw that many cards.",
  bc(g){ for(const p of [0,1]){ const n=g.players[p].hand.length; g.players[p].hand=[]; draw(g,p,n); } } },
l_moderkort:{ n:"THE MOTHERBOARD", c:6, t:"unit", tr:"Component", r:"L", a:0, h:8, kw:["jord"], txt:"Grounded. Your other units have +1/+1.",
  aura:{ others:true, a:1, h:1 } },
l_tesla:{ n:"TESLA COIL", c:7, t:"unit", tr:"Component", r:"L", a:4, h:6, txt:"At the end of your turn: Deal 3 damage to a random enemy.",
  end(g,s){ const r=randEnemyRef(g,s); if(r) dmg(g,r,3,null); } },
l_virusx:{ n:"VIRUS X", c:7, t:"unit", tr:"Virus", r:"L", a:5, h:5, kw:["hoj","host"], txt:"High Voltage. Energy Harvest." },
l_alan:{ n:"A.L.A.N.", c:8, t:"unit", tr:"Robot", r:"L", a:6, h:6, txt:"Install: Draw 3 cards. (“I’m afraid I can’t do that, Dave.”)",
  bc(g,s){ draw(g,s,3); } },
l_kvante:{ n:"THE QUANTUM BOX", c:8, t:"unit", tr:"Component", r:"L", a:5, h:7, txt:"At the end of your turn: Add a random Spell to your hand.",
  end(g,s){ const id=pick(POOL_PROG); if(id) addHand(g,s,id); } },
l_titan:{ n:"TITAN-9000", c:9, t:"unit", tr:"Robot", r:"L", a:8, h:8, kw:["jord"], txt:"Grounded. Install: Destroy the enemy unit with the highest Attack.",
  bc(g,s){ const b=g.players[1-s].board; if(!b.length) return; let m=b[0]; for(const x of b) if(effAtk(g,1-s,x)>effAtk(g,1-s,m)) m=x; m.dmg=999; sweep(g); } },
l_overtek:{ cls:"tek", n:"THE OVERTECHNICIAN", c:9, t:"unit", tr:null, r:"L", a:6, h:6, txt:"Install: Give all your other units +2/+2.",
  bc(g,s,u){ for(const x of g.players[s].board) if(x.uid!==u.uid){ x.a+=2; x.hM+=2; } } },

// ===== RARE (◆) — stærkere end commons, findes sjældnere =====
r_fluxkond:{ n:"Flux Capacitor", c:3, t:"unit", tr:"Component", r:"R", a:2, h:3,
  txt:"Install: Store 2 energy in your capacitor bank.",
  bc(g,s,u){ addStored(g,s,2); } },
r_brandmur:{ n:"Firewall Tower", c:5, t:"unit", tr:"Component", r:"R", a:2, h:7, kw:["jord","iso"],
  txt:"Grounded. Insulated." },
r_stoedbolge:{ n:"Surge Wave", c:4, t:"spell", r:"R",
  txt:"Deal 2 damage to ALL enemy units.",
  fx(g,s){ const n=2+sig(g,s); for(const u of [...g.players[1-s].board]) dmg(g,{s:1-s,u:u.uid},n,null); } },
r_cachelaeser:{ n:"Cache Reader", c:3, t:"spell", r:"R",
  txt:"Draw 2 cards.",
  fx(g,s){ draw(g,s,2); } },
r_magnetfelt:{ n:"Magnet Field", c:3, t:"spell", r:"R", tgt:"eunit",
  txt:"Return an enemy unit to its owner’s hand.",
  fx(g,s,t){ bounce(g,t); } },
r_turbolader:{ n:"Turbo Charger", c:2, t:"spell", r:"R", tgt:"funit",
  txt:"Give a friendly unit +2 Attack and Turbo.",
  fx(g,s,t){ buff(g,t,2,0); const u=refUnit(g,t); if(u){ u.akw.push("turbo"); u.jp=false; } } },

// ===== FLERE LEGENDARIES (★) =====
l_spejlserver:{ n:"MIRROR SERVER", c:6, t:"unit", tr:"Robot", r:"L", a:3, h:4,
  txt:"Install: Summon a fresh copy of a random enemy unit. If there are none, summon a 1/1 Bug.",
  bc(g,s,u){ if(g.players[s].board.length>=MAXBOARD) return;
    const eb=g.players[1-s].board;
    if(eb.length){ summon(g,s,pick(eb).id); } else { summon(g,s,"t_bug"); } } },
l_singularitet:{ n:"THE SINGULARITY", c:9, t:"unit", tr:null, r:"L", a:6, h:6, kw:["turbo"],
  txt:"Turbo. Install: Gains +1/+1 for every other unit in play.",
  bc(g,s,u){ let n=0; for(const p of [0,1]) for(const x of g.players[p].board) if(x.uid!==u.uid) n++;
    if(n>0){ u.a+=n; u.hM+=n; } } },
l_hovedafbryder:{ n:"MASTER BREAKER", c:8, t:"spell", r:"L",
  txt:"Destroy ALL units. Both heroes repair 4.",
  fx(g,s){ for(const p of [0,1]) for(const u of [...g.players[p].board]) dmg(g,{s:p,u:u.uid},99,null);
    healHero(g,0,4); healHero(g,1,4); } },
l_thorexe:{ n:"THOR.EXE", c:7, t:"unit", tr:"Robot", r:"L", a:4, h:5, kw:["hoj"],
  txt:"High Voltage. Install: Deal 1 damage to all enemy units.",
  bc(g,s,u){ for(const x of [...g.players[1-s].board]) dmg(g,{s:1-s,u:x.uid},1,null); } },

// ===== TOKENS (ikke i samlingen) =====

// ---------- The Hacker (klassekort) ----------
hk_spoof:{ cls:"hack", n:"Spoof", c:1, t:"spell", txt:"Give a friendly unit Cloaked.",
  tgt:"funit", fx(g,s,t){ const u=refUnit(g,t); if(u){ u.akw.push("skjul"); u.st=true; } } },
hk_phish:{ cls:"hack", n:"Phishing", c:1, t:"spell", txt:"Copy a random card from your opponent’s hand to yours.",
  fx(g,s){ const oh=g.players[1-s].hand; if(oh.length) addHand(g,s,pick(oh).id); } },
hk_bugswarm:{ cls:"hack", n:"Bug Swarm", c:2, t:"spell", txt:"Summon two 1/1 Bugs. Chain: Three instead.",
  fx(g,s,t,combo){ for(let i=0;i<(combo?3:2);i++) summon(g,s,"t_bug"); } },
hk_keylog:{ cls:"hack", n:"Keylogger", c:2, t:"unit", tr:"Virus", a:1, h:3, kw:["skjul"],
  txt:"Cloaked. Breakdown: Draw a card.", dr(g,s){ draw(g,s,1); } },
hk_ddos:{ cls:"hack", n:"DDoS", c:3, t:"spell", txt:"Give all enemy units -2 Attack.",
  fx(g,s){ for(const u of g.players[1-s].board) buff(g,{s:1-s,u:u.uid},-2,0); } },
hk_crypto:{ cls:"hack", n:"Cryptojacker", c:3, t:"unit", tr:"Virus", a:2, h:3, kw:["host"],
  txt:"Energy Harvest. Install: Store 1 energy.", bc(g,s){ addStored(g,s,1); } },
hk_mitm:{ cls:"hack", n:"Man in the Middle", c:4, t:"unit", tr:"Virus", a:3, h:4,
  txt:"Install: Return an enemy unit to its owner’s hand.",
  bcTgt:"eunit", bc(g,s,u,t){ if(t) bounce(g,t); } },
hk_glitchstorm:{ cls:"hack", n:"Glitch Storm", c:4, t:"spell", txt:"Deal 1 damage to all enemy units, twice.",
  fx(g,s){ aoe(g,1-s,1); aoe(g,1-s,1); } },
hk_payload:{ cls:"hack", n:"Payload", c:5, t:"unit", tr:"Virus", a:4, h:4,
  txt:"Breakdown: Deal 3 damage to the enemy hero.", dr(g,s){ dmg(g,{s:1-s,u:null},3,null); } },
hk_zeroday:{ cls:"hack", n:"Zero-Day", c:5, t:"spell", txt:"Destroy a damaged enemy unit.",
  tgt:"eunit", f:(g,s,r,u)=>u.dmg>0, fx(g,s,t){ const u=refUnit(g,t); if(u){ u.dmg=999; sweep(g); } } },
hk_root:{ cls:"hack", n:"Root Access", c:6, t:"spell", txt:"Take control of an enemy unit.",
  tgt:"eunit", f:(g,s,r,u)=>g.players[s].board.length<MAXBOARD, fx(g,s,t){ takeControl(g,s,t); } },
hk_mirror:{ cls:"hack", n:"M1RR0R", c:7, t:"unit", tr:"Virus", r:"L", a:5, h:5,
  txt:"Install: Summon a base copy of an enemy unit.",
  bcTgt:"eunit", bc(g,s,u,t){ const e=refUnit(g,t); if(e) summon(g,s,e.id); } },
// ---------- The Overclocker (klassekort) ----------
ov_jolt:{ cls:"over", n:"Jolt", c:1, t:"spell", txt:"Deal 2 damage. Overheat (1).",
  tgt:"any", fx(g,s,t){ dmg(g,t,2+sig(g,s),null); g.players[s].ovlNext+=1; } },
ov_boost:{ cls:"over", n:"Turbo Boost", c:2, t:"spell", txt:"Give a friendly unit Turbo and +1/+0.",
  tgt:"funit", fx(g,s,t){ const u=refUnit(g,t); if(u){ u.akw.push("turbo"); buff(g,t,1,0); } } },
ov_coolant:{ cls:"over", n:"Coolant Flush", c:2, t:"spell", txt:"Unlock all your overheated energy (this turn and pending).",
  fx(g,s){ const p=g.players[s]; p.cur+=p.ovlShown; p.ovlShown=0; p.ovlNext=0; } },
ov_reactor:{ cls:"over", n:"Micro Reactor", c:3, t:"unit", tr:"Component", a:0, h:6,
  txt:"At the start of your turn: Store 1 energy.", start(g,s,u){ addStored(g,s,1); } },
ov_amped:{ cls:"over", n:"Amped Up", c:3, t:"spell", txt:"Give a friendly unit +3/+3. Overheat (1).",
  tgt:"funit", fx(g,s,t){ buff(g,t,3,3); g.players[s].ovlNext+=1; } },
ov_press:{ cls:"over", n:"Hydraulic Press", c:4, t:"unit", tr:"Robot", a:5, h:2,
  txt:"Overheat (1).", bc(g,s){ g.players[s].ovlNext+=1; } },
ov_flux:{ cls:"over", n:"Flux Capacitor", c:4, t:"unit", tr:"Component", a:1, h:5,
  txt:"Install: Store 2 energy.", bc(g,s){ addStored(g,s,2); } },
ov_heatwave:{ cls:"over", n:"Heat Wave", c:5, t:"spell", txt:"Deal 3 damage to all enemy units. Overheat (2).",
  fx(g,s){ aoe(g,1-s,3+sig(g,s)); g.players[s].ovlNext+=2; } },
ov_dynamo:{ cls:"over", n:"Dynamo", c:5, t:"unit", tr:"Component", a:4, h:5,
  txt:"At the end of your turn: Deal 1 damage to the enemy hero for each stored energy.",
  end(g,s,u){ const n=g.players[s].stored; if(n>0) dmg(g,{s:1-s,u:null},n,null); } },
ov_golem:{ cls:"over", n:"Scrap Golem", c:6, t:"unit", tr:"Robot", a:7, h:7,
  txt:"Overheat (2).", bc(g,s){ g.players[s].ovlNext+=2; } },
ov_core:{ cls:"over", n:"Fission Core", c:7, t:"unit", tr:"Component", a:6, h:6, kw:["jord"],
  txt:"Grounded. Breakdown: Deal 3 damage to all other units and both heroes.",
  dr(g,s){
    g.players[0].hp-=3; fxPush(g,{t:"dmg",s:0,u:null,n:3});
    g.players[1].hp-=3; fxPush(g,{t:"dmg",s:1,u:null,n:3});
    aoe(g,0,3); aoe(g,1,3); checkWin(g);
  } },
ov_giga:{ cls:"over", n:"GIGAWATT", c:10, t:"unit", tr:"Robot", r:"L", a:10, h:10, kw:["turbo"],
  txt:"Turbo. Overheat (3).", bc(g,s){ g.players[s].ovlNext+=3; } },
// ---------- nye neutrale ----------
n_jumper:{ n:"Jumper Wires", c:0, t:"spell", txt:"Give a friendly unit +1/+1.",
  tgt:"funit", fx(g,s,t){ buff(g,t,1,1); } },
n_multimeter:{ n:"Multimeter", c:1, t:"unit", tr:"Component", a:1, h:2,
  txt:"Install: Draw a card. Overheat (1).", bc(g,s){ draw(g,s,1); g.players[s].ovlNext+=1; } },
n_fan:{ n:"Cooling Fan", c:2, t:"unit", tr:"Component", a:1, h:4,
  txt:"Install: Unlock 1 overheated energy.",
  bc(g,s){ const p=g.players[s]; if(p.ovlShown>0){ p.ovlShown--; p.cur++; } else if(p.ovlNext>0) p.ovlNext--; } },
n_breadboard:{ n:"Breadboard", c:2, t:"unit", tr:"Component", a:2, h:3,
  txt:"Install: Give your other Components +0/+1.",
  bc(g,s,u){ for(const q of g.players[s].board) if(q.uid!==u.uid&&CARDS[q.id].tr==="Component") buff(g,{s,u:q.uid},0,1); } },
n_oscillo:{ n:"Oscilloscope", c:3, t:"unit", tr:"Component", a:2, h:4, sig:1,
  txt:"Signal Strength +1 (your Spells deal +1 damage)." },
n_surgeprot:{ n:"Surge Protector", c:3, t:"unit", tr:"Component", a:2, h:5, kw:["jord","iso"],
  txt:"Grounded. Insulated." },
n_ball:{ n:"Ball Lightning", c:4, t:"unit", a:4, h:3, kw:["turbo"],
  txt:"Turbo. Overheat (1).", bc(g,s){ g.players[s].ovlNext+=1; } },
n_scrapyard:{ n:"Scrapyard", c:4, t:"unit", a:0, h:8, kw:["jord"],
  txt:"Grounded. Breakdown: Add a random Component to your hand.",
  dr(g,s){ addHand(g,s,pick(POOL_KOMP)); } },
n_datacenter:{ n:"Data Center", c:5, t:"unit", a:3, h:7, kw:["jord"],
  txt:"Grounded. Breakdown: Store 2 energy.", dr(g,s){ addStored(g,s,2); } },
n_mainframe:{ n:"THE MAINFRAME", c:8, t:"unit", r:"L", a:6, h:8, kw:["jord"],
  txt:"Grounded. At the end of your turn: Draw a card.", end(g,s,u){ draw(g,s,1); } },
t_mikrobot:{ n:"Microbot", c:1, t:"unit", tr:"Robot", a:1, h:1, tok:true, txt:"" },
t_bug:{ n:"Bug", c:1, t:"unit", tr:"Virus", a:1, h:1, tok:true, txt:"" },
t_server:{ n:"Server", c:3, t:"unit", tr:"Component", a:3, h:3, kw:["jord"], tok:true, txt:"Grounded." },
t_powerbank:{ n:"Powerbank", c:0, t:"spell", tok:true, txt:"Gain 1 energy this turn.",
  fx(g,s){ g.players[s].cur+=1; } },
};

const COLL = Object.keys(CARDS).filter(id=>!CARDS[id].tok)
  .sort((a,b)=>CARDS[a].c-CARDS[b].c || CARDS[a].n.localeCompare(CARDS[b].n,"en"));
const POOL_KOMP = COLL.filter(id=>CARDS[id].t==="unit" && CARDS[id].tr==="Component");
const POOL_PROG = COLL.filter(id=>CARDS[id].t==="spell");

// ---------- afledte værdier / auraer ----------
function auraOn(g,s,u){
  const r={a:0,h:0,kw:[]};
  for(const src of g.players[s].board){
    if(src.sil) continue;
    const d=CARDS[src.id].aura; if(!d) continue;
    if(d.others && src.uid===u.uid) continue;
    if(d.tribe && CARDS[u.id].tr!==d.tribe) continue;
    r.a+=d.a||0; r.h+=d.h||0; if(d.kw) r.kw.push(...d.kw);
  }
  return r;
}
function effAtk(g,s,u){ return Math.max(0,u.a+auraOn(g,s,u).a); }
function effMax(g,s,u){ return u.hM+auraOn(g,s,u).h; }
function effHp(g,s,u){ return effMax(g,s,u)-u.dmg; }
function kws(g,s,u){
  const base=u.sil?[]:(CARDS[u.id].kw||[]);
  return [...new Set([...base,...u.akw,...auraOn(g,s,u).kw])];
}
function hasKw(g,s,u,k){ return kws(g,s,u).includes(k); }
function sig(g,s){ let n=g.players[s].sigB||0; for(const u of g.players[s].board){ if(!u.sil) n+=CARDS[u.id].sig||0; } return n; }

// ---------- grundhandlinger ----------
function nuid(g){ return "u"+(g.n++); }
function log(g,m){
  if(g._rec && g._rec.lines.length<8) g._rec.lines.push(m);
  g.log.push(m); if(g.log.length>60) g.log.shift();
}
/* ---------- historik ----------
   Hvert spillet kort optages som en post i g.hist: hvilke log-linjer der opstod
   mens kortet blev afviklet, hvilke enheder der døde, hvad der blev tilkaldt, og
   hvordan begge heltes HP ændrede sig. g._rec peger på den post der optages lige
   nu (kun sat inde i playCard) — log/sweep/summon skriver til den. */
const MAXHIST = 24;
function recStart(g,s,id){
  const rec={ k:(g.hk=(g.hk||0)+1), s, id, r:Math.max(1,Math.ceil(g.turn/2)),
    _hp:[g.players[0].hp,g.players[1].hp], kills:[], sum:[], lines:[] };
  g._rec=rec; return rec;
}
function recEnd(g,rec){
  g._rec=null;
  rec.dhp=[g.players[0].hp-rec._hp[0], g.players[1].hp-rec._hp[1]];
  delete rec._hp;
  if(!g.hist) g.hist=[];
  g.hist.push(rec);
  if(g.hist.length>MAXHIST) g.hist.shift();
}
function refUnit(g,r){ if(!r||r.u==null) return null; return g.players[r.s].board.find(x=>x.uid===r.u)||null; }
function checkWin(g){
  if(g.status!=="igang") return;
  const d0=g.players[0].hp<=0, d1=g.players[1].hp<=0;
  if(d0&&d1){ g.status="slut"; g.winner=2; log(g,"§bolt§ Double meltdown — it’s a draw!"); }
  else if(d0){ g.status="slut"; g.winner=1; log(g,"§trophy§ "+g.players[1].name+" wins!"); }
  else if(d1){ g.status="slut"; g.winner=0; log(g,"§trophy§ "+g.players[0].name+" wins!"); }
}
function fxPush(g,ev){ ev.k=(g.fxk=(g.fxk||0)+1); (g.fx=g.fx||[]).push(ev); if(g.fx.length>40) g.fx.shift(); }
function dmg(g,ref,n,src){
  if(n<=0||g.status!=="igang") return;
  if(ref.u==null){
    g.players[ref.s].hp-=n;
    fxPush(g,{t:"dmg",s:ref.s,u:null,n});
    if(src&&src.host) healHero(g,src.hs,n);
    checkWin(g); return;
  }
  const u=refUnit(g,ref); if(!u) return;
  if(u.sh){ u.sh=false; fxPush(g,{t:"skjold",s:ref.s,u:u.uid});
    log(g,"§shield§ "+CARDS[u.id].n+"’s insulation absorbs the damage."); return; }
  u.dmg+=n;
  fxPush(g,{t:"dmg",s:ref.s,u:u.uid,n});
  if(src&&src.host) healHero(g,src.hs,n);
  if(src&&src.hoj) u.dmg=999;
  sweep(g);
}
function healHero(g,s,n){ const p=g.players[s]; const r=Math.min((p.max||30)-p.hp,n);
  if(r>0){ p.hp+=r; fxPush(g,{t:"heal",s,u:null,n:r}); } }
function sweep(g){
  if(g._sw) return; g._sw=true;
  for(let i=0;i<30;i++){
    let dead=null, ds=0;
    for(const s of [0,1]){
      for(const u of g.players[s].board){ if(effHp(g,s,u)<=0){ dead=u; ds=s; break; } }
      if(dead) break;
    }
    if(!dead) break;
    const b=g.players[ds].board; b.splice(b.indexOf(dead),1);
    g.players[ds].grave++;
    fxPush(g,{t:"boom",s:ds,u:dead.uid});
    if(g._rec) g._rec.kills.push({id:dead.id,s:ds});
    log(g,"§cross§ "+CARDS[dead.id].n+" breaks down.");
    const def=CARDS[dead.id];
    if(!dead.sil && def.dr) def.dr(g,ds,dead);
  }
  g._sw=false;
}
function draw(g,s,n){
  const p=g.players[s];
  for(let i=0;i<n;i++){
    if(g.status!=="igang") return;
    if(!p.deck.length){
      p.fat++; p.hp-=p.fat;
      log(g,"§hole§ "+p.name+" is out of cards and takes "+p.fat+" fatigue damage.");
      checkWin(g); continue;
    }
    const id=p.deck.pop();
    if(p.hand.length>=MAXHAND){ log(g,"§fire§ "+p.name+"’s hand is full — "+CARDS[id].n+" burns up."); }
    else p.hand.push({uid:nuid(g),id});
  }
}
function addHand(g,s,id){
  const p=g.players[s];
  if(p.hand.length>=MAXHAND){ log(g,"§fire§ "+p.name+"’s hand is full — "+CARDS[id].n+" burns up."); return; }
  p.hand.push({uid:nuid(g),id});
}
function tutor(g,s,pred){
  const p=g.players[s];
  const idx=p.deck.map((id,i)=>pred(id)?i:-1).filter(i=>i>=0);
  if(!idx.length){ log(g,"…the deck contains nothing usable."); return; }
  const i=pick(idx); const id=p.deck.splice(i,1)[0]; addHand(g,s,id);
}
function mkUnit(g,id){
  const d=CARDS[id];
  return { uid:nuid(g), id, a:d.a, hM:d.h, dmg:0, akw:[], sil:false,
    sh:(d.kw||[]).includes("iso"), st:(d.kw||[]).includes("skjul"),
    jp:true, atkLeft:(d.kw||[]).includes("dob")?2:1 };
}
function summon(g,s,id){
  if(g.players[s].board.length>=MAXBOARD) return null;
  const u=mkUnit(g,id); g.players[s].board.push(u);
  fxPush(g,{t:"pop",s,u:u.uid});
  if(g._rec) g._rec.sum.push({id,s});
  return u;
}
function buff(g,ref,a,h){ const u=refUnit(g,ref); if(u){ u.a+=a; u.hM+=h; } }
function silence(g,u){
  const d=CARDS[u.id];
  u.sil=true; u.a=d.a; u.hM=d.h; u.akw=[]; u.sh=false; u.st=false;
  if(u.dmg>=u.hM) u.dmg=u.hM-1;
  if(u.dmg<0) u.dmg=0;
}
function bounce(g,ref){
  const u=refUnit(g,ref); if(!u) return;
  const b=g.players[ref.s].board; b.splice(b.indexOf(u),1);
  const p=g.players[ref.s];
  if(p.hand.length>=MAXHAND) log(g,"§fire§ "+CARDS[u.id].n+" burns up — the hand was full.");
  else p.hand.push({uid:nuid(g),id:u.id});
}
function takeControl(g,s,ref){
  const u=refUnit(g,ref); if(!u) return;
  if(g.players[s].board.length>=MAXBOARD) return;
  const b=g.players[ref.s].board; b.splice(b.indexOf(u),1);
  u.jp=true; g.players[s].board.push(u);
  fxPush(g,{t:"flyt",uid:u.uid,fra:ref.s,til:s,id:u.id});
  log(g,"§ninja§ "+g.players[s].name+" takes control of "+CARDS[u.id].n+"!");
}
function addStored(g,s,n){ const p=g.players[s]; p.stored=Math.min(MAXSTORED,p.stored+n); }
function aoe(g,side,n){
  const ids=g.players[side].board.map(u=>u.uid);
  for(const uid of ids) dmg(g,{s:side,u:uid},n,null);
}
function randEnemyRef(g,s){
  const e=1-s, pool=[{s:e,u:null}];
  for(const u of g.players[e].board) pool.push({s:e,u:u.uid});
  return pick(pool);
}
function neighbors(g,ref){
  const b=g.players[ref.s].board, i=b.findIndex(x=>x.uid===ref.u), out=[];
  if(i<0) return out;
  if(b[i-1]) out.push({s:ref.s,u:b[i-1].uid});
  if(b[i+1]) out.push({s:ref.s,u:b[i+1].uid});
  return out;
}

// ---------- mål-lister ----------
function targetable(g,byS,s,u){ return !(u.st && s!==byS); }
function specTargets(g,s,spec,f,selfUid){
  const out=[];
  const pushU=(ps)=>{ for(const u of g.players[ps].board){
    if(!targetable(g,s,ps,u)) continue;
    if(selfUid && u.uid===selfUid) continue;
    const r={s:ps,u:u.uid};
    if(f && !f(g,s,r,u)) continue;
    out.push(r);
  }};
  if(spec==="any"){ out.push({s:0,u:null},{s:1,u:null}); pushU(0); pushU(1); }
  else if(spec==="eany"){ out.push({s:1-s,u:null}); pushU(1-s); }
  else if(spec==="unit"){ pushU(0); pushU(1); }
  else if(spec==="eunit"){ pushU(1-s); }
  else if(spec==="funit"||spec==="funitO"){ pushU(s); }
  if((spec==="any"||spec==="eany") && f){
    return out.filter(r=>r.u!=null || f(g,s,r,null));
  }
  return out;
}
function targetsForCard(g,s,cardId,selfUid){
  const d=CARDS[cardId];
  const spec=d.t==="spell"?d.tgt:d.bcTgt;
  if(!spec) return {need:false,list:[]};
  const list=specTargets(g,s,spec,d.f||d.bcF,spec==="funitO"?selfUid:null);
  return {need:true,list};
}
function canPlay(g,s,cardId){
  const p=g.players[s], d=CARDS[cardId];
  if(d.c>p.cur) return false;
  if(d.t==="unit" && p.board.length>=MAXBOARD) return false;
  if(d.t==="spell" && d.tgt){
    if(!specTargets(g,s,d.tgt,d.f,null).length) return false;
  }
  return true;
}
function playCard(g,s,handUid,tref){
  if(g.status!=="igang"||g.active!==s) return "Not your turn.";
  const p=g.players[s];
  const hi=p.hand.findIndex(c=>c.uid===handUid);
  if(hi<0) return "That card is not in your hand.";
  const id=p.hand[hi].id, d=CARDS[id];
  if(!canPlay(g,s,id)) return "Can’t be played right now.";
  const spec=d.t==="spell"?d.tgt:d.bcTgt;
  if(spec){
    const list=specTargets(g,s,spec,d.f||d.bcF,null);
    if(d.t==="spell" && list.length && !tref) return "Choose a target.";
    if(tref && !list.some(r=>r.s===tref.s&&r.u===tref.u)) return "Invalid target.";
  }
  const combo=p.played>0;
  p.played++; p.cur-=d.c; p.hand.splice(hi,1);
  g.lc=(g.lc||0)+1; g.last={s,id,k:g.lc};
  fxPush(g,{t:"spil",s,hu:handUid,id,ts:tref?tref.s:null,tu:tref?tref.u:null});
  if(d.t==="spell"&&tref) fxPush(g,{t:"zap",fs:s,fu:null,ts:tref.s,tu:tref.u,art:"spell"});
  else if(d.t==="spell") fxPush(g,{t:"cast",s});
  log(g,"§play§ "+p.name+" plays "+d.n+".");
  const rec=recStart(g,s,id);
  if(d.t==="unit"){
    const u=mkUnit(g,id); p.board.push(u);
    if(d.bcTgt){
      const list=specTargets(g,s,d.bcTgt,d.bcF,u.uid);
      const useT=tref && list.some(r=>r.s===tref.s&&r.u===tref.u) ? tref : null;
      if(d.bc) d.bc(g,s,u,useT,combo);
    } else if(d.bc) d.bc(g,s,u,null,combo);
  } else {
    d.fx(g,s,tref||null,combo);
  }
  sweep(g); checkWin(g);
  recEnd(g,rec);
  return null;
}
function attackTargets(g,s,uid){
  const u=g.players[s].board.find(x=>x.uid===uid);
  if(!u) return [];
  if(effAtk(g,s,u)<1 || u.atkLeft<1) return [];
  const k=kws(g,s,u);
  if(u.jp && !k.includes("turbo")) return [];
  const e=1-s;
  const taunts=g.players[e].board.filter(x=>hasKw(g,e,x,"jord") && !x.st);
  let list=[];
  if(taunts.length) list=taunts.map(x=>({s:e,u:x.uid}));
  else{
    list=g.players[e].board.filter(x=>!x.st).map(x=>({s:e,u:x.uid}));
    if(!u.jp && !k.includes("noHero")) list.push({s:e,u:null});
  }
  return list;
}
function unitAttack(g,s,uid,tref){
  if(g.status!=="igang"||g.active!==s) return "Not your turn.";
  const u=g.players[s].board.find(x=>x.uid===uid);
  if(!u) return "That unit doesn’t exist.";
  const list=attackTargets(g,s,uid);
  if(!list.some(r=>r.s===tref.s&&r.u===tref.u)) return "Invalid target.";
  u.atkLeft--; u.st=false;
  fxPush(g,{t:"zap",fs:s,fu:uid,ts:tref.s,tu:tref.u,art:"melee"});
  const aA=effAtk(g,s,u);
  const srcA={hoj:hasKw(g,s,u,"hoj"),host:hasKw(g,s,u,"host"),hs:s};
  if(tref.u==null){
    log(g,"§sword§ "+CARDS[u.id].n+" attacks "+g.players[tref.s].name+" ("+aA+").");
    dmg(g,tref,aA,srcA);
  } else {
    const d=refUnit(g,tref); if(!d) return "The target doesn’t exist.";
    const aD=effAtk(g,tref.s,d);
    const srcD={hoj:hasKw(g,tref.s,d,"hoj"),host:hasKw(g,tref.s,d,"host"),hs:tref.s};
    log(g,"§sword§ "+CARDS[u.id].n+" ("+aA+") trades with "+CARDS[d.id].n+" ("+aD+").");
    dmg(g,tref,aA,srcA);
    if(aD>0) dmg(g,{s,u:uid},aD,srcD);
  }
  sweep(g); checkWin(g);
  return null;
}
/* ---------- klasser ----------
   Ny klasse tilføjes ved (1) en post her med power{n,ico,c,txt}, powerTargets og
   powerFx, (2) evt. klassekort i CARDS med feltet cls:"kode", (3) intet andet —
   deckbygger, validering og UI slår selv op. Kort uden cls er neutrale. */
const CLASSES={
  tek:{
    n:"The Technician", ico:"tinker", col:"#e8a96a",
    power:{ n:"Soldering Iron", ico:"solder", svg:"loddekolbe", c:2, txt:"Enemy: 1 damage · Friendly: repair 2." },
    powerTargets(g,s){
      const out=[{s:0,u:null},{s:1,u:null}];
      for(const ps of [0,1]) for(const u of g.players[ps].board){
        if(targetable(g,s,ps,u)) out.push({s:ps,u:u.uid});
      }
      return out;
    },
    powerFx(g,s,tref){
      const p=g.players[s];
      if(tref.s===s){
        if(tref.u==null) healHero(g,s,2);
        else { const u=refUnit(g,tref); if(u){ u.dmg=Math.max(0,u.dmg-2); fxPush(g,{t:"heal",s:tref.s,u:tref.u,n:2}); } }
        log(g,"§wrench§ "+p.name+" repairs 2 with the soldering iron.");
      } else {
        fxPush(g,{t:"zap",fs:s,fu:null,ts:tref.s,tu:tref.u,art:"power"});
        log(g,"§wrench§ "+p.name+" burns the enemy with the soldering iron (1).");
        dmg(g,tref,1,null);
      }
    },
  },
  hack:{
    n:"The Hacker", ico:"hoodie", col:"#c76bd9",
    power:{ n:"Breach", ico:"bug", c:2, txt:"Summon a 1/1 Bug." },
    powerTargets(g,s){ return g.players[s].board.length<MAXBOARD?[{s,u:null}]:[]; },
    powerFx(g,s,tref){
      summon(g,s,"t_bug");
      log(g,"§bug§ "+g.players[s].name+" breaches the firewall — a Bug crawls out.");
    },
  },
  over:{
    n:"The Overclocker", ico:"heat", col:"#ff8c5a",
    power:{ n:"Charge", ico:"battery", c:2, txt:"Store 2 energy in the capacitor bank." },
    powerTargets(g,s){ return g.players[s].stored<MAXSTORED?[{s,u:null}]:[]; },
    powerFx(g,s,tref){
      addStored(g,s,2);
      log(g,"§battery§ "+g.players[s].name+" charges the capacitor bank.");
    },
  },
};
function clsOf(g,s){ return CLASSES[g.players[s].cls]||CLASSES.tek; }
function heroTargets(g,s){ return clsOf(g,s).powerTargets(g,s); }
// heltekraftens pris efter evt. run-rabat
function powCost(g,s){ return Math.max(0, clsOf(g,s).power.c - (g.players[s].powD||0)); }
function heroPower(g,s,tref){
  if(g.status!=="igang"||g.active!==s) return "Not your turn.";
  const p=g.players[s], K=clsOf(g,s), pris=powCost(g,s);
  if(p.heroUsed) return K.power.n+" has already been used.";
  if(p.cur<pris) return "Not enough energy.";
  if(!heroTargets(g,s).some(r=>r.s===tref.s&&r.u===tref.u)) return "Invalid target.";
  p.heroUsed=true; p.cur-=pris;
  K.powerFx(g,s,tref);
  sweep(g); checkWin(g);
  return null;
}

// ---------- tur-flow ----------
function startTurn(g){
  const s=g.active, p=g.players[s];
  g.turn++;
  p.maxE=Math.min(p.eCap||10,p.maxE+1);
  p.ovlShown=p.ovlNext; p.ovlNext=0;
  p.cur=Math.max(0,p.maxE-p.ovlShown)+p.stored;
  p.stored=0; p.played=0; p.heroUsed=false;
  for(const u of p.board){ u.jp=false; u.atkLeft=hasKw(g,s,u,"dob")?2:1; }
  log(g,"— Turn "+g.turn+": "+p.name+" ("+p.cur+"§bolt§"+(p.ovlShown?", "+p.ovlShown+" locked by overheat":"")+") —");
  draw(g,s,1);
  for(const uid of p.board.map(u=>u.uid)){
    const u=p.board.find(x=>x.uid===uid); if(!u||u.sil) continue;
    const d=CARDS[u.id]; if(d.start) d.start(g,s,u);
  }
  sweep(g); checkWin(g);
}
function endTurn(g,s){
  if(g.status!=="igang"||g.active!==s) return "Not your turn.";
  const p=g.players[s];
  for(const uid of p.board.map(u=>u.uid)){
    const u=p.board.find(x=>x.uid===uid); if(!u||u.sil) continue;
    const d=CARDS[u.id]; if(d.end) d.end(g,s,u);
    sweep(g);
  }
  if(g.status!=="igang") return null;
  const gem=Math.min(MAXSTORED,p.stored+p.cur)-p.stored;
  if(gem>0){ p.stored+=gem; log(g,"§battery§ "+p.name+" stores "+gem+" energy in the capacitor bank."); }
  if(p.regen>0 && p.hp<p.max){ healHero(g,s,p.regen); log(g,"§wrench§ "+p.name+"’s self-repair restores "+p.regen+"."); }
  p.cur=0;
  g.active=1-s;
  startTurn(g);
  return null;
}

// ---------- opsætning ----------
function mkPlayer(name,cid,deckIds,cls){
  // max/eCap/sigB/powD/regen er 1:1 med normale regler i almindelige kampe.
  // Roguelike-opgraderinger ændrer dem via applyMods() ved kampstart.
  return { name, cid, cls:cls||"tek", hp:30, max:30, maxE:0, eCap:10, cur:0, stored:0,
    sigB:0, powD:0, regen:0, ovlNext:0, ovlShown:0,
    heroUsed:false, played:0, fat:0, grave:0, list:deckIds.slice(),
    deck:shuffle(deckIds), hand:[], board:[] };
}
function mkState(cfg){
  const starter=cfg.starter!=null?cfg.starter:rnd(2);
  const g={ v:1, seq:1, mode:cfg.mode, code:cfg.code||null, status:"igang", winner:null,
    turn:0, active:starter, n:1, last:null, log:[], fx:[], fxk:0, hist:[], hk:0, rematch:[false,false],
    players:[ mkPlayer(cfg.names[0],cfg.cids[0],cfg.decks[0],cfg.classes&&cfg.classes[0]),
              mkPlayer(cfg.names[1],cfg.cids[1],cfg.decks[1],cfg.classes&&cfg.classes[1]) ] };
  log(g,"§bolt§ CARDWARE CRASH — "+g.players[0].name+" vs "+g.players[1].name+".");
  log(g,"§dice§ "+g.players[starter].name+" goes first.");
  for(let i=0;i<3;i++){ draw(g,starter,1); }
  for(let i=0;i<4;i++){ draw(g,1-starter,1); }
  addHand(g,1-starter,"t_powerbank");
  startTurn(g);
  return g;
}
function validateDeck(list,cls){
  cls=cls||"tek";
  if(!Array.isArray(list)||list.length!==DECKSIZE) return "A deck must contain exactly "+DECKSIZE+" cards.";
  const cnt={};
  for(const id of list){
    if(!CARDS[id]||CARDS[id].tok) return "Unknown card in the deck.";
    if(CARDS[id].cls&&CARDS[id].cls!==cls) return CARDS[id].n+" belongs to another class.";
    cnt[id]=(cnt[id]||0)+1;
    const max=CARDS[id].r==="L"?1:2;
    if(cnt[id]>max) return "Too many copies of "+CARDS[id].n+" (max "+max+").";
  }
  return null;
}
function autoDeck(cls,allowed,size){
  cls=cls||"tek";
  const N=size||DECKSIZE;
  const base=allowed&&allowed.length?COLL.filter(id=>allowed.includes(id)):COLL;
  const pool=base.filter(id=>!CARDS[id].cls||CARDS[id].cls===cls);
  const list=[]; const cnt={};
  let guard=0;
  while(list.length<N && guard++<2000){
    const id=pick(pool);
    const d=CARDS[id];
    const max=d.r==="L"?1:2;
    if((cnt[id]||0)>=max) continue;
    const w=1/(1+Math.abs(d.c-3));
    if(Math.random()>w+0.15) continue;
    cnt[id]=(cnt[id]||0)+1; list.push(id);
  }
  while(list.length<N){
    const id=pick(pool); const max=CARDS[id].r==="L"?1:2;
    if((cnt[id]||0)<max){ cnt[id]=(cnt[id]||0)+1; list.push(id); }
  }
  return list;
}
// ---------- BOT (solo-modstander) ----------
function kwVal(g,s,u){
  let v=0; const K=kws(g,s,u);
  if(K.includes("jord")) v+=1;   if(K.includes("iso"))  v+=1.5;
  if(K.includes("hoj"))  v+=2;   if(K.includes("dob"))  v+=1.5;
  if(K.includes("host")) v+=1;   if(K.includes("skjul"))v+=0.5;
  if(!u.sil&&CARDS[u.id].sig) v+=1.5;
  return v;
}
function sideVal(g,s){
  let v=0;
  for(const u of g.players[s].board) v+=effAtk(g,s,u)+effHp(g,s,u)*0.9+kwVal(g,s,u);
  return v;
}
function botScore(g,s){
  if(g.status==="slut") return g.winner===s?10000:(g.winner===2?0:-10000);
  const me=g.players[s], op=g.players[1-s];
  return (me.hp-op.hp)*0.6 + sideVal(g,s)-sideVal(g,1-s)
    + me.hand.length*0.4 + (me.cur+me.stored)*0.15;
}
function botMoves(g,s){
  const p=g.players[s], mv=[];
  for(const c of p.hand){
    if(!canPlay(g,s,c.id)) continue;
    const {need,list}=targetsForCard(g,s,c.id,null);
    if(need&&list.length) for(const t of list) mv.push({k:"kort",uid:c.uid,t});
    else if(!need||CARDS[c.id].t==="unit") mv.push({k:"kort",uid:c.uid,t:null});
  }
  for(const u of p.board)
    for(const t of attackTargets(g,s,u.uid)) mv.push({k:"atk",uid:u.uid,t});
  if(!p.heroUsed&&p.cur>=2)
    for(const t of heroTargets(g,s)) mv.push({k:"hp",t});
  return mv;
}
function botApply(g,s,m){
  if(m.k==="kort") return playCard(g,s,m.uid,m.t);
  if(m.k==="atk")  return unitAttack(g,s,m.uid,m.t);
  return heroPower(g,s,m.t);
}
function botAction(g,s){
  const mv=botMoves(g,s);
  if(!mv.length) return false;
  const base=botScore(g,s);
  let best=null, bd=0.05;
  for(const m of mv){
    const sim=clone(g);
    if(botApply(sim,s,m)) continue;
    const d=botScore(sim,s)-base;
    if(d>bd){ bd=d; best=m; }
  }
  if(!best) return false;
  botApply(g,s,best);
  return true;
}

// ---------- interaktiv tutorial ----------
// Scripted forløb: fast hånd/deck, dum modstander (TUTOR-9000, 7 HP), trin med
// instruktion (t), fremhævninger (hi), tilladte handlinger (allow) og done-prædikat.
function tutPlay(g,id){
  const p=g.players[1];
  const uid="to"+(g.n++);
  p.hand.push({uid,id}); p.cur=99;
  playCard(g,1,uid,null);
}
const TUT={
  mk(name){
    const filler=Array(14).fill("u_modstand");
    const g=mkState({mode:"tutorial",names:[(name||"Technician").trim()||"Technician","TUTOR-9000"],
      cids:["p1","tut"],decks:[autoDeck("tek"),autoDeck("tek")],classes:["tek","tek"],starter:0});
    const p0=g.players[0], p1=g.players[1];
    p0.hand=[{uid:"tc1",id:"u_spole"},{uid:"tc2",id:"s_kortslut"}];
    p0.deck=filler.concat(["u_led","u_kampdrone","s_spids"]);
    p1.hand=[]; p1.deck=filler.slice();
    p1.hp=7;
    g.log=[]; log(g,"§graduate§ Tutorial started — TUTOR-9000 runs on a low battery (7 HP).");
    return g;
  },
  opp:{
    2(g){ tutPlay(g,"u_modstand"); },
    4(g){ tutPlay(g,"u_led"); },
    6(g){ tutPlay(g,"u_kampdrone");
      const d=g.players[1].board.find(u=>u.id==="u_kampdrone");
      const c=g.players[0].board.find(u=>u.id==="u_spole");
      if(d&&c) unitAttack(g,1,d.uid,{s:0,u:c.uid}); },
    8(g){ log(g,"§robot§ TUTOR-9000 idles. It believes in you."); },
  },
  steps:[
    { t:"Welcome, Technician! §bolt§ You only have 1 energy this turn — both cards in your hand cost more, so there\u2019s nothing to play yet. End your turn: your unspent energy is stored in the capacitor bank §battery§ for next turn.",
      hi:["end"], allow:{end:1}, done:g=>g.turn>1 },
    { t:"TUTOR-9000 plays a Resistor. Note the §kw_jord§ — Grounded units must be attacked first.",
      hi:[], allow:{}, done:g=>g.turn===3 },
    { t:"3§bolt§ this turn: 2 new + 1 from the bank. Play your Coil!",
      hi:["hand:u_spole"], allow:{play:"u_spole"}, done:g=>g.players[0].board.some(u=>u.id==="u_spole") },
    { t:"Units sleep the turn they arrive (unless they have Turbo »). End your turn.",
      hi:["end"], allow:{end:1}, done:g=>g.turn===4 },
    { t:"An LED lights up on the other side…",
      hi:[], allow:{}, done:g=>g.turn===5 },
    { t:"Attack! Tap your Coil, then the Resistor — the §kw_jord§ Grounded unit blocks everything else.",
      hi:["unit:u_spole","eunit:u_modstand"], allow:{atk:"u_spole"},
      done:g=>g.players[1].board.some(u=>u.id==="u_modstand"&&u.dmg>0) },
    { t:"It survived with 1 HP! Your hero power §wrench§ Soldering Iron (2§bolt§) can finish it off.",
      hi:["kraft","eunit:u_modstand"], allow:{power:1,tgtUnit:"u_modstand"},
      done:g=>g.players[0].heroUsed&&!g.players[1].board.some(u=>u.id==="u_modstand") },
    { t:"Spells can hit anything targetable. Short Circuit the enemy hero!",
      hi:["hand:s_kortslut","h1"], allow:{play:"s_kortslut",tgtHero:1},
      done:g=>g.players[1].hp<=5 },
    { t:"Out of energy — end your turn.",
      hi:["end"], allow:{end:1}, done:g=>g.turn===6 },
    { t:"Turbo » units can attack units immediately — the Combat Drone rams your Coil and breaks down.",
      hi:[], allow:{}, done:g=>g.turn===7 },
    { t:"Voltage Spike deals 3 damage, but Overheat (1) locks 1§bolt§ next turn. Fire at the hero!",
      hi:["hand:s_spids","h1"], allow:{play:"s_spids",tgtHero:1},
      done:g=>g.players[1].hp<=2 },
    { t:"Deploy your own Combat Drone. Turbo » works on units only — heroes must wait a turn.",
      hi:["hand:u_kampdrone"], allow:{play:"u_kampdrone"},
      done:g=>g.players[0].board.some(u=>u.id==="u_kampdrone") },
    { t:"End your turn — and note the §warning§ Overheat warning on your energy bar.",
      hi:["end"], allow:{end:1}, done:g=>g.turn===8 },
    { t:"TUTOR-9000 idles…",
      hi:[], allow:{}, done:g=>g.turn===9 },
    { t:"See it? 1§bolt§ is locked by Overheat. Now finish it — attack the hero with your Drone!",
      hi:["unit:u_kampdrone","h1"], allow:{any:1}, done:g=>g.status==="slut" },
  ],
};

const CLS_LIST=["tek","hack","over"];

/* ---------- MELTDOWN RUN (roguelike solo) ----------
   En run er en kæde af kampe mod stadigt hårdere bots. Helte-HP bæres med
   videre, decket vokser med belønningskort, og opgraderinger ("upgrades")
   ændrer felterne på spillerobjektet ved kampstart. Selve kamp-motoren er
   uændret — alt her bygger oven på mkState. */
const RUN_LEN = 12;
const RUN_DECK = 20;          // startdeck; vokser med én belønning pr. sejr
const RUN_REWARDS = 3;        // kort at vælge imellem efter sejr
const RUN_HEAL_WIN = 3;       // lidt HP tilbage efter hver almindelig sejr
const RUN_HEAL_NODE = 12;     // værkstedsnoden

const UPGRADES = {
  // once: ændrer run-tilstanden når den vælges, ikke ved hver kampstart
  chassis:  { n:"Reinforced Chassis", ico:"shield",  d:"+6 max HP, and repair 6 now.",
              once:run=>{ run.max+=6; run.hp=Math.min(run.max,run.hp+6); } },
  capbank:  { n:"Spare Capacitor",    ico:"battery", d:"Start every battle with 2 stored energy.",
              fx:p=>{ p.stored+=2; } },
  overflow: { n:"Overflow Bus",       ico:"bolt",    d:"Your energy can reach 12 instead of 10.",
              fx:p=>{ p.eCap=12; } },
  spool:    { n:"Prefetch Spool",     ico:"deck",    d:"Draw one extra card at the start of a battle.",
              fx:null, draw:1 },
  amp:      { n:"Signal Amplifier",   ico:"signal",  d:"Your spells deal 1 extra damage.",
              fx:p=>{ p.sigB+=1; } },
  flux:     { n:"Flux Regulator",     ico:"gear",    d:"Your hero power costs 1 less.",
              fx:p=>{ p.powD+=1; } },
  selfrep:  { n:"Self-Repair Loop",   ico:"wrench",  d:"Repair 2 at the end of each of your turns.",
              fx:p=>{ p.regen+=2; } },
};
const UPG_LIST = Object.keys(UPGRADES);

// nodetyper: kamp, elite (hårdere + opgradering), værksted (helbred/fjern kort), boss
function runMap(){
  const m=[];
  for(let i=0;i<RUN_LEN;i++){
    if(i===RUN_LEN-1) m.push("boss");
    else if(i===3||i===8) m.push("elite");
    else if(i===2||i===6||i===10) m.push("repair");
    else m.push("battle");
  }
  return m;
}
function runNyt(cls){
  const pool=COLL.filter(id=>(!CARDS[id].cls||CARDS[id].cls===cls) && !CARDS[id].r);  // kun commons
  const deck=[]; const c={};
  let guard=0;
  while(deck.length<RUN_DECK && guard++<3000){
    const id=pick(pool); if((c[id]||0)>=2) continue;
    c[id]=(c[id]||0)+1; deck.push(id);
  }
  return { cls, deck, hp:30, max:30, upg:[], node:0, map:runMap(), wins:0, status:"kort" };
}
// modstanderens styrke vokser med dybden
function runFjende(run){
  const i=run.node, t=run.map[i];
  const cls=pick(CLS_LIST);
  const elite=t==="elite", boss=t==="boss";
  const tilladt = i<2 ? COLL.filter(id=>!CARDS[id].r)
                : i<6 ? COLL.filter(id=>CARDS[id].r!=="L")
                : COLL;
  return {
    cls, elite, boss,
    navn: boss ? "THE MELTDOWN" : elite ? "Elite: "+CLASSES[cls].n.replace("The ","") : CLASSES[cls].n.replace("The ",""),
    // Balancetal fundet ved at lade botten spille spillerens side gennem hele
    // runnen (tools/agents/agent-run.mjs). Sigtet er ~70% sejr tidligt, ~50% til bossen —
    // en run kræver 9 sejre i træk, så per-kamp må ikke være en møntkast.
    hp: boss ? 46 : 24 + Math.round(i*1.4) + (elite?6:0),
    stored: Math.floor(i/4) + (boss?2:0),
    deck: autoDeck(cls, tilladt, run.deck.length),   // samme decklængde => symmetrisk fatigue
  };
}
// opsæt en kamp ud fra run-tilstanden. seat 0 = spilleren.
function runKamp(run,navn){
  const f=runFjende(run);
  const g=mkState({ mode:"rogue", names:[navn||"Technician", f.navn], cids:["me","ai"],
    decks:[run.deck.slice(), f.deck], classes:[run.cls, f.cls], starter:0 });
  const p=g.players[0], o=g.players[1];
  // spillerens opgraderinger
  p.hp=run.hp; p.max=run.max;
  let ekstra=0;
  for(const u of run.upg){ const U=UPGRADES[u]; if(!U||U.once) continue; if(U.fx) U.fx(p); ekstra+=U.draw||0; }
  // fjendens skalering
  o.hp=f.hp; o.max=f.hp; o.stored=f.stored;
  // mkState har allerede trukket kort og kørt startTurn for spilleren (starter:0),
  // så ekstra kort trækkes bagefter og "stored" gives til den næste tur.
  for(let i=0;i<ekstra;i++) draw(g,0,1);
  if(p.stored>0) p.cur+=p.stored, p.stored=0;   // Spare Capacitor gælder allerede første tur
  g.rogue={ node:run.node, type:run.map[run.node], elite:f.elite, boss:f.boss };
  return g;
}
// tre kortbelønninger: klassens pulje, sjældnere jo dybere man er
function runBelonning(run){
  const i=run.node;
  const pool=COLL.filter(id=>{
    const d=CARDS[id];
    if(d.cls && d.cls!==run.cls) return false;
    if(d.r==="L") return i>=6;
    if(d.r==="R") return i>=2;
    return true;
  });
  const ud=[]; let guard=0;
  while(ud.length<RUN_REWARDS && guard++<400){
    const id=pick(pool);
    if(ud.includes(id)) continue;
    const antal=run.deck.filter(x=>x===id).length;
    if(antal>=(CARDS[id].r==="L"?1:2)) continue;
    ud.push(id);
  }
  return ud;
}
// tilføj en opgradering til run-tilstanden (håndterer engangs-effekter)
function runTilfoej(run,u){
  const U=UPGRADES[u]; if(!U) return run;
  run.upg=run.upg.concat([u]);
  if(U.once) U.once(run);
  return run;
}
// efter en sejr: bær HP videre (aldrig under 1) plus en lille reparation, så to
// hårde kampe i træk ikke er en dødsdom
function runSejr(run,hpTilbage,elite){
  run.hp=Math.max(1,Math.min(run.max, Math.max(1,hpTilbage) + (elite?0:RUN_HEAL_WIN)));
  run.wins++;
  return run;
}
function runRepair(run){ run.hp=Math.min(run.max, run.hp+RUN_HEAL_NODE); return run; }

function runOpgraderinger(run){
  const ledige=UPG_LIST.filter(u=>!run.upg.includes(u) || u==="chassis" || u==="capbank");
  const ud=[]; let guard=0;
  while(ud.length<2 && guard++<200){ const u=pick(ledige); if(!ud.includes(u)) ud.push(u); }
  return ud;
}

/* __ENGINE_END__ */

/* ============================================================
   UI
   ============================================================ */

const store = (typeof window !== "undefined" && window.storage) ? window.storage : null;
async function stGet(k,sh){ if(!store) return null; try{ const r=await store.get(k,sh); return r?JSON.parse(r.value):null; }catch(e){ return null; } }
async function stSet(k,v,sh){ if(!store) return false; try{ const r=await store.set(k,JSON.stringify(v),sh); return !!r; }catch(e){ return false; } }
async function stDel(k,sh){ if(!store) return; try{ await store.delete(k,sh); }catch(e){} }
function codeGen(){ const A="ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let c=""; for(let i=0;i<4;i++) c+=A[rnd(A.length)]; return c; }

// ---------- indstillinger ----------
// animMult: ganges på grund-tempoet 1.6 (den hidtidige standardfart).
// 1.0 = som nu, 2.0 = dobbelt så langsomt, 0.5 = dobbelt så hurtigt.
const ANIM_BASE = 1.6;
const ANIM_SNAPS = [0.5,0.75,1,1.5,2];
const REVEAL_SNAPS = [1000,2000,3000,4000,5000];
const DEFAULT_SETTINGS = {
  animMult: 1,               // ×1 = nuværende animationsfart (snaps: ½× ¾× 1× 1½× 2×)
  cardRevealMs: 3000,        // hvor længe et spillet kort vises midt på skærmen (1–5 s snaps)
  sound: true,              // lydeffekter
  music: true,              // 8-bit baggrundsmusik
  musicVol: 0.4,
  sfxVol: 0.6,
  fxMotion: true,           // partikler/rystelser
  showEnemyBanner: true,    // vis tydeligt hvad modstanderen gør
  keys: { end:" ", power:"q", cancel:"Escape", card1:"1",card2:"2",card3:"3",card4:"4",card5:"5",card6:"6",card7:"7",card8:"8",card9:"9",card10:"0" },
};
function snapTo(v,arr){ let best=arr[0]; for(const a of arr) if(Math.abs(a-v)<Math.abs(best-v)) best=a; return best; }
let SETTINGS = { ...DEFAULT_SETTINGS };
const _slisteners = new Set();
function applySettings(next){ SETTINGS = { ...SETTINGS, ...next }; for(const f of _slisteners) f(SETTINGS); stSet("settings", SETTINGS); }
async function loadSettings(){ const s=await stGet("settings"); if(s){
  // migration fra ældre gemte settings:
  if(s.animMult==null){
    const t = s.slowness!=null ? 1+s.slowness*1.5 : ANIM_BASE;   // gammel slowness → tempo
    s.animMult = snapTo(t/ANIM_BASE, ANIM_SNAPS);
  }
  delete s.slowness;
  if(s.cardRevealMs==null || s.cardRevealMs===1800) s.cardRevealMs=3000; // gammel default → ny (+1 s)
  else if(s.cardRevealMs>0) s.cardRevealMs=snapTo(s.cardRevealMs, REVEAL_SNAPS); // 0 = slået fra, bevares
  SETTINGS={ ...DEFAULT_SETTINGS, ...s, keys:{ ...DEFAULT_SETTINGS.keys, ...(s.keys||{}) } };
} for(const f of _slisteners) f(SETTINGS); return SETTINGS; }
function onSettings(fn){ _slisteners.add(fn); return ()=>_slisteners.delete(fn); }
// tempo-faktor: ANIM_BASE × animMult. ×1 = den hidtidige fart, ×2 = dobbelt tid.
function tempo(){ return ANIM_BASE*(SETTINGS.animMult!=null?SETTINGS.animMult:1); }
function slowMs(ms){ return Math.round(ms*tempo()); }

// ---------- spillerprofil & kort-oplåsning ----------
// Gemmes lokalt pr. spiller (window.storage). Commons er altid åbne;
// Rare (◆) og Legendary (★) låses op ved at vinde kampe.
const DEFAULT_PROFIL = { wins:0, games:0, unlocked:[] };
function unlockedSetAf(profil){
  const s=new Set();
  for(const id of COLL) if(!CARDS[id].r) s.add(id);       // commons altid åbne
  for(const id of (profil&&profil.unlocked)||[]) s.add(id);
  return s;
}
function pickUnlock(uSet){
  const lockedR=COLL.filter(id=>CARDS[id].r==="R"&&!uSet.has(id));
  const lockedL=COLL.filter(id=>CARDS[id].r==="L"&&!uSet.has(id));
  if(!lockedR.length&&!lockedL.length) return null;
  const brugL = lockedL.length && (!lockedR.length || Math.random()<0.3);
  return pick(brugL?lockedL:lockedR);
}
// ---------- lyd: 8-bit SFX + baggrundsmusik (syntetiseret, ingen filer) ----------
const Audio8 = (() => {
  let ctx=null, master=null, musicGain=null, sfxGain=null, musicTimer=null, musicOn=false;
  function ensure(){
    if(ctx) return;
    try{
      ctx = new (window.AudioContext||window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value=0.9; master.connect(ctx.destination);
      musicGain = ctx.createGain(); musicGain.gain.value=SETTINGS.musicVol; musicGain.connect(master);
      sfxGain = ctx.createGain(); sfxGain.gain.value=SETTINGS.sfxVol; sfxGain.connect(master);
    }catch(e){}
  }
  function resume(){ ensure(); if(ctx&&ctx.state==="suspended") ctx.resume(); }
  // enkelt tone
  function tone(freq,dur,type="square",when=0,vol=0.5,gainNode){
    if(!ctx) return;
    const t=ctx.currentTime+when;
    const o=ctx.createOscillator(), g=ctx.createGain();
    o.type=type; o.frequency.setValueAtTime(freq,t);
    g.gain.setValueAtTime(0,t);
    g.gain.linearRampToValueAtTime(vol,t+0.008);
    g.gain.exponentialRampToValueAtTime(0.0008,t+dur);
    o.connect(g); g.connect(gainNode||sfxGain);
    o.start(t); o.stop(t+dur+0.02);
  }
  function slide(f1,f2,dur,type="square",vol=0.5){
    if(!ctx) return; const t=ctx.currentTime;
    const o=ctx.createOscillator(), g=ctx.createGain();
    o.type=type; o.frequency.setValueAtTime(f1,t); o.frequency.exponentialRampToValueAtTime(f2,t+dur);
    g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(0.0008,t+dur);
    o.connect(g); g.connect(sfxGain); o.start(t); o.stop(t+dur+0.02);
  }
  function noise(dur,vol=0.4){
    if(!ctx) return; const t=ctx.currentTime;
    const n=ctx.createBufferSource(), buf=ctx.createBuffer(1,ctx.sampleRate*dur,ctx.sampleRate);
    const data=buf.getChannelData(0); for(let i=0;i<data.length;i++) data[i]=(Math.random()*2-1);
    n.buffer=buf; const g=ctx.createGain(); g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(0.0008,t+dur);
    const f=ctx.createBiquadFilter(); f.type="highpass"; f.frequency.value=800;
    n.connect(f); f.connect(g); g.connect(sfxGain); n.start(t); n.stop(t+dur);
  }
  const sfx = {
    play(){ resume(); if(!SETTINGS.sound)return; tone(330,0.07,"square",0,0.4); tone(494,0.09,"square",0.06,0.4); },
    unit(){ resume(); if(!SETTINGS.sound)return; tone(196,0.08,"triangle",0,0.5); tone(294,0.1,"triangle",0.07,0.45); },
    spell(){ resume(); if(!SETTINGS.sound)return; slide(400,900,0.22,"sawtooth",0.4); },
    attack(){ resume(); if(!SETTINGS.sound)return; slide(300,140,0.16,"square",0.5); noise(0.12,0.25); },
    hit(){ resume(); if(!SETTINGS.sound)return; noise(0.14,0.4); tone(110,0.12,"square",0,0.4); },
    heal(){ resume(); if(!SETTINGS.sound)return; tone(523,0.1,"sine",0,0.4); tone(659,0.12,"sine",0.08,0.4); tone(784,0.14,"sine",0.16,0.4); },
    death(){ resume(); if(!SETTINGS.sound)return; slide(200,60,0.4,"sawtooth",0.45); noise(0.25,0.3); },
    zap(){ resume(); if(!SETTINGS.sound)return; slide(1200,300,0.14,"square",0.35); noise(0.08,0.3); },
    endturn(){ resume(); if(!SETTINGS.sound)return; tone(392,0.09,"square",0,0.4); tone(261,0.12,"square",0.08,0.4); },
    win(){ resume(); if(!SETTINGS.sound)return; [523,659,784,1047].forEach((f,i)=>tone(f,0.18,"square",i*0.11,0.45)); },
    lose(){ resume(); if(!SETTINGS.sound)return; [392,330,262,196].forEach((f,i)=>tone(f,0.2,"sawtooth",i*0.13,0.4)); },
    click(){ resume(); if(!SETTINGS.sound)return; tone(660,0.04,"square",0,0.25); },
    tik(){ resume(); if(!SETTINGS.sound)return; tone(1400,0.03,"square",0,0.3); },
    tok(){ resume(); if(!SETTINGS.sound)return; tone(900,0.045,"square",0,0.3); },
    error(){ resume(); if(!SETTINGS.sound)return; tone(140,0.12,"square",0,0.4); tone(120,0.14,"square",0.09,0.4); },
  };
  // baggrundsmusik: enkel loopende 8-bit basgang + melodi
  const BASS=[130.81,130.81,164.81,196.00,174.61,174.61,146.83,196.00]; // C C E G F F D G
  const MEL =[523.25,659.25,587.33,783.99,698.46,659.25,587.33,523.25,
              493.88,587.33,523.25,659.25,587.33,523.25,493.88,440.00];
  let step=0;
  function musicTick(){
    if(!ctx||!musicOn) return;
    const beat=0.34*tempo(); // musik følger også langsomhed en anelse
    const b=BASS[step%BASS.length];
    tone(b,beat*0.9,"triangle",0,0.5,musicGain);
    tone(b*2,beat*0.4,"square",0,0.12,musicGain);
    const m=MEL[step%MEL.length];
    tone(m,beat*0.5,"square",beat*0.5,0.18,musicGain);
    if(step%2===0) tone(m*1.5,beat*0.25,"square",beat*0.25,0.08,musicGain);
    step++;
    musicTimer=setTimeout(musicTick, beat*1000);
  }
  return {
    sfx,
    startMusic(){ resume(); if(!SETTINGS.music||musicOn) return; musicOn=true; step=0; musicTick(); },
    stopMusic(){ musicOn=false; if(musicTimer) clearTimeout(musicTimer); },
    setMusicVol(v){ ensure(); if(musicGain) musicGain.gain.value=v; },
    setSfxVol(v){ ensure(); if(sfxGain) sfxGain.gain.value=v; },
    resume,
  };
})();

/* __ICONS_START__ */
// GENERERET af tools/gen-icons.mjs — rediger ikke i hånden.
// Ikoner fra game-icons.net, CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/).
// Ændret: baggrundspladen fjernet, figuren arver currentColor. Se ICONS-CREDITS.md.
// Krediteringen er et licenskrav — fjern ikke ICON_CREDITS eller kreditsektionen i Rules.
const ICON_CREDITS = [
  {n:"Carl Olsen", u:"https://twitter.com/unstoppableCarl"},
  {n:"Caro Asercion", u:"https://game-icons.net"},
  {n:"Delapouite", u:"https://delapouite.com"},
  {n:"Faithtoken", u:"https://fungustoken.deviantart.com"},
  {n:"Guard13007", u:"https://guard13007.com"},
  {n:"Lorc", u:"https://lorcblog.blogspot.com"},
  {n:"Quoting", u:"https://game-icons.net"},
  {n:"Sbed", u:"https://opengameart.org/content/95-game-icons"},
  {n:"Skoll", u:"https://game-icons.net"},
];
const ICONS = {
  bolt: '<path d="M29.805 29.777L242.14 209.55H118.712l112.54 86.784H95.995l225.656 174.012-81.537-116.05 66.487.143 179.185 138.175-171.96-244.746h84.568L248.082 29.776H29.805z"/>',
  heart: '<path d="M480.25 156.355c0 161.24-224.25 324.43-224.25 324.43S31.75 317.595 31.75 156.355c0-91.41 70.63-125.13 107.77-125.13 77.65 0 116.48 65.72 116.48 65.72s38.83-65.73 116.48-65.73c37.14.01 107.77 33.72 107.77 125.14z"/>',
  sword: '<path d="M19.75 14.438c59.538 112.29 142.51 202.35 232.28 292.718l3.626 3.75.063-.062c21.827 21.93 44.04 43.923 66.405 66.25-18.856 14.813-38.974 28.2-59.938 40.312l28.532 28.53 68.717-68.717c42.337 27.636 76.286 63.646 104.094 105.81l28.064-28.06c-42.47-27.493-79.74-60.206-106.03-103.876l68.936-68.938-28.53-28.53c-11.115 21.853-24.413 42.015-39.47 60.593-43.852-43.8-86.462-85.842-130.125-125.47-.224-.203-.432-.422-.656-.625C183.624 122.75 108.515 63.91 19.75 14.437zm471.875 0c-83.038 46.28-154.122 100.78-221.97 161.156l22.814 21.562 56.81-56.812 13.22 13.187-56.438 56.44 24.594 23.186c61.802-66.92 117.6-136.92 160.97-218.72zm-329.53 125.906l200.56 200.53c-4.36 4.443-8.84 8.793-13.405 13.032L148.875 153.53l13.22-13.186zm-76.69 113.28l-28.5 28.532 68.907 68.906c-26.29 43.673-63.53 76.414-106 103.907l28.063 28.06c27.807-42.164 61.758-78.174 104.094-105.81l68.718 68.717 28.53-28.53c-20.962-12.113-41.08-25.5-59.937-40.313 17.865-17.83 35.61-35.433 53.157-52.97l-24.843-25.655-55.47 55.467c-4.565-4.238-9.014-8.62-13.374-13.062l55.844-55.844-24.53-25.374c-18.28 17.856-36.602 36.06-55.158 54.594-15.068-18.587-28.38-38.758-39.5-60.625z"/>',
  skull: '<path d="M425.344 22.22c-9.027.085-18.7 5.826-24.344 19.405-11.143 26.803-31.93 59.156-58.563 93.47 10.57 8.694 19.85 18.92 27.5 30.31 35.1-26.57 68.882-46.81 98.125-56.75 44.6-15.16 12.02-69.72-35.343-35.343 26.91-27.842 11.107-51.27-7.376-51.093zm-341.22.03c-18.5.378-37.604 23.962-16.343 49.875C31.523 38.635-.802 85.48 37.095 102.813c28.085 12.844 62.54 35.66 99.062 64.343 8.125-12.5 18.207-23.61 29.78-32.937-26.782-35.743-48.44-69.835-61.78-98.47-4.515-9.69-12.22-13.66-20.03-13.5zm169.5 99.688c-67.104 0-121.31 54.21-121.31 121.312 0 44.676 24.04 83.613 59.905 104.656v56.406h18.718v-47.468c5.203 1.95 10.576 3.552 16.093 4.78v42.688h18.69v-40.03c2.614.167 5.247.25 7.905.25 2.637 0 5.25-.086 7.844-.25v40.03h18.686v-42.687c5.52-1.226 10.89-2.834 16.094-4.78v47.467h18.688V347.97c35.92-21.03 60-60.003 60-104.72 0-67.105-54.208-121.313-121.313-121.313zm-66.874 88.218c19.88 0 36 16.12 36 36s-16.12 36-36 36-36-16.12-36-36 16.12-36 36-36zm133.563 0c19.878 0 36 16.12 36 36s-16.122 36-36 36c-19.88 0-36-16.12-36-36s16.12-36 36-36zm-66.72 52.344l29.938 48.188h-59.874l29.938-48.188zm-107.28 70.563c-40.263 32.472-78.546 58.41-109.22 72.437-37.896 17.334-5.57 64.146 30.688 30.656-30.237 36.854 21.167 69.05 36.376 36.406 15.072-32.352 40.727-71.7 72.438-112.5-11.352-7.506-21.564-16.603-30.28-27zm213.156 1.718c-8.155 9.415-17.542 17.72-27.908 24.69 31.846 39.39 56.82 76.862 69.438 107.217 17.203 41.383 71.774 9.722 31.72-31.718 47.363 34.376 79.94-20.185 35.342-35.345-32.146-10.926-69.758-34.3-108.593-64.844z"/>',
  battery: '<path d="M230.218 16c-14.245 0-51.563 11.946-51.563 26.718v26.718h-51.093C99.072 69.436 76 93.326 76 122.874V442.56C76 472.11 99.072 496 127.563 496h256.875c28.49-.002 51.562-23.892 51.562-53.44V122.874c0-29.547-23.072-53.437-51.563-53.437h-51.093V42.718c0-14.774-37.317-26.718-51.562-26.718H230.22zM256 122.875V256h102.657L256 442.563V309.438H153.343L256 122.875z"/>',
  signal: '<path d="M252.78 20.875c-1.302.012-2.6.03-3.905.063-37.928.974-76.148 11.153-111.28 31.437C25.164 117.285-13.41 261.322 51.5 373.75s208.946 151.036 321.375 86.125c77.7-44.86 120.1-127.513 117.47-211.406-3.563 65.847-35.898 128.573-91 169.374-10.828 9.62-22.774 18.315-35.814 25.844-103.68 59.86-235.983 24.4-295.842-79.282-59.86-103.68-24.43-235.984 79.25-295.844 35.64-20.576 74.67-29.88 112.968-29.03 63.304 1.4 124.623 30.57 165.438 82.53l-32.594 23.032c-33.27-42.835-84.01-66.6-136.063-67-.96-.008-1.91-.012-2.875 0-.964.01-1.943.038-2.906.062-28.006.717-56.222 8.215-82.156 23.188-82.99 47.914-111.508 154.322-63.594 237.312 47.914 82.99 154.32 111.51 237.313 63.594 51.37-29.66 81.862-81.724 86.28-136.78-12.53 45.37-42.32 86.745-85.438 114.186-.02.013-.043.018-.062.03l-.344.22c-3.16 2.147-6.42 4.216-9.78 6.156-74.245 42.865-168.918 17.494-211.782-56.75-42.864-74.243-17.493-168.917 56.75-211.78 23.2-13.396 48.39-20.122 73.375-20.782 47.953-1.266 95.138 19.858 125.968 59.156l-39.844 28.156c-20.232-24.32-50.055-37.79-80.594-38.03-1.17-.01-2.33 0-3.5.03-17.035.432-34.176 4.995-49.938 14.094-50.435 29.12-67.806 93.877-38.687 144.313 29.12 50.434 93.908 67.806 144.344 38.686 21.245-12.267 36.623-30.85 45.124-52.03-18.815 21.064-44.364 36.888-73.938 44.155-.04.013-.084.02-.125.033-37.507 10.787-78.796-4.816-99.217-40.188-24.07-41.688-9.845-94.712 31.843-118.78 13.028-7.523 27.143-11.314 41.156-11.69 25.66-.685 50.898 10.098 68.188 30.25l-41 28.97c-5.497-4.796-12.664-7.72-20.53-7.72-17.277 0-31.283 14.007-31.283 31.282 0 17.276 14.004 31.282 31.282 31.282 17.277 0 31.28-14.007 31.28-31.283 0-1.187-.06-2.347-.188-3.5l120.094-57.312 4.03-1.75-.06-.156 62.25-29.72 9.25-4.438-5.282-8.812-19.97-33.375-5.155-8.625-8.25 5.813-8.095 5.718c-45.9-58.864-116.14-91.053-187.844-90.405z"/>',
  sparkle: '<path d="M237.4 20.73c-6.1 42.1-26.8 64.2-63.9 64 31.6 4.5 63.8 8 63.9 64.07-.6-46.1 24.5-63.07 64.1-64.07-38-1.5-64.9-16.3-64.1-64zm127.8 11.58c-9.1 14.25-20.8 21.29-38.9 10.28 14.9 11.79 18.6 24.76 10.2 38.97 8.9-11.18 17.5-22.73 39-10.27-17.8-10.06-18.8-23.57-10.3-38.98zM59.68 41.69c-2.7 18.8-12 28.6-28.5 28.5 14.1 2 28.4 3.6 28.5 28.52-.3-20.5 10.9-28.12 28.5-28.52-16.9-.7-28.9-7.3-28.5-28.5zM431 66.28c-2.7 18.8-12 28.6-28.5 28.5 14.1 2 28.4 3.6 28.5 28.52-.3-20.5 10.9-28.12 28.5-28.52-16.9-.7-28.9-7.3-28.5-28.5zM120.3 116.4c-15.8 53.7-47.76 48-79.35 43.4C76.6 170 90.3 197.1 84.28 239.2c12.66-46 42.62-52.6 79.42-43.4-37.6-12.1-56.9-35.4-43.4-79.4zm187 5c-8.8 61.6-39.3 94-93.6 93.7 46.2 6.5 93.6 11.7 93.6 93.7-.8-67.3 35.9-92.2 93.8-93.7-55.5-2.2-94.9-23.9-93.8-93.7zm136.8 38.3c-13.1 21.6-29.5 28.8-49.7 20.1 16.3 9.7 33 19.1 20.1 49.6 10.3-25.2 27.9-28.7 49.7-20-20.3-9.7-31.6-23.9-20.1-49.7zM50.7 243.2c9.16 16.7 7.63 30.1-5.61 40 12.46-6.9 24.85-14.3 39.91 5.6-12.57-16.2-8.2-29 5.61-40-13.92 9.7-27.47 11.6-39.91-5.6zm137.2.3c11.4 26.8-.5 41.3-21.7 50.9 22.7-8.5 40.8-4.5 50.9 21.7-12.7-31.8 4.8-41.2 21.7-50.9-21 8.5-37.8.9-50.9-21.7zm228 12.6c-26.6 64.7-68.7 91.7-127.8 76.4 48.6 19.8 98.8 38.5 76.4 127.9 17.5-73.7 64.4-90.7 127.9-76.5-59.9-17.5-96.9-52-76.5-127.8zM99.94 295.5c15.66 57.8.86 98.1-47.32 118.5 43.46-11.8 87.38-25.2 118.68 47.4-26.4-59.3-3.4-95.4 47.3-118.8-50 19.2-93.1 15-118.66-47.1zm169.36 61c-21.8 20.6-43 23.6-63.2 7.3 15.5 16.3 31.6 32.4 7.2 63.3 19.8-25.6 41.2-24.1 63.3-7.3-20.2-17.4-28.6-37.5-7.3-63.3zM443.2 404c-2.7 18.8-12 28.6-28.5 28.5 14.1 2 28.4 3.6 28.5 28.5-.3-20.5 10.9-28.1 28.5-28.5-16.9-.7-28.9-7.3-28.5-28.5zm-169.7 36c-2.7 18.8-12 28.6-28.5 28.5 14.1 2 28.4 3.6 28.5 28.5-.3-20.5 10.9-28.1 28.5-28.5-16.9-.7-28.9-7.3-28.5-28.5z"/>',
  boom: '<path d="M454.547 16.027C406.8 37.25 381.052 75.064 369.135 123.303c42.096-24.196 72.15-58.61 85.412-107.276zM95.56 19.03c15.534 34.478 41.673 62.266 76.506 84.683 1.576-31.216-1.92-59.57-11.097-84.682H95.56zm223.674 9.507c-27.494 57.123-49.87 115.225-67.9 174.162-13.04-40.243-29.32-79.83-49.25-118.68.247 36.447 3.52 71.91 9.445 106.51-38.943-35.318-79.96-68.894-123.292-100.52 29.922 43.868 62.24 84.967 96.64 123.656-26.502-8.224-56.91-10.145-88.08-5.97 19.645 14.96 42.703 28.156 67.192 36-48.423 2.757-97.046 7.823-145.888 15.45 41.51 7.845 82.85 13.375 124.043 16.842-22.063 8.906-43.915 18.854-65.536 29.946 40.608-.275 79.997-4.3 118.33-11.577-16.74 21.736-31.644 45.162-44.99 70.028 25.735-15.12 49.978-31.88 72.554-50.477-12.504 58.248-21.31 117.203-27.092 176.738 21.65-50.587 41.044-101.993 57.877-154.328 11.282 28.076 24.197 55.62 38.556 82.696-2.48-37.338-7-74.264-13.793-110.73 46.832 43.08 96.5 82.882 148.472 120.017-38.845-51.87-80.238-101.596-124.584-148.84 65.17-2.498 130.007-9.56 194.576-20.314-47.5-6.818-95.158-11.807-142.99-14.775 19.607-8.637 38.96-18.06 58.078-28.198-36.566 2.427-72.737 6.804-108.467 13.363 12.16-16.334 23.427-33.654 33.715-52.05-16.755 8.214-32.493 17.366-47.317 27.36 13.228-57.563 23.26-116.284 29.7-176.308zm175.05 29.625c-48.748 27.205-89.195 69.08-119.934 128.35 46.33-.998 85.935-12.905 119.933-33.666V58.162zM25.36 124.676c-1.285-.01-2.578-.004-3.878.015 24.13 35.622 56.432 55.136 101.748 49.035-24.56-34.196-57.994-48.75-97.87-49.05zm374.08 179.517c-10.527-.03-21.428 1.062-32.66 3.15 34.93 36.464 77.04 54.27 129.158 46.053-26.086-34.646-58.903-49.093-96.5-49.203zM113.774 326.62c-8.008.004-15.842.556-23.472 1.32-25.435 2.57-48.993 9.59-70.666 21.062v70.666c38.192-19.716 72.544-49.83 102.203-92.86-2.708-.13-5.395-.19-8.065-.19zm57.727 49.855c-50.455 23.15-70.933 64.14-72.57 116.345 43.08-26.34 69.47-63.673 72.57-116.345zm157.664 15.744c.832 38.58 10.744 71.555 28.033 99.866h78.843c-22.654-40.592-57.522-74.27-106.877-99.867z"/>',
  shield: '<path d="M50.807 26.285c-1.105 42.86 2.978 85.91 11.98 128.55l50.606-11.388c-2.658-19.543-4.11-39.265-3.6-59.002l.236-9.103h49.402V26.285H50.807zm306.607 0v49.057h45.904l.23 9.107c.498 19.563-.492 39.338-3.058 59l50.086 11.34c9.048-42.643 13.05-85.63 11.96-128.505H357.415zm-131.65 1.354v45.786h65.056V27.64h-65.056zM178.12 43.335V94.03H128.48c.084 18.322 1.696 36.784 4.56 55.216l1.34 8.633-50.216 11.298c3.15 13.61 6.88 27.174 11.172 40.677l41.1-6.197 50.804 107.07-31.744 28.473c7.095 11.418 14.626 22.74 22.615 33.952l42.496-31.466 5.634 6.912c9.656 11.84 19.914 23.57 30.766 34.93 10.873-11.26 21.116-22.59 30.664-34.335l5.625-6.922 41.82 30.886c8.05-11.315 15.64-22.748 22.788-34.277l-31.383-28.15 50.803-107.072 40.627 6.127c4.308-13.503 8.054-27.07 11.22-40.68l-49.636-11.24 1.347-8.627c2.855-18.264 4.06-36.774 4.023-55.207h-46.183V43.337h-29.22v48.78h-102.43v-48.78h-28.958zm-13.915 79.252h185.41l.22 9.12c1.746 73.04-27.91 137.976-86.116 199.905l-6.798 7.23-6.81-7.216c-58.558-62.066-87.895-126.956-86.128-199.92l.22-9.12zm18.48 18.69c.818 61.19 25.098 115.615 74.213 170.062 48.85-54.348 73.37-108.852 74.23-170.063H182.685zm-57.18 82.93l-54.216 8.173 52.335 110.306 40.752-36.553-38.873-81.926zm262.76 0l-38.874 81.925 40.753 36.553L442.48 232.38l-54.216-8.173zM217.52 367.227l-42.704 31.62c23.914 32.71 51.31 64.504 82.15 95.236 30.733-30.743 57.7-62.44 81.548-95.19l-42.15-31.128c-10.264 12.222-20.992 24.175-32.792 35.978l-6.597 6.598-6.608-6.586c-11.93-11.89-22.64-24.246-32.846-36.53z"/>',
  legendary: '<path d="M143.627 36.361c-2.18 0-16.495 38.303-18.258 39.584-1.763 1.281-42.615 3.06-43.289 5.133-.673 2.073 31.33 27.523 32.004 29.596.674 2.073-10.26 41.475-8.496 42.756 1.763 1.28 35.86-21.291 38.039-21.291 2.18 0 36.276 22.572 38.039 21.29 1.763-1.28-9.17-40.682-8.496-42.755.673-2.073 32.677-27.523 32.004-29.596-.674-2.073-41.526-3.852-43.29-5.133-1.763-1.28-16.077-39.584-18.257-39.584zm224.746 0c-2.18 0-16.494 38.303-18.258 39.584-1.763 1.281-42.615 3.06-43.289 5.133-.673 2.073 31.33 27.523 32.004 29.596.674 2.073-10.26 41.475-8.496 42.756 1.763 1.28 35.86-21.291 38.039-21.291 2.18 0 36.276 22.572 38.04 21.29 1.762-1.28-9.17-40.682-8.497-42.755.674-2.073 32.677-27.523 32.004-29.596-.674-2.073-41.526-3.852-43.29-5.133-1.762-1.28-16.077-39.584-18.257-39.584zM256 39.883c-7.12 0-53.884 125.123-59.645 129.308-5.76 4.185-139.211 9.996-141.412 16.768-2.2 6.772 102.349 89.912 104.55 96.684 2.2 6.771-33.513 135.486-27.753 139.671C137.5 426.5 248.88 352.76 256 352.76c7.12 0 118.5 73.74 124.26 69.554 5.76-4.185-29.952-132.9-27.752-139.671 2.2-6.772 106.749-89.912 104.549-96.684-2.2-6.772-135.652-12.583-141.412-16.768-5.76-4.185-52.525-129.308-59.645-129.308zM77.973 243.102c-2.18 0-16.495 38.302-18.258 39.584-1.763 1.28-42.616 3.06-43.29 5.132-.673 2.073 31.333 27.523 32.007 29.596.673 2.073-10.26 41.475-8.496 42.756 1.763 1.281 35.857-21.291 38.037-21.291 2.18 0 36.275 22.572 38.039 21.29 1.763-1.28-9.17-40.682-8.496-42.755.673-2.073 32.679-27.523 32.005-29.596-.673-2.073-41.525-3.851-43.289-5.132-1.763-1.282-16.08-39.584-18.26-39.584zm356.054 0c-2.18 0-16.496 38.302-18.26 39.584-1.763 1.28-42.615 3.06-43.288 5.132-.674 2.073 31.332 27.523 32.005 29.596.674 2.073-10.26 41.475-8.496 42.756 1.764 1.281 35.86-21.291 38.04-21.291 2.179 0 36.273 22.572 38.036 21.29 1.764-1.28-9.17-40.682-8.496-42.755.674-2.073 32.68-27.523 32.006-29.596-.673-2.073-41.526-3.851-43.289-5.132-1.763-1.282-16.078-39.584-18.258-39.584zM256 369.932c-2.18 0-16.494 38.302-18.258 39.584-1.763 1.28-42.615 3.06-43.289 5.132-.673 2.073 31.33 27.525 32.004 29.598.674 2.073-10.26 41.475-8.496 42.756 1.763 1.281 35.86-21.293 38.039-21.293 2.18 0 36.276 22.574 38.04 21.293 1.762-1.281-9.17-40.683-8.497-42.756.673-2.073 32.677-27.525 32.004-29.598-.674-2.072-41.526-3.851-43.29-5.132-1.763-1.282-16.077-39.584-18.257-39.584z"/>',
  rare: '<path d="M258.396 21.375l-17.503 64.1c-1.133 2.452-1.782 5.172-1.782 8.05 0 10.634 8.62 19.256 19.255 19.256 10.634 0 19.256-8.62 19.256-19.255 0-.72-.045-1.426-.122-2.125h.022l-.05-.18c-.23-1.917-.737-3.746-1.488-5.45l-17.586-64.395zm118.21 31.494l-46.21 45.77c-6.03 3.254-10.126 9.626-10.126 16.956 0 10.633 8.622 19.254 19.255 19.254.668 0 1.327-.034 1.977-.1 7.608 5.175 14.85 11.125 21.6 17.875 57.872 57.872 57.87 151.418 0 209.29-6.75 6.747-13.99 12.694-21.594 17.868-.65-.066-1.308-.1-1.975-.1-10.634 0-19.256 8.623-19.256 19.256 0 7.006 3.757 13.12 9.352 16.49l46.694 46.252-18.545-70.55c6.468-4.81 12.67-10.137 18.536-16.003l6.608-6.61-.334-.332c3.252-3.637 6.305-7.388 9.183-11.23l71.057 18.68-51.63-52.126c6.54-15.08 10.757-30.926 12.636-46.996l70.61-19.282-70.56-19.267c-1.82-15.925-5.937-31.633-12.343-46.59l51.234-51.727-70.318 18.483c-4.842-6.536-10.22-12.8-16.144-18.723-5.794-5.794-11.916-11.063-18.298-15.824l18.587-70.717zm-236.307.005l17.112 65.107c.218 1.76.662 3.45 1.322 5.032l.153.582c-6.38 4.76-12.498 10.023-18.29 15.814-5.92 5.92-11.294 12.18-16.136 18.715L54.024 139.61l51.31 51.802c-6.41 14.945-10.535 30.64-12.376 46.553l-70.562 19.27L92.95 276.5c1.856 16.108 6.06 31.994 12.595 47.105l-51.574 52.07 70.952-18.648c4.722 6.312 9.94 12.368 15.676 18.102 5.815 5.814 11.96 11.102 18.367 15.876-1.004 2.215-1.613 4.646-1.707 7.213l-16.678 63.456 48.91-48.447-.037-.08c3.86-3.52 6.297-8.575 6.297-14.21 0-10.634-8.622-19.256-19.256-19.256-.395 0-.786.015-1.176.04-7.573-5.16-14.783-11.088-21.506-17.81-57.872-57.872-57.872-151.417 0-209.29 6.725-6.723 13.938-12.65 21.514-17.81.39.022.782.036 1.178.036 10.634 0 19.254-8.62 19.254-19.254 0-6.22-2.963-11.736-7.54-15.256L140.3 52.875zm127.436 89.87v49.02l33.602 19.292 46.18-25.045-79.782-43.268zm-18.69.312l-79.722 42.957 46.31 24.955 33.413-19.062v-48.85zM159.9 202.164v114.012l46.346-24.975v-64.063L159.9 202.164zm196.985.027l-46.342 25.134v63.7l46.342 25.136V202.19zm-98.367 5.83l-33.584 19.158v64.285l33.584 19.162 33.336-19.145v-64.318l-33.336-19.14zm43.082 99.416l-33.864 19.445v47.056l78.24-42.432-44.376-24.068zm-86.24.084l-44.495 23.976 78.182 42.127v-46.885L215.36 307.52zm43.005 94.234c-10.634 0-19.254 8.622-19.254 19.256 0 2.74.582 5.342 1.615 7.703l17.67 64.713 17.787-65.12c.57-1.39.965-2.86 1.197-4.388l.06-.23h-.026c.122-.878.207-1.767.207-2.678 0-10.634-8.62-19.256-19.255-19.256z"/>',
  play: '<path d="M106.854 106.002a26.003 26.003 0 0 0-25.64 29.326c16 124 16 117.344 0 241.344a26.003 26.003 0 0 0 35.776 27.332l298-124a26.003 26.003 0 0 0 0-48.008l-298-124a26.003 26.003 0 0 0-10.136-1.994z"/>',
  cross: '<path d="M256 16C123.45 16 16 123.45 16 256s107.45 240 240 240 240-107.45 240-240S388.55 16 256 16zm0 60c99.41 0 180 80.59 180 180s-80.59 180-180 180S76 355.41 76 256 156.59 76 256 76zm-80.625 60c-.97-.005-2.006.112-3.063.313v-.032c-18.297 3.436-45.264 34.743-33.375 46.626l73.157 73.125-73.156 73.126c-14.63 14.625 29.275 58.534 43.906 43.906L256 299.906l73.156 73.156c14.63 14.628 58.537-29.28 43.906-43.906l-73.156-73.125 73.156-73.124c14.63-14.625-29.275-58.5-43.906-43.875L256 212.157l-73.156-73.125c-2.06-2.046-4.56-3.015-7.47-3.03z"/>',
  trophy: '<path d="M256.156 21.625c-45.605 0-86.876 2.852-117.22 7.563-15.17 2.355-27.554 5.11-36.874 8.53-4.66 1.71-8.568 3.515-11.968 6.094-3.238 2.457-6.65 6.36-6.97 11.75h-.75c0 10.08.362 20.022 1.064 29.813H57.53c-.12-7.952.003-15.922.376-23.875l-26.812-6.28C22.55 161.892 64.1 265.716 140.564 339.655l15.655-29.594c-4.198-3.477-8.25-7.063-12.157-10.75 5.846-6.112 12.293-11.76 19.28-16.843 13.468 13.172 28.182 23.565 43.813 30.655 22.114 17.744 8.053 29.368-23.5 36.25 58.863 10.6 38.948 62.267-14.125 92.313-2.14.27-4.256.523-6.28.812-12.047 1.718-21.876 3.71-29.406 6.25-3.765 1.27-6.958 2.6-9.906 4.656-2.95 2.055-6.626 5.705-6.626 11.406 0 5.702 3.677 9.32 6.626 11.375 2.948 2.055 6.14 3.387 9.906 4.657 7.53 2.54 17.36 4.532 29.406 6.25 24.094 3.436 56.784 5.53 92.906 5.53 36.123 0 68.812-2.094 92.906-5.53 12.048-1.718 21.877-3.71 29.407-6.25 3.764-1.27 6.957-2.602 9.905-4.656 2.948-2.055 6.625-5.674 6.625-11.375 0-5.702-3.677-9.352-6.625-11.407-2.948-2.055-6.14-3.387-9.906-4.656-7.53-2.54-17.36-4.532-29.408-6.25-2.013-.287-4.12-.544-6.25-.813-53.076-30.045-72.99-81.71-14.125-92.312-31.568-6.886-45.63-18.522-23.468-36.28 15.74-7.15 30.547-17.655 44.092-30.97 6.648 4.773 12.84 10.038 18.47 15.72-4.105 4.172-8.338 8.257-12.72 12.217l16.188 29.594c79.118-71.955 116.195-179.53 110.03-285l-27.342 7.97c.45 7.61.64 15.19.562 22.75h-25.594c.702-9.792 1.063-19.735 1.063-29.814h-.75c-.323-5.39-3.763-9.293-7-11.75-3.402-2.58-7.31-4.383-11.97-6.093-9.32-3.422-21.704-6.177-36.875-8.532-30.342-4.71-71.613-7.563-117.22-7.563zm0 18.688c44.822 0 85.426 2.854 114.344 7.343 14.46 2.245 26.06 4.932 33.313 7.594 1.04.382 1.775.75 2.625 1.125-.85.375-1.58.742-2.625 1.125-7.252 2.662-18.854 5.38-33.313 7.625-28.918 4.49-69.522 7.344-114.344 7.344-44.82 0-85.425-2.855-114.344-7.345-14.46-2.245-26.06-4.963-33.312-7.625-1.05-.386-1.77-.748-2.625-1.125.853-.376 1.577-.74 2.625-1.125 7.252-2.662 18.853-5.35 33.313-7.594 28.918-4.49 69.522-7.343 114.343-7.343zm-197.25 71.874H86.25c8.057 57.878 28.23 108.83 56.188 146.25-6.974 5.74-13.407 11.968-19.188 18.688-38.648-46.456-59.042-104.647-64.344-164.938zm367.188 0h27C447.51 171.82 425.336 228.34 388.03 275c-5.44-6.055-11.406-11.73-17.842-16.97 27.81-37.38 47.873-88.175 55.906-145.842z"/>',
  dice: '<path d="M255.76 44.764c-6.176 0-12.353 1.384-17.137 4.152L85.87 137.276c-9.57 5.536-9.57 14.29 0 19.826l152.753 88.36c9.57 5.536 24.703 5.536 34.272 0l152.753-88.36c9.57-5.535 9.57-14.29 0-19.825l-152.753-88.36c-4.785-2.77-10.96-4.153-17.135-4.153zm-.824 53.11c9.013.097 17.117 2.162 24.31 6.192 4.92 2.758 8.143 5.903 9.666 9.438 1.473 3.507 1.56 8.13.26 13.865l-1.6 5.706c-1.06 4.083-1.28 7.02-.66 8.81.57 1.764 1.983 3.278 4.242 4.544l3.39 1.898-33.235 18.62-3.693-2.067c-4.118-2.306-6.744-4.912-7.883-7.82-1.188-2.935-.99-7.603.594-14.005l1.524-5.748c.887-3.423.973-6.23.26-8.418-.653-2.224-2.134-3.983-4.444-5.277-3.515-1.97-7.726-2.676-12.63-2.123-4.956.526-10.072 2.268-15.35 5.225-4.972 2.785-9.487 6.272-13.55 10.46-4.112 4.162-7.64 8.924-10.587 14.288L171.9 138.21c5.318-5.34 10.543-10.01 15.676-14.013 5.134-4 10.554-7.6 16.262-10.8 14.976-8.39 28.903-13.38 41.78-14.967 3.208-.404 6.315-.59 9.32-.557zm50.757 56.7l26.815 15.024-33.235 18.62-26.816-15.023 33.236-18.62zM75.67 173.84c-5.753-.155-9.664 4.336-9.664 12.28v157.696c0 11.052 7.57 24.163 17.14 29.69l146.93 84.848c9.57 5.526 17.14 1.156 17.14-9.895V290.76c0-11.052-7.57-24.16-17.14-29.688l-146.93-84.847c-2.69-1.555-5.225-2.327-7.476-2.387zm360.773.002c-2.25.06-4.783.83-7.474 2.385l-146.935 84.847c-9.57 5.527-17.14 18.638-17.14 29.69v157.7c0 11.05 7.57 15.418 17.14 9.89L428.97 373.51c9.57-5.527 17.137-18.636 17.137-29.688v-157.7c0-7.942-3.91-12.432-9.664-12.278zm-321.545 63.752c6.553 1.366 12.538 3.038 17.954 5.013 5.415 1.976 10.643 4.417 15.68 7.325 13.213 7.63 23.286 16.324 30.218 26.082 6.932 9.7 10.398 20.046 10.398 31.04 0 5.64-1.055 10.094-3.168 13.364-2.112 3.212-5.714 5.91-10.804 8.094l-5.2 1.92c-3.682 1.442-6.093 2.928-7.23 4.46-1.137 1.472-1.705 3.502-1.705 6.092v3.885l-29.325-16.933v-4.23c0-4.72.892-8.376 2.68-10.97 1.787-2.652 5.552-5.14 11.292-7.467l5.2-2.006c3.087-1.21 5.334-2.732 6.742-4.567 1.46-1.803 2.192-4.028 2.192-6.676 0-4.027-1.3-7.915-3.9-11.66-2.6-3.804-6.227-7.05-10.885-9.74-4.387-2.532-9.126-4.29-14.217-5.272-5.09-1.04-10.398-1.254-15.922-.645v-27.11zm269.54 8.607c1.522 0 2.932.165 4.232.493 6.932 1.696 10.398 8.04 10.398 19.034 0 5.64-1.056 11.314-3.168 17.023-2.112 5.65-5.714 12.507-10.804 20.568l-5.2 7.924c-3.682 5.695-6.093 9.963-7.23 12.807-1.137 2.785-1.705 5.473-1.705 8.063v3.885l-29.325 16.932v-4.23c0-4.72.894-9.41 2.68-14.067 1.79-4.715 5.552-11.55 11.292-20.504l5.2-8.01c3.087-4.776 5.334-8.894 6.742-12.354 1.46-3.492 2.192-6.562 2.192-9.21 0-4.028-1.3-6.414-3.898-7.158-2.6-.8-6.23.142-10.887 2.83-4.387 2.533-9.124 6.25-14.215 11.145-5.09 4.84-10.398 10.752-15.922 17.74v-27.11c6.553-6.2 12.536-11.44 17.95-15.718 5.417-4.278 10.645-7.87 15.68-10.777 10.738-6.2 19.4-9.302 25.99-9.307zm-252.723 94.515l29.326 16.93v30.736l-29.325-16.93v-30.735zm239.246 8.06v30.735l-29.325 16.93v-30.733l29.326-16.932z"/>',
  flag: '<path d="M145.3 23.89L89.27 257.7c5.62-4.9 12.93-5.8 19.63-4.4l54-225.21zm37 6.1l-57 231.41c1 .8 1.9 1.8 2.7 2.7 39.2-14 117.2-32 127.1 32.2 15.2 99.1 96.8 135.8 148.9 114.8-27.8-99.6 87.6-116.8 70.7-205.1 0 0-111 26.4-131.6-90.6-23.5-58.14-101.6-103.33-160.8-85.41zM101.4 270.9c-6.91 22.3-10.68 51.2.6 67.9 5.4 30.1 34 51.5 49.4 57.5-12.2 4.6-24.8 2.8-35.4-3.3-5.6 11.4-18.71 17.5-29.76 21 7.21 8.8 15.46 16.7 23.96 22.4 4.3 18.2 7.3 41.8 12.7 56.9h114.7c-31.7-18.6-56.8-42-61.3-69.9 8.6-18.2 10.5-46.2-.5-70.9-14.8-22.7-54.9-22.9-61.1-48.3-2.5-11.2 5.2-40.6-13.3-33.3zm-41.38 13c-7.17 1.5-11.98 8.3-10.24 14.7 8.66 1 17.82 2.2 26.53 3.8.38-4.1 1-8.2 1.73-12-6.18-2.5-12.48-4.8-18.02-6.5zm-16.91 32.2c-7.45 1.7-10.55 12.4-3.69 15.7 13.81.8 28.8 2.6 40.96 4.9-2-5-3.24-10.1-3.9-15.3-10.35-2.2-22.62-4.3-33.37-5.3zm-3.18 33.5c-8.95 5.5.2 16.2 4.7 18 15.57 2 29.64 2.7 41.1-1.8 4.51-2.5 4.29-4.4 2.89-8.3-16.82-3.7-33.26-6.4-48.69-7.9zm57.96 29.7c-12.54 8.9-32.12 8.5-44.89 7.4 1.64 6 7.89 9 10.92 10.2 9.37 3.7 22.37-1.1 33.47-8.4 3.21-2.7 4.51-8.7.5-9.2zm-45.46 32.2l-13.18 54.9 17.5 4.2 13-54.3c-6.59-.5-11.94-2.1-17.32-4.8z"/>',
  hole: '<path d="M256 151c-62.9 0-119.9 10.8-161.94 28.8-21.03 9.1-38.38 19.9-50.86 32.5C30.71 225 23 239.9 23 256s7.71 31 20.2 43.7c12.48 12.6 29.83 23.4 50.86 32.5C136.1 350.2 193.1 361 256 361c62.9 0 119.9-10.8 161.9-28.8 21.1-9.1 38.4-19.9 50.9-32.5C481.3 287 489 272.1 489 256s-7.7-31-20.2-43.7c-12.5-12.6-29.8-23.4-50.9-32.5-42-18-99-28.8-161.9-28.8zm0 43c82.7 0 165.5 21.2 215 63.6-.5 9.9-5.3 19.6-15 29.4-10.2 10.4-25.6 20.2-45.2 28.6-39 16.7-94 27.4-154.8 27.4-60.8 0-115.8-10.7-154.8-27.4-19.55-8.4-35.01-18.2-45.19-28.6-9.65-9.8-14.48-19.5-14.96-29.4C90.54 215.2 173.3 194 256 194z"/>',
  fire: '<path d="M245.05 15.514c34.29 48.815-23.535 320.54-90.302 136.72C106.796 325.11 38.956 332.518 38.876 252.55c-71.6 79.31 43.824 220.767 87.376 243.935h52.127c-45.92-40.016-76.784-78-82.176-135.968 47.312 9.423 71.855 20.96 81.263-62.048 60.736 86.59 100.944-49.376 137.184-107.12-1.647 40.32-3.343 93.456 22.848 129.888 8.736 12.143 33.232 16.11 54.736 15.807-9.92 16.08-44.848 69.376-17.008 89.2 27.84 19.824 33.072-.384 25.856 16.176-13.264 20.88-22.992 39.375-59.072 54.063h56.064c59.44-18.72 111.807-91.663 94.607-135.535-22.015 18.657-43.774 30.897-61.294 29.537 49.12-72.08 37.84-145.903 14.752-221.342-20.224 72.383-33.488 82.495-54.576 99.52 29.104-68.657-85.44-214.448-146.51-253.15z"/>',
  cycle: '<path d="M252.314 19.957c-72.036.363-142.99 33.534-189.18 95.97-69.83 94.39-59.125 223.32 19.85 304.993l-37.238 50.332 151.22-22.613L174.35 297.42l-43.137 58.308c-44.08-54.382-47.723-133.646-4.16-192.53 30.676-41.466 77.863-63.504 125.758-63.753 16.344-.085 32.766 2.382 48.645 7.467l-6.963-46.55c-23.858-4.86-47.908-5.026-71.017-.997-59.232 7.322-113.994 39.918-148.157 91.215 35.65-65.89 103.774-105.918 176.043-107.744 1.673-.042 3.347-.063 5.023-.065 14.8-.01 29.748 1.596 44.597 4.905l48.608-7.268c-31.14-13.906-64.32-20.62-97.274-20.453zm212.93 22.055l-151.217 22.61 22.614 151.22 41.126-55.588c42.204 54.29 45.092 132.048 2.187 190.043-40.22 54.367-108.82 75.32-170.19 57.566l6.522 43.598c28.726 5.533 58.236 4.414 86.203-3.07 37.448-5.957 73.34-22.05 103.16-47.728-49.196 54.65-122.615 77.514-191.744 64.34l-55.8 8.344c99.03 43.7 218.402 14.77 285.51-75.938 69.13-93.445 59.34-220.743-17.483-302.53l39.114-52.866z"/>',
  warning: '<path d="M254.97 34.75c-30.48-.167-59.02 22.12-79.532 62.156-.075.146-.176.26-.25.406L43.063 326.783l-.22.343C18.5 365.413 13.377 401.515 28.47 428.03c15.08 26.498 48.627 40.126 93.5 37.908H387.063c44.887 2.227 78.445-11.404 93.53-37.907 15.09-26.51 9.956-62.595-14.375-100.874l-.22-.375L335.28 98.064c-.06-.12-.124-.225-.186-.344-20.948-40.263-49.626-62.803-80.125-62.97zm.06 18.844c13.576.13 26.453 6.93 38.126 18.343 11.606 11.347 22.554 27.453 33.406 48.344.063.122.125.224.188.345l115.22 201.563c.033.053.058.102.092.156l.125.22c12.92 20.274 21.395 38.06 25.282 53.967 3.91 16.01 3.063 30.648-3.845 42.408-6.908 11.76-19.222 19.533-34.78 23.906-15.444 4.34-34.508 5.656-57.408 4.5H137.625c-24.845 1.258-44.73-.32-60.405-5.125-15.78-4.84-27.68-13.45-33.72-25.69-6.04-12.237-5.862-26.797-1.5-42.436 4.333-15.535 12.815-32.608 24.875-51.53l.22-.377L183.562 120c.08-.157.17-.28.25-.438C194.51 98.644 205.32 82.6 216.875 71.376c11.642-11.307 24.58-17.913 38.156-17.78zm47.657 62.093l-28.53 224.032h-41.844L204.438 120.5c-1.404 2.556-2.81 5.205-4.22 7.97l-.093.218-.125.218-116.938 202.97-.093.187-.126.187C71.28 350.346 63.598 366.226 60 379.125c-3.598 12.9-3.108 22.322.25 29.125 3.358 6.803 9.925 12.28 22.47 16.125 12.542 3.845 30.67 5.547 54.405 4.313l.25-.032h234.313l.25.03c21.85 1.138 39.308-.28 51.875-3.81 12.566-3.533 19.822-8.827 23.687-15.407 3.865-6.58 4.978-15.545 1.813-28.5-3.166-12.958-10.732-29.374-23.094-48.72l-.126-.188-.125-.218-115.658-202.28-.093-.158-.064-.187c-2.5-4.828-4.99-9.326-7.47-13.532zM231.28 361.875h43.907v43.906H231.28v-43.905z"/>',
  ninja: '<path d="M255.063 21c-46.697 0-88.406 27.674-117.844 70.656-29.44 42.982-47.25 101.566-47.25 166.094 0 64.527 17.81 123.112 47.25 166.094 29.437 42.982 71.146 70.656 117.843 70.656 46.696 0 88.405-27.674 117.843-70.656 29.44-42.982 47.25-101.567 47.25-166.094 0-64.528-17.81-123.112-47.25-166.094C343.468 48.674 301.76 21 255.062 21zM396.28 200.344c3.365 18.28 5.19 37.527 5.19 57.406 0 18.535-1.594 36.522-4.533 53.688-37.91 12.904-87.436 20.812-141.656 20.812-54.45 0-104.125-8.235-142.186-21.313-2.884-17.014-4.438-34.833-4.438-53.187 0-19.868 1.827-39.103 5.188-57.375 37.903 14.565 87.35 23.25 141.47 23.25 54.136 0 103.183-8.707 140.967-23.28zM177.157 241c-15.137-.162-30.97 3.458-47.375 10.313 14.562 51.423 87.08 42.483 102.157 10.156-17.004-13.822-35.318-20.262-54.78-20.47zm155.75 0c-19.462.208-37.808 6.648-54.812 20.47 15.078 32.326 87.596 41.266 102.156-10.158-16.405-6.854-32.206-10.474-47.344-10.312z"/>',
  target: '<path d="M27.48 25.695C37 62.802 51.945 100.233 69.07 137.86c17.496-31.598 41.214-52.96 71.563-70.473C102.823 50.575 65.097 36.27 27.48 25.695zm456.24 0c-37.62 10.575-75.347 24.88-113.156 41.692 30.35 17.514 54.067 38.875 71.563 70.472 17.125-37.627 32.07-75.058 41.592-112.165zm-367.1 81.315c-3.574 3.207-6.978 6.57-10.224 10.117L232.12 242.85l10.257-10.243L116.62 107.01zm277.956 0L28.018 473.11l10.54 10.26L404.8 117.126c-3.245-3.548-6.648-6.91-10.224-10.117zm-138.963 26.81c-24.338 0-47.014 7.245-65.998 19.682l13.494 13.477c15.33-9.19 33.285-14.472 52.503-14.472 19.214 0 37.16 5.28 52.483 14.465l13.492-13.477c-18.975-12.433-41.64-19.676-65.975-19.676zm-.004 45.08c-11.807 0-22.994 2.732-32.967 7.588l14.246 14.23c5.86-2.026 12.152-3.138 18.72-3.138 6.56 0 12.848 1.11 18.702 3.13l14.25-14.228c-9.97-4.853-21.15-7.582-32.953-7.582zm102.27 11.58l-13.556 13.55c8.464 14.877 13.297 32.102 13.297 50.488 0 19.172-5.255 37.087-14.403 52.392l13.496 13.48c12.386-18.958 19.598-41.59 19.598-65.872 0-23.51-6.76-45.467-18.43-64.04zm-204.56 0c-11.677 18.573-18.443 40.527-18.443 64.038 0 24.282 7.217 46.912 19.61 65.87l13.493-13.478c-9.154-15.305-14.416-33.22-14.416-52.392 0-18.386 4.838-35.61 13.307-50.487l-13.55-13.55zm171.315 33.24l-14.457 14.458c1.536 5.174 2.373 10.655 2.373 16.343 0 6.543-1.103 12.813-3.113 18.654l14.25 14.23c4.83-9.952 7.543-21.11 7.543-32.883 0-10.962-2.37-21.38-6.595-30.8zm-138.072.003c-4.227 9.417-6.598 19.836-6.598 30.798 0 11.773 2.715 22.93 7.547 32.882l14.25-14.23c-2.01-5.84-3.117-12.11-3.117-18.65 0-5.69.837-11.17 2.375-16.344l-14.458-14.455zm92.523 45.547l-10.274 10.273 203.83 203.826 10.54-10.26-204.096-203.84zm-39.84 39.84l-14.453 14.452c9.423 4.23 19.85 6.604 30.816 6.604 10.962 0 21.38-2.373 30.798-6.6l-14.453-14.453c-5.174 1.538-10.657 2.375-16.346 2.375-5.695 0-11.183-.838-16.364-2.38zM81.87 341.3l-68.024 68.026h51.588l68.11-68.025H81.872zm295.78 0l68.112 68.026h51.59L429.326 341.3H377.65zm-172.546 1.95l-13.55 13.553c18.58 11.68 40.544 18.45 64.06 18.45 23.51 0 45.464-6.768 64.036-18.444l-13.55-13.552c-14.875 8.47-32.102 13.306-50.487 13.306-18.39 0-35.625-4.84-50.51-13.314zm-34.88 34.883l-68.03 68.025.003 51.52 68.026-68.024v-51.52zm170.75 0v51.52L409 497.68l.002-51.52-68.027-68.025z"/>',
  scroll: '<path d="M103.432 17.844c-1.118.005-2.234.032-3.348.08-2.547.11-5.083.334-7.604.678-20.167 2.747-39.158 13.667-52.324 33.67-24.613 37.4 2.194 98.025 56.625 98.025.536 0 1.058-.012 1.583-.022v.704h60.565c-10.758 31.994-30.298 66.596-52.448 101.43-2.162 3.4-4.254 6.878-6.29 10.406l34.878 35.733-56.263 9.423c-32.728 85.966-27.42 182.074 48.277 182.074v-.002l9.31.066c23.83-.57 46.732-4.298 61.325-12.887 4.174-2.458 7.63-5.237 10.467-8.42h-32.446c-20.33 5.95-40.8-6.94-47.396-25.922-8.956-25.77 7.52-52.36 31.867-60.452 5.803-1.93 11.723-2.834 17.565-2.834v-.406h178.33c-.57-44.403 16.35-90.125 49.184-126 23.955-26.176 42.03-60.624 51.3-94.846l-41.225-24.932 38.272-6.906-43.37-25.807h-.005l.002-.002.002.002 52.127-8.85c-5.232-39.134-28.84-68.113-77.37-68.113C341.14 32.26 222.11 35.29 149.34 28.496c-14.888-6.763-30.547-10.723-45.908-10.652zm.464 18.703c13.137.043 27.407 3.804 41.247 10.63l.033-.07c4.667 4.735 8.542 9.737 11.68 14.985H82.92l10.574 14.78c10.608 14.83 19.803 31.99 21.09 42.024.643 5.017-.11 7.167-1.814 8.836-1.705 1.67-6.228 3.875-15.99 3.875-40.587 0-56.878-44.952-41.012-69.06C66.238 46.64 79.582 39.22 95.002 37.12c2.89-.395 5.863-.583 8.894-.573zM118.5 80.78h46.28c4.275 15.734 3.656 33.07-.544 51.51H131.52c1.9-5.027 2.268-10.574 1.6-15.77-1.527-11.913-7.405-24.065-14.62-35.74zm101.553 317.095c6.44 6.84 11.192 15.31 13.37 24.914 3.797 16.736 3.092 31.208-1.767 43.204-4.526 11.175-12.576 19.79-22.29 26h237.19c14.448 0 24.887-5.678 32.2-14.318 7.312-8.64 11.2-20.514 10.705-32.352-.186-4.473-.978-8.913-2.407-13.18l-69.91-8.205 42.017-20.528c-8.32-3.442-18.64-5.537-31.375-5.537H220.053zm-42.668.506c-1.152-.003-2.306.048-3.457.153-2.633.242-5.256.775-7.824 1.63-15.11 5.02-25.338 21.54-20.11 36.583 3.673 10.57 15.347 17.71 25.654 13.938l1.555-.57h43.354c.946-6.36.754-13.882-1.358-23.192-3.71-16.358-20.543-28.483-37.815-28.54z"/>',
  cards: '<path d="M272.824 24.318c-14.929.312-25.66 3.246-32.767 8.446L142.898 84.91l-54.105 73.514C77.42 175.98 85.517 210 121.111 188.197l38.9-51.351c49.476-42.711 150.485-23.032 102.587 62.591-23.53 49.582-12.457 73.79 17.76 83.95l13.812-46.381c23.949-53.825 68.502-63.51 66.684-106.904l107.302 7.724-.865-112.045-194.467-1.463zm-54.09 103.338c-17.41-.3-34.486 6.898-46.92 17.375l-39.044 51.33c10.713 8.506 21.413 3.96 32.125-6.363 12.626 6.394 22.365-3.522 30.365-23.297 3.317-13.489 8.21-23.037 23.474-39.045zm-32.617 88.324a13.49 13.49 0 0 0-5.232 1.235L51.72 276.725c-6.784 3.13-9.763 11.202-6.633 17.992l85.27 185.08c3.131 6.783 11.204 9.779 18 6.635l129.15-59.504c6.796-3.137 9.776-11.198 6.646-18L198.871 223.86c-2.344-5.097-7.474-8.043-12.754-7.88z"/>',
  deck: '<path d="M209.955 488.202l-121.242-46.62c-11.308-4.34-11.643-12.087-.79-17.288L204.8 469.236c15.024 5.777 37.23 4.92 51.774-1.96l161.522-76.6c10.014 4.436 9.864 11.818-.67 16.798L250.43 486.668c-10.983 5.195-29.128 5.902-40.477 1.534zm0-32.37L88.713 409.21C79.09 405.52 77.41 399.36 83.81 394.4l120.99 46.517c15.024 5.776 37.23 4.92 51.774-1.96l165.393-78.433c5.855 4.417 4.38 10.36-4.542 14.58l-166.993 79.193c-10.983 5.196-29.128 5.903-40.477 1.534zm0-28.314L88.713 380.892c-9.624-3.69-11.302-9.85-4.902-14.813l120.99 46.523c15.024 5.77 37.23 4.914 51.774-1.96l165.393-78.438c5.855 4.416 4.38 10.36-4.542 14.58l-166.993 79.2c-10.983 5.194-29.128 5.895-40.477 1.533zm0-28.32L88.713 352.572c-9.624-3.69-11.302-9.85-4.902-14.812l120.99 46.524c15.024 5.776 37.23 4.92 51.774-1.96l165.393-78.44c5.855 4.424 4.38 10.368-4.542 14.586l-166.993 79.194c-10.983 5.196-29.128 5.897-40.477 1.534zm0-28.32L88.713 324.26c-11.35-4.355-11.643-12.15-.66-17.353l87.236-41.376 34.826 18.323c15.365 8.09 37.937 7.06 52.5-2.39l65.74-42.672 88.404 34.007c11.344 4.357 11.65 12.16.665 17.354l-166.993 79.195c-10.983 5.195-29.128 5.902-40.477 1.534zm6.85-99.73L93.44 206.22c-10.767-5.67-11.217-15.647-1.018-22.268l105.11-68.228h25.845l.015 64.962h58.664v-64.962H332.2l-27.487-41.39 118.91 62.584c10.763 5.67 11.212 15.646 1.013 22.268L254.803 269.418c-10.2 6.62-27.23 7.4-37.997 1.73zm21.637-105.523V100.67h-34.845l49.13-79.74 49.12 79.74H267v64.955h-28.558z"/>',
  gear: '<path d="M179.625 22.313L163.22 58.937c-3.258-.384-6.498-.604-9.72-.624-10.577-.066-20.857 1.808-30.47 5.28L99.78 31.032 55.75 63.188l24.063 33.657c-7.21 10.412-12.3 22.5-14.5 35.75l-42.72 4.687 5.345 54.25 45.468-5c5.082 10.2 12.078 19.372 20.594 26.97l-19.406 43.375 49.375 22.094 19.5-43.564c11.656 1.242 23.08.128 33.75-3l28.124 38.53 31.72-23.186 11.655 20.156C234.014 279.138 220.873 292.3 209.624 307l-49.22-28.344-25.718 46.72 48.125 27.937c-7.068 16.934-11.967 34.975-14.343 53.812H112.5v53.72h56.22c1.66 12.053 4.372 23.753 8.03 35.06h169.312c-23.915-10.758-40.562-34.788-40.562-62.717 0-37.964 30.754-68.75 68.72-68.75 37.963 0 68.75 30.786 68.75 68.75 0 27.93-16.67 51.96-40.595 62.718h91.5V200.375l-11.688-6.406L454.594 242c-16.842-7.204-34.808-12.234-53.594-14.72v-55.53h-53.72v55.47c-18.303 2.377-35.83 7.183-52.31 14.03l-27.126-47.28-36 20.25-9.25-12.97c7.08-9.223 12.43-19.93 15.5-31.72l44.437-4.843-5.342-54.25-42.25 4.157c-4.92-12.618-12.648-23.953-22.563-33.094L229 44.406l-49.375-22.093zm-27.344 84.25c23.3-.24 42.94 17.827 44.376 41.343 1.48 24.275-17.004 45.144-41.28 46.625-24.278 1.483-45.145-16.974-46.626-41.25-1.48-24.274 16.973-45.142 41.25-46.624.76-.046 1.53-.086 2.28-.094z"/>',
  chat: '<path d="M488 348.78h-70.24l-15.1 87.44-48.78-87.44H169v-50h190v-157h129zm-145-273v207H158.13l-48.79 87.47-15.11-87.47H24v-207zM136.724 215.324c0-10.139-12.257-15.214-19.425-8.046-7.168 7.168-2.093 19.426 8.046 19.426 6.285 0 11.38-5.095 11.38-11.38zm60.945 0c-.068-10.12-12.32-15.122-19.452-7.943-7.131 7.18-2.047 19.399 8.073 19.399 6.314 0 11.422-5.141 11.38-11.456zm60.945 0c0-10.139-12.257-15.214-19.425-8.046-7.169 7.168-2.093 19.426 8.046 19.426 6.284 0 11.38-5.095 11.38-11.38z"/>',
  send: '<path d="M480 40L32 296l112.148 37.383L448 72 209.404 355.135 320 392 480 40zM208 376l-16 96 49.932-83.863L208 376z"/>',
  lock: '<path d="M254.28 17.313c-81.048 0-146.624 65.484-146.624 146.406V236h49.594v-69.094c0-53.658 43.47-97.187 97.03-97.187 53.563 0 97.032 44.744 97.032 97.186V236h49.594v-72.28c0-78.856-65.717-146.407-146.625-146.407zM85.157 254.688c-14.61 22.827-22.844 49.148-22.844 76.78 0 88.358 84.97 161.5 191.97 161.5 106.998 0 191.968-73.142 191.968-161.5 0-27.635-8.26-53.95-22.875-76.78H85.155zM254 278.625c22.34 0 40.875 17.94 40.875 40.28 0 16.756-10.6 31.23-25.125 37.376l32.72 98.126h-96.376l32.125-98.125c-14.526-6.145-24.532-20.62-24.532-37.374 0-22.338 17.972-40.28 40.312-40.28z"/>',
  unlock: '<path d="M402.6 164.6c0-78.92-65.7-146.47-146.6-146.47-81.1 0-146.6 65.49-146.6 146.47v72.3H159v-69.1c0-53.7 43.4-97.26 97-97.26 53.5 0 97 41.66 97 94.06zm-315.7 91C72.2 278.4 64 304.7 64 332.4c0 88.3 85 161.5 192 161.5s192-73.2 192-161.5c0-27.7-8.3-54-22.9-76.8zm168.8 23.9c22.3 0 40.9 18 40.9 40.3 0 16.8-10.6 31.2-25.1 37.3l32.7 98.2h-96.4l32.1-98.2c-14.5-6.1-24.5-20.6-24.5-37.3 0-22.3 18-40.3 40.3-40.3z"/>',
  save: '<path d="M224 30v256h-64l96 128 96-128h-64V30h-64zM32 434v48h448v-48H32z"/>',
  book: '<path d="M149.688 85.625c-1.234.005-2.465.033-3.72.063-33.913.806-75.48 10.704-127.25 33.718V362.78c60.77-28.82 106.718-37.067 144.22-33.092 33.502 3.55 59.685 16.66 83.562 31.187v-242.97c-23.217-17.744-50.195-30.04-85.97-32-3.52-.192-7.142-.296-10.843-.28zm211.968 0c-3.7-.016-7.322.088-10.844.28-35.773 1.96-62.75 14.256-85.968 32v242.97c23.876-14.527 50.06-27.637 83.562-31.188 37.502-3.974 83.45 4.272 144.22 33.094V119.407c-51.77-23.014-93.337-32.912-127.25-33.72-1.255-.028-2.486-.056-3.72-.06zm5.72 261.78c-1.038-.002-2.074.017-3.095.033-4.808.075-9.43.37-13.905.843-33.932 3.597-59.603 17.976-85.53 34.44v.28c-6.554-1.99-13.02-2.37-19.408-.97-25.566-16.177-51.003-30.202-84.468-33.75-5.595-.592-11.44-.883-17.564-.842-32.04.213-71.833 9.778-124.687 35.937v42.53c60.77-28.823 106.714-37.067 144.218-33.092 18.545 1.965 34.837 6.845 49.75 13.28-4.682 6.064-9.308 13.268-13.875 21.688h117.156c-5.93-8.22-11.798-15.414-17.626-21.56 14.996-6.503 31.39-11.43 50.062-13.408 37.503-3.974 83.448 4.27 144.22 33.094v-42.53c-53.16-26.31-93.115-35.863-125.25-35.97z"/>',
  globe: '<path d="M322.02 20.184l-17.13 42.273c7.053 2.776 13.857 6.04 20.372 9.758l8.62-13.274 15.675 10.18-8.637 13.296c.85.628 1.692 1.266 2.53 1.91l-19.745 22.735c4.994 3.747 9.706 7.85 14.1 12.268l19.754-22.746c.187.184.38.366.567.55l11.795-10.618 12.504 13.89-11.79 10.614c4.71 5.887 9.005 12.117 12.846 18.648l14.114-7.19 8.482 16.653-14.092 7.177c3.015 6.877 5.555 14.007 7.578 21.353l15.452-3.283 3.884 18.28-15.445 3.282c1.114 7.374 1.71 14.918 1.77 22.59l15.777.827-.98 18.664-15.74-.825c-.835 7.61-2.214 15.056-4.09 22.303l14.947 4.857-5.777 17.774-14.922-4.85c-2.767 7.09-6.03 13.934-9.75 20.486l13.142 8.537-10.18 15.674-13.13-8.528c-4.493 6.108-9.418 11.877-14.725 17.273l10.46 11.617-13.89 12.506-10.437-11.594c-5.9 4.734-12.14 9.062-18.69 12.924l7.05 13.838-16.65 8.484-7.033-13.803c-6.898 3.034-14.055 5.585-21.427 7.62l3.213 15.123-18.28 3.884-3.21-15.107c-7.405 1.125-14.978 1.735-22.682 1.797l-.808 15.41-18.662-.98.807-15.368c-7.645-.834-15.127-2.208-22.405-4.092l-4.738 14.58-17.773-5.777 4.73-14.55c-7.124-2.78-13.997-6.063-20.575-9.803l-8.328 12.822-15.672-10.18 8.33-12.824c-.93-.685-1.848-1.384-2.762-2.088l19.848-22.853c-4.997-3.743-9.71-7.842-14.108-12.257l-19.848 22.853c-.156-.152-.314-.302-.47-.455l-11.356 10.226-12.504-13.89 11.347-10.216c-4.563-5.7-8.737-11.725-12.49-18.03l-38.9 23.71c9.515 15.894 21.132 30.386 34.472 43.088l-20.575 23.69 14.112 12.255 20.575-23.693c34.76 27.522 78.7 43.96 126.482 43.96 1.365 0 2.726-.023 4.084-.05v19.473c-34.134 15.356-59.115 36.682-79.753 59.906h197.54c-19.674-24.32-44.835-43.993-80.784-59.712V409.41c92.908-19.004 162.8-101.184 162.8-199.68 0-58.094-24.315-110.51-63.323-147.636l20.58-23.698-14.11-12.253-20.584 23.7c-15.464-12.24-32.75-22.278-51.376-29.66zm-75.108 82.664c-59.132 0-106.838 47.692-106.838 106.8 0 59.11 47.706 106.8 106.838 106.8 59.132 0 106.838-47.69 106.838-106.8 0-9.375-1.203-18.462-3.46-27.12-10.244 25.087-23.08 45.15-45.905 66.95-16.887-1.487-29.712-8.08-40.643-19.966 6.048-8.86 13.09-17.22 27.096-22.102-12.564-28.283-18.19-56.568-21.393-84.85 12.464 4.59 20.16 11.93 29.235 24.954 7.712 1.697 16.863-6.856 23.27-13.975-19.274-18.99-45.752-30.692-75.038-30.692zm-32.48 65.03c17.62 12.56 32.407 31.486 38.03 52.517-11.065 9.256-16.907 21.124-19.92 34.406 16.957 8.23 30.048 21.297 41.65 36.22v.007c-34.438-3.405-68.245-9.135-98.696-27.164-12.172-20.824-19.107-41.65-19.92-62.474 16.6-7.525 33.2-4.936 49.8.895 9.222-11.47 9.186-20.922 9.056-34.408z"/>',
  folder: '<path d="M168.8 32.89l-32.6 32.53 21.3 21.17L190 54.08zm33.9 33.96l-9.9 9.91 123 123.04 9.9-9.9zm159.4 18.06c-3.7 0-7.4.1-10.9.3-31.9 1.78-56.7 11.76-78.3 26.39l65.5 65.6c3.5 7.3 52 96.2 65.5 123.3-9.7-6.4-123.4-65.4-123.4-65.4l-15.3-15.2v140.3c23.9-14.6 50.1-27.7 83.6-31.2 37.5-4 83.5 4.3 144.2 33.1V118.7c-51.7-22.99-93.3-32.89-127.2-33.69-1.3 0-2.5-.11-3.7-.1zm-230.8 1.03C100.4 88.93 63.44 99 19.05 118.7v243.4C79.85 333.3 125.8 325 163.3 329c33 5.2 58.1 15.8 83.6 31.2V201.6c-38.6-38.5-77.1-77.1-115.6-115.66zm48.8 3.55l-9.9 9.89 123 123.02 9.9-9.9zM336 205.1l-27.5 27.5 55.1 27.6zM143.8 346.7c-32 .3-71.85 9.8-124.75 36v42.5c60.8-28.8 106.75-37.1 144.25-33.1 18.6 2 34.9 6.9 49.8 13.3-4.7 6.1-9.3 13.3-13.9 21.7h117.2c-6-8.2-11.8-15.4-17.7-21.6 15-6.5 31.4-11.4 50.1-13.4 37.5-4 83.5 4.3 144.2 33.1v-42.5c-53.1-26.3-93.1-35.9-125.2-36h-3.1c-4.8.1-9.4.4-13.9.9-34 3.6-59.6 18-85.6 34.4-5.7-.8-13-1.8-18.3-.9-27.2-16.2-58.2-30.4-85.5-33.5-5.6-.6-11.5-.9-17.6-.9z"/>',
  gamepad: '<path d="M380.95 114.46c-62.946-13.147-63.32 32.04-124.868 32.04-53.25 0-55.247-44.675-124.87-32.04C17.207 135.072-.32 385.9 60.16 399.045c33.578 7.295 50.495-31.644 94.89-59.593a51.562 51.562 0 0 0 79.77-25.78 243.665 243.665 0 0 1 21.24-.91c7.466 0 14.44.32 21.126.898a51.573 51.573 0 0 0 79.82 25.717c44.45 27.95 61.367 66.93 94.955 59.626 60.47-13.104 42.496-260.845-71.01-284.543zM147.47 242.703h-26.144V216.12H94.73v-26.143h26.594v-26.593h26.144v26.582h26.582v26.144h-26.582v26.582zm38.223 89.615a34.336 34.336 0 1 1 34.337-34.336 34.336 34.336 0 0 1-34.325 34.346zm140.602 0a34.336 34.336 0 1 1 34.367-34.325 34.336 34.336 0 0 1-34.368 34.335zM349.98 220.36A17.323 17.323 0 1 1 367.3 203.04a17.323 17.323 0 0 1-17.323 17.323zm37.518 37.52a17.323 17.323 0 1 1 17.322-17.324 17.323 17.323 0 0 1-17.365 17.334zm0-75.048a17.323 17.323 0 1 1 17.322-17.323 17.323 17.323 0 0 1-17.365 17.333zm37.518 37.518a17.323 17.323 0 1 1 17.323-17.323 17.323 17.323 0 0 1-17.367 17.334z"/>',
  graduate: '<path d="M256 89.61L22.486 177.18 256 293.937l111.22-55.61-104.337-31.9A16 16 0 0 1 256 208a16 16 0 0 1-16-16 16 16 0 0 1 16-16l-2.646 8.602 18.537 5.703a16 16 0 0 1 .008.056l27.354 8.365L455 246.645v12.146a16 16 0 0 0-7 13.21 16 16 0 0 0 7.293 13.406C448.01 312.932 448 375.383 448 400c16 10.395 16 10.775 32 0 0-24.614-.008-87.053-7.29-114.584A16 16 0 0 0 480 272a16 16 0 0 0-7-13.227v-25.42L413.676 215.1l75.838-37.92L256 89.61zM119.623 249L106.5 327.74c26.175 3.423 57.486 18.637 86.27 36.627 16.37 10.232 31.703 21.463 44.156 32.36 7.612 6.66 13.977 13.05 19.074 19.337 5.097-6.288 11.462-12.677 19.074-19.337 12.453-10.897 27.785-22.128 44.156-32.36 28.784-17.99 60.095-33.204 86.27-36.627L392.375 249h-6.25L256 314.063 125.873 249h-6.25z"/>',
  arrow: '<path d="M130.81 21.785v245.95H43.84L256 489.382l212.158-221.644H381.19V21.786H130.81z"/>',
  hand: '<path d="M309.752 35.514c-3.784.046-7.807.454-12.004 1.082-27.198 61.067-49.85 122.007-65.45 182.775-9.293-4.313-18.634-8.57-27.962-12.845-3.95-53.137 1.876-103.13 5.33-153.757-6.696-5.06-17.54-8.82-28.596-8.98-11.573-.166-22.304 3.33-28.537 9.513-5.44 70.22-5.258 147.354 1.133 217.475 21.926 29.733 45.877 59.903 52.305 103.64l-18.49 2.716c-4.24-28.837-17.583-51.34-33.238-73.51l-7.582-10.55c-5.01-6.862-10.134-13.79-15.185-20.945-21.397-28.51-44.094-51.49-62.155-59.22-9.81-4.196-17.273-4.385-24.632-.442-6.486 3.474-13.52 11.49-20.043 25.387 53.41 51.674 70.576 104.044 82.718 138.664 5.79 16.507 11.08 31.523 21.274 47.025 15.614 23.746 49.446 42.91 84.066 49.51 34.62 6.598 68.69.712 86.87-19.833 14.36-16.227 41.232-41.87 56.195-57.787 24.524-26.085 59.485-54.964 88.597-77.248 14.556-11.142 27.62-20.598 37.197-27.178 4.79-3.29 8.68-5.848 11.612-7.625.197-.12.34-.182.527-.294 1.31-9.873-.448-20.663-4.804-29.375-4.358-8.718-10.787-14.658-17.763-17.015-35.707 21.283-70.62 44.438-103.877 75.438-5.745-7.274-11.933-14.06-18.5-20.424 30.747-58.815 69.992-107.75 114.28-150.41-1.56-9.55-7.76-19.814-16.114-27.32-8.4-7.55-18.526-11.7-25.852-11.623-45.615 46.382-85.864 96.907-117.5 154.463-6.918-4.36-14.023-8.513-21.27-12.51 18.893-64.715 42.99-126.426 73.5-184.392-12.757-15.245-25.477-23.335-42.347-24.324-1.205-.07-2.44-.096-3.7-.08z"/>',
  robot: '<path d="M81 21.499c-12.81 0-23 10.192-23 23.002 0 12.81 10.19 23 23 23s23.002-10.19 23.002-23S93.81 21.499 81 21.499zm350 0c-12.81 0-23.002 10.192-23.002 23.002 0 12.81 10.192 23 23.002 23 12.81 0 23-10.19 23-23s-10.19-23.002-23-23.002zM110.18 73.212a41.25 41.25 0 0 1-15.11 9.781l28.666 45.867 14.983-9.988zm291.64 0l-28.539 45.66 14.983 9.988 28.666-45.867a41.25 41.25 0 0 1-15.11-9.781zm-242.966 53.87l-36.143 24.095 6.652 19.955c9.215-12.422 23.339-21.987 39.614-28.912 1.172-.5 2.37-.973 3.568-1.448zm194.292 0l-13.69 13.69c1.197.475 2.395.949 3.567 1.448 16.275 6.925 30.399 16.49 39.614 28.912l6.652-19.955zM256 144.5c-29 0-58.021 4.939-79.977 14.281-21.898 9.319-35.908 22.38-39.164 38.364L106.28 426.5h299.442l-30.58-229.355c-3.256-15.984-17.266-29.045-39.164-38.364C314.02 149.44 285 144.501 256 144.501zm-64 58c31.373 0 57 25.627 57 57s-25.627 57-57 57-57-25.627-57-57 25.627-57 57-57zm128 0c31.373 0 57 25.627 57 57s-25.627 57-57 57-57-25.627-57-57 25.627-57 57-57zm-128.549 16.023c-22.754 0-41.547 18.366-41.547 40.977 0 22.611 18.793 40.977 41.547 40.977 22.754 0 41.549-18.366 41.549-40.977 0-22.611-18.795-40.977-41.549-40.977zm128 0c-22.754 0-41.547 18.366-41.547 40.977 0 22.611 18.793 40.977 41.547 40.977 22.754 0 41.549-18.366 41.549-40.977 0-22.611-18.795-40.977-41.549-40.977zm-128 17.998c13.198 0 23.549 10.269 23.549 22.979 0 12.71-10.35 22.978-23.549 22.978-13.198 0-23.549-10.268-23.549-22.978s10.351-22.979 23.55-22.979zm128 0c13.198 0 23.549 10.269 23.549 22.979 0 12.71-10.35 22.978-23.549 22.978-13.198 0-23.549-10.268-23.549-22.978s10.351-22.979 23.55-22.979zM208 330.501h96v18h-96zm-16 32h128v18H192zm-16 32h160v18H176zm-103 50v46h46v-46zm64 0v46h46v-46zm64 0v46h46v-46zm64 0v46h46v-46zm64 0v46h46v-46zm64 0v46h46v-46z"/>',
  tinker: '<path d="M409.28 19.313c-20.507.34-40.836 8.245-56.53 23.937-20.558 20.558-27.823 49.56-22.188 76.156l1.032 4.938-3.594 3.594-43.406 43.406c3.86 2.906 7.167 6.498 9.72 10.625 7.166 11.59 6.305 28.69-6.22 41.218l-11.97 11.968 30.438 30.47 79.563-79.563 3.563-3.594 4.968 1.06c26.44 5.525 55.136-1.98 75.75-22.593 23.596-23.595 29.518-57.696 18.688-87.093l-49.22 49.25c-13.71 13.708-36.3 15.01-50.093 1.22-13.79-13.793-13.07-36.618.814-50.5l49.22-49.25c-8.545-3.15-17.475-4.93-26.44-5.22-1.367-.045-2.726-.054-4.093-.032zM72.157 21.53c-13.533.162-25.857 6.134-34.937 15.69-18.163 19.108-23.575 51.08 4.56 79.218l86.126 86.124c30.25 2.733 53.004 26.662 53.906 57.532L182 266c.883 5.654 4.31 10.126 8.844 12.47 5.734 2.963 12.387 3.145 19.625-4.095l64.405-64.406c7.718-7.72 6.896-12.716 3.53-18.157-3.364-5.442-11.272-10.063-18.81-10.063h-.19l-.186-.03c-30.125-1.298-53.427-23.487-56.5-53l-86.595-86.595C100.84 26.84 85.69 21.37 72.155 21.53zm191.188 227.314l-14.03 14.03 136.5 136.532 3.31 3.313-.655 4.655-4.595 31.813 77.188 49.375L489 460.625l-49.375-77.22-31.78 4.595-4.658.688-3.312-3.313-136.53-136.53zm-27.72 26.812l-11.936 11.938c-12.238 12.24-29.134 13.86-41.438 7.5-4.515-2.334-8.513-5.66-11.656-9.72l-41.78 41.782-3.595 3.594-4.97-1.063c-26.596-5.632-55.6 1.632-76.156 22.188-23.598 23.596-29.52 57.697-18.688 87.094l49.25-49.25c13.883-13.877 36.71-14.605 50.5-.814 13.792 13.792 12.494 36.384-1.22 50.094l-49.25 49.25c29.398 10.83 63.498 4.906 87.095-18.688 20.613-20.615 28.114-49.342 22.595-75.78l-1.03-4.938 3.56-3.563 79.19-79.186-30.47-30.438z"/>',
  hoodie: '<path d="M256 25c-6.6 0-16.1 3.77-26.1 10.69-9.9 6.92-20.3 16.69-29.6 27.09-8.4 9.52-15.9 19.56-21.5 28.35 5-2.29 10-4.34 15.1-6.17l.9-.41c20.2-8.78 40.6-13.25 61.1-13.25 20.5-.02 41 4.37 61.3 13.26l.8.35c5.1 1.84 10.2 3.91 15.2 6.22-5.6-8.79-13.1-18.83-21.5-28.35-9.3-10.4-19.7-20.17-29.6-27.09C272.1 28.77 262.6 25 256 25zm0 67.23c-16.3 0-32.5 2.37-48.2 7.1 1 16.67 5.3 36.37 13 51.87 8.8 17.6 20.5 28.6 35.2 28.6 14.7 0 26.4-11 35.2-28.6 7.7-15.5 12-35.2 13-51.87-15.7-4.73-31.9-7.1-48.2-7.1zm-66 13.67c-7.1 3.1-14.1 6.7-20.8 10.9 1.3 19.1 10.4 34.5 24.8 45.7 5.7 4.5 12.3 8.2 19.5 11-3.3-4.4-6.2-9.3-8.7-14.3-8.4-16.6-13.2-35.7-14.8-53.3zm132 0c-1.6 17.6-6.4 36.7-14.8 53.3-2.5 5.1-5.5 10-8.8 14.5 7.4-2.9 14.1-6.6 19.9-11.2 14.2-11.2 23.2-26.6 24.5-45.7-6.7-4.2-13.7-7.8-20.8-10.9zm-131.4 76.2c-23.4 3.6-46.8 9.2-70.3 16.7L93.42 427l31.18 10.4 26.5-198.6 17.9 1.8L155.6 442c23.6 5.7 62.1 9 100.4 9 38.3 0 76.8-3.3 100.4-9L343 240.6l17.9-1.8 26.5 198.6 31.1-10.3-26.8-228.3c-23.4-7.4-46.7-13.1-70-16.7-4.1 2.6-8.4 4.8-12.9 6.8-3.3 11.9-2.9 26 0 39.1 3.7 16.7 11.7 31.8 17.6 37.6l-12.8 12.8c-10.1-10.2-18.1-27.1-22.4-46.4-2.6-11.7-3.8-24.4-2.2-36.7-10.4 2.3-21.5 3.2-33 2.5-11.5.7-22.6-.3-33-2.6 1.6 12.3.4 25-2.2 36.8-4.3 19.3-12.3 36.2-22.4 46.4l-12.8-12.8c5.9-5.8 13.9-20.9 17.6-37.6 2.9-13.2 3.3-27.3 0-39.3-4.4-1.9-8.6-4.1-12.6-6.6zm10.2 154.4h110.4l17.6 77.5-17.6 4-14.4-63.5h-81.6L200.8 418l-17.6-4 17.6-77.5zM91.28 445.2l-2.23 18.9c.05-.3.69 1.7 3.98 4.3 3.4 2.6 8.67 5.3 13.77 7.1 5.1 1.6 10.1 2.2 12.4 2l2.9-22-30.82-10.3zm329.42 0l-30.8 10.3 2.9 22c2.3.2 7.3-.4 12.4-2 5.1-1.8 10.4-4.5 13.8-7.1 3.3-2.6 3.9-4.6 3.9-4.3l-2.2-18.9zm-266.3 15l-1.3 19.2v.1c.5.5 2.1 1.7 4.5 2.9 4.8 2.4 13 4.8 23.1 6.8 20.1 3.8 47.7 5.8 75.3 5.8 27.6 0 55.2-2 75.3-5.8 10.1-2 18.3-4.4 23.1-6.8 2.4-1.2 4-2.4 4.5-2.9v-.1l-1.3-19.2c-26.5 6.1-63.9 8.8-101.6 8.8-37.7 0-75.1-2.7-101.6-8.8z"/>',
  heat: '<path d="M328.094 16.28c-418.547 189.59 58.108 230.146-86.313 473.533C566.646 247.035 59.723 256.837 328.095 16.28zm10.844 32.44C154.714 186.1 475.226 253.64 369.717 409.06 561.48 253.028 248.215 203.768 338.94 48.72zM141 102.25c-174.244 135.025 104.332 215.754 61.063 367C307.03 285.77 42.887 268.31 141 102.25z"/>',
  solder: '<path d="M372.5 33.27c-24.9.2-51.8 13.41-70.6 46.03l-.2.4 14.4 8.3.2-.4c16.2-27.8 39.1-38.9 60.2-37.6 30.6 1.9 56.5 29.9 47.6 66.4-2 8.4-5.9 17.3-11.8 26.4-33 50.5-73 84.1-103.3 116.7-32.3 34.8-53.8 68.7-47.4 117.9C268.1 428 317 458 371.4 461c39.3 3 81-8 110.1-33v-23c-25.3 30-68.7 43-108.9 40-46.1-3-89-27-94.5-69.7-5.6-43.8 14.4-73.5 43.1-104.4 30.8-33.2 71.5-67.6 105-119 7.1-10.9 11.7-21.5 14.1-31.6 11.7-47.8-22.5-84.4-62.8-86.9-1.6-.1-3.3-.14-5-.13zM84.26 41.44C-6.511 138.9 158.5 160.1 75.56 268.1c-62.2 80.9-10.68 102.6-.96 195.1 0 0 .32-1.7.86-4.4 4.77-23.9 1.58-48.8-9.12-70.8-26.01-53.4-5.18-74.8 56.26-143.4 71.9-80.4-58.81-126.2-38.34-203.16zM287.3 90.3s-17.6 29.9-38.9 62.9c-13.8 21.4-30.8 42.9-41.4 61.4-4.9 8.5-8.7 16-11.3 21.8l-10-5.8-9.3 16 57.8 33.4 9.2-16-10-5.8c3.7-5.2 8.3-12.3 13.2-20.7 10.7-18.4 20.9-43.9 32.5-66.6 17.9-35 35-65.1 35-65.1l-26.8-15.5zM180.5 264.5l-5.4 9.4 36.1 20.8 5.4-9.4-36.1-20.8zm-4.6 24.7-55 95.2 21.7 12.5 54.9-95.2-21.6-12.5zm-60.4 107.3-3.7 12.2 14.8 8.6 8.8-9.3-19.9-11.5zm-7.8 23.4-15.53 26.9-3.11 17.9L103 453l15.5-26.8-10.8-6.3z"/>',
  bug: '<path d="M216 21.23s-5.1 9.96-9.7 22.52c-4.5 12.57-9.4 27.36-7.2 40.96 2.2 13.16 11 25.19 19 35.29.1.2.2.3.4.4 0-.1.1-.2.2-.3 3.6-5 7.4-9.8 11.4-14.1-6.5-8.69-12.4-18.93-13.2-24.18-1-6.21 2.2-20.41 6.4-31.89 4.2-11.49 8.7-20.63 8.7-20.63zm80.1.17l-16 8.08s4.5 9.14 8.7 20.63c4.2 11.48 7.4 25.68 6.4 31.89-.8 5.14-6.6 15.18-13 23.8 4.1 4.4 7.9 9.3 11.6 14.4l.1-.1c8-10 16.9-22.04 19.1-35.21 2.2-13.6-2.7-28.39-7.2-40.96-4.6-12.56-9.7-22.52-9.7-22.52zM82.38 106.6l-4.8 17.4s15.14 4.2 32.52 10.2c16.7 5.7 35.5 13.8 43 19.3 15.7 30.7 32.4 48 62 77.7-.1-1.4-.1-2.7-.1-3.9 0-6.3.1-13.3 1.3-20.6-22.6-22.9-35.3-37.5-48.2-63.4l-.9-1.8-1.5-1.2c-11.8-9.5-31.7-16.9-49.7-23.1-18.01-6.3-33.62-10.6-33.62-10.6zm347.22 0s-15.6 4.3-33.6 10.6c-18 6.2-37.9 13.6-49.7 23.1l-1.5 1.2-.9 1.8c-12.9 26-25.5 40.5-48.2 63.5 1.2 7.3 1.3 14.2 1.3 20.5 0 1.2 0 2.6-.1 4 29.6-29.7 46.3-47.1 62-77.8 7.5-5.5 26.3-13.6 43-19.3 17.4-6 32.5-10.2 32.5-10.2zm-173.7 1.8c.1.1-3.7 1.4-8.1 5.3-4.6 4.1-9.8 10.2-14.5 16.8-4.7 6.6-9 13.8-11.9 20-3 6.1-4.4 11.8-4.4 12.8s.7 3.1 3.1 5.9c2.3 2.7 6.1 5.7 10.5 8.4 8.8 5.3 20.4 8.7 25.4 8.7s16.6-3.4 25.4-8.7c4.4-2.7 8.2-5.7 10.5-8.4 2.4-2.8 3.1-4.9 3.1-5.9 0-1.1-1.3-6.7-4.2-12.8-2.8-6.2-7-13.2-11.6-19.8-4.6-6.5-9.7-12.6-14.3-16.7-4.5-4-8.4-5.5-9-5.6zm-19.6 91.9c-3.4 8.4-3.3 16.8-3.3 27 0 6.5 1.9 22.5 5.7 37.8 1.6 6.4 3.7 12.7 5.9 18.3 3.7-.7 7.5-1.1 11.4-1.1 3.9 0 7.7.4 11.4 1.1 2.2-5.6 4.3-11.9 5.9-18.3 3.8-15.3 5.7-31.3 5.7-37.8 0-10.2.1-18.6-3.3-27-6.7 2.5-13.4 4-19.7 4-6.3 0-13-1.5-19.7-4zm-99.3 18l-1.7 6.8c-15.7 62.6-47.8 126-77.68 155.8l12.72 12.8c32.86-32.9 63.56-94.1 80.36-157 21.8 1.7 44.7 11 68.2 22.3-1.6-7.9-2.7-15.3-3.3-21.6-23.1-10.7-46.8-19.1-71.6-19.1zm231 0c-24.7 0-48.5 8.5-71.6 19.1-.6 6.3-1.7 13.7-3.3 21.7 23.5-11.4 46.4-20.7 68.2-22.4 16.8 62.9 47.5 124.1 80.3 157l12.8-12.8c-29.9-29.8-62-93.2-77.7-155.8l-1.7-6.8zm-148 45.6c-22.1 20.8-43.9 41.3-64 51.3l-5 2.5v5.6c0 61.9-3.4 83.1-14.8 122.4l-45.21 30.1 10.01 15 50.7-33.8.9-3.2c12-40.9 16-65.3 16.3-125.2 19.5-10.9 38.3-27.7 56.4-44.8-1.5-4.7-2.8-9.5-4-14.3-.5-1.9-.9-3.7-1.3-5.6zm72 0c-.4 1.8-.8 3.7-1.3 5.6-1.2 4.8-2.5 9.6-4 14.3 18.1 17.1 36.9 33.9 56.4 44.8.2 59.9 4.3 84.3 16.3 125.2l.9 3.2 50.7 33.8 10-15-45.2-30.1c-11.4-39.3-14.8-60.5-14.8-122.4v-5.6l-5-2.4c-20.1-10-41.8-30.6-64-51.4zm-36 36.4c-13 0-27.4 6.9-38.2 15.9-5.4 4.5-9.9 9.5-12.8 13.8-2.9 4.4-4 8.3-4 9.3 0 40.9 27.2 98.5 55 130.4 27.8-31.9 55-89.5 55-130.4 0-1-1.1-4.9-4-9.3-2.9-4.3-7.4-9.3-12.8-13.8-10.8-9-25.2-15.9-38.2-15.9z"/>',
  wrench: '<path d="M331.188 16.72c-40.712-.002-81.41 15.408-112.438 46.436-43.866 43.864-56.798 107-38.813 162.25L17.03 388.312v25.75l170.22-170.218c2.75 5.84 5.847 11.555 9.344 17.094L17.03 440.5v51.78H64l181.875-181.874c5.516 3.515 11.212 6.668 17.03 9.438L90.44 492.28h27.03l164.75-164.75c55.182 17.85 118.21 4.884 162-38.905 41.415-41.414 54.998-99.91 41.282-152.813L380.22 241.125l-90.033-23.938-23.968-90.03L371.53 21.843c-13.213-3.41-26.772-5.125-40.342-5.125z"/>',
};
/* __ICONS_END__ */

// game-icons-path → data-URI, så CSS-pseudoelementer også kan bruge ikonerne
function icoUrl(n,farve){
  const p=ICONS[n]; if(!p) return "";
  const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="'+farve+'">'+p+'</svg>';
  return 'url("data:image/svg+xml,'+encodeURIComponent(svg)+'")';
}

const CSS = `
:root{
  --bg0:#0c1811; --bg1:#12241a; --bg2:#173021; --line:#274a35;
  --cu:#c9814a; --cu2:#e8a96a; --fos:#5fe0a0; --amber:#f0b23e;
  --rod:#ff6d5a; --guld:#ffd166; --txt:#dbe7de; --dim:#87a693;
  --mono:ui-monospace,'Cascadia Mono','JetBrains Mono',Menlo,Consolas,monospace;
  --disp:'Impact','Haettenschweiler','Arial Narrow Bold',system-ui,sans-serif;
  /* papirtekstur: lag 1 = fint korn, lag 2 = vandrette fibre (anisotropisk turbulence) */
  --paper:url("data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='180'%20height='180'%3E%3Cfilter%20id='g'%3E%3CfeTurbulence%20type='fractalNoise'%20baseFrequency='0.9'%20numOctaves='3'%20stitchTiles='stitch'/%3E%3CfeColorMatrix%20values='0%200%200%200%200.9%200%200%200%200%200.96%200%200%200%200%200.88%200%200%200%200.12%200'/%3E%3C/filter%3E%3Cfilter%20id='f'%3E%3CfeTurbulence%20type='turbulence'%20baseFrequency='0.014%200.09'%20numOctaves='2'%20seed='7'%20stitchTiles='stitch'/%3E%3CfeColorMatrix%20values='0%200%200%200%200.05%200%200%200%200%200.09%200%200%200%200%200.06%200%200%200%200.11%200'/%3E%3C/filter%3E%3Crect%20width='180'%20height='180'%20filter='url(%23g)'/%3E%3Crect%20width='180'%20height='180'%20filter='url(%23f)'/%3E%3C/svg%3E");
  /* diskret top-belysning der giver kortfladen en let hvælvet fornemmelse */
  --sheen:linear-gradient(170deg,rgba(255,255,255,.07),rgba(255,255,255,.02) 34%,rgba(0,0,0,.16) 82%);
}
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
html,body,#root{height:100%}
.app{height:100dvh;display:flex;flex-direction:column;background:
  radial-gradient(150% 110% at 50% 42%, transparent 42%, rgba(0,0,0,.5) 100%),
  radial-gradient(900px 620px at 15% 6%, rgba(63,168,120,.16) 0%, transparent 55%),
  radial-gradient(900px 620px at 88% 94%, rgba(201,129,74,.13) 0%, transparent 55%),
  radial-gradient(1400px 620px at 50% -12%, #1a3826 0%, transparent 62%),
  url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22440%22%20height%3D%22440%22%20viewBox%3D%220%200%20440%20440%22%3E%20%3Cg%20fill%3D%22none%22%20stroke%3D%22%233fa878%22%20stroke-opacity%3D%220.19%22%20stroke-width%3D%222.2%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%20%3Cpath%20d%3D%22M20%2060%20H150%20L185%2095%20V200%20H320%22%2F%3E%20%3Cpath%20d%3D%22M60%2020%20V120%20L110%20170%20H210%22%2F%3E%20%3Cpath%20d%3D%22M420%2080%20H300%20L265%20115%20V240%22%2F%3E%20%3Cpath%20d%3D%22M380%2040%20V140%20L340%20180%22%2F%3E%20%3Cpath%20d%3D%22M20%20300%20H120%20L160%20260%20V150%22%2F%3E%20%3Cpath%20d%3D%22M40%20420%20V320%20L90%20270%20H190%20L220%20300%20V400%22%2F%3E%20%3Cpath%20d%3D%22M300%20420%20V340%20L350%20290%20H420%22%2F%3E%20%3Cpath%20d%3D%22M420%20360%20H320%20L280%20400%22%2F%3E%20%3Cpath%20d%3D%22M220%20220%20H280%20L310%20250%20V330%20H240%22%2F%3E%20%3Cpath%20d%3D%22M150%20340%20H210%20L240%20370%22%2F%3E%20%3C%2Fg%3E%20%3Cg%20fill%3D%22none%22%20stroke%3D%22%23c9814a%22%20stroke-opacity%3D%220.15%22%20stroke-width%3D%222.2%22%20stroke-linecap%3D%22round%22%3E%20%3Cpath%20d%3D%22M120%20120%20H220%20L250%20150%20V210%22%2F%3E%20%3Cpath%20d%3D%22M300%20300%20H370%20L400%20270%22%2F%3E%20%3Cpath%20d%3D%22M70%20220%20H140%20L170%20190%22%2F%3E%20%3C%2Fg%3E%20%3Cg%20fill%3D%22%233fa878%22%20fill-opacity%3D%220.26%22%3E%20%3Ccircle%20cx%3D%2220%22%20cy%3D%2260%22%20r%3D%224%22%2F%3E%3Ccircle%20cx%3D%22185%22%20cy%3D%2295%22%20r%3D%224%22%2F%3E%3Ccircle%20cx%3D%22320%22%20cy%3D%22200%22%20r%3D%224%22%2F%3E%20%3Ccircle%20cx%3D%22110%22%20cy%3D%22170%22%20r%3D%224%22%2F%3E%3Ccircle%20cx%3D%22265%22%20cy%3D%22115%22%20r%3D%224%22%2F%3E%3Ccircle%20cx%3D%22160%22%20cy%3D%22260%22%20r%3D%224%22%2F%3E%20%3Ccircle%20cx%3D%22220%22%20cy%3D%22300%22%20r%3D%224%22%2F%3E%3Ccircle%20cx%3D%22310%22%20cy%3D%22250%22%20r%3D%224%22%2F%3E%3Ccircle%20cx%3D%22350%22%20cy%3D%22290%22%20r%3D%224%22%2F%3E%20%3Ccircle%20cx%3D%2290%22%20cy%3D%22270%22%20r%3D%224%22%2F%3E%3Ccircle%20cx%3D%22240%22%20cy%3D%22370%22%20r%3D%224%22%2F%3E%20%3C%2Fg%3E%20%3Cg%20fill%3D%22%23c9814a%22%20fill-opacity%3D%220.22%22%3E%20%3Ccircle%20cx%3D%22250%22%20cy%3D%22150%22%20r%3D%223.5%22%2F%3E%3Ccircle%20cx%3D%22170%22%20cy%3D%22190%22%20r%3D%223.5%22%2F%3E%3Ccircle%20cx%3D%22370%22%20cy%3D%22300%22%20r%3D%223.5%22%2F%3E%20%3C%2Fg%3E%20%3Cg%20fill%3D%22none%22%20stroke%3D%22%233fa878%22%20stroke-opacity%3D%220.22%22%20stroke-width%3D%221.8%22%3E%20%3Crect%20x%3D%22175%22%20y%3D%22200%22%20width%3D%2226%22%20height%3D%2226%22%20rx%3D%223%22%2F%3E%20%3Crect%20x%3D%22300%22%20y%3D%22330%22%20width%3D%2230%22%20height%3D%2220%22%20rx%3D%223%22%2F%3E%20%3C%2Fg%3E%20%3C%2Fsvg%3E"),
  linear-gradient(160deg, #10231a 0%, #0b1913 55%, #0d1b13 100%);
  background-size:cover,cover,cover,cover,420px 420px,cover;
  color:var(--txt);font-family:system-ui,sans-serif;overflow:hidden;user-select:none}
button{font:inherit;color:inherit;background:none;border:none;cursor:pointer}
input,select{font:inherit;color:var(--txt);background:var(--bg1);border:1px solid var(--line);border-radius:8px;padding:9px 11px;outline:none;width:100%}
input:focus,select:focus{border-color:var(--cu)}
.knap{display:block;width:100%;text-align:left;background:var(--bg1);border:1px solid var(--line);
  border-radius:12px;padding:13px 15px;margin-top:10px;font-weight:600;transition:border-color .15s}
.knap:active{border-color:var(--cu)}
.knap small{display:block;color:var(--dim);font-weight:400;margin-top:2px}
.knap.cu{background:linear-gradient(180deg,#3a2415,#2a1a0e);border-color:var(--cu);color:var(--cu2)}
.knap:disabled{opacity:.45}
.pane{flex:1;overflow-y:auto;padding:18px 16px calc(20px + env(safe-area-inset-bottom));max-width:560px;width:100%;margin:0 auto}
.logo{font-family:var(--disp);font-size:44px;letter-spacing:3px;color:var(--cu2);line-height:1;
  text-shadow:0 0 22px rgba(201,129,74,.35)}
.logo b{color:var(--fos)}
.ulinie{color:var(--dim);font-family:var(--mono);font-size:12px;margin:6px 0 18px}
.etiket{font-family:var(--mono);font-size:11px;letter-spacing:1.5px;color:var(--cu);text-transform:uppercase;margin:20px 0 6px}
.raek{display:flex;gap:8px;align-items:center}
.tilbage{color:var(--dim);font-family:var(--mono);font-size:13px;padding:6px 0;margin-bottom:6px}
/* ---- kort ---- */
.haand .mkort:not(.spil){opacity:.62;filter:saturate(.7)}
.mkort{position:relative;width:66px;height:92px;border-radius:9px;flex:none;
  background:var(--paper),var(--sheen),linear-gradient(180deg,var(--bg2),var(--bg1));
  background-blend-mode:overlay,normal,normal;border:1px solid var(--line);
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;
  padding-bottom:7px;overflow:hidden;transition:transform .12s,border-color .12s,box-shadow .12s;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.13),inset 0 -3px 6px rgba(0,0,0,.5),
    0 1px 2px rgba(0,0,0,.55),0 7px 14px rgba(0,0,0,.42)}
.mkort::after{content:"";position:absolute;left:8px;right:8px;bottom:0;height:6px;border-radius:2px 2px 0 0;
  background:repeating-linear-gradient(90deg,var(--guld) 0 4px,#3a2f12 4px 7px);opacity:.85}
.mkort.leg{border-color:var(--guld)}
.mkort.spil{border-color:var(--fos);border-width:2px;box-shadow:0 0 16px rgba(95,224,160,.6),0 6px 12px rgba(0,0,0,.5);transform:translateY(-9px) scale(1.04)}
.mkort.spil::before{content:"";position:absolute;top:-8px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:8px solid var(--fos);filter:drop-shadow(0 0 4px var(--fos));z-index:3}
.mkort .art{width:40px;height:40px}
.mkort .nv{font-size:8.5px;line-height:1.05;text-align:center;color:var(--txt);padding:0 3px;max-height:19px;overflow:hidden}
.pris{position:absolute;top:-1px;left:-1px;background:var(--amber);color:#1c1405;font-family:var(--mono);
  font-weight:700;font-size:12px;min-width:20px;height:20px;border-radius:0 0 8px 0;display:flex;align-items:center;justify-content:center}
.stat{position:absolute;bottom:2px;font-family:var(--mono);font-weight:700;font-size:12px}
.stat.a{left:5px;color:var(--amber)} .stat.h{right:5px;color:var(--fos)}
.stat.h.skadet{color:var(--rod)}
.antal{position:absolute;top:-1px;right:-1px;background:var(--cu);color:#180e05;font-family:var(--mono);
  font-size:10px;font-weight:700;padding:2px 5px;border-radius:0 0 0 8px}
/* ---- bræt ---- */
.spilflade{flex:1;display:flex;flex-direction:column;min-height:0}
.bar{display:flex;align-items:center;gap:10px;padding:7px 12px;background:rgba(9,16,11,.65);
  border-bottom:1px solid var(--line);font-family:var(--mono);font-size:13px}
.bar.min{border-bottom:none;border-top:1px solid var(--line)}
.helt{display:flex;align-items:center;gap:11px;padding:7px 16px 7px 8px;border-radius:14px;
  border:1.5px solid color-mix(in srgb, var(--kf) 45%, transparent);
  background:linear-gradient(135deg, color-mix(in srgb, var(--kf) 12%, var(--bg2)), var(--bg1));
  box-shadow:0 2px 10px rgba(0,0,0,.35), inset 0 0 18px color-mix(in srgb, var(--kf) 8%, transparent);
  transition:transform .15s, box-shadow .15s, border-color .15s}
.helt:hover{transform:translateY(-1px);box-shadow:0 4px 16px rgba(0,0,0,.45), inset 0 0 22px color-mix(in srgb, var(--kf) 14%, transparent)}
.heltikon{display:flex;align-items:center;justify-content:center;width:46px;height:46px;flex:none;
  font-size:26px;border-radius:50%;
  background:radial-gradient(circle at 38% 30%, color-mix(in srgb, var(--kf) 35%, #1a2b20), #0d1811);
  border:2px solid var(--kf);box-shadow:0 0 12px color-mix(in srgb, var(--kf) 55%, transparent), inset 0 0 8px rgba(0,0,0,.5)}
.heltinfo{display:flex;flex-direction:column;gap:1px;line-height:1.15;text-align:left}
.helt .nm{max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  color:#f2f7f3;font-size:19px;font-weight:800;letter-spacing:.02em;
  text-shadow:0 0 10px color-mix(in srgb, var(--kf) 40%, transparent)}
.heltklasse{font-size:10px;color:var(--kf);font-family:var(--mono);letter-spacing:.06em;text-transform:uppercase;opacity:.85}
.helt .hp{font-weight:800;font-size:17px;color:var(--fos)} .helt .hp.lav{color:var(--rod)}
.braet{flex:1;display:flex;align-items:center;justify-content:center;gap:7px;padding:6px 8px;min-height:74px;position:relative}
.braet.op{border-bottom:1px dashed var(--line)}
.enh{position:relative;width:58px;height:66px;border-radius:10px;
  background:var(--paper),var(--sheen),linear-gradient(180deg,var(--bg2),var(--bg1));background-blend-mode:overlay,normal,normal;
  border:1.5px solid var(--line);display:flex;align-items:center;justify-content:center;transition:border-color .12s,box-shadow .12s;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.12),inset 0 -3px 6px rgba(0,0,0,.5),
    0 1px 2px rgba(0,0,0,.5),0 6px 12px rgba(0,0,0,.45)}
.enh .art{width:40px;height:40px}
.enh.klar{border-color:var(--fos)!important;border-width:2px;box-shadow:0 0 15px rgba(95,224,160,.55)}
.enh.klar::after{content:"";position:absolute;top:-9px;right:-6px;background:var(--fos);border-radius:50%;width:20px;height:20px;box-shadow:0 0 8px rgba(95,224,160,.8);z-index:4;background-image:${icoUrl("sword","%230c1811")};background-size:13px 13px;background-position:center;background-repeat:no-repeat}
.enh.leg{border-color:var(--guld)}
.enh.sover{opacity:.72}
.enh.sover .art{opacity:.5}
.enh.sover::before{content:"z";position:absolute;top:-6px;right:2px;font-size:13px;color:var(--dim);font-style:italic;z-index:3}
.enh .zz{position:absolute;top:1px;right:4px;font-size:11px;color:var(--dim)}
.enh .ikoner{position:absolute;top:-15px;left:50%;transform:translateX(-50%);display:flex;gap:3px;
  white-space:nowrap;z-index:5}
.kwb{display:inline-flex;align-items:center;justify-content:center;line-height:0;
  border-radius:50%;border:1.5px solid;padding:2px;background:#0d1b13;
  filter:drop-shadow(0 1px 3px rgba(0,0,0,.6))}
.kwb svg{display:block}
.enh .stat{bottom:1px;font-size:13px}
.enh.sil{filter:grayscale(.8)}
.enh .skjold{position:absolute;inset:-4px;border-radius:12px;border:2.5px solid #4db4ff;opacity:.9;pointer-events:none;box-shadow:0 0 10px rgba(77,180,255,.6),inset 0 0 8px rgba(77,180,255,.3);animation:skjoldpuls 2s ease-in-out infinite}
@keyframes skjoldpuls{50%{box-shadow:0 0 16px rgba(77,180,255,.9),inset 0 0 12px rgba(77,180,255,.45)}}
.tgt{border-color:var(--rod) !important;border-width:3px !important;
  box-shadow:0 0 0 3px rgba(255,109,90,.5),0 0 22px rgba(255,109,90,.75) !important;
  animation:puls .8s infinite;z-index:6}
.tgt::after{content:"";width:19px;height:19px;background:${icoUrl("target","%23ff6d5a")} center/contain no-repeat;position:absolute;top:-13px;left:50%;transform:translateX(-50%);
  font-size:18px;filter:drop-shadow(0 0 5px rgba(255,109,90,.9));z-index:7;
  animation:tgtbob .8s ease-in-out infinite}
@keyframes tgtbob{50%{transform:translateX(-50%) translateY(-3px)}}
@keyframes puls{50%{box-shadow:0 0 0 6px rgba(255,109,90,.3),0 0 30px rgba(255,109,90,.9) !important}}
.midt{display:flex;align-items:center;gap:10px;padding:4px 12px;font-family:var(--mono);font-size:12px;color:var(--dim)}
.slutknap{margin-left:auto;background:linear-gradient(180deg,#274a35,#173021);border:1px solid var(--fos);
  color:var(--fos);border-radius:10px;padding:9px 16px;font-family:var(--mono);font-weight:700;letter-spacing:1px}
.slutknap:disabled{border-color:var(--line);color:var(--dim);background:var(--bg1)}
.pips{display:flex;gap:3px;align-items:center}
.pip{width:11px;height:15px;border-radius:3px;background:var(--bg2);border:1px solid var(--line)}
.pip.fuld{background:var(--amber);border-color:var(--amber);box-shadow:0 0 5px rgba(240,178,62,.5)}
.pip.brugt{background:#4a3a1a;border-color:#4a3a1a}
.pip.laast{background:#3a1410;border-color:var(--rod)}
.pip.gemt{background:var(--fos);border-color:var(--fos)}
.haand{display:flex;gap:7px;padding:9px 10px calc(10px + env(safe-area-inset-bottom));overflow-x:auto;
  background:rgba(9,16,11,.75);border-top:1px solid var(--line);min-height:128px}
/* ---- håndplads: kort + tastetal nedenunder ---- */
.hslot{position:relative;flex:none;display:flex;flex-direction:column;align-items:center}
.hotkey{margin-top:-9px;z-index:4;width:20px;height:20px;border-radius:50%;flex:none;
  display:flex;align-items:center;justify-content:center;
  font-family:var(--mono);font-size:11px;font-weight:700;line-height:1;
  color:#0a140e;background:var(--cu2);border:1.5px solid #0a140e;
  box-shadow:0 2px 5px rgba(0,0,0,.6);text-transform:uppercase;pointer-events:none;
  transition:background .12s,color .12s,transform .12s}
.hslot.kan .hotkey{background:var(--fos);box-shadow:0 0 9px rgba(95,224,160,.7),0 2px 5px rgba(0,0,0,.6)}
.hslot.valgt .hotkey{transform:scale(1.18);background:#fff}
.hslot:not(.kan) .hotkey{background:#4d5a51;color:#0a140e}
.kraft{width:44px;height:44px;border-radius:50%;border:1.5px solid var(--cu);background:radial-gradient(circle at 35% 30%,#3a2415,#20140a);
  font-size:19px;display:flex;align-items:center;justify-content:center;flex:none}
.kraft:disabled{opacity:.4;border-color:var(--line)}
.ryg{width:26px;height:38px;border-radius:4px;background:repeating-linear-gradient(45deg,#20140a 0 4px,#2a1a0e 4px 8px);
  border:1px solid var(--cu);margin-left:-14px}
/* ---- overlays ---- */
.slor{position:fixed;inset:0;background:rgba(5,10,7,.82);display:flex;align-items:center;justify-content:center;
  z-index:40;padding:18px;backdrop-filter:blur(2px);animation:slorind .12s ease-out}
@keyframes slorind{from{opacity:0}}
.ark{background:var(--bg1);border:1px solid var(--line);border-radius:16px;padding:18px;width:100%;max-width:360px;
  max-height:85dvh;overflow-y:auto;animation:arkind .16s cubic-bezier(.3,1.3,.5,1)}
@keyframes arkind{from{opacity:0;transform:scale(.9) translateY(10px)}}
.storkort{border:1px solid var(--line);border-radius:14px;padding:14px;
  background:var(--paper),var(--sheen),linear-gradient(180deg,var(--bg2),var(--bg1));background-blend-mode:overlay,normal,normal;
  position:relative;overflow:hidden;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.1),inset 0 -4px 8px rgba(0,0,0,.42),0 10px 26px rgba(0,0,0,.5)}
.storkort.leg{border-color:var(--guld)}
.storkort::after{content:"";position:absolute;left:14px;right:14px;bottom:0;height:8px;border-radius:3px 3px 0 0;
  background:repeating-linear-gradient(90deg,var(--guld) 0 6px,#3a2f12 6px 10px);opacity:.85}
.storkort .top{display:flex;gap:10px;align-items:center}
.storkort .art.storart{width:82px;height:82px;flex:none}
.storkort h3{font-family:var(--disp);letter-spacing:1px;font-size:20px;color:var(--cu2)}
.storkort .meta{font-family:var(--mono);font-size:11px;color:var(--dim);margin-top:2px}
.storkort .txt{margin:12px 0 14px;font-size:14px;line-height:1.45;color:var(--txt)}
.storkort .statraek{display:flex;gap:14px;font-family:var(--mono);font-weight:700}
.banner{position:fixed;top:0;left:0;right:0;z-index:35;background:#2a1a0e;border-bottom:1px solid var(--cu);
  color:var(--cu2);font-family:var(--mono);font-size:13px;padding:10px 14px;text-align:center}
.toast{position:fixed;bottom:130px;left:50%;transform:translateX(-50%);z-index:50;background:#0a140e;
  border:1px solid var(--cu);border-radius:12px;padding:9px 14px;font-family:var(--mono);font-size:13px;
  max-width:90%;text-align:center;animation:ind .2s}
@keyframes ind{from{opacity:0;transform:translateX(-50%) translateY(8px)}}
.optoast{position:fixed;top:64px;left:50%;transform:translateX(-50%);z-index:38;display:flex;gap:10px;align-items:center;
  background:#0a140e;border:1px solid var(--line);border-radius:14px;padding:8px 12px;animation:ind .2s}
.logpanel{position:fixed;left:8px;bottom:142px;z-index:36;width:min(320px,86vw);max-height:44dvh;overflow-y:auto;
  background:rgba(8,14,10,.96);border:1px solid var(--line);border-radius:12px;padding:0;
  font-family:var(--mono);font-size:11.5px;line-height:1.5;color:var(--dim)}
.logpanel .lhoved{position:sticky;top:0;display:flex;align-items:center;justify-content:space-between;
  background:rgba(8,14,10,.98);border-bottom:1px solid var(--line);padding:8px 10px;font-weight:700;color:var(--cu2)}
.logpanel .lluk{font-size:16px;line-height:1;padding:2px 6px;color:var(--dim)}
.logpanel .lkrop{padding:8px 10px}
.logknap{position:fixed;left:10px;bottom:calc(138px + env(safe-area-inset-bottom));z-index:36;width:38px;height:38px;border-radius:50%;
  background:var(--bg1);border:1px solid var(--line);font-size:16px}
/* ---- historik-skinne (spillede kort) ---- */
.histknap{position:fixed;left:10px;bottom:calc(184px + env(safe-area-inset-bottom));z-index:36;width:38px;height:38px;border-radius:50%;
  background:var(--bg1);border:1px solid var(--line);font-size:15px}
.histknap.aktiv{border-color:var(--fos);color:var(--fos)}
/* rækken der holder skinne + brætter */
.spilmidt{flex:1;display:flex;min-height:0;position:relative}
.braetwrap{flex:1;display:flex;flex-direction:column;min-height:0;min-width:0}
.histrail{flex:none;align-self:stretch;width:62px;margin:6px 0 6px 6px;
  display:flex;flex-direction:column;align-items:center;gap:6px;
  overflow-y:auto;overflow-x:hidden;scrollbar-width:none;
  padding:6px 4px;border-radius:12px;background:rgba(8,14,10,.72);border:1px solid var(--line);
  box-shadow:inset 0 2px 6px rgba(0,0,0,.5),inset 0 -1px 0 rgba(255,255,255,.04)}
/* på smalle skærme overlejrer skinnen brættet i stedet for at klemme det */
@media (max-width:819px){
  .histrail{position:absolute;left:4px;top:4px;bottom:4px;z-index:20;margin:0;
    background:rgba(8,14,10,.93)}
}
.histrail::-webkit-scrollbar{display:none}
.histrail .htop{position:sticky;top:-6px;z-index:2;width:100%;padding:2px 0 4px;text-align:center;
  background:rgba(8,14,10,.95);font-family:var(--mono);font-size:8.5px;letter-spacing:1px;color:var(--dim)}
.histrail .htom{font-family:var(--mono);font-size:9px;color:var(--dim);text-align:center;padding:10px 2px;line-height:1.4}
.hkort{position:relative;flex:none;width:50px;height:52px;border-radius:7px;cursor:pointer;
  display:flex;align-items:center;justify-content:center;
  background:var(--paper),var(--sheen),linear-gradient(180deg,var(--ct),var(--cb));
  background-blend-mode:overlay,normal,normal;
  border:1px solid color-mix(in srgb,var(--ce) 45%,transparent);
  border-left:3px solid var(--dim);overflow:hidden;transition:transform .12s,box-shadow .12s;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.1),0 2px 5px rgba(0,0,0,.5);
  animation:histind .28s cubic-bezier(.3,1.3,.5,1)}
@keyframes histind{from{opacity:0;transform:translateX(14px) scale(.85)}}
.hkort.mig{border-left-color:var(--fos)}
.hkort.dem{border-left-color:var(--rod)}
.hkort:hover,.hkort.aaben{transform:scale(1.08);box-shadow:0 0 0 1px var(--cu2),0 4px 12px rgba(0,0,0,.6);z-index:2}
.hkort .art{width:34px;height:34px}
.hkort .hpris{position:absolute;top:-1px;right:-1px;min-width:14px;height:14px;padding:0 2px;border-radius:0 6px 0 6px;
  background:var(--amber);color:#1c1405;font-family:var(--mono);font-size:9px;font-weight:700;
  display:flex;align-items:center;justify-content:center}
.hkort .hdoed{position:absolute;bottom:1px;right:2px;font-size:9px;line-height:1;color:var(--rod);text-shadow:0 0 3px #000}
.hkort .hhit{position:absolute;bottom:1px;left:2px;font-family:var(--mono);font-size:9px;font-weight:700;
  line-height:1;color:var(--rod);text-shadow:0 0 3px #000}
.histtip{position:fixed;z-index:70;width:214px;pointer-events:none;
  background:linear-gradient(180deg,#14251b,#0b160f);border:1.5px solid var(--ce,#5fe0a0);border-radius:10px;
  padding:8px 10px;box-shadow:0 10px 26px rgba(0,0,0,.65);animation:ind .12s}
.histtip .hth{display:flex;align-items:baseline;gap:6px}
.histtip .hth b{font-family:var(--disp);letter-spacing:.5px;font-size:14px;color:var(--cu2)}
.histtip .hth span{margin-left:auto;font-family:var(--mono);font-size:11px;color:var(--amber)}
.histtip .htmeta{font-family:var(--mono);font-size:10px;color:var(--dim);margin-bottom:6px}
.histtip .htchips{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px}
.histtip .chip{font-family:var(--mono);font-size:9.5px;padding:2px 5px;border-radius:5px;
  border:1px solid var(--line);background:rgba(0,0,0,.3);color:#c3d6c9}
.histtip .chip.skade{border-color:var(--rod);color:#ffb0a4}
.histtip .chip.heal{border-color:var(--fos);color:var(--fos)}
.histtip .chip.doed{border-color:var(--rod);background:rgba(120,20,20,.35);color:#ffd2cb}
.histtip .chip.doed.selv{border-color:var(--dim);background:rgba(0,0,0,.3);color:#9fb3a6}
.histtip .htlinjer{font-family:var(--mono);font-size:10px;line-height:1.45;color:#a8bdb0;
  border-top:1px solid var(--line);padding-top:5px}
.histtip .htintet{font-family:var(--mono);font-size:10px;color:var(--dim)}
@media (min-width:820px){
  .histrail{width:74px;margin:8px 0 8px 8px}
  .hkort{width:60px;height:62px}.hkort .art{width:42px;height:42px}
  .histknap{bottom:250px}
}
.turban{position:fixed;top:38%;left:0;right:0;z-index:30;text-align:center;font-family:var(--disp);
  font-size:38px;letter-spacing:4px;color:var(--fos);text-shadow:0 0 24px rgba(95,224,160,.6);
  animation:tur calc(1.6s * var(--tempo,1)) forwards;pointer-events:none}
@keyframes tur{0%{opacity:0;transform:scale(.8)}10%{opacity:1;transform:scale(1)}14%{opacity:.35}18%{opacity:1}22%{opacity:.5}26%{opacity:1;text-shadow:0 0 34px rgba(95,224,160,.9)}78%{opacity:1}100%{opacity:0}}
/* ---- deckbygger ---- */
.faner{display:flex;gap:8px;margin:10px 0}
.fane{flex:1;text-align:center;padding:9px;border-radius:10px;border:1px solid var(--line);background:var(--bg1);
  font-family:var(--mono);font-size:12.5px}
.fane.aktiv{border-color:var(--cu);color:var(--cu2)}
.gitter{display:grid;grid-template-columns:repeat(auto-fill,minmax(70px,1fr));gap:10px;justify-items:center;padding-bottom:14px}
/* ---- kortbibliotek ---- */
.pane.bred{max-width:1080px}
.hint{font-family:var(--mono);font-size:11px;color:var(--dim);margin:6px 0 10px}
.kostgruppe{margin-bottom:6px}
.kosthd{display:flex;align-items:center;gap:6px;margin:14px 0 8px;color:var(--amber);
  font-family:var(--mono);font-size:12px}
.kosthd::after{content:"";flex:1;height:1px;background:linear-gradient(90deg,var(--line),transparent)}
.kosthd .kostpip{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;
  border-radius:50%;background:var(--bg2);border:1px solid var(--line);font-weight:700;font-size:11px;color:var(--amber)}
.kosthd i{font-style:normal;color:var(--dim);font-size:10.5px;order:3}
.bibkort.ideck .mkort{border-color:var(--fos);box-shadow:inset 0 1px 0 rgba(255,255,255,.13),
  0 0 0 1px var(--fos),0 0 12px rgba(95,224,160,.35),0 7px 14px rgba(0,0,0,.42)}
.bibkort .idmark{position:absolute;top:-5px;left:-5px;z-index:3;min-width:19px;height:19px;padding:0 4px;
  border-radius:10px;background:var(--fos);color:#0a140e;font-family:var(--mono);font-size:11px;font-weight:700;
  display:flex;align-items:center;justify-content:center;box-shadow:0 2px 5px rgba(0,0,0,.6);pointer-events:none}
.fknap.ryd{border-color:var(--cu);color:var(--cu2)}
.hovpop{position:fixed;z-index:80;pointer-events:none;animation:ind .09s ease-out}
.hovinfo{width:232px;border-radius:12px;padding:11px 13px;text-align:left;
  background:linear-gradient(180deg,#14251b,#0b160f);border:1.5px solid var(--ce,#5fe0a0);
  box-shadow:0 14px 36px rgba(0,0,0,.7);font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
.hi-h{display:flex;align-items:baseline;gap:7px;margin-bottom:3px}
.hi-c{font-family:var(--mono);font-weight:700;color:var(--amber);font-size:13px}
.hi-n{font-weight:700;color:#eaf6ee;font-size:15px;line-height:1.15}
.hi-t{font-family:var(--mono);font-size:10px;color:var(--dim);margin-bottom:6px}
.hi-s{font-family:var(--mono);font-size:14px;color:#eaf6ee;margin-bottom:6px;display:flex;align-items:center}
.hi-x{font-size:12.5px;color:#cfe6d6;line-height:1.45;margin-bottom:2px}
.hi-kw{display:flex;flex-direction:column;gap:6px;margin-top:8px;border-top:1px solid var(--line);padding-top:8px}
.hi-kwrow{display:flex;align-items:flex-start;gap:8px}
.hi-kwrow .kwb{flex:none;margin-top:1px}
.hi-kwtxt{display:flex;flex-direction:column;gap:1px}
.hi-kwtxt b{font-size:11.5px;color:var(--fos)}
.hi-kwtxt span{font-size:10.5px;color:#c3d6c9;line-height:1.35}
/* ---- Meltdown Run ---- */
.knap.rogueknap{background:linear-gradient(135deg,#3a1410,#1a0d0a);border-color:var(--rod);color:#ffd7cf}
.knap.rogueknap:hover{border-color:var(--guld);box-shadow:0 0 16px rgba(255,109,90,.4)}
.knap.rogueknap .ico{color:var(--rod)}
.knap.big{padding:14px;font-size:16px;margin-top:16px}
.runpane{max-width:940px}
.rhud{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:12px 0 6px;
  font-family:var(--mono);font-size:13px}
.rhud>span{display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:9px;
  background:var(--bg1);border:1px solid var(--line)}
.rhud .rhp{color:var(--fos)} .rhud .rhp.lav{color:var(--rod);border-color:var(--rod)}
.rhud .rupg{gap:7px;color:var(--cu2)}
.rmap{display:flex;align-items:center;overflow-x:auto;gap:0;padding:14px 4px;margin:6px 0 18px;
  scrollbar-width:thin;scrollbar-color:var(--line) transparent}
.rnode{position:relative;display:flex;flex-direction:column;align-items:center;gap:5px;flex:none;
  min-width:74px;opacity:.5;transition:opacity .2s}
.rnode.nu{opacity:1} .rnode.klaret{opacity:.75}
.rn-ico{width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;
  background:var(--bg2);border:2px solid var(--line);font-size:16px;z-index:2}
.rnode.klaret .rn-ico{border-color:var(--fos);color:var(--fos)}
.rnode.nu .rn-ico{border-color:var(--amber);color:var(--amber);box-shadow:0 0 14px rgba(240,178,62,.55);animation:nupuls 1.6s ease-in-out infinite}
.rnode.elite .rn-ico{border-style:double;border-width:3px}
.rnode.boss.nu .rn-ico,.rnode.boss .rn-ico{border-color:var(--rod);color:var(--rod)}
.rnode.boss.nu .rn-ico{box-shadow:0 0 16px rgba(255,109,90,.7)}
@keyframes nupuls{50%{transform:scale(1.1)}}
.rn-lbl{font-family:var(--mono);font-size:9px;color:var(--dim);text-align:center;white-space:nowrap}
.rnode.nu .rn-lbl{color:var(--amber)} .rnode.boss .rn-lbl{color:var(--rod)}
.rn-line{position:absolute;top:19px;left:calc(50% + 19px);width:calc(100% - 38px);height:2px;
  background:var(--line);z-index:1}
.rnode.klaret .rn-line{background:var(--fos)}
.rnbanner{display:flex;align-items:center;gap:12px;padding:14px;border-radius:12px;margin:6px 0;
  background:var(--bg1);border:1px solid var(--line);border-left:4px solid var(--cu)}
.rnbanner.elite{border-left-color:var(--amber)} .rnbanner.boss{border-left-color:var(--rod);background:linear-gradient(135deg,#2a1210,#12160f)}
.rnbanner.repair{border-left-color:var(--fos)}
.rnbanner b{display:block;font-family:var(--disp);letter-spacing:.5px;font-size:17px}
.rnbanner small{display:block;color:var(--dim);font-size:12px;margin-top:2px;font-family:var(--mono)}
.rnbanner .ico{color:var(--cu2)} .rnbanner.boss .ico{color:var(--rod)}
.rvhead{display:flex;flex-direction:column;align-items:center;gap:6px;margin:18px 0 6px;text-align:center}
.rvhead .ico{color:var(--guld)} .rvhead.tabt{margin:24px 0}
.rvhead h2{font-family:var(--disp);letter-spacing:1px;font-size:28px;margin:0}
.rvhead.sejr h2{color:var(--guld)}
.rrewards{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin:14px 0;justify-items:center}
.rcard{background:none;border:2px solid transparent;border-radius:16px;padding:0;cursor:pointer;
  transition:transform .12s,border-color .12s;border-radius:16px}
.rcard:hover{transform:translateY(-4px)}
.rcard.valgt{border-color:var(--fos);box-shadow:0 0 20px rgba(95,224,160,.4)}
.rupgrades{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin:14px 0}
.ucard{display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;padding:18px 14px;
  border-radius:14px;background:var(--bg1);border:2px solid var(--line);cursor:pointer;
  transition:transform .12s,border-color .12s}
.ucard:hover{transform:translateY(-3px);border-color:var(--cu)}
.ucard.valgt{border-color:var(--fos);box-shadow:0 0 18px rgba(95,224,160,.35)}
.ucard .u-ico{color:var(--cu2)} .ucard b{font-family:var(--disp);letter-spacing:.5px;font-size:16px}
.ucard span{color:var(--dim);font-size:12.5px;font-family:var(--mono);line-height:1.4}
.rclspick{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin:20px 0}
.rcls-card{display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;padding:20px 16px;
  border-radius:16px;background:var(--bg1);border:2px solid var(--line);cursor:pointer;transition:transform .12s,box-shadow .12s}
.rcls-card:hover{transform:translateY(-4px);box-shadow:0 8px 24px rgba(0,0,0,.5)}
.rcls-card b{font-family:var(--disp);letter-spacing:1px;font-size:22px}
.rcls-pow{display:inline-flex;align-items:center;gap:5px;font-family:var(--mono);font-size:12px;color:var(--cu2)}
.rcls-card small{color:var(--dim);font-size:12px;font-family:var(--mono);line-height:1.4}
.u-ico{display:inline-flex}
.filterraek{display:flex;gap:5px;flex-wrap:wrap;margin:8px 0}
.fknap{padding:5px 9px;border-radius:8px;border:1px solid var(--line);background:var(--bg1);font-family:var(--mono);font-size:11.5px;color:var(--dim)}
.fknap.aktiv{border-color:var(--amber);color:var(--amber)}
.dlinje{display:flex;align-items:center;gap:8px;padding:7px 10px;border:1px solid var(--line);border-radius:9px;
  margin-top:6px;background:var(--bg1);font-size:13px}
.dlinje .c{font-family:var(--mono);color:var(--amber);font-weight:700;width:20px}
.dlinje .x{margin-left:auto;color:var(--rod);font-family:var(--mono);padding:2px 8px}
.kurve{display:flex;align-items:flex-end;gap:4px;height:52px;margin:12px 2px 4px}
.soejle{flex:1;background:var(--cu);border-radius:3px 3px 0 0;min-height:2px;position:relative}
.soejle i{position:absolute;top:-15px;left:0;right:0;text-align:center;font-size:9px;font-style:normal;color:var(--dim);font-family:var(--mono)}
.soejle b{position:absolute;bottom:-15px;left:0;right:0;text-align:center;font-size:9px;color:var(--dim);font-family:var(--mono)}
.kwtab{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px}
.kwtab td{border-top:1px solid var(--line);padding:7px 6px;vertical-align:top}
.kwtab td:first-child{font-family:var(--mono);color:var(--cu2);white-space:nowrap}
.kodevis{font-family:var(--disp);font-size:52px;letter-spacing:10px;color:var(--fos);text-align:center;margin:14px 0;
  text-shadow:0 0 22px rgba(95,224,160,.5)}
h2.ov{font-family:var(--disp);letter-spacing:2px;font-size:22px;color:var(--cu2);margin:18px 0 6px}
p.rt{font-size:14px;line-height:1.55;color:var(--txt);margin:6px 0}
.centrer{display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;text-align:center;padding:20px}
.clsdot{position:absolute;top:23px;right:4px;width:8px;height:8px;border-radius:50%;box-shadow:0 0 6px currentColor}
.kvalg{display:flex;gap:8px}
.kknap{flex:1;text-align:center;padding:9px 4px;border-radius:12px;border:1px solid var(--line);
  background:var(--bg1);font-family:var(--mono);font-size:11.5px;color:var(--dim);line-height:1.5}
.kinfo{font-size:12.5px;color:var(--dim);margin-top:7px;font-family:var(--mono)}
.mkort.tema{background:var(--paper),var(--sheen),linear-gradient(180deg,var(--ct),var(--cb));
  background-blend-mode:overlay,normal,normal;border-color:color-mix(in srgb,var(--ce) 55%,transparent)}
.mkort.tema::after{background:var(--ce)}
.enh.tema{background:var(--paper),var(--sheen),linear-gradient(180deg,var(--ct),var(--cb));
  background-blend-mode:overlay,normal,normal;border-color:color-mix(in srgb,var(--ce) 55%,transparent)}
.storkort.tema{background:var(--paper),var(--sheen),linear-gradient(180deg,var(--ct),var(--cb));
  background-blend-mode:overlay,normal,normal;border-color:color-mix(in srgb,var(--ce) 60%,transparent)}
.storkort.tema .top{background:color-mix(in srgb,var(--ct) 60%,#0c1811);border-color:color-mix(in srgb,var(--ce) 40%,transparent)}
.storkort.tema.leg{border-color:var(--guld)}
/* ---- dybde & liv ---- */
.ark{box-shadow:0 18px 50px rgba(0,0,0,.6)}
.knap{transition:transform .12s,border-color .15s,box-shadow .15s}
.knap:hover{border-color:var(--cu);box-shadow:0 4px 14px rgba(0,0,0,.35)}
button:active{transform:scale(.97)}
.mkort.spil{animation:spilpuls 1.6s ease-in-out infinite}
@keyframes spilpuls{0%,100%{box-shadow:0 0 16px rgba(95,224,160,.55),0 6px 12px rgba(0,0,0,.5)}50%{box-shadow:0 0 26px rgba(95,224,160,.9),0 6px 12px rgba(0,0,0,.5)}}
.enh.klar{animation:klarpuls 2s ease-in-out infinite}
@keyframes klarpuls{0%,100%{box-shadow:0 0 15px rgba(95,224,160,.5)}50%{box-shadow:0 0 24px rgba(95,224,160,.85)}}
.enh{animation:enhind calc(.38s * var(--tempo,1)) cubic-bezier(.2,1.5,.4,1)}
@keyframes enhind{from{transform:scale(.3);opacity:0;filter:brightness(2.2)}}
.ryst{animation:ryst calc(.32s * var(--tempo,1)) ease-in-out !important}
@keyframes ryst{20%{transform:translateX(-4px)}40%{transform:translateX(4px)}60%{transform:translateX(-3px)}80%{transform:translateX(2px)}}
/* ---- FX-lag ---- */
.fxlag{position:fixed;inset:0;pointer-events:none;z-index:60;overflow:hidden}
.fxtal{position:fixed;transform:translate(-50%,-50%);font-family:var(--mono);font-weight:700;font-size:30px;
  text-shadow:0 0 12px currentColor;animation:fxtal calc(.95s * var(--tempo,1)) ease-out forwards;opacity:0}
@keyframes fxtal{0%{opacity:0;transform:translate(-50%,-28%) scale(.6)}14%{opacity:1;transform:translate(-50%,-50%) scale(1.18)}
  100%{opacity:0;transform:translate(-50%,-170%) scale(1)}}
.fxburst{position:fixed}
.fxburst i{position:absolute;width:7px;height:7px;border-radius:2px;background:currentColor;
  box-shadow:0 0 9px currentColor;animation:gnist calc(.65s * var(--tempo,1)) ease-out forwards}
@keyframes gnist{to{transform:translate(var(--dx),var(--dy)) rotate(220deg) scale(.15);opacity:0}}
.fxring{position:fixed;width:26px;height:26px;margin:-13px 0 0 -13px;border:3px solid;border-radius:50%;
  animation:fxring calc(.6s * var(--tempo,1)) ease-out forwards;box-shadow:0 0 12px currentColor}
@keyframes fxring{to{transform:scale(3.6);opacity:0}}
.fxzap{position:fixed;left:0;top:0;width:100%;height:100%;animation:zapfl calc(.32s * var(--tempo,1)) ease-out forwards;
  filter:drop-shadow(0 0 7px rgba(240,178,62,.9))}
.fxzap.spell{filter:drop-shadow(0 0 7px rgba(95,224,160,.9))}
@keyframes zapfl{0%{opacity:1}45%{opacity:.3}60%{opacity:1}100%{opacity:0}}
.fxflyv{position:fixed;font-size:42px;transform:translate(-50%,-50%);z-index:61;
  text-shadow:0 0 16px rgba(95,224,160,.9);animation:flyv calc(.55s * var(--tempo,1)) cubic-bezier(.3,.1,.55,1) forwards}
@keyframes flyv{55%{opacity:1}100%{transform:translate(calc(-50% + var(--tx)),calc(-50% + var(--ty))) scale(.35);opacity:0}}
.ico{display:inline-flex;align-items:center;justify-content:center;vertical-align:-0.14em;line-height:0}
.ico svg{display:block}
.lnk{color:var(--cu2);text-decoration:underline;text-underline-offset:2px}
.lnk:hover{color:var(--guld)}
.dart{width:1.35em;height:1.35em;vertical-align:-0.42em;display:inline-block}
.art{display:block;pointer-events:none}
.art.dimart{opacity:.45}
/* glans-sweep + legendarisk shimmer */
.mkort::before{content:"";position:absolute;inset:0;pointer-events:none;
  background:linear-gradient(115deg,transparent 32%,rgba(255,224,150,.26) 50%,transparent 68%);
  transform:translateX(-135%)}
.mkort.leg::before{animation:skin 4.4s ease-in-out infinite}
.mkort.leg{animation:legpuls 3.2s ease-in-out infinite}
@keyframes skin{14%{transform:translateX(135%)}100%{transform:translateX(135%)}}
@keyframes legpuls{50%{box-shadow:0 0 16px rgba(255,209,102,.5),0 4px 10px rgba(0,0,0,.45)}}
.enh.leg{animation:legpuls 3.2s ease-in-out infinite}
@media (hover:hover){ .mkort:hover::before{animation:skin .75s ease-out 1} }
.pip.gemt{animation:gemtpuls 1.9s ease-in-out infinite}
@keyframes gemtpuls{50%{box-shadow:0 0 8px rgba(95,224,160,.8)}}
.fxflyv{width:64px;height:78px;border-radius:10px;background:linear-gradient(180deg,var(--bg2),var(--bg1));
  border:1.5px solid var(--fos);box-shadow:0 0 18px rgba(95,224,160,.55);
  display:flex;align-items:center;justify-content:center;font-size:0}
.fxflyv .art{width:44px;height:44px}
.fxflyv.kurve{left:0;top:0;transform:none;offset-rotate:0deg;offset-anchor:50% 50%;
  animation:flyvk calc(.62s * var(--tempo,1)) cubic-bezier(.32,.08,.55,1) forwards}
@keyframes flyvk{0%{offset-distance:0%;opacity:0}10%{opacity:1}
  100%{offset-distance:100%;opacity:0;transform:scale(.42)}}
.mkort.hastip:hover{overflow:visible;z-index:70}
.haand:hover{overflow:visible}
.enh.hastip:hover{overflow:visible;z-index:70}
.braet{overflow:visible}
/* modstanderens (øverste) enheder: tooltip nedad så den ikke ryger ud over toppen */
.braet.op .enh .ctipwrap{bottom:auto;top:calc(100% + 10px);transform:translateX(-50%) translateY(-6px)}
.braet.op .enh:hover .ctipwrap{transform:translateX(-50%) translateY(0)}
.braet.op .enh .ctip::after{top:auto;bottom:100%;border-top-color:transparent;border-bottom-color:var(--ce,#5fe0a0)}
/* ---- træk-og-slip ---- */
.haand .mkort{touch-action:none}
.braet .enh{touch-action:none}
.dragkort{position:fixed;z-index:75;pointer-events:none;transform:translate(-50%,-50%) rotate(-4deg) scale(1.15);
  filter:drop-shadow(0 12px 24px rgba(0,0,0,.6));opacity:.97;
  transition:transform .12s cubic-bezier(.3,1.3,.5,1),filter .12s;animation:dragpop .16s ease-out}
@keyframes dragpop{0%{transform:translate(-50%,-50%) rotate(0) scale(.85);opacity:.5}100%{transform:translate(-50%,-50%) rotate(-4deg) scale(1.15);opacity:.97}}
.dragkort.over{transform:translate(-50%,-50%) rotate(0deg) scale(1.28);
  filter:drop-shadow(0 0 22px rgba(95,224,160,.9)) drop-shadow(0 12px 24px rgba(0,0,0,.6))}
.braet.dropzone{outline:2.5px dashed var(--fos);outline-offset:4px;border-radius:12px;
  background:rgba(95,224,160,.08);animation:dropz 1s ease-in-out infinite}
@keyframes dropz{50%{background:rgba(95,224,160,.16);outline-color:#8effc0}}
.dragatk{position:fixed;z-index:76;pointer-events:none;transform:translate(-50%,-50%) scale(1.4);
  font-size:32px;filter:drop-shadow(0 0 8px rgba(255,109,90,.8));color:#ff6d5a}
.dragatk.hit{transform:translate(-50%,-50%) scale(1.9);filter:drop-shadow(0 0 16px rgba(255,109,90,1))}
.enh.dragtgt,.helt.dragtgt{outline:3px solid var(--rod);outline-offset:3px;
  box-shadow:0 0 22px rgba(255,109,90,.7);animation:dragtgtpuls .7s ease-in-out infinite;z-index:6}
@keyframes dragtgtpuls{50%{outline-color:#ff9a8c;box-shadow:0 0 32px rgba(255,109,90,1)}}
/* ---- knækket neonskilt (nederlag) ---- */
.neonwrap{transform:rotate(-1.8deg);display:inline-block}
.neon{position:relative;display:inline-flex;color:#ff5a4d;
  font-family:var(--mono);letter-spacing:3px}
.neon .nl{display:inline-block;
  text-shadow:0 0 6px #ff5a4d,0 0 14px #ff2d1d,0 0 26px rgba(255,45,29,.6)}
/* fire flimre-varianter — forskellig rytme så bogstaverne blinker i utakt */
.neon .f1{animation:flick1 infinite steps(1)}
.neon .f2{animation:flick2 infinite steps(1)}
.neon .f3{animation:flick3 infinite steps(1)}
.neon .f4{animation:flick4 infinite steps(1)}
@keyframes flick1{0%,100%{opacity:1}43%{opacity:1}44%{opacity:.25}46%{opacity:1}72%{opacity:1}73%{opacity:.3}75%{opacity:1}}
@keyframes flick2{0%,100%{opacity:1}12%{opacity:.3}14%{opacity:1}60%{opacity:1}61%{opacity:.2}64%{opacity:1}65%{opacity:.5}67%{opacity:1}}
@keyframes flick3{0%,100%{opacity:1}30%{opacity:1}31%{opacity:.15}33%{opacity:1}34%{opacity:.4}36%{opacity:1}88%{opacity:1}89%{opacity:.3}91%{opacity:1}}
@keyframes flick4{0%,100%{opacity:1}20%{opacity:.6}21%{opacity:1}50%{opacity:1}51%{opacity:.1}55%{opacity:1}}
/* dødt bogstav: mest slukket, glimter kun kort og sjældent */
.neon .dead{color:#5a2420;text-shadow:none;animation:flickdead 2.7s infinite steps(1)}
@keyframes flickdead{0%,100%{opacity:.32}90%{opacity:.32}91%{opacity:1;text-shadow:0 0 8px #ff5a4d,0 0 18px #ff2d1d}93%{opacity:.32;text-shadow:none}96%{opacity:.7}97%{opacity:.32}}
/* gnister der siver fra skiltet */
.neonspark{position:absolute;width:3px;height:3px;border-radius:50%;background:#ffb347;
  box-shadow:0 0 6px #ffb347;opacity:0}
.neonspark.s1{left:18%;top:12%;animation:nspark 3.3s infinite ease-in}
.neonspark.s2{right:24%;top:70%;animation:nspark 4.1s .8s infinite ease-in}
@keyframes nspark{0%,72%{opacity:0;transform:translate(0,0) scale(1)}73%{opacity:1}100%{opacity:0;transform:translate(var(--sx,-8px),22px) scale(.3)}}
@media (prefers-reduced-motion:reduce){
  .neon .nl,.neon .dead{animation:none;opacity:1}
  .neon .dead{opacity:.4}
  .neonspark{display:none}
}
.kwlegend{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}
.kwleg{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--txt);
  background:#0d1b13;border:1px solid var(--line);border-radius:8px;padding:3px 8px 3px 6px}
.kwleg span{white-space:nowrap}
.slutknap{position:relative}
.slutknap.haster{border-color:var(--rod);box-shadow:0 0 14px rgba(255,90,77,.5);animation:hasterpuls .5s ease-in-out infinite}
@keyframes hasterpuls{50%{box-shadow:0 0 22px rgba(255,90,77,.85)}}
.nedtael{position:absolute;right:-46px;top:50%;transform:translateY(-50%);
  font-family:var(--mono);font-weight:700;font-size:30px;color:var(--rod);
  text-shadow:0 0 12px rgba(255,90,77,.8);min-width:34px;text-align:center;
  animation:nedtaeltik 1s steps(1) infinite;pointer-events:none}
@keyframes nedtaeltik{0%{transform:translateY(-50%) scale(1.25);opacity:1}30%{transform:translateY(-50%) scale(1);opacity:.85}100%{transform:translateY(-50%) scale(1);opacity:.85}}
/* ---- chat ---- */
.chatbox{position:fixed;right:14px;bottom:14px;z-index:45;display:flex;flex-direction:column;align-items:flex-end;gap:8px}
.chatknap{width:52px;height:52px;border-radius:50%;border:1.5px solid var(--fos);
  background:radial-gradient(circle at 38% 30%,#1c3a28,#0d1811);color:#fff;font-size:22px;cursor:pointer;position:relative;
  box-shadow:0 3px 12px rgba(0,0,0,.5),0 0 14px rgba(95,224,160,.3);transition:transform .15s,box-shadow .15s}
.chatknap:hover{transform:translateY(-2px) scale(1.05);box-shadow:0 5px 18px rgba(0,0,0,.6),0 0 20px rgba(95,224,160,.5)}
.chatbadge{position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;border-radius:10px;background:var(--rod);
  color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;padding:0 5px;
  box-shadow:0 0 8px rgba(255,90,77,.7);animation:chatpop .3s cubic-bezier(.3,1.5,.5,1)}
@keyframes chatpop{from{transform:scale(0)}}
.chatpanel{width:300px;max-width:80vw;height:360px;max-height:56vh;display:flex;flex-direction:column;
  background:linear-gradient(180deg,var(--bg1),var(--bg0));border:1.5px solid var(--line);border-radius:14px;overflow:hidden;
  box-shadow:0 12px 40px rgba(0,0,0,.6);animation:chatind .22s cubic-bezier(.3,1.2,.5,1)}
@keyframes chatind{from{transform:translateY(20px) scale(.94);opacity:0}}
.chathead{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;
  border-bottom:1px solid var(--line);font-family:var(--mono);font-size:14px;color:var(--fos);
  background:rgba(95,224,160,.06)}
.chatx{background:none;border:none;color:var(--dim);font-size:16px;cursor:pointer;padding:2px 6px;border-radius:6px}
.chatx:hover{color:#fff;background:rgba(255,255,255,.08)}
.chatlist{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px}
.chattom{color:var(--dim);font-size:13px;text-align:center;margin:auto;font-style:italic}
.chatmsg{display:flex;flex-direction:column;gap:2px;max-width:82%;align-self:flex-start;
  animation:msgind .25s cubic-bezier(.3,1.1,.5,1)}
@keyframes msgind{from{transform:translateY(8px);opacity:0}}
.chatmsg.mig{align-self:flex-end;align-items:flex-end}
.chatn{font-size:10px;color:var(--dim);font-family:var(--mono);padding:0 4px}
.chatt{font-size:14px;color:var(--txt);background:var(--bg2);padding:7px 11px;border-radius:12px;
  border:1px solid var(--line);word-break:break-word;line-height:1.35}
.chatmsg.mig .chatt{background:color-mix(in srgb,var(--fos) 18%,var(--bg2));border-color:color-mix(in srgb,var(--fos) 40%,var(--line))}
.chatind{display:flex;gap:7px;padding:10px;border-top:1px solid var(--line)}
.chatind input{flex:1;background:var(--bg0);border:1px solid var(--line);border-radius:9px;color:var(--txt);
  padding:9px 12px;font-size:14px;font-family:inherit;outline:none}
.chatind input:focus{border-color:var(--fos)}
.chatsend{width:40px;border:none;border-radius:9px;background:var(--fos);color:#062012;font-size:16px;cursor:pointer;
  transition:transform .12s,filter .12s}
.chatsend:hover{transform:scale(1.06);filter:brightness(1.1)}
@media (max-width:560px){ .chatbox{bottom:78px} }
/* håndkort toner ind når de trækkes (rører ikke transform, så viften bevares) */
.haand .mkort{animation:handind calc(.4s * var(--tempo,1)) ease-out backwards}
@keyframes handind{from{opacity:0;filter:brightness(2.2) blur(2px)}60%{opacity:1}}
/* ---- spillet kort vises midtfor før effekten ---- */
.revealwrap{position:fixed;inset:0;z-index:62;display:flex;align-items:center;justify-content:center;
  pointer-events:none;animation:revwrap var(--rms,900ms) ease-out forwards}
@keyframes revwrap{0%{background:rgba(5,10,7,0)}18%{background:rgba(5,10,7,.45)}78%{background:rgba(5,10,7,.45)}100%{background:rgba(5,10,7,0)}}
.revealkort{display:flex;flex-direction:column;align-items:center;gap:12px;
  animation:revkort var(--rms,900ms) cubic-bezier(.2,1.2,.4,1) forwards}
@keyframes revkort{
  0%{transform:scale(.6) rotate(-6deg);opacity:0;filter:brightness(1.8) blur(3px)}
  14%{transform:scale(1.5) rotate(0deg);opacity:1;filter:brightness(1.1) blur(0)}
  82%{transform:scale(1.52) rotate(0deg);opacity:1;filter:brightness(1)}
  100%{transform:scale(1.35) rotate(0deg);opacity:0;filter:brightness(1) blur(2px)}
}
.revealkort .mkort{box-shadow:0 0 40px rgba(95,224,160,.5),0 18px 50px rgba(0,0,0,.7);cursor:default}
.revealkort .mkort .ctipwrap{display:none}
.revealnavn{font-family:var(--disp);font-size:26px;letter-spacing:2px;color:var(--fos);
  text-shadow:0 0 20px rgba(95,224,160,.8);white-space:nowrap}
@media (prefers-reduced-motion:reduce){ .revealwrap{display:none} }
/* ---- 3D-dybde på kort-art ---- */
.mkort .art,.enh .art{filter:drop-shadow(0 3px 4px rgba(0,0,0,.55)) drop-shadow(0 0 6px color-mix(in srgb, var(--ce,#5fe0a0) 25%, transparent))}
.storart{filter:drop-shadow(0 5px 8px rgba(0,0,0,.6)) drop-shadow(0 0 10px color-mix(in srgb, var(--ce,#5fe0a0) 30%, transparent))}
/* ---- legendariske/sjældne kort: diskret elektrisk liv ---- */
.mkort.leg::before,.enh.leg::before{content:"";position:absolute;inset:-1px;border-radius:inherit;pointer-events:none;z-index:2;
  background:linear-gradient(115deg,transparent 42%,rgba(255,215,130,.28) 50%,transparent 58%);
  background-size:280% 280%;animation:legsheen 5.5s ease-in-out infinite;mix-blend-mode:screen}
@keyframes legsheen{0%,60%{background-position:120% 120%}90%,100%{background-position:-40% -40%}}
.mkort.leg,.enh.leg{animation:leggloed 3.4s ease-in-out infinite}
@keyframes leggloed{50%{box-shadow:inset 0 1px 0 rgba(255,255,255,.07),inset 0 -2px 4px rgba(0,0,0,.35),0 3px 10px rgba(0,0,0,.4),0 0 16px rgba(240,196,90,.4)}}
.mkort.rare,.enh.rare{border-color:#4db4ff}
.mkort.rare::before,.enh.rare::before{content:"";position:absolute;inset:-1px;border-radius:inherit;pointer-events:none;z-index:2;
  background:linear-gradient(115deg,transparent 44%,rgba(120,190,255,.18) 50%,transparent 56%);
  background-size:280% 280%;animation:legsheen 7s ease-in-out infinite;mix-blend-mode:screen}
@media (prefers-reduced-motion:reduce){.mkort.leg::before,.enh.leg::before,.mkort.rare::before,.enh.rare::before{animation:none;display:none}.mkort.leg,.enh.leg{animation:none}}
/* ---- bane-dekoration ---- */
.boarddecor{position:absolute;inset:0;pointer-events:none;z-index:0;overflow:hidden}
.spilflade{position:relative}
.bd-screw{position:absolute;opacity:.8;filter:drop-shadow(0 2px 3px rgba(0,0,0,.5))}
.bd-screw.tl{top:8px;left:8px}.bd-screw.tr{top:8px;right:8px;transform:rotate(40deg)}
.bd-screw.bl{bottom:8px;left:8px;transform:rotate(70deg)}.bd-screw.br{bottom:8px;right:8px;transform:rotate(15deg)}
.bd-rail{position:absolute;top:6%;height:64%;width:26px;opacity:0;display:none}
.bd-rail.left{left:4px}.bd-rail.right{right:4px}
.bd-cpu{position:absolute;left:50%;transform:translateX(-50%);top:calc(50% - 20px);opacity:.5;display:none;
  filter:drop-shadow(0 0 8px rgba(63,168,120,.3))}
@media (min-width:820px){
  .bd-rail{display:block;opacity:.75;animation:railfade 1s ease-out}
  .bd-cpu{display:block}
}
@keyframes railfade{from{opacity:0}}
/* ---- glossar sub-popup ---- */
.mkwrow{position:absolute;top:2px;left:50%;transform:translateX(-50%) scale(.72);display:flex;gap:2px;z-index:3;transform-origin:top center}
.ark.setingame{max-width:600px}
.glossterm{position:relative;color:var(--fos);border-bottom:1px dotted var(--fos);cursor:help;font-weight:600}
.glosspop{position:absolute;left:50%;bottom:calc(100% + 8px);transform:translateX(-50%) translateY(4px);
  width:220px;background:#0a140e;border:1.5px solid var(--fos);border-radius:10px;padding:9px 11px;
  font-size:12px;font-weight:400;color:#dbe7de;line-height:1.4;text-align:left;
  box-shadow:0 8px 26px rgba(0,0,0,.7);opacity:0;pointer-events:none;transition:opacity .12s,transform .12s;z-index:90}
.glosspop b{display:block;color:var(--fos);font-size:12.5px;margin-bottom:3px}
.glosspop::after{content:"";position:absolute;top:100%;left:50%;transform:translateX(-50%);
  border:6px solid transparent;border-top-color:var(--fos)}
.glossterm:hover .glosspop{opacity:1;transform:translateX(-50%) translateY(0)}
.unlocktitel{font-family:var(--disp);font-size:24px;letter-spacing:2px;color:var(--guld);
  text-shadow:0 0 18px rgba(240,196,90,.7);margin-bottom:12px;animation:vpulse 1.6s ease-in-out infinite}
.unlockkort{animation:unlockflip calc(.7s * var(--tempo,1)) cubic-bezier(.3,1.3,.5,1) both}
@keyframes unlockflip{0%{transform:rotateY(90deg) scale(.7);opacity:0}100%{transform:rotateY(0) scale(1);opacity:1}}
.bibkort{position:relative;display:inline-block}
.bibkort.laast .mkort{filter:grayscale(.85) brightness(.55)}
.bibkort .laas{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:20px;
  pointer-events:none;filter:drop-shadow(0 2px 4px rgba(0,0,0,.8))}
.samling{margin-top:10px;font-family:var(--mono);font-size:12px;color:var(--dim);text-align:center}
.samling b{color:var(--fos)}
.samlinghint{color:var(--amber);opacity:.8}
/* ---- settings ---- */
.setwrap{max-width:100%;text-align:left;max-height:none;overflow-y:visible}
.setsec{margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--line)}
.seth{font-family:var(--mono);font-size:14px;color:var(--fos);letter-spacing:.05em;margin-bottom:6px;text-transform:uppercase}
.setnote{font-size:12px;color:var(--dim);margin-bottom:10px;line-height:1.4}
.setrow{display:flex;align-items:center;gap:12px;margin:8px 0}
.setrow.sub{padding-left:22px;font-size:13px;color:var(--txt)}
.setrow.sub span{min-width:100px;color:var(--dim)}
.slider{flex:1;accent-color:var(--fos);height:4px}
.slider.sm{max-width:180px}
.setval{font-family:var(--mono);color:var(--amber);min-width:78px;text-align:right;font-size:13px}
.setpreset{display:flex;gap:6px;margin-top:8px}
.minknap{font-family:var(--mono);font-size:12px;padding:5px 12px;border-radius:8px;
  background:var(--bg2);border:1px solid var(--line);color:var(--txt);cursor:pointer;transition:all .12s}
.minknap:hover{border-color:var(--fos)}
.minknap.aktiv{border-color:var(--fos);color:var(--fos);background:rgba(95,224,160,.1)}
.settoggle{display:flex;align-items:center;gap:9px;margin:9px 0;font-size:14px;color:var(--txt);cursor:pointer}
.settoggle input{width:17px;height:17px;accent-color:var(--fos);cursor:pointer}
.keygrid{display:grid;grid-template-columns:1fr 1fr;gap:7px 14px;margin-top:8px}
.keyrow{display:flex;align-items:center;justify-content:space-between;gap:8px}
.keylabel{font-size:12.5px;color:var(--txt)}
.keybtn{font-family:var(--mono);font-size:12px;min-width:64px;padding:4px 8px;border-radius:6px;
  background:#0d1b13;border:1px solid var(--line);color:var(--amber);cursor:pointer;transition:all .12s}
.keybtn:hover{border-color:var(--fos)}
.keybtn.waiting{border-color:var(--fos);color:var(--fos);background:rgba(95,224,160,.12);animation:keywait 1s ease-in-out infinite}
@keyframes keywait{50%{background:rgba(95,224,160,.24)}}
@media (max-width:560px){ .keygrid{grid-template-columns:1fr} }
/* ---- sejrsanimation ---- */
.slor.sejr{background:radial-gradient(120% 90% at 50% 30%,rgba(63,168,120,.18),rgba(6,12,9,.86) 70%)}
.vfx{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:1}
.vpart{position:absolute;top:-6%;opacity:0;animation:vfall linear infinite}
.vpart.ci{border-radius:50%}
.vpart.sq{border-radius:1px}
@keyframes vfall{
  0%{opacity:0;transform:translate(0,-20px) rotate(0deg)}
  8%{opacity:1}
  100%{opacity:0;transform:translate(var(--drift),108vh) rotate(var(--spin))}
}
.vbolt{position:absolute;top:-8%;opacity:0;filter:drop-shadow(0 0 6px rgba(240,178,62,.9));
  animation:vboltfall linear infinite}
@keyframes vboltfall{
  0%{opacity:0;transform:translateY(-30px) scale(.8)}
  10%{opacity:1}
  60%{opacity:1}
  100%{opacity:0;transform:translateY(114vh) scale(1.1)}
}
.slor.sejr .ark{position:relative;z-index:2;animation:vark .6s cubic-bezier(.2,1.4,.4,1) both}
@keyframes vark{0%{transform:scale(.7);opacity:0}100%{transform:scale(1);opacity:1}}
.vlogo{color:var(--fos);letter-spacing:2px;position:relative;
  text-shadow:0 0 20px rgba(95,224,160,.7),0 0 44px rgba(95,224,160,.4);
  animation:vpulse 1.6s ease-in-out infinite}
@keyframes vpulse{50%{text-shadow:0 0 30px rgba(95,224,160,1),0 0 60px rgba(95,224,160,.6),0 0 90px rgba(240,178,62,.4)}}
.vbadge{display:inline-block;margin-left:8px;animation:vspark .9s ease-in-out infinite}
@keyframes vspark{0%,100%{transform:scale(1) rotate(0);filter:drop-shadow(0 0 4px #f0b23e)}50%{transform:scale(1.35) rotate(8deg);filter:drop-shadow(0 0 14px #f0b23e)}}
@media (prefers-reduced-motion:reduce){
  .vpart,.vbolt{display:none}
  .vlogo,.vbadge,.slor.sejr .ark{animation:none}
}
/* ---- hover-tooltip ---- */
.ctipwrap{position:absolute;bottom:calc(100% + 10px);left:50%;transform:translateX(-50%) translateY(6px);
  z-index:80;pointer-events:none;
  opacity:0;transition:opacity .12s,transform .12s;white-space:normal}
.mkort.hastip:hover .ctipwrap,.enh.hastip:hover .ctipwrap{opacity:1;transform:translateX(-50%) translateY(0)}
.ctip{width:210px;flex:none;background:linear-gradient(180deg,#14251b,#0b160f);border:1.5px solid var(--ce,#5fe0a0);
  border-radius:12px;padding:10px 12px;text-align:left;position:relative;
  box-shadow:0 12px 30px rgba(0,0,0,.6);
  font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
.ctip::after{content:"";position:absolute;top:100%;left:50%;transform:translateX(-50%);
  border:7px solid transparent;border-top-color:var(--ce,#5fe0a0)}
/* keyword-forklaringsbokse ved siden af tooltippen — én pr. keyword */
.ctipkws{position:absolute;left:calc(100% + 8px);top:0;display:flex;flex-direction:column;gap:6px;width:190px}
.ctipkw{display:flex;align-items:flex-start;gap:8px;background:linear-gradient(180deg,#12211a,#0a140e);
  border:1.2px solid var(--line);border-radius:10px;padding:7px 9px;text-align:left;
  box-shadow:0 8px 20px rgba(0,0,0,.5);
  font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
.ctipkw .kwb{flex:none;margin-top:1px}
.ctipkwtxt{display:flex;flex-direction:column;gap:1px}
.ctipkwtxt b{font-size:11.5px;color:var(--fos)}
.ctipkwtxt span{font-size:10.5px;color:#c3d6c9;line-height:1.35}
.ctip-h{display:flex;align-items:baseline;gap:7px;margin-bottom:3px}
.ctip-c{font-family:var(--mono);font-weight:700;color:var(--amber);font-size:13px}
.ctip-n{font-weight:700;color:#eaf6ee;font-size:14px;line-height:1.15}
.ctip-t{font-family:var(--mono);font-size:10px;color:var(--dim);letter-spacing:.03em;margin-bottom:5px}
.ctip-s{font-family:var(--mono);font-size:13px;color:#eaf6ee;margin-bottom:5px}
.ctip-k{font-family:var(--mono);font-size:11px;color:var(--fos);margin-bottom:5px;line-height:1.3}
.ctip-x{font-size:12px;color:#cfe6d6;line-height:1.4}
@media (hover:none){ .ctipwrap{display:none} }
/* ---- angreb/targeting ---- */
.spilflade.targeting .enh:not(.tgt),.spilflade.targeting .helt:not(.tgt){opacity:.4;filter:saturate(.5)}
.spilflade.targeting .mkort{opacity:.4}
.spilflade.targeting .enh.tgt,.spilflade.targeting .helt.tgt{opacity:1 !important;filter:none !important}
.atkhint{text-align:center;font-family:var(--mono);font-size:12px;color:var(--fos);
  background:rgba(95,224,160,.1);border:1px solid rgba(95,224,160,.35);border-radius:10px;
  padding:6px 12px;margin:2px auto 6px;max-width:440px;animation:atkhintpuls 2.4s ease-in-out infinite}
@keyframes atkhintpuls{50%{background:rgba(95,224,160,.18);border-color:rgba(95,224,160,.6)}}
.banner.atk{background:linear-gradient(180deg,#5a1a12,#3a0f0a);border-color:var(--rod);color:#ffd9d2}
.banner .bx{opacity:.7;font-size:11px;margin-left:6px}
/* ---- tutorial ---- */
.coach{position:fixed;left:50%;transform:translateX(-50%);bottom:178px;z-index:55;
  display:flex;gap:10px;align-items:flex-start;max-width:470px;width:calc(100% - 26px);
  background:linear-gradient(180deg,#12251a,#0e1d14);border:1.5px solid var(--fos);border-radius:14px;
  padding:11px 12px;box-shadow:0 10px 34px rgba(0,0,0,.55),0 0 18px rgba(95,224,160,.18)}
.coach .cava{font-size:24px;line-height:1.2}
.coach .ctxt{font-size:13.5px;line-height:1.45}
.coach .cnum{font-family:var(--mono);font-size:10.5px;color:var(--dim);margin-top:4px}
.coach .cx{margin-left:auto;background:none;border:none;color:var(--dim);font-size:15px;padding:2px 4px}
.coach.wob{animation:ryst .4s ease-in-out}
.tuthi{outline:2.5px solid var(--fos);outline-offset:2px;animation:tutpuls 1.15s ease-in-out infinite;z-index:5}
@keyframes tutpuls{50%{outline-color:rgba(95,224,160,.15);box-shadow:0 0 20px rgba(95,224,160,.65)}}
@media (min-width:820px){ .coach{bottom:206px} }
/* ---- store skærme / landscape ---- */
@media (min-width:700px){
  .mkort{width:74px;height:104px}.mkort .art{width:46px;height:46px}.mkort .nv{font-size:9.5px}
  .enh{width:68px;height:76px}.enh .art{width:46px;height:46px}
}
@media (min-width:820px){
  .spilflade{max-width:1080px;width:100%;margin:0 auto}
  .mkort{width:92px;height:129px}.mkort .art{width:60px;height:60px}.mkort .nv{font-size:11px;max-height:24px}
  .mkort .stat{font-size:15px}.pris{font-size:15px;min-width:24px;height:24px}
  .enh{width:118px;height:132px;border-radius:13px}.enh .art{width:80px;height:80px}.enh .stat{font-size:20px}
  .heltikon{width:64px;height:64px;font-size:36px}
  .helt .nm{font-size:23px;max-width:340px}
  .heltklasse{font-size:12px}
  .helt .hp{font-size:21px}
  .helt{padding:9px 22px 9px 10px;gap:14px}
  .enh .ikoner{font-size:11px}
  .braet{gap:16px;min-height:170px}
  .bar{font-size:17px;padding:14px 28px}
  .midt{padding:6px 24px;font-size:13px}
  .haand{justify-content:center;overflow:visible;padding-top:26px;min-height:200px;gap:0}
  .haand .hslot{margin:0 -6px}
  .haand .mkort{transform-origin:50% 135%;
    transform:rotate(calc(var(--o,0)*3.5deg)) translateY(calc(var(--a,0)*7px))}
  .haand .mkort.spil{transform:rotate(calc(var(--o,0)*3.5deg)) translateY(calc(var(--a,0)*7px - 8px))}
  .haand .mkort:hover{transform:rotate(0deg) translateY(-34px) scale(1.16);z-index:6;
    box-shadow:inset 0 1px 0 rgba(255,255,255,.14),0 4px 8px rgba(0,0,0,.5),0 24px 38px rgba(0,0,0,.62)}
  .hotkey{width:25px;height:25px;font-size:13px;margin-top:-11px}
  .kraft{width:58px;height:58px;font-size:26px}
  .logpanel{bottom:204px}.logknap{bottom:204px}
}
@media (min-width:1200px){
  .spilflade{max-width:1240px}
  .mkort{width:104px;height:146px}.mkort .art{width:68px;height:68px}
  .enh{width:132px;height:148px}.enh .art{width:92px;height:92px}
  .heltikon{width:72px;height:72px;font-size:40px}
  .helt .nm{font-size:26px;max-width:420px}
  .braet{gap:20px;min-height:192px}
  .haand .hslot{margin:0 -5px}
}
@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{animation-duration:.01ms !important;animation-iteration-count:1 !important;transition-duration:.01ms !important}
}
`;

// ---------- småkomponenter ----------
// tydelige SVG-ikoner pr. keyword — genkendeligt symbol + farve
const KWSVG = {
  jord: {c:"#8b6cff", t:"Grounded — must be attacked first",
    svg:'<path d="M12 3 v7 M7 10 h10 M8.5 13 h7 M10 16 h4" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>'},
  turbo: {c:"#5fe0a0", t:"Turbo — can attack the turn it's played",
    svg:'<path d="M7 4 L15 4 L10 11 L14 11 L7 20 L9 12 L5 12 Z" fill="currentColor"/>'},
  iso: {c:"#4db4ff", t:"Insulated — ignores the first damage",
    svg:'<path d="M12 3 L19 6 V11 C19 15.5 16 18.5 12 20 C8 18.5 5 15.5 5 11 V6 Z" fill="currentColor" opacity="0.9"/><path d="M9 11.5 l2 2 l4 -4.5" stroke="#0a140e" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'},
  hoj: {c:"#ff5a4d", t:"High Voltage — destroys any unit it damages",
    svg:'<path d="M13 2 L5 13 H10 L9 22 L18 10 H12 Z" fill="currentColor"/>'},
  dob: {c:"#ffb347", t:"Dual Core — can attack twice",
    svg:'<path d="M4 8 L10 8 L10 5 L15 11 L10 17 L10 14 L4 14 Z" fill="currentColor"/><path d="M20 8 L20 14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M16.5 8 L16.5 14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>'},
  host: {c:"#ff8ec4", t:"Energy Harvest — its damage heals your hero",
    svg:'<path d="M12 20 C12 20 3 14 3 8.5 C3 5.5 5.2 4 7.3 4 C9 4 10.5 5 12 7 C13.5 5 15 4 16.7 4 C18.8 4 21 5.5 21 8.5 C21 14 12 20 12 20 Z" fill="currentColor"/><path d="M11 9 h2 v2 h2 v2 h-2 v2 h-2 v-2 h-2 v-2 h2 Z" fill="#0a140e"/>'},
  skjul: {c:"#9fb4a8", t:"Cloaked — can't be targeted until it attacks",
    svg:'<path d="M2 12 C5 7 8.5 5 12 5 C15.5 5 19 7 22 12 C19 17 15.5 19 12 19 C8.5 19 5 17 2 12 Z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="3" fill="currentColor"/><path d="M4 19 L20 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'},
  noHero: {c:"#e0765a", t:"Units only — can't attack heroes",
    svg:'<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 6 L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'},
  sig: {c:"#5fe0a0", t:"Signal Strength — your Spells hit harder",
    svg:'<path d="M4 20 v-4 M9 20 v-8 M14 20 v-12 M19 20 v-16" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'},
};
// SVG-ikoner til hero powers hvor emoji ikke findes/passer

// <Ico n="bolt"/> — inline SVG i tekststørrelse, arver farven fra teksten.
const _icoCache=new Map();
function icoHtml(n,s){
  const k=n+"|"+s;
  let v=_icoCache.get(k);
  if(v===undefined){
    const p=ICONS[n];
    v = p ? '<svg viewBox="0 0 512 512" width="'+s+'" height="'+s+'" fill="currentColor">'+p+'</svg>' : null;
    _icoCache.set(k,v);
  }
  return v;
}
// dangerouslySetInnerHTML får samme objekt-reference ved samme (n,size), så React
// springer DOM-skrivningen over ved gen-render. Uden det skrives hvert ikon om
// hver gang forælderen rendrer — det var det, der fik biblioteket til at hakke.
const _icoProps=new Map();
const Ico = memo(function Ico({n,size,cls,style}){
  const sz=size||"1em", k=n+"|"+sz;
  let props=_icoProps.get(k);
  if(props===undefined){ const h=icoHtml(n,sz); props = h?{__html:h}:null; _icoProps.set(k,props); }
  if(!props) return null;
  return <span className={"ico"+(cls?" "+cls:"")} style={style} aria-hidden="true"
    dangerouslySetInnerHTML={props}/>;
});
// Log-linjer gemmes som ren tekst med ikon-tokens: "§bolt§ Foo wins!".
// Det holder spiltilstanden serialiserbar (online-spil) og fri for emoji.
// §kw_jord§ osv. slår op i de håndtegnede keyword-badges i stedet.
const LOGTOK=/§(kw_)?([a-z]+)§/g;
function LogTekst({t}){
  if(!t) return null;
  const ud=[]; let sidst=0, m, i=0;
  LOGTOK.lastIndex=0;
  while((m=LOGTOK.exec(t))){
    if(m.index>sidst) ud.push(t.slice(sidst,m.index));
    ud.push(m[1] ? <KwBadge key={i++} k={m[2]}/> : <Ico key={i++} n={m[2]}/>);
    sidst=m.index+m[0].length;
  }
  if(sidst<t.length) ud.push(t.slice(sidst));
  return <>{ud}</>;
}
const POWERSVG = {
  loddekolbe: '<svg viewBox="0 0 24 24" width="1em" height="1em" style="vertical-align:-0.12em"><path d="M20 4 L14 10" stroke="#c9814a" stroke-width="2.4" stroke-linecap="round"/><path d="M13 11 L9 15" stroke="#9aa7a0" stroke-width="3.2" stroke-linecap="round"/><path d="M9 15 L5 19 L4 20" stroke="#8b6cff" stroke-width="2" stroke-linecap="round" fill="none"/><path d="M6 18 c-1 1 -2 1 -2 2 c1 0 1 -1 2 -2" fill="#ffb347"/><circle cx="6.5" cy="17.5" r="1.6" fill="#ff8c3a"/></svg>',
};
function PowerIcon({p}){
  if(p&&p.svg&&POWERSVG[p.svg]) return <span className="pwsvg" dangerouslySetInnerHTML={{__html:POWERSVG[p.svg]}}/>;
  return p&&p.ico ? <Ico n={p.ico}/> : null;
}
// splitter en korttekst op og gør kendte mekanik-termer til hover-bare chips
function GlossText({txt}){
  if(!txt) return null;
  const terms=Object.keys(GLOSSARY).sort((a,b)=>b.length-a.length); // længste først
  const re=new RegExp("("+terms.map(t=>t.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|")+")","g");
  const parts=[]; let last=0, m, i=0;
  while((m=re.exec(txt))){
    if(m.index>last) parts.push(txt.slice(last,m.index));
    parts.push(<GlossTerm key={i++} term={m[0]}/>);
    last=m.index+m[0].length;
  }
  if(last<txt.length) parts.push(txt.slice(last));
  return <>{parts}</>;
}
function GlossTerm({term}){
  return (
    <span className="glossterm">{term}
      <span className="glosspop"><b>{term}</b>{GLOSSARY[term]}</span>
    </span>
  );
}
const _kwProps=new Map();
const KwBadge = memo(function KwBadge({k,big}){
  const info=KWSVG[k]; if(!info) return null;
  const sz=big?31:26, key=k+"|"+sz;
  let props=_kwProps.get(key);
  if(props===undefined){ props={__html:'<svg viewBox="0 0 24 24" width="'+sz+'" height="'+sz+'">'+info.svg+'</svg>'}; _kwProps.set(key,props); }
  return (
    <span className={"kwb"+(big?" big":"")} style={{color:info.c,borderColor:info.c}} title={info.t}
      dangerouslySetInnerHTML={props}/>
  );
});
function kwList(g,s,u){
  const out=[];
  for(const k of kws(g,s,u)){ if(KWSVG[k]) out.push(k); }
  if(!u.sil && CARDS[u.id].sig) out.push("sig");
  return out;
}
const CARDTHEME={
  tek:  ["#4a3410","#120d04","#ffb347"], hack:["#3d1170","#0f0420","#c07bff"],
  over: ["#5c1a08","#160502","#ff6a3d"], Component:["#5a3806","#130b02","#ffa726"],
  Robot:["#0d3566","#030c18","#4db4ff"], Drone:["#0a4a2c","#02120a","#33e88a"],
  Virus:["#4a0f52","#120414","#e85adf"], spell:["#4a4708","#131202","#f5ea3a"],
  none: ["#1e3d1a","#070f06","#7dd960"],
};
function themeVars(d){
  const t=(d.cls&&CARDTHEME[d.cls])||(d.t==="spell"&&CARDTHEME.spell)||(d.tr&&CARDTHEME[d.tr])||CARDTHEME.none;
  return {"--ct":t[0],"--cb":t[1],"--ce":t[2]};
}
function cardKws(d){
  const out=[];
  if(d.kw) for(const k of d.kw){ if(KWINFO[k]) out.push(KWINFO[k].n); }
  if(d.sig) out.push("Signal Strength +"+d.sig);
  return out;
}
function CardTip({id,live}){
  const d=CARDS[id];
  // codes = keyword-koder (jord/turbo/...) — live fra brættet eller basiskortet
  const codes = live&&live.codes ? live.codes
    : (()=>{ const o=[]; if(d.kw) for(const k of d.kw){ if(KWSVG[k]) o.push(k); } if(d.sig) o.push("sig"); return o; })();
  const names = codes.map(k=> k==="sig" ? ("Signal Strength"+(d.sig?" +"+d.sig:"")) : (KWINFO[k]?KWINFO[k].n:k));
  const atk=live?live.atk:d.a, hp=live?live.hp:d.h;
  return (
    <div className="ctipwrap">
      <div className="ctip">
        <div className="ctip-h">
          <span className="ctip-c">{d.c}<Ico n="bolt"/></span>
          <span className="ctip-n">{d.n}</span>
        </div>
        <div className="ctip-t">{d.t==="unit"?"Unit":"Spell"}{d.tr?" · "+d.tr:""}{d.cls&&CLASSES[d.cls]?" · "+CLASSES[d.cls].n:""}{d.r==="L"?<> · <Ico n="legendary"/> Legendary</>:null}{d.r==="R"?<> · <Ico n="rare"/> Rare</>:null}</div>
        {d.t==="unit" && <div className="ctip-s"><Ico n="sword"/> {atk} &nbsp; <Ico n="heart"/> {hp}</div>}
        {names.length>0 && <div className="ctip-k">{names.join(" · ")}</div>}
        {d.txt && <div className="ctip-x">{d.txt}</div>}
      </div>
      {codes.length>0 && (
        <div className="ctipkws">
          {codes.map(k=>{
            const navn=k==="sig"?"Signal Strength":(KWINFO[k]?KWINFO[k].n:k);
            return (
              <div key={k} className="ctipkw">
                <KwBadge k={k}/>
                <div className="ctipkwtxt"><b>{navn}</b><span>{GLOSSARY[navn]||""}</span></div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
const MiniCard = memo(function MiniCard({id,onClick,glow,count,style,dfx,xcls,tip,onPointerDown}){
  const d=CARDS[id];
  const kwl=[]; if(d.kw) for(const k of d.kw){ if(KWSVG[k]) kwl.push(k); } if(d.sig) kwl.push("sig");
  return (
    <button className={"mkort tema"+(d.r==="L"?" leg":d.r==="R"?" rare":"")+(glow?" spil":"")+(xcls?" "+xcls:"")+(tip?" hastip":"")} onClick={onClick} onPointerDown={onPointerDown} style={{...themeVars(d),...style}} data-fx={dfx}>
      <span className="pris">{d.c}</span>
      {count!=null && <span className="antal">{count}×</span>}
      {d.cls&&CLASSES[d.cls]&&<span className="clsdot" style={{background:CLASSES[d.cls].col}}/>}
      {kwl.length>0 && <span className="mkwrow">{kwl.map(k=><KwBadge key={k} k={k}/>)}</span>}
      <CardArt id={id}/>
      <span className="nv">{d.n}</span>
      {d.t==="unit" && <><span className="stat a">{d.a}</span><span className="stat h">{d.h}</span></>}
      {tip && <CardTip id={id}/>}
    </button>
  );
});
/* ---------- historik-skinne ----------
   Viser hvert spillet kort som en lille brik i en lodret liste. Hold musen over
   (eller tap) for at se hvad kortet gjorde: skade på helte, dræbte enheder,
   tilkaldte enheder og de log-linjer effekten producerede. */
function histSkade(rec,side){ const d=rec.dhp?rec.dhp[side]:0; return d<0?-d:0; }
function histHeal(rec,side){ const d=rec.dhp?rec.dhp[side]:0; return d>0?d:0; }
function HistCard({rec,aaben,onEnter,onLeave,onClick}){
  const d=CARDS[rec.id]; if(!d) return null;
  const mine=rec.mine;
  const hit=histSkade(rec,1-rec.s); // skade taget af den helt kortet blev spillet imod
  return (
    <div className={"hkort tema"+(mine?" mig":" dem")+(aaben?" aaben":"")} style={themeVars(d)}
      onMouseEnter={onEnter} onMouseLeave={onLeave} onClick={onClick}>
      <span className="hpris">{d.c}</span>
      <CardArt id={rec.id}/>
      {hit>0 && <span className="hhit">−{hit}</span>}
      {rec.kills.length>0 && <span className="hdoed"><Ico n="skull"/>{rec.kills.length>1?rec.kills.length:""}</span>}
    </div>
  );
}
function HistTip({rec,pos,navne}){
  const d=CARDS[rec.id]; if(!d) return null;
  const opS=1-rec.s;
  const chips=[];
  const sMod=histSkade(rec,opS), sSelv=histSkade(rec,rec.s);
  const hMod=histHeal(rec,opS), hSelv=histHeal(rec,rec.s);
  if(sMod>0) chips.push(<span key="sm" className="chip skade">−{sMod} <Ico n="heart"/> {navne[opS]}</span>);
  if(sSelv>0) chips.push(<span key="ss" className="chip skade">−{sSelv} <Ico n="heart"/> {navne[rec.s]}</span>);
  if(hMod>0) chips.push(<span key="hm" className="chip heal">+{hMod} <Ico n="heart"/> {navne[opS]}</span>);
  if(hSelv>0) chips.push(<span key="hs" className="chip heal">+{hSelv} <Ico n="heart"/> {navne[rec.s]}</span>);
  for(const k of rec.kills) chips.push(
    <span key={"k"+chips.length} className={"chip doed"+(k.s===rec.s?" selv":"")}>
      <Ico n="skull"/> {CARDS[k.id]?CARDS[k.id].n:"?"}{k.s===rec.s?" (own)":""}</span>);
  for(const u of rec.sum) chips.push(<span key={"s"+chips.length} className="chip"><Ico n="sparkle"/> {CARDS[u.id]?CARDS[u.id].n:"?"}</span>);
  // dødsfald står allerede som chips — undgå dobbeltinfo i log-linjerne
  const linjer=rec.lines.filter(l=>!l.startsWith("§cross§ "));
  const tomt = chips.length===0 && linjer.length===0;
  return (
    <div className="histtip" style={{...themeVars(d),top:pos.top,left:pos.left}}>
      <div className="hth"><b>{d.n}</b><span>{d.c}<Ico n="bolt"/></span></div>
      <div className="htmeta">{navne[rec.s]} · round {rec.r} · {d.t==="unit"?"unit":"spell"}</div>
      {chips.length>0 && <div className="htchips">{chips}</div>}
      {linjer.length>0 && <div className="htlinjer">{linjer.map((l,i)=><div key={i}><LogTekst t={l}/></div>)}</div>}
      {tomt && <div className="htintet">No visible effect — it just hit the board.</div>}
    </div>
  );
}
function HistRail({g,seat,navne}){
  const [tip,setTip]=useState(null);
  const poster=(g.hist||[]).map(r=>({...r,mine:r.s===seat})).slice().reverse();
  const vis=(rec,el)=>{
    if(!el) return;
    const b=el.getBoundingClientRect();
    const vh=(typeof window!=="undefined"?window.innerHeight:800);
    const vw=(typeof window!=="undefined"?window.innerWidth:1000);
    const top=Math.max(8,Math.min(b.top-6,vh-230));
    const left=Math.min(b.right+10, vw-224);
    setTip({rec,pos:{top,left}});
  };
  return (
    <>
      <div className="histrail" onMouseLeave={()=>setTip(null)}>
        <div className="htop">PLAYED</div>
        {poster.length===0 && <div className="htom">no cards<br/>played yet</div>}
        {poster.map(r=>
          <HistCard key={r.k} rec={r} aaben={!!tip&&tip.rec.k===r.k}
            onEnter={e=>vis(r,e.currentTarget)}
            onLeave={()=>setTip(null)}
            onClick={e=>{ if(tip&&tip.rec.k===r.k) setTip(null); else vis(r,e.currentTarget); }}/>)}
      </div>
      {tip && <HistTip rec={tip.rec} pos={tip.pos} navne={navne}/>}
    </>
  );
}
const StorKort = memo(function StorKort({id,unitInfo,g}){
  const d=CARDS[id];
  let live=null, kwl=[];
  if(unitInfo&&g){ const u=refUnit(g,{s:unitInfo.s,u:unitInfo.uid});
    if(u){ live={a:effAtk(g,unitInfo.s,u),h:effHp(g,unitInfo.s,u),m:effMax(g,unitInfo.s,u),sil:u.sil};
      kwl=kwList(g,unitInfo.s,u); } }
  else if(d.t==="unit"){ // basiskortets keywords (uden live-instans)
    if(d.kw) for(const k of d.kw){ if(KWSVG[k]) kwl.push(k); }
    if(d.sig) kwl.push("sig");
  }
  return (
    <div className={"storkort tema"+(d.r==="L"?" leg":d.r==="R"?" rare":"")} style={themeVars(d)}>
      <div className="top">
        <CardArt id={id} pattern={true} className="storart"/>
        <div>
          <h3>{d.n}</h3>
          <div className="meta">{d.c}<Ico n="bolt"/> · {d.cls&&CLASSES[d.cls]?CLASSES[d.cls].n+" · ":""}{d.t==="unit"?"Unit":"Spell"}{d.tr?" · "+d.tr:""}{d.r==="L"?<> · <Ico n="legendary"/> Legendary</>:null}</div>
        </div>
      </div>
      <div className="txt">{live&&live.sil?<i>Reset — all text removed.</i>:(d.txt?<GlossText txt={d.txt}/>:"—")}</div>
      {kwl.length>0 && (
        <div className="kwlegend">
          {kwl.map(k=>{ const navn=k==="sig"?"Signal Strength":KWINFO[k].n;
            return <span key={k} className="kwleg"><KwBadge k={k}/><GlossTerm term={navn}/></span>; })}
        </div>
      )}
      {d.t==="unit" && (
        <div className="statraek">
          <span style={{color:"var(--amber)"}}><Ico n="sword"/> {live?live.a:d.a}</span>
          <span style={{color:live&&live.h<live.m?"var(--rod)":"var(--fos)"}}><Ico n="heart"/> {live?live.h+"/"+live.m:d.h}</span>
        </div>
      )}
    </div>
  );
});
function BrokenNeon({text}){
  // hvert bogstav får sit eget uregelmæssige flimre; ét er næsten dødt
  const letters=useMemo(()=>{
    const arr=text.split("");
    const deadIdx=(Math.random()*arr.length)|0; // ét "dødt" bogstav
    return arr.map((ch,i)=>({
      ch, i,
      dead:i===deadIdx,
      delay:(-Math.random()*3).toFixed(2),
      dur:(1.4+Math.random()*2.6).toFixed(2),
      variant:1+((Math.random()*4)|0), // vælg 1 af 4 flimre-keyframes
    }));
  },[text]);
  return (
    <span className="neon">
      {letters.map(l=>(
        <span key={l.i} className={"nl f"+l.variant+(l.dead?" dead":"")}
          style={{animationDelay:l.delay+"s",animationDuration:l.dur+"s"}}>
          {l.ch===" "?"\u00A0":l.ch}
        </span>
      ))}
      <span className="neonspark s1"/>
      <span className="neonspark s2"/>
    </span>
  );
}
function VictoryFX(){
  // genererer partikler (gnister/konfetti) + elektriske bolte i temaets farver
  const parts=useMemo(()=>{
    const cols=["#5fe0a0","#f0b23e","#ff5a4d","#4db4ff","#c07bff"];
    return Array.from({length:80},(_,i)=>({
      id:i,
      left:Math.random()*100,
      delay:Math.random()*2.2,
      dur:2.4+Math.random()*2.2,
      col:cols[(Math.random()*cols.length)|0],
      size:3+Math.random()*5,
      drift:(Math.random()*2-1)*140,
      spin:(Math.random()*2-1)*720,
      shape:Math.random()<0.5?"sq":"ci",
    }));
  },[]);
  const bolts=useMemo(()=>Array.from({length:7},(_,i)=>({
    id:i, left:8+Math.random()*84, delay:0.3+Math.random()*2.6, dur:0.5+Math.random()*0.4,
  })),[]);
  return (
    <div className="vfx" aria-hidden="true">
      {parts.map(p=>(
        <span key={p.id} className={"vpart "+p.shape} style={{
          left:p.left+"%", background:p.col, width:p.size, height:p.size,
          animationDelay:p.delay+"s", animationDuration:p.dur+"s",
          "--drift":p.drift+"px", "--spin":p.spin+"deg",
          boxShadow:"0 0 8px "+p.col,
        }}/>
      ))}
      {bolts.map(b=>(
        <svg key={b.id} className="vbolt" style={{left:b.left+"%",animationDelay:b.delay+"s",animationDuration:b.dur+"s"}}
          viewBox="0 0 40 120" width="26" height="80">
          <path d="M24 4 L8 60 L20 60 L14 116 L34 48 L22 48 Z" fill="#f0b23e" stroke="#fff6d8" strokeWidth="1.5"/>
        </svg>
      ))}
    </div>
  );
}
function Pips({p}){
  const el=[];
  const brugbar=Math.max(0,p.maxE-p.ovlShown);
  for(let i=0;i<p.maxE;i++){
    let cls="pip";
    if(i<Math.min(p.cur,brugbar)) cls+=" fuld";
    else if(i>=brugbar) cls+=" laast";
    else cls+=" brugt";
    el.push(<span key={i} className={cls}/>);
  }
  for(let i=Math.max(0,p.cur-brugbar);i>0;i--) el.push(<span key={"x"+i} className="pip fuld" style={{borderColor:"var(--fos)"}}/>);
  for(let i=0;i<p.stored;i++) el.push(<span key={"g"+i} className="pip gemt"/>);
  return <span className="pips">{el}<span style={{marginLeft:5,color:"var(--amber)"}}>{p.cur}<Ico n="bolt"/></span></span>;
}
function UnitTile({g,s,u,mine,onClick,hilite,ready,shake,tuthi,onPointerDown,dragtgt}){
  const d=CARDS[u.id];
  const hp=effHp(g,s,u), mx=effMax(g,s,u);
  const kwl=kwList(g,s,u);
  const sover=mine&&u.jp&&!hasKw(g,s,u,"turbo");
  return (
    <button className={"enh tema hastip"+(d.r==="L"?" leg":d.r==="R"?" rare":"")+(hilite?" tgt":"")+(ready?" klar":"")+(u.sil?" sil":"")+(sover?" sover":"")+(shake?" ryst":"")+(tuthi?" tuthi":"")+(dragtgt?" dragtgt":"")}
      onClick={onClick} onPointerDown={onPointerDown} data-fx={u.uid} style={themeVars(d)}>
      {kwl.length>0 && <span className="ikoner">{kwl.map(k=><KwBadge key={k} k={k}/>)}</span>}
      {u.sh && <span className="skjold"/>}
      <CardArt id={u.id} className={u.st?"dimart":undefined}/>
      {sover && <span className="zz">z</span>}
      <span className="stat a">{effAtk(g,s,u)}</span>
      <span className={"stat h"+(hp<mx?" skadet":"")}>{hp}</span>
      <CardTip id={u.id} live={{atk:effAtk(g,s,u),hp,codes:kwl}}/>
    </button>
  );
}
function HeltPlade({g,s,me,onClick,hilite,shake,tuthi,dragtgt}){
  const p=g.players[s];
  const K=CLASSES[p.cls]||CLASSES.tek;
  return (
    <button className={"helt"+(hilite?" tgt":"")+(shake?" ryst":"")+(tuthi?" tuthi":"")+(dragtgt?" dragtgt":"")} onClick={onClick} data-fx={"h"+s}
      style={{"--kf":K.col||"var(--fos)"}}>
      <span className="heltikon"><Ico n={K.ico} size="20px"/></span>
      <span className="heltinfo">
        <span className="nm">{p.name}</span>
        <span className="heltklasse">{K.n}</span>
        <span className={"hp"+(p.hp<=10?" lav":"")}><Ico n="heart"/> {p.hp}</span>
      </span>
    </button>
  );
}

// ---------- kort-art (vektor, deterministisk pr. id) ----------
const ARTC={bg:"#0c1811",bg2:"#173021",cu:"#c9814a"};
function seedOf(str){ let h=2166136261; for(const c of str){ h^=c.charCodeAt(0); h=Math.imul(h,16777619); } return h>>>0; }
function mulberry(a){ return function(){ a|=0; a=(a+0x6D2B79F5)|0; let t=Math.imul(a^(a>>>15),1|a);
  t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; }; }
function artAccent(d){
  if(d.cls&&d.t==="spell"&&CLASSES[d.cls]) return CLASSES[d.cls].col;
  return d.t==="spell"?"#e8e05f":({Component:"#e8a96a",Robot:"#9fc0e8",Drone:"#5fe0a0",Virus:"#c76bd9"}[d.tr]||"#ffd166");
}
function circuitArt(rnd,x0,y0,x1,y1,color,n,op){
  const G=25, snap=v=>Math.round(v/G)*G;
  let out="";
  for(let i=0;i<n;i++){
    let x=snap(x0+rnd()*(x1-x0)), y=snap(y0+rnd()*(y1-y0));
    let dd="M "+x+" "+y;
    out+='<circle cx="'+x+'" cy="'+y+'" r="7" fill="none" stroke="'+color+'" stroke-width="4" opacity="'+op+'"/>';
    const segs=1+Math.floor(rnd()*3);
    let dir=rnd()<0.5?0:1;
    for(let sg=0;sg<segs;sg++){
      const len=G*(2+Math.floor(rnd()*5)), sgn=rnd()<0.5?-1:1;
      if(rnd()<0.35){ let nx=Math.max(x0,Math.min(x1,x+sgn*len)), ny=Math.max(y0,Math.min(y1,y+(rnd()<0.5?-1:1)*len));
        dd+=" L "+nx+" "+ny; x=nx; y=ny; }
      else if(dir===0){ let nx=Math.max(x0,Math.min(x1,x+sgn*len)); dd+=" L "+nx+" "+y; x=nx; dir=1; }
      else { let ny=Math.max(y0,Math.min(y1,y+sgn*len)); dd+=" L "+x+" "+ny; y=ny; dir=0; }
    }
    out+='<path d="'+dd+'" fill="none" stroke="'+color+'" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity="'+op+'"/>';
    if(rnd()<0.6) out+='<circle cx="'+x+'" cy="'+y+'" r="9" fill="'+ARTC.bg+'" stroke="'+color+'" stroke-width="4" opacity="'+op+'"/>';
    else out+='<rect x="'+(x-8)+'" y="'+(y-8)+'" width="16" height="16" fill="'+color+'" opacity="'+op+'"/>';
  }
  return out;
}
// ---------- KORTIKONER ----------
// Per-kort elektronik-symboler tegnet i 750x690-koordinatrum (centreret ~375,345).
// Bruges af BÅDE spillets CardArt og asset-generatoren, så de altid matcher.
// Hvert ikon er en funktion (ac, bg, bg2) => svg-streng. Fald tilbage på stamme-motiv
// hvis kortet ikke har et dedikeret ikon.

const CX = 375, CY = 345;

// hjælpere
const L = (x1,y1,x2,y2,ac,w=11) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${ac}" stroke-width="${w}" stroke-linecap="round"/>`;
const C = (x,y,r,ac,w=10,fill="none") => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${ac}" stroke-width="${w}"/>`;
const DOT = (x,y,r,ac) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${ac}"/>`;
const PATH = (d,ac,w=11,fill="none") => `<path d="${d}" fill="${fill}" stroke="${ac}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const POLY = (pts,ac,w=11,fill="none") => `<polygon points="${pts}" fill="${fill}" stroke="${ac}" stroke-width="${w}" stroke-linejoin="round"/>`;

// vandrette tilledninger i venstre+højre kant (klassisk komponent-look)
const leads = (y,ac,x1=150,x2=600) => L(x1,y,255,y,ac,9)+L(495,y,x2,y,ac,9);

// --- induktor/spole: buer på en linje ---
function coil(ac){
  let humps="";
  for(let i=0;i<4;i++){ const x=270+i*60; humps+=`<path d="M ${x} 345 A 30 30 0 0 1 ${x+60} 345" fill="none" stroke="${ac}" stroke-width="11"/>`; }
  return leads(345,ac,150,600).replace('495','510')+L(150,345,270,345,ac,9)+humps+L(510,345,600,345,ac,9);
}

// --- modstand: zigzag ---
function resistor(ac){
  const zz="M 270 345 L 292 315 L 330 375 L 368 315 L 406 375 L 444 315 L 480 345";
  return leads(345,ac)+PATH(zz,ac,11);
}

// --- LED: diode-trekant + pil-stråler ---
function led(ac){
  const tri=`M 320 300 L 320 390 L 400 345 Z`;
  const bar=L(400,300,400,390,ac,11);
  const ray=(x,y)=>PATH(`M ${x} ${y} L ${x+34} ${y-34}`,ac,7)+PATH(`M ${x+34} ${y-34} l -14 2 M ${x+34} ${y-34} l 2 -14`,ac,6);
  return leads(345,ac)+PATH(tri,ac,10,ac)+bar+ray(410,285)+ray(440,315);
}

// --- diode: trekant + bar (uden stråler) ---
function diode(ac){
  return leads(345,ac)+PATH(`M 320 300 L 320 390 L 400 345 Z`,ac,10,ac)+L(400,300,400,390,ac,11);
}

// --- kondensator: to plader ---
function capacitor(ac){
  return leads(345,ac,150,600).replace('255','345').replace('495','405')
    +L(345,285,345,405,ac,13)+L(405,285,405,405,ac,13);
}

// --- superkondensator/flux: to buede plader ---
function supercap(ac){
  return leads(345,ac).replace('255','345').replace('495','405')
    +L(345,285,345,405,ac,13)+PATH("M 405 285 Q 435 345 405 405",ac,13);
}

// --- sikring: aflang kapsel med tråd igennem ---
function fuse(ac){
  return leads(345,ac)+`<rect x="285" y="315" width="180" height="60" rx="30" fill="none" stroke="${ac}" stroke-width="10"/>`
    +PATH("M 300 345 Q 375 320 450 345",ac,7);
}

// --- transistor: cirkel med base + to ben ---
function transistor(ac){
  return C(375,345,78,ac,10)+L(230,345,297,345,ac,9) // base-lead
    +L(340,305,340,385,ac,12) // base-plade
    +L(340,325,440,285,ac,10)+L(340,365,440,405,ac,10) // collector/emitter
    +L(440,285,440,240,ac,9)+L(440,405,440,450,ac,9)
    +PATH("M 415 395 l 25 10 l -8 -24",ac,8,ac); // emitter-pil
}

// --- krystal-oscillator: kapsel mellem to plader ---
function crystal(ac){
  return leads(345,ac).replace('255','325').replace('495','425')
    +L(325,290,325,400,ac,12)+L(425,290,425,400,ac,12)
    +`<rect x="345" y="300" width="60" height="90" rx="8" fill="none" stroke="${ac}" stroke-width="11"/>`;
}

// --- potentiometer: modstand med pil ovenfra ---
function potmeter(ac){
  return resistor(ac)+PATH("M 375 250 L 375 322",ac,8)+PATH("M 360 285 l 15 -18 l 15 18",ac,8,ac);
}

// --- transformer: to spoler ryg mod ryg med kerne ---
function transformer(ac){
  const halfL=[0,1,2].map(i=>`<path d="M 320 ${300+i*30} A 15 15 0 0 0 320 ${330+i*30}" fill="none" stroke="${ac}" stroke-width="9"/>`).join("");
  const halfR=[0,1,2].map(i=>`<path d="M 430 ${300+i*30} A 15 15 0 0 1 430 ${330+i*30}" fill="none" stroke="${ac}" stroke-width="9"/>`).join("");
  return L(150,315,320,315,ac,8)+L(150,375,320,375,ac,8)+L(430,315,600,315,ac,8)+L(430,375,600,375,ac,8)
    +halfL+halfR+L(365,290,365,400,ac,7)+L(385,290,385,400,ac,7);
}

// --- relæ: spole + kontakt ---
function relay(ac){
  return `<rect x="300" y="290" width="150" height="110" rx="10" fill="none" stroke="${ac}" stroke-width="10"/>`
    +[0,1,2].map(i=>`<path d="M 320 ${310+i*28} h 40" stroke="${ac}" stroke-width="8" fill="none"/>`).join("")
    +DOT(410,320,7,ac)+L(410,320,445,300,ac,8)+DOT(410,380,7,ac)+L(150,345,300,345,ac,8)+L(450,345,600,345,ac,8);
}

// --- kontakt/switch: åben knap ---
function switchIcon(ac){
  return leads(345,ac)+DOT(300,345,10,ac)+DOT(450,345,10,ac)+L(300,345,435,300,ac,11);
}

// --- køleplade/heat sink: finner ---
function heatsink(ac){
  let fins=""; for(let i=0;i<6;i++){ const x=285+i*34; fins+=L(x,290,x,400,ac,11); }
  return `<rect x="270" y="390" width="210" height="26" fill="${ac}"/>`+fins;
}

// --- fan/blæser: nav + 4 blade ---
function fan(ac){
  const blade=a=>`<path d="M ${CX} ${CY} Q ${CX+Math.cos(a)*40-Math.sin(a)*70} ${CY+Math.sin(a)*40+Math.cos(a)*70} ${CX+Math.cos(a)*110} ${CY+Math.sin(a)*110} Q ${CX+Math.cos(a)*40+Math.sin(a)*70} ${CY+Math.sin(a)*40-Math.cos(a)*70} ${CX} ${CY} Z" fill="${ac}" opacity="0.8"/>`;
  return C(375,345,120,ac,9)+[0,1,2,3].map(i=>blade(Math.PI/2*i+0.4)).join("")+DOT(375,345,20,ac);
}

// --- piezo/buzzer: cirkel med lydbølger ---
function buzzer(ac){
  return C(375,345,70,ac,10)+DOT(375,345,14,ac)
    +PATH("M 470 300 Q 500 345 470 390",ac,8)+PATH("M 500 280 Q 540 345 500 410",ac,7);
}

// --- multimeter/oscilloskop: skærm med kurve ---
function meter(ac,bg2,wave){
  const scr=`<rect x="270" y="280" width="210" height="130" rx="12" fill="${bg2}" stroke="${ac}" stroke-width="10"/>`;
  const line=wave?PATH("M 290 380 Q 320 300 350 360 T 410 345 T 460 320",ac,7)
    :PATH("M 300 345 L 340 345 L 360 310 L 380 380 L 400 345 L 460 345",ac,7);
  return scr+line+DOT(300,300,6,ac);
}

// --- breadboard: hulmatrix ---
function breadboard(ac,bg2){
  let holes=""; for(let r=0;r<5;r++)for(let c=0;c<8;c++) holes+=DOT(292+c*28,300+r*24,4,ac);
  return `<rect x="270" y="280" width="210" height="130" rx="10" fill="${bg2}" stroke="${ac}" stroke-width="9"/>`+holes;
}

// --- kredsløbskort/PCB: plade med baner ---
function pcb(ac,bg2){
  return `<rect x="268" y="270" width="214" height="150" rx="10" fill="${bg2}" stroke="${ac}" stroke-width="9"/>`
    +PATH("M 300 300 h 60 l 20 20 v 40",ac,6)+PATH("M 450 300 v 50 l -30 30",ac,6)
    +DOT(300,300,7,ac)+DOT(380,360,7,ac)+DOT(450,300,7,ac)+DOT(420,380,7,ac)
    +`<rect x="345" y="325" width="60" height="40" rx="5" fill="none" stroke="${ac}" stroke-width="7"/>`;
}

// --- IC-chip (generisk komponent-fallback) ---
function chip(ac,bg2){
  let ben=""; for(let i=0;i<5;i++){ const y=290+i*30;
    ben+=`<rect x="248" y="${y}" width="26" height="12" rx="3" fill="${ac}"/><rect x="476" y="${y}" width="26" height="12" rx="3" fill="${ac}"/>`; }
  return ben+`<rect x="274" y="278" width="202" height="154" rx="14" fill="${bg2}" stroke="${ac}" stroke-width="10"/>`
    +DOT(305,308,10,ac)+`<rect x="300" y="345" width="150" height="7" rx="3" fill="${ac}" opacity="0.5"/>`
    +`<rect x="300" y="368" width="110" height="7" rx="3" fill="${ac}" opacity="0.35"/>`;
}

// --- reaktor: fare-symbol ring ---
function reactor(ac){
  const tre=a=>`<path d="M ${CX} ${CY} L ${CX+Math.cos(a)*80} ${CY+Math.sin(a)*80} A 80 80 0 0 1 ${CX+Math.cos(a+2.09)*80} ${CY+Math.sin(a+2.09)*80} Z" fill="${ac}" opacity="0.8"/>`;
  return C(375,345,110,ac,9)+DOT(375,345,22,ac,)+[0,1,2].map(i=>tre(Math.PI/3+i*2.09)).join("");
}

// ---------- ROBOTTER: variationer over robothoved ----------
function robotBase(ac,bg2,opts={}){
  const { antenna=1, eyes="rect", mouth=1 } = opts;
  let s="";
  if(antenna) s+=L(375,252,375,208,ac,10)+DOT(375,196,13,ac);
  s+=`<rect x="262" y="252" width="226" height="188" rx="28" fill="${bg2}" stroke="${ac}" stroke-width="10"/>`;
  s+=`<rect x="236" y="310" width="26" height="64" rx="8" fill="${ac}" opacity="0.7"/><rect x="488" y="310" width="26" height="64" rx="8" fill="${ac}" opacity="0.7"/>`;
  if(eyes==="round") s+=C(326,332,20,ac,0,ac)+C(424,332,20,ac,0,ac);
  else if(eyes==="angry") s+=`<path d="M 300 315 L 352 335 L 300 355 Z" fill="${ac}"/><path d="M 450 315 L 398 335 L 450 355 Z" fill="${ac}"/>`;
  else s+=`<rect x="300" y="308" width="52" height="30" rx="8" fill="${ac}"/><rect x="398" y="308" width="52" height="30" rx="8" fill="${ac}"/>`;
  if(mouth) s+=`<rect x="318" y="384" width="114" height="12" rx="6" fill="${ac}" opacity="0.6"/>`;
  return s;
}

// ---------- DRONER: variationer over quadcopter ----------
function droneBase(ac,bg2,opts={}){
  const { rotors=4, body="rect" } = opts;
  const arm=(x2,y2)=>L(375,345,x2,y2,ac,12);
  const rot=(x,y)=>C(x,y,52,ac,8)+DOT(x,y,10,ac);
  let s="";
  const pos=[[263,233],[487,233],[263,457],[487,457]];
  for(let i=0;i<rotors;i++){ s+=arm(pos[i][0],pos[i][1]); }
  for(let i=0;i<rotors;i++){ s+=rot(pos[i][0],pos[i][1]); }
  if(body==="round") s+=C(375,345,40,ac,10,bg2)+DOT(375,345,13,ac);
  else s+=`<rect x="327" y="311" width="96" height="68" rx="16" fill="${bg2}" stroke="${ac}" stroke-width="10"/>`+DOT(375,345,13,ac);
  return s;
}

// ---------- VIRUS: variationer over blob med spikes ----------
function virusBase(ac,bg2,opts={}){
  const { spikes=8, r=96 } = opts;
  let sp="";
  for(let i=0;i<spikes;i++){ const a=Math.PI*2/spikes*i+Math.PI/spikes;
    const x1=CX+Math.cos(a)*r, y1=CY+Math.sin(a)*r, x2=CX+Math.cos(a)*(r+56), y2=CY+Math.sin(a)*(r+56);
    sp+=L(x1,y1,x2,y2,ac,13)+DOT(x2,y2,15,ac); }
  return sp+C(375,345,r,ac,10,bg2)+DOT(345,322,14,ac)+DOT(404,352,19,ac)+DOT(358,386,10,ac);
}

// ---------- SPELL: hexagon med kort-specifikt indre ----------
function spellHex(ac,bg,inner){
  const hex=[...Array(6)].map((_,i)=>{const a=Math.PI/3*i-Math.PI/6;
    return (CX+158*Math.cos(a)).toFixed(1)+","+(CY+158*Math.sin(a)).toFixed(1);}).join(" ");
  return POLY(hex,ac,10)+`<polygon points="${hex}" fill="${ac}" opacity="0.07"/>`+inner;
}
const bolt = (ac,bg) => `<path d="M 402 232 L 322 372 L 372 372 L 344 462 L 434 318 L 380 318 Z" fill="${ac}" stroke="${bg}" stroke-width="5" stroke-linejoin="round"/>`;
function spellGlyph(id,ac,bg){
  // kort-specifikke spell-glyffer; ellers lyn
  const g={
    s_diag:()=>meter(ac,bg,true),
    n_multimeter:()=>meter(ac,bg,false),
    s_magnet:()=>PATH("M 320 300 v 60 a 55 55 0 0 0 110 0 v -60",ac,16)+`<rect x="312" y="290" width="26" height="20" fill="${ac}"/><rect x="412" y="290" width="26" height="20" fill="${ac}"/>`,
    s_forstark:()=>PATH("M 300 400 L 360 300 L 420 400 M 320 365 h 80",ac,13),
    s_lynafleder:()=>L(375,250,375,440,ac,12)+PATH("M 345 280 l 30 -30 l 30 30",ac,9),
    s_kabels:()=>PATH("M 300 320 Q 375 280 450 320 T 300 380 T 450 380",ac,9),
    s_massep:()=>[0,1,2,3].map(i=>`<rect x="${300+(i%2)*80}" y="${300+Math.floor(i/2)*70}" width="60" height="52" rx="8" fill="none" stroke="${ac}" stroke-width="8"/>`).join(""),
    s_ransom:()=>`<rect x="315" y="330" width="120" height="90" rx="10" fill="none" stroke="${ac}" stroke-width="11"/>`+PATH("M 335 330 v -25 a 40 40 0 0 1 80 0 v 25",ac,11)+DOT(375,370,12,ac),
    hk_root:()=>bolt(ac,bg),
  };
  return (g[id]?g[id]():bolt(ac,bg));
}

// ---------- hoved-opslag ----------
const COMPONENT_ICONS = {
  u_spole:coil, u_modstand:resistor, u_led:led, u_diode:diode, u_kondens:capacitor,
  u_sikring:fuse, u_transistor:transistor, u_krystal:crystal, u_potmeter:potmeter,
  u_transform:transformer, u_relae:relay, u_kontakt:switchIcon, u_koleleg:heatsink,
  u_piezo:buzzer, u_printplade:pcb, n_breadboard:breadboard, n_oscillo:(ac,bg,bg2)=>meter(ac,bg2,true),
  n_multimeter:(ac,bg,bg2)=>meter(ac,bg2,false), n_fan:fan, n_surgeprot:(ac)=>fuse(ac),
  ov_reactor:reactor, ov_flux:supercap, u_superkond:supercap,
};

function iconFor(id, d, ac, bg, bg2, rnd){
  // 1) dedikeret komponent-ikon
  if(COMPONENT_ICONS[id]){
    const fn=COMPONENT_ICONS[id];
    return fn.length>=3 ? fn(ac,bg,bg2) : fn(ac);
  }
  // 2) spell — hexagon med (evt. specifik) glyf
  if(d.t==="spell") return spellHex(ac,bg,spellGlyph(id,ac,bg));
  // 3) robot-varianter
  if(d.tr==="Robot"){
    const big=(d.a||0)+(d.h||0)>=12;
    return robotBase(ac,bg2,{eyes:big?"angry":"rect",antenna:1});
  }
  // 4) drone-varianter
  if(d.tr==="Drone"){
    return droneBase(ac,bg2,{rotors:4,body:(d.a||0)>=4?"round":"rect"});
  }
  // 5) virus-varianter
  if(d.tr==="Virus"){
    const spikes = (d.a||0)>=4?10:8;
    return virusBase(ac,bg2,{spikes});
  }
  // 6) øvrige komponenter → chip
  if(d.tr==="Component") return chip(ac,bg2);
  // 7) stammeløse enheder → energikerne-stjerne
  return C(375,345,120,ac,8)+C(375,345,150,ac,3)+
    `<path d="M 375 205 L 405 315 L 515 345 L 405 375 L 375 485 L 345 375 L 235 345 L 345 315 Z" fill="${ac}" stroke="${bg}" stroke-width="5" stroke-linejoin="round"/>`;
}

function motifArt(d,ac,rnd,id){
  const sc=(0.94+rnd()*0.12).toFixed(3);
  const wrap=inner=>'<g transform="translate(375 345) scale('+sc+') translate(-375 -345)">'+inner+"</g>";
  return wrap(iconFor(id,d,ac,ARTC.bg,ARTC.bg2,rnd));
}
// Kortkunsten er deterministisk (seed = kort-id), så den kan caches globalt i
// stedet for pr. komponent-instans. Ellers regenereres 144 SVG'er hver gang
// biblioteksfanen mountes.
const _artProps=new Map();
function artProps(id,pattern){
  const k=id+"|"+(pattern?1:0);
  let v=_artProps.get(k);
  if(v===undefined){
    const d=CARDS[id], ac=artAccent(d), rnd=mulberry(seedOf(id));
    let out="";
    if(pattern) out+=circuitArt(mulberry(seedOf(id+"p")),190,165,560,535,ARTC.cu,7,0.3)
                    +circuitArt(mulberry(seedOf(id+"q")),190,165,560,535,ac,3,0.2);
    out+=motifArt(d,ac,rnd,id);
    v={__html:out}; _artProps.set(k,v);
  }
  return v;
}
const CardArt = memo(function CardArt({id,pattern,className}){
  return <svg className={"art"+(className?" "+className:"")} viewBox="172 148 406 414"
    dangerouslySetInnerHTML={artProps(id,pattern)}/>;
});

function ClassPick({value,onChange}){
  const K=CLASSES[value];
  return (
    <div>
      <div className="kvalg">
        {CLS_LIST.map(c=>{
          const k=CLASSES[c], aktiv=c===value;
          return (
            <button key={c} className={"kknap"+(aktiv?" aktiv":"")}
              style={aktiv?{borderColor:k.col,color:k.col}:null}
              onClick={()=>onChange(c)}>
              <Ico n={k.ico} size="24px"/><br/>{k.n.replace("The ","")}
            </button>);
        })}
      </div>
      <div className="kinfo"><PowerIcon p={K.power}/> <b>{K.power.n}</b> ({K.power.c}<Ico n="bolt"/>): {K.power.txt}</div>
    </div>
  );
}

function zigzag(a,b){
  const N=9, pts=[];
  const dx=b.y-a.y, dy=-(b.x-a.x), L=Math.hypot(dx,dy)||1;
  for(let i=0;i<=N;i++){
    const t=i/N;
    let x=a.x+(b.x-a.x)*t, y=a.y+(b.y-a.y)*t;
    if(i>0&&i<N){
      const j=(Math.random()-0.5)*32*Math.sin(Math.PI*t)+(Math.random()-0.5)*8;
      x+=dx/L*j; y+=dy/L*j;
    }
    pts.push({x,y});
  }
  const main=pts.map(p=>p.x.toFixed(1)+","+p.y.toFixed(1)).join(" ");
  const br=[];
  for(const idx of [3,6]){
    const p=pts[idx]; if(!p) continue;
    const ang=Math.random()*Math.PI*2, len=16+Math.random()*24;
    const mx=p.x+Math.cos(ang)*len*0.55+(Math.random()-0.5)*8;
    const my=p.y+Math.sin(ang)*len*0.55+(Math.random()-0.5)*8;
    br.push(p.x.toFixed(1)+","+p.y.toFixed(1)+" "+mx.toFixed(1)+","+my.toFixed(1)+" "
      +(p.x+Math.cos(ang)*len).toFixed(1)+","+(p.y+Math.sin(ang)*len).toFixed(1));
  }
  return {main,br};
}

// ---------- spilskærm ----------
// dekorativt lag rundt om banen (skruer, side-lister, CPU-emblem) — ren pynt
function BoardDecor(){
  const screw=(cls)=>(
    <svg className={"bd-screw "+cls} viewBox="0 0 30 30" width="26" height="26" aria-hidden="true">
      <circle cx="15" cy="15" r="13" fill="url(#bdscrew)" stroke="#3a5443" strokeWidth="1.5"/>
      <circle cx="15" cy="15" r="13" fill="none" stroke="rgba(255,255,255,.15)" strokeWidth="1" strokeDasharray="2 4"/>
      <path d="M8 15 H22 M15 8 V22" stroke="#20301f" strokeWidth="2.6" strokeLinecap="round"/>
      <defs><radialGradient id="bdscrew" cx="35%" cy="30%"><stop offset="0%" stopColor="#7d947f"/><stop offset="70%" stopColor="#44584a"/><stop offset="100%" stopColor="#2c3d32"/></radialGradient></defs>
    </svg>
  );
  return (
    <div className="boarddecor" aria-hidden="true">
      {screw("tl")}{screw("tr")}{screw("bl")}{screw("br")}
      <svg className="bd-rail left" viewBox="0 0 26 400" preserveAspectRatio="none" aria-hidden="true">
        <path d="M13 0 V400" stroke="#c9814a" strokeOpacity=".25" strokeWidth="2.5"/>
        <rect x="6" y="60" width="14" height="34" rx="3" fill="#173021" stroke="#3fa878" strokeOpacity=".5" strokeWidth="1.5"/>
        <path d="M9 68 h8 M9 76 h8 M9 84 h8" stroke="#3fa878" strokeOpacity=".55" strokeWidth="1.5"/>
        <circle cx="13" cy="150" r="4.5" fill="#0d1b13" stroke="#c9814a" strokeOpacity=".6" strokeWidth="1.5"/>
        <rect x="8" y="220" width="10" height="26" rx="5" fill="#20301f" stroke="#f0b23e" strokeOpacity=".45" strokeWidth="1.5"/>
        <path d="M13 226 v14" stroke="#f0b23e" strokeOpacity=".5" strokeWidth="1.5"/>
        <circle cx="13" cy="310" r="4.5" fill="#0d1b13" stroke="#3fa878" strokeOpacity=".55" strokeWidth="1.5"/>
      </svg>
      <svg className="bd-rail right" viewBox="0 0 26 400" preserveAspectRatio="none" aria-hidden="true">
        <path d="M13 0 V400" stroke="#3fa878" strokeOpacity=".22" strokeWidth="2.5"/>
        <circle cx="13" cy="90" r="4.5" fill="#0d1b13" stroke="#3fa878" strokeOpacity=".55" strokeWidth="1.5"/>
        <rect x="6" y="170" width="14" height="34" rx="3" fill="#173021" stroke="#c9814a" strokeOpacity=".5" strokeWidth="1.5"/>
        <path d="M9 178 h8 M9 186 h8 M9 194 h8" stroke="#c9814a" strokeOpacity=".55" strokeWidth="1.5"/>
        <rect x="8" y="270" width="10" height="26" rx="5" fill="#20301f" stroke="#8b6cff" strokeOpacity=".4" strokeWidth="1.5"/>
        <circle cx="13" cy="350" r="4.5" fill="#0d1b13" stroke="#f0b23e" strokeOpacity=".5" strokeWidth="1.5"/>
      </svg>
      <svg className="bd-cpu" viewBox="0 0 60 40" width="58" height="38" aria-hidden="true">
        <rect x="14" y="8" width="32" height="24" rx="4" fill="#12241a" stroke="#3fa878" strokeOpacity=".7" strokeWidth="1.6"/>
        <rect x="21" y="14" width="18" height="12" rx="2" fill="none" stroke="#3fa878" strokeOpacity=".45" strokeWidth="1.2"/>
        <circle cx="30" cy="20" r="2.4" fill="#5fe0a0" fillOpacity=".8"/>
        <path d="M18 4 v4 M26 4 v4 M34 4 v4 M42 4 v4 M18 32 v4 M26 32 v4 M34 32 v4 M42 32 v4 M10 14 h4 M10 22 h4 M46 14 h4 M46 22 h4"
          stroke="#c9814a" strokeOpacity=".6" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    </div>
  );
}
function ChatBox({kode,seat,navn,opNavn}){
  const [beskeder,setBeskeder]=useState([]);
  const [tekst,setTekst]=useState("");
  const [aaben,setAaben]=useState(false);
  const [uleste,setUleste]=useState(0);
  const nkey="chat:"+kode;
  const sidst=useRef(0);
  const listRef=useRef(null);
  // poll chat-beskeder
  useEffect(()=>{
    if(!kode) return; let stop=false;
    const tick=async()=>{
      const v=await stGet(nkey,true); if(stop||!v||!Array.isArray(v.msgs)) return;
      setBeskeder(prev=>{
        if(v.msgs.length!==prev.length){
          // tæl uleste fra modparten hvis chat er lukket
          const nye=v.msgs.slice(prev.length).filter(m=>m.s!==seat);
          if(nye.length && !aaben) setUleste(u=>u+nye.length);
          return v.msgs;
        }
        return prev;
      });
    };
    tick(); const t=setInterval(tick,1500);
    return ()=>{ stop=true; clearInterval(t); };
  },[kode,aaben,seat]);
  // scroll til bunden ved nye beskeder
  useEffect(()=>{ if(listRef.current) listRef.current.scrollTop=listRef.current.scrollHeight; },[beskeder,aaben]);
  const send=async()=>{
    const t=tekst.trim(); if(!t) return;
    if(t.length>200) return;
    const v=await stGet(nkey,true)||{msgs:[]};
    const msgs=Array.isArray(v.msgs)?v.msgs:[];
    msgs.push({s:seat,n:navn,t,ts:Date.now()});
    // hold historikken kort
    while(msgs.length>50) msgs.shift();
    await stSet(nkey,{msgs},true);
    setBeskeder(msgs); setTekst(""); Audio8.sfx.click();
  };
  const aabn=()=>{ setAaben(a=>!a); setUleste(0); };
  return (
    <div className={"chatbox"+(aaben?" open":"")}>
      {aaben && (
        <div className="chatpanel">
          <div className="chathead"><span><Ico n="chat"/> Chat</span><button className="chatx" onClick={aabn}><Ico n="cross"/></button></div>
          <div className="chatlist" ref={listRef}>
            {beskeder.length===0 && <div className="chattom">Say hi to {opNavn} </div>}
            {beskeder.map((m,i)=>(
              <div key={i} className={"chatmsg"+(m.s===seat?" mig":"")}>
                <span className="chatn">{m.s===seat?"You":(m.n||opNavn)}</span>
                <span className="chatt">{m.t}</span>
              </div>
            ))}
          </div>
          <div className="chatind">
            <input value={tekst} maxLength={200} placeholder="Type a message…"
              onChange={e=>setTekst(e.target.value)}
              onKeyDown={e=>{ if(e.key==="Enter"){ e.preventDefault(); send(); } }}/>
            <button className="chatsend" onClick={send}><Ico n="send"/></button>
          </div>
        </div>
      )}
      <button className="chatknap" onClick={aabn} title="Chat">
        <Ico n="chat"/>{uleste>0 && <span className="chatbadge">{uleste>9?"9+":uleste}</span>}
      </button>
    </div>
  );
}
function GameView({g,seat,myTurn,act,mode,onLeave,onConcede,onRematch,onDelete,pos,tut,setTut,kode}){
  const me=g.players[seat], op=g.players[1-seat];
  const K=CLASSES[me.cls]||CLASSES.tek;
  const step=mode==="tutorial"?TUT.steps[tut]:null;
  const [wob,setWob]=useState(false);
  const nope=()=>{ Audio8.sfx.error(); setWob(true); setTimeout(()=>setWob(false),450); };
  const hiB=k=>!!(step&&step.hi&&step.hi.includes(k));
  const tOK=(k,v)=>{
    if(!step) return true;
    const a=step.allow||{};
    if(a.any) return true;
    if(k==="play") return a.play===v;
    if(k==="atk") return a.atk===v;
    if(k==="power") return !!a.power;
    if(k==="end") return !!a.end;
    if(k==="tgt"){
      if(a.tgtHero) return v.u==null&&v.s===1-seat;
      if(a.tgtUnit){ const u=v.u!=null?refUnit(g,v):null; return !!u&&u.id===a.tgtUnit; }
      return true;
    }
    return false;
  };
  useEffect(()=>{
    if(mode!=="tutorial") return;
    let t=tut;
    while(TUT.steps[t]&&TUT.steps[t].done(g)) t++;
    if(t!==tut) setTut(t);
  },[g,tut,mode]);
  const [sel,setSel]=useState(null);
  const [tmode,setT]=useState(null);
  const [visLog,setVisLog]=useState(false);
  const [bekraeft,setBekraeft]=useState(false);
  const [ptoast,setPt]=useState(null);
  const [sparks,setSparks]=useState([]);
  const [reveal,setReveal]=useState(null); // kort vist stort midtfor før effekt
  const [shake,setShake]=useState(new Set());
  const fxDone=useRef(g.fxk||0);
  const lastK=useRef(g.last?g.last.k:0);
  const [turban,setTurban]=useState(0);
  const prevTurn=useRef(g.turn);

  const posOf=(s2,u2)=>{
    const key=u2!=null?u2:("h"+s2);
    const el=document.querySelector('[data-fx="'+key+'"]');
    if(el){ const r=el.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; }
    const r=pos&&pos.current&&pos.current[key];
    return r?{x:r.left+r.width/2,y:r.top+r.height/2}:null;
  };

  useEffect(()=>{
    const fx=g.fx||[];
    if((g.fxk||0)<fxDone.current) fxDone.current=0;
    const nye=fx.filter(e=>e.k>fxDone.current);
    if(fx.length) fxDone.current=fx[fx.length-1].k;
    if(!nye.length) return;
    const redMo=(typeof window!=="undefined"&&window.matchMedia
      &&window.matchMedia("(prefers-reduced-motion: reduce)").matches)||!SETTINGS.fxMotion;
    const T=tempo(); // langsomhed-faktor
    const gap=0.14*T; // afstand mellem sekventielle fx (før: 0.06)
    // Er der spillet et kort i denne batch? Så vis det stort midtfor først,
    // og udskyd de øvrige effekter så man når at læse hvad der blev spillet.
    const spilEv=nye.find(e=>e.t==="spil");
    let hold=0;
    if(spilEv && !redMo && SETTINGS.cardRevealMs>0){
      const ms=SETTINGS.cardRevealMs;
      hold=ms/1000;
      setReveal({id:spilEv.id,k:spilEv.k,ms});
      setTimeout(()=>setReveal(r=>(r&&r.k===spilEv.k)?null:r),ms);
    }
    // lyde skal følge den forsinkede effekt, ikke fyre med det samme
    const lyd=(fn,extra=0)=>{ const ms=(hold+extra)*1000; if(ms<=0) fn(); else setTimeout(fn,ms); };
    const add=[], sh=[];
    for(const e of nye){
      // "spil"-eventet selv skal ikke forsinkes (det ER showcasen); resten venter
      const d=(e.t==="spil"?0:hold)+add.length*gap, kk=e.k;
      if(e.t==="dmg"){ const P=posOf(e.s,e.u!==undefined?e.u:null); if(!P) continue;
        add.push({key:"t"+kk,type:"tal",x:P.x,y:P.y,txt:"−"+e.n,c:"var(--rod)",d});
        add.push({key:"b"+kk,type:"burst",x:P.x,y:P.y,n:7,c:"var(--amber)",d});
        sh.push(e.u!=null?e.u:"h"+e.s); lyd(Audio8.sfx.hit); }
      else if(e.t==="heal"){ const P=posOf(e.s,e.u); if(!P) continue;
        add.push({key:"t"+kk,type:"tal",x:P.x,y:P.y,txt:"+"+e.n,c:"var(--fos)",d});
        add.push({key:"r"+kk,type:"ring",x:P.x,y:P.y,c:"var(--fos)",d}); lyd(Audio8.sfx.heal); }
      else if(e.t==="boom"){ const P=posOf(e.s,e.u); if(!P) continue;
        add.push({key:"b"+kk,type:"burst",x:P.x,y:P.y,n:14,c:"var(--cu2)",stor:true,d}); lyd(Audio8.sfx.death);
        if(!redMo){ const fl=document.querySelector(".spilflade");
          if(fl&&fl.animate) fl.animate(
            [{transform:"translate(0,0)"},{transform:"translate(-5px,2px)"},{transform:"translate(4px,-2px)"},{transform:"translate(-2px,1px)"},{transform:"translate(0,0)"}],
            {duration:slowMs(260),delay:d*1000}); } }
      else if(e.t==="skjold"){ const P=posOf(e.s,e.u); if(!P) continue;
        add.push({key:"r"+kk,type:"ring",x:P.x,y:P.y,c:"var(--guld)",d}); }
      else if(e.t==="pop"){ const P=posOf(e.s,e.u); if(!P) continue;
        add.push({key:"b"+kk,type:"burst",x:P.x,y:P.y,n:6,c:"var(--fos)",d}); lyd(Audio8.sfx.unit); }
      else if(e.t==="cast"){ const P=posOf(e.s,null); if(!P) continue;
        add.push({key:"r"+kk,type:"ring",x:P.x,y:P.y,c:"var(--amber)",d}); lyd(Audio8.sfx.spell); }
      else if(e.t==="zap"&&e.art==="melee"){
        const P1=posOf(e.fs,e.fu), P2=posOf(e.ts,e.tu); if(!P1||!P2) continue;
        lyd(Audio8.sfx.attack);
        if(!redMo){ const el=document.querySelector('[data-fx="'+e.fu+'"]');
          if(el&&el.animate){ const lx=(P2.x-P1.x)*0.7, ly=(P2.y-P1.y)*0.7;
            el.animate([{transform:"translate(0,0)"},
              {transform:"translate("+lx+"px,"+ly+"px) scale(1.07)",offset:0.42},
              {transform:"translate(0,0)"}],
              {duration:slowMs(330),easing:"cubic-bezier(.34,.65,.3,1)",delay:d*1000}); } }
        add.push({key:"b"+kk,type:"burst",x:P2.x,y:P2.y,n:8,c:"var(--amber)",d:d+0.13*T}); }
      else if(e.t==="zap"){ const P1=posOf(e.fs,e.fu), P2=posOf(e.ts,e.tu); if(!P1||!P2) continue;
        add.push({key:"z"+kk,type:"zap",p1:P1,p2:P2,art:e.art,d}); lyd(Audio8.sfx.zap); }
      else if(e.t==="flyt"){
        // mind control: kortet er allerede flyttet i state; animer det fra
        // modstanderens side ned til din side med et glimt
        const P=posOf(e.til,e.uid); if(!P) continue;
        const fraY=posOf(e.fra,null);
        const startY=fraY?fraY.y:P.y-220;
        add.push({key:"mcr"+kk,type:"ring",x:P.x,y:P.y,c:"#c07bff",d:d+0.3*T});
        lyd(Audio8.sfx.zap);
        if(!redMo){ const el=document.querySelector('[data-fx="'+e.uid+'"]');
          if(el&&el.animate){
            el.animate([
              {transform:"translateY("+(startY-P.y)+"px) scale(1.15) rotate(-8deg)",filter:"brightness(2) drop-shadow(0 0 12px #c07bff)",offset:0},
              {transform:"translateY(0) scale(1) rotate(0)",filter:"brightness(1)",offset:1}
            ],{duration:slowMs(600),easing:"cubic-bezier(.3,.9,.4,1)",delay:d*1000}); } }
      }
      else if(e.t==="spil"){ const fra=posOf(e.s,e.hu)||posOf(e.s,null); if(!fra) continue;
        const til=e.ts!=null?posOf(e.ts,e.tu):null;
        const cx=(typeof window!=="undefined"?window.innerWidth/2:400);
        const cy=(typeof window!=="undefined"?window.innerHeight/2:400);
        // med showcase flyver kortet ind midtfor; uden flyver det direkte mod målet
        const mx=hold>0?cx:(til?til.x:cx), my=hold>0?cy:(til?til.y:cy);
        const kurve=typeof CSS!=="undefined"&&CSS.supports&&CSS.supports("offset-path",'path("M0 0 L1 1")');
        add.push({key:"f"+kk,type:"flyv",x:fra.x,y:fra.y,tx:mx-fra.x,ty:my-fra.y,id:e.id,d,
          op:kurve?('path("M '+fra.x.toFixed(0)+' '+fra.y.toFixed(0)+' Q '+((fra.x+mx)/2).toFixed(0)+' '
            +(Math.min(fra.y,my)-110).toFixed(0)+' '+mx.toFixed(0)+' '+my.toFixed(0)+'")'):null}); }
    }
    if(add.length){
      setSparks(x=>[...x,...add]);
      const keys=add.map(a=>a.key);
      setTimeout(()=>setSparks(x=>x.filter(f=>!keys.includes(f.key))),slowMs(1400)+hold*1000);
    }
    if(sh.length){ setTimeout(()=>{ setShake(new Set(sh)); setTimeout(()=>setShake(new Set()),slowMs(380)); }, hold*1000); }
  },[g]);

  useEffect(()=>{ const L=g.last;
    if(L&&L.k!==lastK.current){ lastK.current=L.k;
      if(L.s!==seat && SETTINGS.showEnemyBanner){ setPt(L); const t=setTimeout(()=>setPt(null),slowMs(2600)); return ()=>clearTimeout(t); } }
  },[g.last&&g.last.k]);
  useEffect(()=>{ if(g.turn!==prevTurn.current){ prevTurn.current=g.turn;
      if(myTurn&&g.status==="igang") setTurban(x=>x+1); } },[g.turn,myTurn]);
  useEffect(()=>{ if(!myTurn){ setT(null); } },[myTurn]);
  const sluttet=useRef(false);
  useEffect(()=>{
    if(g.status==="slut" && !sluttet.current){
      sluttet.current=true;
      if(g.winner===seat) Audio8.sfx.win(); else if(g.winner!==2) Audio8.sfx.lose();
    }
    if(g.status==="igang") sluttet.current=false;
  },[g.status,g.winner,seat]);
  // start baggrundsmusik når spillet er i gang
  useEffect(()=>{
    if(g.status==="igang" && SETTINGS.music){ Audio8.startMusic(); }
    return ()=>{ if(g.status!=="igang") Audio8.stopMusic(); };
  },[g.status]);

  const isTgt=r=>tmode&&tmode.list.some(x=>x.s===r.s&&x.u===r.u);
  const fire=r=>{ const run=tmode.run; setT(null); setSel(null); run(r); };

  const klikEnhed=(rs,u)=>{
    const ref={s:rs,u:u.uid};
    if(tmode){ if(isTgt(ref)){ if(!tOK("tgt",ref)){nope();return;} fire(ref); } else setT(null); return; }
    if(rs===seat&&myTurn){
      const ts=attackTargets(g,seat,u.uid);
      if(ts.length){
        if(!tOK("atk",u.id)){nope();return;}
        const label = ts.some(r=>r.u==null)
          ? "§sword§ "+CARDS[u.id].n+" attacking — tap a red target"
          : "§sword§ "+CARDS[u.id].n+" — Turbo can hit units only its first turn (hero next turn)";
        setT({atk:true,list:ts,label,run:r=>act(x=>unitAttack(x,seat,u.uid,r))}); return; }
    }
    setSel({kind:"info",id:u.id,unit:{s:rs,uid:u.uid}});
  };
  const klikHelt=(rs)=>{
    const ref={s:rs,u:null};
    if(tmode){ if(isTgt(ref)){ if(!tOK("tgt",ref)){nope();return;} fire(ref); } else setT(null); return; }
  };
  const spilKortNu=(c)=>{
    if(!c) return;
    if(!tOK("play",c.id)){ nope(); return; }
    const d=CARDS[c.id];
    if(d) (d.t==="spell"?Audio8.sfx.spell:Audio8.sfx.unit)();
    const {need,list}=targetsForCard(g,seat,c.id,null);
    if(need&&list.length>1){
      setSel(null);
      setT({list,label:"§play§ "+CARDS[c.id].n+" — choose a target",run:r=>act(x=>playCard(x,seat,c.uid,r))});
    } else if(need&&list.length===1){
      setSel(null); act(x=>playCard(x,seat,c.uid,list[0]));
    } else { setSel(null); act(x=>playCard(x,seat,c.uid,null)); }
  };
  const spilFraArk=()=>{ spilKortNu(sel); };
  // træk-og-slip: kort fra hånden op på brættet
  const [drag,setDrag]=useState(null); // {uid,id,x,y,over}
  const dragRef=useRef(null);
  const braetRef=useRef(null);
  const opAreaRef=useRef(null);
  const justDragged=useRef(false);
  const startDrag=(c,e)=>{
    if(!myTurn||tmode||!canPlay(g,seat,c.id)) return; // kun spilbare kort på egen tur
    // knappen capturer pointeren by default → frigiv den så window-listeners fyrer
    try{ e.currentTarget.releasePointerCapture(e.pointerId); }catch(_){}
    dragRef.current={kind:"play",uid:c.uid,id:c.id,x0:e.clientX,y0:e.clientY,moved:false};
  };
  const startAttackDrag=(u,e)=>{
    if(!myTurn||tmode) return;
    if(attackTargets(g,seat,u.uid).length===0) return; // kun enheder der kan angribe
    try{ e.currentTarget.releasePointerCapture(e.pointerId); }catch(_){}
    dragRef.current={kind:"atk",uid:u.uid,id:u.id,x0:e.clientX,y0:e.clientY,moved:false};
  };
  // find hvilket kamp-mål pointeren er over (fjendtlig enhed eller modstanderens helt)
  const targetAt=(x,y)=>{
    const el=document.elementFromPoint(x,y);
    if(el){
      const fxEl=el.closest("[data-fx]");
      if(fxEl){
        const key=fxEl.dataset.fx;
        if(key==="h"+(1-seat)) return {s:1-seat,u:null};       // direkte på modstanderens helt
        const u=op.board.find(z=>z.uid===key);                  // direkte på fjendtlig enhed
        if(u) return {s:1-seat,u:u.uid};
      }
    }
    // ikke over et konkret mål: er vi i modstanderens område? → sigt efter helten
    // (attackTargets-checket bagefter afviser hvis fx Grounded forhindrer det)
    const area=opAreaRef.current;
    if(area && drag && drag.kind==="atk"){
      const r=area.getBoundingClientRect();
      if(y < r.bottom+60){ // hele modstanderens halvdel + lidt luft under
        return {s:1-seat,u:null};
      }
    }
    return null;
  };
  // find ETHVERT mål under pointeren (egne+fjendtlige enheder + begge helte) — til spells
  const anyTargetAt=(x,y)=>{
    const el=document.elementFromPoint(x,y);
    if(!el) return null;
    const fxEl=el.closest("[data-fx]");
    if(!fxEl) return null;
    const key=fxEl.dataset.fx;
    if(key==="h0") return {s:0,u:null};
    if(key==="h1") return {s:1,u:null};
    for(const ps of [0,1]){ const u=g.players[ps].board.find(z=>z.uid===key); if(u) return {s:ps,u:u.uid}; }
    return null;
  };
  const overBoard=(y)=>{
    const bel=braetRef.current;
    if(!bel) return false;
    const r=bel.getBoundingClientRect();
    // generøs zone: fra et stykke over brættet til lidt under det
    return y < r.bottom+40 && y > r.top-120;
  };
  // er ref et gyldigt mål for det igangværende drag? (angreb ELLER targeting-spell)
  const isDragTgt=(ref)=>{
    if(!drag) return false;
    if(drag.kind==="atk") return attackTargets(g,seat,drag.uid).some(r=>r.s===ref.s&&r.u===ref.u);
    if(drag.kind==="play"&&drag.need){
      const {list}=targetsForCard(g,seat,drag.id,null);
      return list.some(r=>r.s===ref.s&&r.u===ref.u);
    }
    return false;
  };
  useEffect(()=>{
    const move=(e)=>{
      const d=dragRef.current; if(!d) return;
      const dx=e.clientX-d.x0, dy=e.clientY-d.y0;
      if(!d.moved && Math.hypot(dx,dy)<8) return; // lille bevægelse = stadig et klik
      d.moved=true;
      if(d.kind==="play"){
        const dc=CARDS[d.id];
        const {need}=targetsForCard(g,seat,d.id,null);
        if(dc.t==="spell"&&need){
          // targeting-spell: slippes direkte på et gyldigt mål
          const tgt=anyTargetAt(e.clientX,e.clientY);
          const valid=tgt && targetsForCard(g,seat,d.id,null).list.some(r=>r.s===tgt.s&&r.u===tgt.u);
          setDrag({kind:"play",need:true,uid:d.uid,id:d.id,x:e.clientX,y:e.clientY,tgt:valid?tgt:null});
        } else {
          // enhed (evt. med Install-mål) eller mål-løst spell → til brættet
          setDrag({kind:"play",uid:d.uid,id:d.id,x:e.clientX,y:e.clientY,over:overBoard(e.clientY)});
        }
      } else {
        const tgt=targetAt(e.clientX,e.clientY);
        const valid=tgt && attackTargets(g,seat,d.uid).some(r=>r.s===tgt.s&&r.u===tgt.u);
        setDrag({kind:"atk",uid:d.uid,id:d.id,x:e.clientX,y:e.clientY,tgt:valid?tgt:null});
      }
    };
    const up=(e)=>{
      const d=dragRef.current; dragRef.current=null;
      if(!d) return;
      if(d.moved){
        justDragged.current=true;
        setDrag(null);
        if(d.kind==="play"){
          const c=me.hand.find(x=>x.uid===d.uid); if(!c){ return; }
          const dc=CARDS[c.id];
          const {need}=targetsForCard(g,seat,c.id,null);
          if(dc.t==="spell"&&need){
            const tgt=anyTargetAt(e.clientX,e.clientY);
            const {list}=targetsForCard(g,seat,c.id,null);
            if(tgt && list.some(r=>r.s===tgt.s&&r.u===tgt.u)){
              act(x=>playCard(x,seat,c.uid,tgt)); // slip direkte på mål
            } else { spilKortNu(c); } // sluppet uden gyldigt mål → åbn mål-vælger
          } else if(overBoard(e.clientY)){ spilKortNu(c); }
        } else {
          const tgt=targetAt(e.clientX,e.clientY);
          if(tgt && attackTargets(g,seat,d.uid).some(r=>r.s===tgt.s&&r.u===tgt.u)){
            act(x=>unitAttack(x,seat,d.uid,tgt));
          }
        }
      }
      // hvis ikke moved: lad onClick håndtere det (klik-flowet)
    };
    window.addEventListener("pointermove",move);
    window.addEventListener("pointerup",up);
    window.addEventListener("pointercancel",up);
    return ()=>{ window.removeEventListener("pointermove",move); window.removeEventListener("pointerup",up); window.removeEventListener("pointercancel",up); };
  },[g,myTurn,tmode,me.hand]);
  const kraft=()=>{
    if(tmode){ setT(null); return; }
    if(!tOK("power")){ nope(); return; }
    const list=heroTargets(g,seat);
    if(!list.length){ act(()=>"No valid target for "+K.power.n+"."); return; }
    if(list.length===1){ act(x=>heroPower(x,seat,list[0])); return; }
    setT({list,label:K.power.ico+" "+K.power.n+" — "+K.power.txt,
      run:r=>act(x=>heroPower(x,seat,r))});
  };

  const slut=g.status==="slut";
  const kraftPris=powCost(g,seat);
  const kanKraft=myTurn&&!me.heroUsed&&me.cur>=kraftPris;
  // keyboard-shortcuts (konfigurerbare via settings)
  useEffect(()=>{
    const onKey=(e)=>{
      if(e.target&&/input|textarea|select/i.test(e.target.tagName)) return;
      const K=SETTINGS.keys, key=e.key;
      if(key===K.end){ e.preventDefault(); if(myTurn&&!slut&&tOK("end")){ Audio8.sfx.endturn(); act(x=>endTurn(x,seat)); } return; }
      if(key===K.cancel){ if(tmode){ setT(null); } else if(sel){ setSel(null); } else { setVisSettings(v=>!v); } return; }
      if(key===K.power||key===(K.power||"").toUpperCase()){ if(kanKraft){ kraft(); } return; }
      // kort 1-10
      for(let i=1;i<=10;i++){
        if(key===K["card"+i]){ e.preventDefault();
          const c=me.hand[i-1];
          if(c && myTurn && !slut){
            // allerede valgt dette kort? → spil det. Ellers: vælg (vis stort).
            if(sel && sel.kind==="hand" && sel.uid===c.uid){
              if(canPlay(g,seat,c.id)){ Audio8.sfx.click(); spilKortNu(c); }
              else { Audio8.sfx.error(); nope(); }
            } else {
              Audio8.sfx.click(); setT(null); setSel({kind:"hand",id:c.id,uid:c.uid});
            }
          }
          return;
        }
      }
    };
    window.addEventListener("keydown",onKey);
    return ()=>window.removeEventListener("keydown",onKey);
  },[g,myTurn,slut,tmode,sel,me.hand]);
  const kanAngribe=myTurn&&!slut&&!tmode&&me.board.filter(u=>attackTargets(g,seat,u.uid).length>0).length;
  // kan spilleren overhovedet foretage sig noget? (spille kort, angribe, bruge hero power)
  const kanSpilleKort=myTurn&&!slut&&me.hand.some(c=>canPlay(g,seat,c.id));
  const kanIntet=myTurn&&!slut&&!tmode&&!kanSpilleKort&&!kanAngribe&&!kanKraft;

  // nedtælling: når man intet kan gøre, tæl 5 sek ned og auto-slut turen.
  // TIK/TOK-lyd hvert halve sekund som et ur.
  const [nedtael,setNedtael]=useState(null);
  const [visSettings,setVisSettings]=useState(false);
  const nedRef=useRef(null);
  useEffect(()=>{
    if(kanIntet){
      setNedtael(5);
      let halve=10; // 10 halve sekunder = 5 sek
      let veksel=false;
      nedRef.current=setInterval(()=>{
        halve--;
        (veksel?Audio8.sfx.tok:Audio8.sfx.tik)(); veksel=!veksel;
        setNedtael(Math.ceil(halve/2));
        if(halve<=0){ clearInterval(nedRef.current);
          setTimeout(()=>{ if(tOK("end")){ Audio8.sfx.endturn(); act(x=>endTurn(x,seat)); } },0);
          setNedtael(null);
        }
      },500);
    } else {
      setNedtael(null);
      if(nedRef.current) clearInterval(nedRef.current);
    }
    return ()=>{ if(nedRef.current) clearInterval(nedRef.current); };
  },[kanIntet]);

  const [animUI,setAnimUI]=useState(SETTINGS.animMult!=null?SETTINGS.animMult:1);
  useEffect(()=>onSettings(s=>setAnimUI(s.animMult!=null?s.animMult:1)),[]);
  const tempoVar=ANIM_BASE*animUI;
  const [keys,setKeys]=useState(SETTINGS.keys);
  useEffect(()=>onSettings(s=>setKeys(s.keys)),[]);
  // historik-skinnen: åben som udgangspunkt på brede skærme, ellers via knappen
  const [visHist,setVisHist]=useState(()=>typeof window!=="undefined" && window.innerWidth>=820);

  return (
    <div className={"spilflade"+(tmode?" targeting":"")+(tmode&&tmode.atk?" atkmode":"")} style={{"--tempo":tempoVar}}>
      <BoardDecor/>
      {mode==="online" && kode && <ChatBox kode={kode} seat={seat} navn={me.name} opNavn={op.name}/>}
      {tmode && <button className={"banner"+(tmode.atk?" atk":"")} onClick={()=>setT(null)}><LogTekst t={tmode.label}/><span className="bx">· tap here to cancel</span></button>}
      {turban>0 && myTurn && !slut && <div key={turban} className="turban">YOUR TURN</div>}

      {/* modstander */}
      <div className="bar">
        <HeltPlade g={g} s={1-seat} me={false} tuthi={hiB("h1")} hilite={isTgt({s:1-seat,u:null})} shake={shake.has("h"+(1-seat))}
          dragtgt={isDragTgt({s:1-seat,u:null})}
          onClick={()=>klikHelt(1-seat)}/>
        <Pips p={op}/>
        <span style={{marginLeft:"auto",display:"flex",alignItems:"center"}}>
          {Array.from({length:Math.min(op.hand.length,9)}).map((_,i)=><span key={i} className="ryg"/>)}
          <span style={{marginLeft:8,color:"var(--dim)"}}><Ico n="deck"/>{op.deck.length}</span>
        </span>
      </div>
      <div className="spilmidt">
        {visHist && <HistRail g={g} seat={seat} navne={[g.players[0].name,g.players[1].name]}/>}
        <div className="braetwrap">
          <div className="braet op" ref={opAreaRef}>
            {op.board.length===0&&<span style={{color:"var(--dim)",fontFamily:"var(--mono)",fontSize:11}}>— empty board —</span>}
            {op.board.map(u=>
              <UnitTile key={u.uid} g={g} s={1-seat} u={u} mine={false} tuthi={hiB("eunit:"+u.id)} shake={shake.has(u.uid)}
                dragtgt={isDragTgt({s:1-seat,u:u.uid})}
                hilite={isTgt({s:1-seat,u:u.uid})} onClick={()=>klikEnhed(1-seat,u)}/>)}
          </div>

          <div className="midt">
            <span>Round {Math.max(1,Math.ceil(g.turn/2))}</span>
            <span style={{color:myTurn?"var(--fos)":"var(--dim)"}}><LogTekst t={slut?"Game over":(myTurn?"§bolt§ Your turn":"Waiting for "+op.name+"…")}/></span>
            <button className={"slutknap"+(hiB("end")?" tuthi":"")+(nedtael!=null?" haster":"")} disabled={!myTurn||slut}
              onClick={()=>{ if(!tOK("end")){nope();return;} Audio8.sfx.endturn(); act(x=>endTurn(x,seat)); }}>
              END TURN
              {nedtael!=null && <span className="nedtael">{nedtael}</span>}
            </button>
          </div>

          {kanAngribe>0 && mode!=="tutorial" &&
            <div className="atkhint"><Ico n="sword"/> Tap a unit with a sword badge, then tap what you want to attack</div>}
          <div className={"braet"+(drag&&drag.over?" dropzone":"")} ref={braetRef}>
            {me.board.length===0&&<span style={{color:"var(--dim)",fontFamily:"var(--mono)",fontSize:11}}>— empty board —</span>}
            {me.board.map(u=>
              <UnitTile key={u.uid} g={g} s={seat} u={u} mine={true} tuthi={hiB("unit:"+u.id)} shake={shake.has(u.uid)}
                ready={myTurn&&attackTargets(g,seat,u.uid).length>0}
                onPointerDown={(e)=>startAttackDrag(u,e)}
                dragtgt={isDragTgt({s:seat,u:u.uid})}
                hilite={isTgt({s:seat,u:u.uid})} onClick={()=>klikEnhed(seat,u)}/>)}
          </div>
        </div>
      </div>
      {/* mig */}
      <div className="bar min">
        <HeltPlade g={g} s={seat} me={true} hilite={isTgt({s:seat,u:null})} shake={shake.has("h"+seat)} dragtgt={isDragTgt({s:seat,u:null})} onClick={()=>klikHelt(seat)}/>
        <Pips p={me}/>
        <button className={"kraft"+(hiB("kraft")?" tuthi":"")} disabled={!kanKraft} onClick={kraft} title={K.power.n+" ("+kraftPris+" energy)"}><PowerIcon p={K.power}/></button>
        <span style={{marginLeft:"auto",color:"var(--dim)"}}><Ico n="deck"/>{me.deck.length}</span>
        <button style={{color:"var(--dim)",fontSize:16,padding:"0 4px"}} onClick={()=>setBekraeft(true)}><Ico n="flag"/></button>
      </div>
      <div className="haand">
        {me.hand.length===0&&<span style={{color:"var(--dim)",fontFamily:"var(--mono)",fontSize:11,alignSelf:"center"}}>hand is empty</span>}
        {me.hand.map((c,i)=>{
          const o=i-(me.hand.length-1)/2;
          const kan=myTurn&&canPlay(g,seat,c.id);
          const tast=i<10?(keys["card"+(i+1)]||""):"";
          const valgt=!!(sel&&sel.kind==="hand"&&sel.uid===c.uid);
          return (
            <div key={c.uid} className={"hslot"+(kan?" kan":"")+(valgt?" valgt":"")}>
              <MiniCard id={c.id} dfx={c.uid} tip={true} xcls={hiB("hand:"+c.id)?"tuthi":""} glow={kan}
                style={{"--o":o,"--a":Math.abs(o),opacity:drag&&drag.uid===c.uid?0.3:undefined}}
                onPointerDown={(e)=>startDrag(c,e)}
                onClick={()=>{ if(justDragged.current){justDragged.current=false;return;} if(tmode){setT(null);return;} setSel({kind:"hand",id:c.id,uid:c.uid}); }}/>
              {tast && <span className="hotkey" aria-hidden="true">{tast===" "?"␣":tast}</span>}
            </div>);})}
      </div>

      {step&&(
        <div className={"coach"+(wob?" wob":"")}>
          <span className="cava"><Ico n="robot" size="24px"/></span>
          <div className="ctxt"><LogTekst t={step.t}/><div className="cnum">{tut+1} / {TUT.steps.length}</div></div>
          <button className="cx" onClick={onLeave} title="Skip tutorial"><Ico n="cross"/></button>
        </div>)}
      {drag && drag.kind==="play" && <div className={"dragkort"+((drag.over||drag.tgt)?" over":"")} style={{left:drag.x,top:drag.y}}><MiniCard id={drag.id}/></div>}
      {drag && drag.kind==="atk" && <div className={"dragatk"+(drag.tgt?" hit":"")} style={{left:drag.x,top:drag.y}}><Ico n="sword"/></div>}
      {reveal && (
        <div className="revealwrap" key={reveal.k} style={{"--rms":reveal.ms+"ms"}}>
          <div className="revealkort">
            <MiniCard id={reveal.id}/>
            <div className="revealnavn">{CARDS[reveal.id]?CARDS[reveal.id].n:""}</div>
          </div>
        </div>
      )}
      <div className="fxlag">
        {sparks.map(f=>{
          const ds={animationDelay:f.d+"s"};
          if(f.type==="tal") return <div key={f.key} className="fxtal" style={{left:f.x,top:f.y,color:f.c,...ds}}>{f.txt}</div>;
          if(f.type==="ring") return <div key={f.key} className="fxring" style={{left:f.x,top:f.y,borderColor:f.c,color:f.c,...ds}}/>;
          if(f.type==="burst") return (
            <div key={f.key} className="fxburst" style={{left:f.x,top:f.y}}>
              {Array.from({length:f.n}).map((_,i)=>{
                const a=Math.PI*2*i/f.n+(i%2?0.35:0), r=(f.stor?62:36)+(i%3)*11;
                return <i key={i} style={{color:f.c,"--dx":(Math.cos(a)*r).toFixed(0)+"px","--dy":(Math.sin(a)*r).toFixed(0)+"px",...ds}}/>;
              })}
            </div>);
          if(f.type==="flyv") return f.op
            ? <div key={f.key} className="fxflyv kurve" style={{offsetPath:f.op}}><CardArt id={f.id}/></div>
            : <div key={f.key} className="fxflyv" style={{left:f.x,top:f.y,"--tx":f.tx+"px","--ty":f.ty+"px"}}><CardArt id={f.id}/></div>;
          if(f.type==="zap"){
            const Z=zigzag(f.p1,f.p2), c=f.art==="spell"?"var(--fos)":"var(--amber)";
            const vw=(typeof window!=="undefined"?window.innerWidth:1000);
            const vh=(typeof window!=="undefined"?window.innerHeight:800);
            return (
              <svg key={f.key} className={"fxzap"+(f.art==="spell"?" spell":"")} style={ds}
                viewBox={"0 0 "+vw+" "+vh} preserveAspectRatio="none">
                <polyline points={Z.main} fill="none" stroke={c} strokeWidth="3.5" strokeLinejoin="round"/>
                {Z.br.map((b,i)=><polyline key={i} points={b} fill="none" stroke={c} strokeWidth="2" opacity="0.7" strokeLinejoin="round"/>)}
                <polyline points={Z.main} fill="none" stroke="#ffffff" strokeWidth="1.3" opacity="0.9" strokeLinejoin="round"/>
              </svg>);
          }
          return null;
        })}
      </div>
      <button className={"histknap"+(visHist?" aktiv":"")} onClick={()=>setVisHist(v=>!v)}
        title="Played cards"><Ico n="cards"/></button>
      <button className="logknap" onClick={()=>setVisLog(v=>!v)}><Ico n={visLog?"cross":"scroll"}/></button>
      {visLog && (
        <div className="logpanel">
          <div className="lhoved">
            <span><Ico n="scroll"/> Combat log</span>
            <button className="lluk" onClick={()=>setVisLog(false)}><Ico n="cross"/></button>
          </div>
          <div className="lkrop">{g.log.slice().reverse().map((l,i)=><div key={i}><LogTekst t={l}/></div>)}</div>
        </div>
      )}

      {ptoast && <div className="optoast"><MiniCard id={ptoast.id}/><span style={{fontFamily:"var(--mono)",fontSize:12,color:"var(--dim)"}}><b style={{color:"var(--rod)"}}>{op.name} plays</b><br/><span style={{color:"var(--txt)",fontSize:14}}>{CARDS[ptoast.id]?CARDS[ptoast.id].n:"a card"}</span></span></div>}

      {visSettings && (
        <div className="slor" onClick={()=>setVisSettings(false)}>
          <div className="ark setingame" onClick={e=>e.stopPropagation()}>
            <SettingsScreen onBack={()=>setVisSettings(false)}/>
          </div>
        </div>
      )}

      {sel && (
        <div className="slor" onClick={()=>setSel(null)}>
          <div className="ark" onClick={e=>e.stopPropagation()}>
            <StorKort id={sel.id} unitInfo={sel.unit} g={g}/>
            {sel.kind==="hand" && (
              <button className="knap cu" disabled={!myTurn||!canPlay(g,seat,sel.id)} onClick={spilFraArk}>
                <Ico n="bolt"/> Play ({CARDS[sel.id].c} energy)
              </button>)}
            <button className="knap" onClick={()=>setSel(null)}>Close</button>
          </div>
        </div>
      )}

      {bekraeft && (
        <div className="slor" onClick={()=>setBekraeft(false)}>
          <div className="ark" onClick={e=>e.stopPropagation()}>
            <p className="rt">Do you want to concede?</p>
            <button className="knap cu" onClick={()=>{setBekraeft(false);onConcede();}}><Ico n="flag"/> Yes, concede</button>
            <button className="knap" onClick={()=>setBekraeft(false)}>No, keep playing</button>
          </div>
        </div>
      )}

      {slut && mode!=="rogue" && (
        <div className={"slor"+(g.winner===seat?" sejr":"")}>
          {g.winner===seat && <VictoryFX/>}
          <div className="ark" style={{textAlign:"center"}}>
            <div className={"logo"+(g.winner===seat?" vlogo":"")+(slut&&g.winner!==seat&&g.winner!==2?" neonwrap":"")} style={{fontSize:g.winner===seat?46:34}}>
              {g.winner===2?"DRAW":(g.winner===seat?"VICTORY":<BrokenNeon text="BREAKDOWN"/>)}
              {g.winner===seat && <span className="vbadge"><Ico n="bolt"/></span>}
            </div>
            <p className="rt" style={{color:"var(--dim)"}}>
              {g.winner===2?mode==="tutorial"?"Tutorial complete — you know the basics! Try the bot next.":"Both circuits burned out.":(g.winner===seat?(mode==="tutorial"?"Tutorial complete — you know the basics! Try the bot next.":"Your opponent’s circuit burned out."):"Your circuit burned out.")}
            </p>
            {mode==="online" ? (
              <button className="knap cu" disabled={g.rematch[seat]} onClick={onRematch}>
                {g.rematch[seat]?"Waiting for opponent…":<><Ico n="cycle"/> {g.rematch[1-seat]?"Rematch (opponent is ready!)":"Rematch"}</>}
              </button>
            ) : (
              mode==="tutorial"?null:<button className="knap cu" onClick={onRematch}><Ico n="cycle"/> Rematch</button>
            )}
            <button className="knap" onClick={onLeave}>Back to menu</button>
            {mode==="online" && <button className="knap" onClick={onDelete}>Delete game & leave</button>}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- deckbygger ----------
function SettingsScreen({onBack}){
  const [s,setS]=useState(SETTINGS);
  const [rebind,setRebind]=useState(null); // hvilken tast der ventes på
  useEffect(()=>onSettings(setS),[]);
  const upd=(patch)=>{ applySettings(patch); setS({...SETTINGS}); };
  // live-preview af lyd/musik-volumen
  useEffect(()=>{ Audio8.setMusicVol(s.musicVol); Audio8.setSfxVol(s.sfxVol); },[s.musicVol,s.sfxVol]);
  useEffect(()=>{
    if(!rebind) return;
    const onKey=(e)=>{
      e.preventDefault();
      const val=e.key;
      upd({keys:{...SETTINGS.keys,[rebind]:val}});
      setRebind(null);
    };
    window.addEventListener("keydown",onKey,{once:true});
    return ()=>window.removeEventListener("keydown",onKey);
  },[rebind]);
  const animIdx=Math.max(0,ANIM_SNAPS.indexOf(snapTo(s.animMult!=null?s.animMult:1,ANIM_SNAPS)));
  const revIdx=Math.max(0,REVEAL_SNAPS.indexOf(snapTo(s.cardRevealMs||3000,REVEAL_SNAPS)));
  const multTxt=m=>(m===0.5?"½×":m===0.75?"¾×":m===1.5?"1½×":m+"×");
  const keyName=(k)=> k===" "?"Space": k==="Escape"?"Esc": (k||"").length===1?k.toUpperCase():k;
  const shortcuts=[
    ["end","End turn"],["power","Hero power"],["cancel","Cancel / deselect"],
    ["card1","Play hand card 1"],["card2","Card 2"],["card3","Card 3"],["card4","Card 4"],["card5","Card 5"],
    ["card6","Card 6"],["card7","Card 7"],["card8","Card 8"],["card9","Card 9"],["card10","Card 10"],
  ];
  return (
    <div className="ark setwrap">
      <div className="logo" style={{fontSize:26,marginBottom:14}}><Ico n="gear"/> SETTINGS</div>

      <div className="setsec">
        <div className="seth">Game speed</div>
        <p className="setnote">Length of all animations. ×1 is the standard pace, ×2 takes twice as long — slower is easier to follow.</p>
        <div className="setrow">
          <input type="range" min="0" max={ANIM_SNAPS.length-1} step="1" value={animIdx}
            onChange={e=>upd({animMult:ANIM_SNAPS[+e.target.value]})} className="slider snaps"/>
          <span className="setval">{multTxt(ANIM_SNAPS[animIdx])}</span>
        </div>
        <div className="setpreset">
          {ANIM_SNAPS.map((m,i)=>(
            <button key={m} className={"minknap"+(animIdx===i?" aktiv":"")} onClick={()=>upd({animMult:m})}>{multTxt(m)}</button>
          ))}
        </div>
        <p className="setnote" style={{marginTop:14}}>How long a played card is shown in the centre of the screen before its effect happens.</p>
        <div className="setrow">
          <input type="range" min="0" max={REVEAL_SNAPS.length-1} step="1" value={revIdx}
            onChange={e=>upd({cardRevealMs:REVEAL_SNAPS[+e.target.value]})} className="slider snaps"/>
          <span className="setval">{(REVEAL_SNAPS[revIdx]/1000)+"s"}</span>
        </div>
        <div className="setpreset">
          {REVEAL_SNAPS.map((ms,i)=>(
            <button key={ms} className={"minknap"+(revIdx===i?" aktiv":"")} onClick={()=>upd({cardRevealMs:ms})}>{ms/1000}s</button>
          ))}
        </div>
      </div>

      <div className="setsec">
        <div className="seth">Sound</div>
        <label className="settoggle"><input type="checkbox" checked={s.sound} onChange={e=>{upd({sound:e.target.checked}); if(e.target.checked) Audio8.sfx.click();}}/> Sound effects</label>
        <div className="setrow sub"><span>SFX volume</span>
          <input type="range" min="0" max="100" value={Math.round(s.sfxVol*100)} disabled={!s.sound}
            onChange={e=>upd({sfxVol:(+e.target.value)/100})} onMouseUp={()=>Audio8.sfx.play()} className="slider sm"/>
        </div>
        <label className="settoggle"><input type="checkbox" checked={s.music} onChange={e=>{upd({music:e.target.checked}); if(e.target.checked) Audio8.startMusic(); else Audio8.stopMusic();}}/> 8-bit background music</label>
        <div className="setrow sub"><span>Music volume</span>
          <input type="range" min="0" max="100" value={Math.round(s.musicVol*100)} disabled={!s.music}
            onChange={e=>upd({musicVol:(+e.target.value)/100})} className="slider sm"/>
        </div>
      </div>

      <div className="setsec">
        <div className="seth">Visuals</div>
        <label className="settoggle"><input type="checkbox" checked={s.fxMotion} onChange={e=>upd({fxMotion:e.target.checked})}/> Particle & shake effects</label>
        <label className="settoggle"><input type="checkbox" checked={s.showEnemyBanner} onChange={e=>upd({showEnemyBanner:e.target.checked})}/> Show a banner for opponent’s actions</label>
      </div>

      <div className="setsec">
        <div className="seth">Keyboard shortcuts</div>
        <p className="setnote">Click a key to rebind it, then press the new key.</p>
        <div className="keygrid">
          {shortcuts.map(([id,label])=>(
            <div key={id} className="keyrow">
              <span className="keylabel">{label}</span>
              <button className={"keybtn"+(rebind===id?" waiting":"")} onClick={()=>setRebind(id)}>
                {rebind===id?"press a key…":keyName(s.keys[id])}
              </button>
            </div>
          ))}
        </div>
        <button className="minknap" style={{marginTop:10}} onClick={()=>upd({keys:{...DEFAULT_SETTINGS.keys}})}>Reset shortcuts</button>
      </div>

      <div className="setsec">
        <button className="minknap" onClick={()=>{applySettings({...DEFAULT_SETTINGS}); setS({...SETTINGS});}}>Reset all to defaults</button>
      </div>

      <button className="knap cu" onClick={onBack}>← Back to menu</button>
    </div>
  );
}
// Ét kort i gitteret. memo + primitive props => et klik på ét kort rendrer kun
// dét kort om, ikke alle 144. Uden det blev hvert klik til ~150 SVG-genskrivninger.
const BibKort = memo(function BibKort({id,count,laast,onAdd,onRem,onInfo,kanHover}){
  const ind=e=>{ if(kanHover) onInfo(id,e.currentTarget); };
  const ud=()=>{ if(kanHover) onInfo(null,null); };
  return (
    <div className={"bibkort"+(laast?" laast":"")+(count?" ideck":"")}
      onMouseEnter={ind} onMouseLeave={ud}
      onContextMenu={e=>{ e.preventDefault(); if(count) onRem(id); }}>
      <MiniCard id={id} count={count||null}
        onClick={()=>{ if(kanHover) onAdd(id); else onInfo(id,null); }}/>
      {laast && <span className="laas"><Ico n="lock"/></span>}
      {count>0 && <span className="idmark">{count}</span>}
    </div>
  );
});

// Svævende infopanel. Ligger position:fixed uden for gitteret, så det aldrig
// klippes af scroll-containeren.
// Let info-panel til hover i biblioteket. Viser ALT: navn, pris, type, stats,
// nøgleord og korttekst — men uden den tunge kredsløbs-SVG som StorKort tegner.
// Det var netop den store SVG, browseren måtte genparse ved hver eneste hover.
const CardInfoPanel = memo(function CardInfoPanel({id}){
  const d=CARDS[id];
  const kwl=[];
  if(d.t==="unit"){ if(d.kw) for(const k of d.kw){ if(KWSVG[k]) kwl.push(k); } if(d.sig) kwl.push("sig"); }
  return (
    <div className="hovinfo tema" style={themeVars(d)}>
      <div className="hi-h"><span className="hi-c">{d.c}<Ico n="bolt"/></span><span className="hi-n">{d.n}</span></div>
      <div className="hi-t">{d.t==="unit"?"Unit":"Spell"}{d.tr?" · "+d.tr:""}{d.cls&&CLASSES[d.cls]?" · "+CLASSES[d.cls].n:""}{d.r==="L"?<> · <Ico n="legendary"/> Legendary</>:d.r==="R"?<> · <Ico n="rare"/> Rare</>:null}</div>
      {d.t==="unit" && <div className="hi-s"><Ico n="sword"/> {d.a}&nbsp;&nbsp;<Ico n="heart"/> {d.h}</div>}
      {d.txt && <div className="hi-x"><GlossText txt={d.txt}/></div>}
      {kwl.length>0 && <div className="hi-kw">
        {kwl.map(k=>{ const navn=k==="sig"?"Signal Strength":KWINFO[k].n;
          return <div key={k} className="hi-kwrow"><KwBadge k={k}/><div className="hi-kwtxt"><b>{navn}</b><span>{GLOSSARY[navn]||""}</span></div></div>; })}
      </div>}
    </div>
  );
});
function HoverKort({id,pos}){
  if(!id||!pos) return null;
  return <div className="hovpop" style={{top:pos.top,left:pos.left}}><CardInfoPanel id={id}/></div>;
}

function DeckBuilder({decks,gemDecks,onBack,flash,unlocked}){
  const [cards,setCards]=useState([]);
  const [navn,setNavn]=useState("My deck");
  const [dbCls,setDbCls]=useState("tek");
  const [tab,setTab]=useState("bib");
  const [fC,setFC]=useState(null);
  const [fT,setFT]=useState(null);
  const [q,setQ]=useState("");
  const [sel,setSel]=useState(null);     // detaljeark (touch)
  const [hov,setHov]=useState(null);     // {id,pos} svævepanel (mus)
  const kanHover=useMemo(()=>typeof window!=="undefined"
    && window.matchMedia && window.matchMedia("(hover: hover)").matches,[]);

  const cnt=useMemo(()=>{ const m={}; for(const id of cards) m[id]=(m[id]||0)+1; return m; },[cards]);

  const filt=useMemo(()=>{
    const ql=q.trim().toLowerCase();
    return COLL.filter(id=>{
      const d=CARDS[id];
      if(d.cls&&d.cls!==dbCls) return false;
      if(fC!=null && (fC===7?d.c<7:d.c!==fC)) return false;
      if(fT && d.t!==fT) return false;
      if(ql && !(d.n.toLowerCase().includes(ql) || (d.txt||"").toLowerCase().includes(ql))) return false;
      return true;
    }).sort((a,b)=>CARDS[a].c-CARDS[b].c||CARDS[a].n.localeCompare(CARDS[b].n,"en"));
  },[dbCls,fC,fT,q]);

  // grupperet efter energipris — langt nemmere at overskue end én lang strøm
  const grupper=useMemo(()=>{
    const g=new Map();
    for(const id of filt){ const c=CARDS[id].c; if(!g.has(c)) g.set(c,[]); g.get(c).push(id); }
    return [...g.entries()];
  },[filt]);

  // handlerne holdes stabile via ref, så BibKort ikke gen-rendrer på hver ændring
  const R=useRef({});
  R.current.add=id=>{
    if(unlocked && !unlocked.has(id)) return flash("§lock§ "+CARDS[id].n+" is locked — win games to unlock it!");
    const max=CARDS[id].r==="L"?1:2;
    if((cnt[id]||0)>=max) return flash("Max "+max+"× "+CARDS[id].n+".");
    if(cards.length>=DECKSIZE) return flash("The deck is full ("+DECKSIZE+").");
    setCards(c=>[...c,id]);
  };
  R.current.rem=id=>setCards(c=>{ const i=c.indexOf(id); if(i<0) return c; const n=c.slice(); n.splice(i,1); return n; });
  R.current.info=(id,el)=>{
    if(!kanHover){ setSel(id); return; }
    if(!id||!el) return setHov(null);
    const b=el.getBoundingClientRect();
    const vw=window.innerWidth, vh=window.innerHeight, W=232, H=300;
    const left = b.right+12+W<vw ? b.right+12 : Math.max(8,b.left-12-W);
    setHov({id,pos:{left,top:Math.max(8,Math.min(b.top-30,vh-H-8))}});
  };
  const onAdd =useCallback(id=>R.current.add(id),[]);
  const onRem =useCallback(id=>R.current.rem(id),[]);
  const onInfo=useCallback((id,el)=>R.current.info(id,el),[]);

  const add=id=>R.current.add(id), rem=id=>R.current.rem(id);
  const gem=()=>{
    const err=validateDeck(cards,dbCls); if(err) return flash(err);
    const n=navn.trim()||"My deck";
    const nx=decks.filter(d=>d.name!==n).concat([{name:n,cls:dbCls,cards:cards.slice()}]);
    gemDecks(nx); flash("§save§ “"+n+"” saved.");
  };
  const autofyld=()=>{
    const c=cards.slice(); const t={...cnt};
    const pool=COLL.filter(id=>(!CARDS[id].cls||CARDS[id].cls===dbCls) && (!unlocked||unlocked.has(id)));
    let guard=0;
    while(c.length<DECKSIZE&&guard++<4000){
      const id=pick(pool); const max=CARDS[id].r==="L"?1:2;
      if((t[id]||0)>=max) continue; t[id]=(t[id]||0)+1; c.push(id);
    }
    setCards(c);
  };
  const unik=useMemo(()=>Object.keys(cnt).sort((a,b)=>CARDS[a].c-CARDS[b].c||CARDS[a].n.localeCompare(CARDS[b].n,"en")),[cnt]);
  const kurve=[0,1,2,3,4,5,6,7].map(c=>cards.filter(id=>c===7?CARDS[id].c>=7:CARDS[id].c===c).length);
  const kMax=Math.max(1,...kurve);
  const fejl=cards.length===DECKSIZE?validateDeck(cards,dbCls):null;

  // Gitrene bygges kun om når deres data faktisk ændrer sig (filter/antal), IKKE
  // når hover-panelet skifter kort. Ved hover får React samme element-reference
  // og springer hele gitter-undertræet over — det er nøglen til at hover er gratis.
  const bibGitter=useMemo(()=>(
    <>
      {grupper.length===0 && <p className="rt" style={{color:"var(--dim)"}}>No cards match those filters.</p>}
      {grupper.map(([c,ids])=>
        <div key={c} className="kostgruppe">
          <div className="kosthd"><span className="kostpip">{c}</span><Ico n="bolt"/><i>{ids.length}</i></div>
          <div className="gitter">
            {ids.map(id=>
              <BibKort key={id} id={id} count={cnt[id]||0} laast={!!(unlocked&&!unlocked.has(id))}
                onAdd={onAdd} onRem={onRem} onInfo={onInfo} kanHover={kanHover}/>)}
          </div>
        </div>)}
    </>
  ),[grupper,cnt,unlocked,onAdd,onRem,onInfo,kanHover]);

  const deckGitter=useMemo(()=>(
    <div className="gitter">
      {unik.map(id=>
        <BibKort key={id} id={id} count={cnt[id]} laast={false}
          onAdd={onRem} onRem={onRem} onInfo={onInfo} kanHover={kanHover}/>)}
    </div>
  ),[unik,cnt,onRem,onInfo,kanHover]);

  return (
    <div className="pane bred" onScroll={()=>hov&&setHov(null)}>
      <button className="tilbage" onClick={onBack}>← Back</button>
      <div className="logo" style={{fontSize:26}}>CARD LIBRARY</div>
      <div className="ulinie">{COLL.length} cards{unlocked?" · "+unlocked.size+" unlocked":""} · deck: {cards.length}/{DECKSIZE}</div>
      <ClassPick value={dbCls} onChange={c=>{
        if(c===dbCls) return;
        setDbCls(c);
        const rest=cards.filter(id=>!CARDS[id].cls||CARDS[id].cls===c);
        if(rest.length!==cards.length){ setCards(rest); flash("Removed cards from another class."); }
      }}/>
      <div className="faner">
        <button className={"fane"+(tab==="bib"?" aktiv":"")} onClick={()=>{setTab("bib");setHov(null);}}>Library</button>
        <button className={"fane"+(tab==="deck"?" aktiv":"")} onClick={()=>{setTab("deck");setHov(null);}}>
          My Deck ({cards.length}/{DECKSIZE})</button>
      </div>

      {/* begge faner bliver monteret — at unmounte 120 kort ved hvert tab-skift
          kostede ~160 ms. Nu er skiftet en ren display-toggle. */}
      <div className="fanepane" style={{display:tab==="bib"?"block":"none"}}>
        <input placeholder="Search name or text…" value={q} onChange={e=>setQ(e.target.value)}/>
        <div className="filterraek">
          {[0,1,2,3,4,5,6,7].map(c=>
            <button key={c} className={"fknap"+(fC===c?" aktiv":"")} onClick={()=>setFC(fC===c?null:c)}>{c===7?"7+":c}<Ico n="bolt"/></button>)}
          <button className={"fknap"+(fT==="unit"?" aktiv":"")} onClick={()=>setFT(fT==="unit"?null:"unit")}>Units</button>
          <button className={"fknap"+(fT==="spell"?" aktiv":"")} onClick={()=>setFT(fT==="spell"?null:"spell")}>Spells</button>
          {(fC!=null||fT||q) && <button className="fknap ryd" onClick={()=>{setFC(null);setFT(null);setQ("");}}>Clear filters</button>}
        </div>
        <p className="hint">{kanHover?"Hover for details · click to add · right-click to remove":"Tap a card for details"}</p>
        {bibGitter}
      </div>

      <div className="fanepane" style={{display:tab==="deck"?"block":"none"}}>
        <div className="kurve">
          {kurve.map((v,i)=>
            <div key={i} className="soejle" style={{height:(v/kMax*100)+"%"}}><i>{v||""}</i><b>{i===7?"7+":i}</b></div>)}
        </div>
        <div style={{height:18}}/>
        {unik.length===0
          ? <p className="rt" style={{color:"var(--dim)"}}>The deck is empty. Add cards from the library, or tap Auto-fill.</p>
          : <>
            <p className="hint">{kanHover?"Hover for details · click to remove one":"Tap a card for details"}</p>
            {deckGitter}
          </>}
        {fejl && <p className="rt" style={{color:"var(--rod)"}}>{fejl}</p>}
        <div className="raek" style={{marginTop:14}}>
          <button className="knap" style={{marginTop:0}} onClick={autofyld}><Ico n="dice"/> Auto-fill</button>
          <button className="knap" style={{marginTop:0}} onClick={()=>setCards([])}>Clear</button>
        </div>
        <div className="etiket">Save deck</div>
        <div className="raek">
          <input value={navn} onChange={e=>setNavn(e.target.value)} placeholder="Deck name"/>
          <button className="knap cu" style={{marginTop:0,width:"auto",flex:"none"}} onClick={gem}><Ico n="save"/> Save</button>
        </div>
        {decks.length>0 && <>
          <div className="etiket">Saved decks</div>
          {decks.map((d,i)=>
            <div key={i} className="dlinje">
              <span><Ico n={(CLASSES[d.cls||"tek"]||CLASSES.tek).ico}/> {d.name}</span>
              <button className="x" style={{color:"var(--fos)"}} onClick={()=>{setCards(d.cards.slice());setNavn(d.name);setDbCls(d.cls||"tek");flash("Loaded “"+d.name+"”.");}}>Load</button>
              <button className="x" onClick={()=>gemDecks(decks.filter((_,j)=>j!==i))}>Delete</button>
            </div>)}
        </>}
      </div>

      {hov && <HoverKort id={hov.id} pos={hov.pos}/>}

      {sel && (
        <div className="slor" onClick={()=>setSel(null)}>
          <div className="ark" onClick={e=>e.stopPropagation()}>
            <StorKort id={sel}/>
            <button className="knap cu" onClick={()=>add(sel)}>＋ Add to deck ({cnt[sel]||0}/{CARDS[sel].r==="L"?1:2})</button>
            {(cnt[sel]||0)>0 && <button className="knap" onClick={()=>rem(sel)}>− Remove one</button>}
            <button className="knap" onClick={()=>setSel(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- regler ----------
function Regler({onBack}){
  return (
    <div className="pane">
      <button className="tilbage" onClick={onBack}>← Back</button>
      <div className="logo" style={{fontSize:26}}>RULES</div>
      <h2 className="ov">The goal</h2>
      <p className="rt">Both technicians start with 30 health. Burn out your opponent’s circuit (bring them to 0) before they do the same to you.</p>
      <h2 className="ov">Energy <Ico n="bolt"/></h2>
      <p className="rt">You start with 1 energy and gain +1 per turn (max 10). Cards cost energy to play. The Soldering Iron (your hero power) costs 2 energy and deals 1 damage to an enemy or repairs 2 on something friendly — once per turn.</p>
      <p className="rt"><b>The capacitor bank <Ico n="battery"/>:</b> Unspent energy at the end of your turn is stored (up to 3) and added to your energy next turn. Some cards fill the bank directly.</p>
      <p className="rt"><b>Overheat:</b> Powerful cards lock part of your energy on the following turn. Cheap effect now, the bill arrives later.</p>
      <h2 className="ov">Combat</h2>
      <p className="rt">Units can’t attack the turn they are played (unless they have Turbo). When a unit attacks another, they damage each other simultaneously. Max 6 units on the board and 9 cards in hand. If your deck runs out, you take escalating fatigue damage.</p>
      <h2 className="ov">Classes</h2>
      <p className="rt">Each player picks a class. Class cards (marked with a colored dot) can only go in that class’s decks; all other cards are neutral.</p>
      {CLS_LIST.map(c=>{const k=CLASSES[c];return (
        <p className="rt" key={c}><b style={{color:k.col}}><Ico n={k.ico}/> {k.n}</b> — <PowerIcon p={k.power}/> {k.power.n} ({k.power.c}<Ico n="bolt"/>): {k.power.txt}</p>);})}
      <h2 className="ov">Keywords</h2>
      <table className="kwtab"><tbody>
        {Object.entries(KWINFO).map(([id,k])=><tr key={k.n}><td><KwBadge k={id}/> {k.n}</td><td>{k.d}</td></tr>)}
        <tr><td><Ico n="signal"/> Signal Strength +X</td><td>Your Spells deal X extra damage.</td></tr>
        <tr><td>Install</td><td>Effect that triggers when the card is played from your hand.</td></tr>
        <tr><td>Breakdown</td><td>Effect that triggers when the unit is destroyed.</td></tr>
        <tr><td>Chain</td><td>Bonus if you have already played another card this turn.</td></tr>
        <tr><td>Reset</td><td>Removes all card text and all buffs from a unit.</td></tr>
      </tbody></table>
      <h2 className="ov">Deck</h2>
      <p className="rt">Exactly {DECKSIZE} cards. Max 2 of each card, max 1 of each legendary. The second player starts with an extra card and a Powerbank (0 energy: gain 1 energy).</p>
      <h2 className="ov">Online</h2>
      <p className="rt">Create a game and share the 4-character code with your opponent — you both need <b>the same artifact link</b> open. The game syncs automatically with a couple of seconds’ delay. Note: game data is kept in the artifact’s shared storage and can in principle be seen by other users of the artifact.</p>
      <h2 className="ov">Credits</h2>
      <p className="rt">Interface icons from <b>game-icons.net</b>, used under the{" "}
        <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noreferrer" className="lnk">Creative Commons Attribution 3.0 licence</a>{" "}
        and modified (background removed, recoloured).</p>
      <p className="rt">Icons made by:{" "}
        {ICON_CREDITS.map((a,i)=>(
          <span key={a.n}>{i>0?", ":""}
            <a href={a.u} target="_blank" rel="noreferrer" className="lnk">{a.n}</a>
          </span>))}.
      </p>
      <p className="rt" style={{color:"var(--dim)",fontSize:12}}>Card artwork, keyword badges and the soldering-iron hero power are original work.</p>
    </div>
  );
}

// ---------- hovedapp ----------
function UnlockPop({id,onClose}){
  const d=CARDS[id];
  return (
    <div className="slor sejr" onClick={onClose}>
      <VictoryFX/>
      <div className="ark" style={{textAlign:"center"}} onClick={e=>e.stopPropagation()}>
        <div className="unlocktitel">{d.r==="L"?<><Ico n="legendary"/> LEGENDARY UNLOCKED</>:<><Ico n="rare"/> NEW CARD UNLOCKED</>}</div>
        <div className="unlockkort"><StorKort id={id}/></div>
        <p className="rt" style={{color:"var(--dim)",marginTop:8}}>Added to your collection — build it into a deck!</p>
        <button className="knap cu" onClick={onClose}>Nice!</button>
      </div>
    </div>
  );
}
/* ---------- MELTDOWN RUN — skærm ---------- */
function RunMap({run}){
  if(!run||!run.map) return null;
  const NAV={battle:"Battle",elite:"Elite",repair:"Repair bay",boss:"THE MELTDOWN"};
  const ICO={battle:"sword",elite:"skull",repair:"wrench",boss:"fire"};
  return (
    <div className="rmap">
      {run.map.map((t,i)=>{
        const st = i<run.node?"klaret" : i===run.node?"nu" : "kommende";
        return (
          <div key={i} className={"rnode "+st+" "+t}>
            <span className="rn-ico"><Ico n={i<run.node?"cross":ICO[t]}/></span>
            <span className="rn-lbl">{NAV[t]}</span>
            {i<run.map.length-1 && <span className="rn-line"/>}
          </div>);
      })}
    </div>
  );
}
function RunHUD({run}){
  return (
    <div className="rhud">
      <span className={"rhp"+(run.hp<=10?" lav":"")}><Ico n="heart"/> {run.hp}/{run.max}</span>
      <span className="rdeck"><Ico n="deck"/> {run.deck.length}</span>
      <span className="rcls"><Ico n={CLASSES[run.cls].ico}/> {CLASSES[run.cls].n.replace("The ","")}</span>
      <span className="rwins"><Ico n="trophy"/> {run.node}/{RUN_LEN}</span>
      {run.upg.length>0 && <span className="rupg">
        {run.upg.map((u,i)=><span key={i} title={UPGRADES[u].n}><Ico n={UPGRADES[u].ico}/></span>)}
      </span>}
    </div>
  );
}
function RunView({run,fase,navn,onStartBattle,onPickCard,onPickUpgrade,onLeave,onNewRun}){
  const [kort,setKort]=useState(null); // preview i grid
  const [valgKort,setValgKort]=useState(null);  // valgt belønningskort
  const [valgUpg,setValgUpg]=useState(null);     // valgt opgradering
  const kanHover=useMemo(()=>typeof window!=="undefined" && window.matchMedia && window.matchMedia("(hover: hover)").matches,[]);
  const belon=useMemo(()=>fase==="belon"?runBelonning(run):[],[fase,run]);
  const opgrad=useMemo(()=>fase==="opgrad"?runOpgraderinger(run):[],[fase,run]);
  useEffect(()=>{ setValgKort(null); setValgUpg(null); },[fase,run.node]);

  const type=run.map[run.node];
  const typeNavn={battle:"Battle",elite:"Elite battle",repair:"Repair bay",boss:"THE MELTDOWN"}[type];

  return (
    <div className="pane bred runpane">
      <button className="tilbage" onClick={onLeave}>← Abandon run</button>
      <div className="logo" style={{fontSize:30}}>MELTDOWN</div>
      <RunHUD run={run}/>
      <RunMap run={run}/>

      {fase==="kort" && <>
        <div className={"rnbanner "+type}>
          <Ico n={type==="boss"?"fire":type==="elite"?"skull":type==="repair"?"wrench":"sword"} size="22px"/>
          <div>
            <b>{typeNavn}</b>
            <small>{type==="boss"?"The final opponent. 46 HP, extra energy, full card pool."
              : type==="elite"?"Tougher opponent — but victory grants an upgrade."
              : type==="repair"?"You patched up between fights (+12 HP)."
              : "A standard opponent. Win to draft a card."}</small>
          </div>
        </div>
        <button className="knap cu big" onClick={onStartBattle}>
          <Ico n="bolt"/> {type==="boss"?"Face the Meltdown":"Enter battle"} (node {run.node+1}/{RUN_LEN})</button>
        <div className="etiket">Your deck ({run.deck.length})</div>
        <div className="gitter">
          {dedupSorted(run.deck).map(([id,n])=>
            <div key={id} className="bibkort" onMouseEnter={e=>kanHover&&setKort({id,pos:hpos(e.currentTarget)})} onMouseLeave={()=>setKort(null)}
              onClick={()=>!kanHover&&setKort({id,pos:null})}>
              <MiniCard id={id} count={n>1?n:null} onClick={()=>{}}/>
            </div>)}
        </div>
      </>}

      {fase==="belon" && <>
        <div className="rvhead"><Ico n="trophy" size="26px"/><h2>Victory — draft a card</h2></div>
        <p className="hint">Pick one card to add to your deck.</p>
        <div className="rrewards">
          {belon.map(id=>
            <button key={id} className={"rcard"+(valgKort===id?" valgt":"")} onClick={()=>setValgKort(id)}>
              <StorKort id={id}/>
            </button>)}
        </div>
        <button className="knap cu big" disabled={!valgKort} onClick={()=>onPickCard(valgKort)}>
          {valgKort?<>Add “{CARDS[valgKort].n}” & continue</>:"Select a card"}</button>
        <button className="knap" onClick={()=>onPickCard(belon[0])} style={{opacity:.7}}>Skip (take {CARDS[belon[0]]?.n})</button>
      </>}

      {fase==="opgrad" && <>
        <div className="rvhead"><Ico n="gear" size="26px"/><h2>Choose an upgrade</h2></div>
        <p className="hint">Permanent for the rest of this run.</p>
        <div className="rupgrades">
          {opgrad.map(u=>{
            const U=UPGRADES[u];
            return (
              <button key={u} className={"ucard"+(valgUpg===u?" valgt":"")} onClick={()=>setValgUpg(u)}>
                <span className="u-ico"><Ico n={U.ico} size="30px"/></span>
                <b>{U.n}</b>
                <span>{U.d}</span>
              </button>);
          })}
        </div>
        <button className="knap cu big" disabled={!valgUpg} onClick={()=>onPickUpgrade(valgUpg)}>
          {valgUpg?<>Install {UPGRADES[valgUpg].n}</>:"Select an upgrade"}</button>
      </>}

      {fase==="sejr" && <>
        <div className="rvhead sejr"><Ico n="trophy" size="40px"/><h2>RUN COMPLETE</h2></div>
        <p className="rt" style={{textAlign:"center"}}>You survived all {RUN_LEN} nodes and shut down the Meltdown. Nicely done.</p>
        <button className="knap cu big" onClick={onNewRun}><Ico n="cycle"/> New run</button>
        <button className="knap" onClick={onLeave}>Back to menu</button>
      </>}

      {fase==="tabt" && <>
        <div className="rvhead tabt"><BrokenNeon text="BREAKDOWN"/></div>
        <p className="rt" style={{textAlign:"center"}}>Your circuits gave out at node {run.node+1} of {RUN_LEN}. {run.node>=6?"Deep run!":run.node>=3?"Not bad.":"Try a different draft."}</p>
        <button className="knap cu big" onClick={onNewRun}><Ico n="cycle"/> New run</button>
        <button className="knap" onClick={onLeave}>Back to menu</button>
      </>}

      {kort && <HoverKort id={kort.id} pos={kort.pos||{left:(typeof window!=="undefined"?window.innerWidth/2-126:120),top:80}}/>}
    </div>
  );
}
function dedupSorted(list){
  const m={}; for(const id of list) m[id]=(m[id]||0)+1;
  return Object.keys(m).sort((a,b)=>CARDS[a].c-CARDS[b].c||CARDS[a].n.localeCompare(CARDS[b].n,"en")).map(id=>[id,m[id]]);
}
function hpos(el){
  const b=el.getBoundingClientRect(), vw=window.innerWidth, W=232;
  const left=b.right+12+W<vw?b.right+12:Math.max(8,b.left-12-W);
  return {left,top:Math.max(8,Math.min(b.top-30,window.innerHeight-308))};
}

function RunClassPick({onPick,onBack}){
  return (
    <div className="pane runpane">
      <button className="tilbage" onClick={onBack}>← Back</button>
      <div className="logo" style={{fontSize:30}}>MELTDOWN</div>
      <p className="rt" style={{color:"var(--dim)",textAlign:"center"}}>
        A roguelike gauntlet: {RUN_LEN} escalating battles, one life. Your HP carries between fights, your deck grows with every win, and elites hand out permanent upgrades. Pick a class to begin.</p>
      <div className="rclspick">
        {CLS_LIST.map(c=>{
          const k=CLASSES[c];
          return (
            <button key={c} className="rcls-card" style={{borderColor:k.col}} onClick={()=>onPick(c)}>
              <span className="u-ico" style={{color:k.col}}><Ico n={k.ico} size="34px"/></span>
              <b style={{color:k.col}}>{k.n.replace("The ","")}</b>
              <span className="rcls-pow"><PowerIcon p={k.power}/> {k.power.n}</span>
              <small>{k.power.txt}</small>
            </button>);
        })}
      </div>
    </div>
  );
}

export default function App(){
  const [skaerm,setSkaerm]=useState("indlaeser");
  const [navn,setNavn]=useState("Technician");
  const [decks,setDecks]=useState([]);
  const [profil,setProfil]=useState(null);
  const [unlockPop,setUnlockPop]=useState(null); // nyligt oplåst kort-id
  const prevStatus=useRef(null);
  const [g,setG]=useState(null);
  const [mode,setMode]=useState(null);
  const [seat,setSeat]=useState(0);
  const [lobby,setLobby]=useState(null);
  const [toast,setToast]=useState(null);
  const [handoff,setHandoff]=useState(false);
  const [joinKode,setJoinKode]=useState("");
  const [deckValg,setDeckValg]=useState("auto");
  const [deckValg2,setDeckValg2]=useState("auto");
  const [cls,setClsS]=useState("tek");
  const [cls2,setCls2]=useState("tek");
  const [tut,setTut]=useState(0);
  const [run,setRun]=useState(null);       // aktiv roguelike-run (null = ingen)
  const [runFase,setRunFase]=useState(null); // "kort" | "kamp" | "belon" | "opgrad" | "slut"
  const cid=useRef(null);
  const kode=useRef(null);
  const gRef=useRef(null); gRef.current=g;
  const seatRef=useRef(0); seatRef.current=seat;
  const modeRef=useRef(null); modeRef.current=mode;
  const saveQ=useRef(Promise.resolve());
  const toastT=useRef(null);
  const rematchGuard=useRef(-1);
  const posRef=useRef({});
  const applyG=g2=>{
    try{
      const m={};
      document.querySelectorAll("[data-fx]").forEach(el=>{ m[el.dataset.fx]=el.getBoundingClientRect(); });
      posRef.current=m;
    }catch(e){}
    setG(g2);
  };

  const onlineOK=!!store&&!store.isLocal;
  const flash=t=>{ setToast(t); clearTimeout(toastT.current); toastT.current=setTimeout(()=>setToast(null),2600); };

  useEffect(()=>{ (async()=>{
    await loadSettings();
    const n=await stGet("ks-navn",false); if(n) setNavn(n);
    const d=await stGet("ks-decks",false); if(Array.isArray(d)) setDecks(d);
    // spillerprofil: indlæs eller opret. Migrering: kort der allerede ligger i
    // gemte decks forbliver oplåste (så gamle decks ikke går i stykker), og
    // nye spillere får 2 gratis Rares som velkomst.
    let pf=await stGet("ks-profil",false);
    if(!pf){
      pf={...DEFAULT_PROFIL, unlocked:[]};
      const fraDecks=new Set();
      if(Array.isArray(d)) for(const dk of d) for(const id of (dk.cards||[])) if(CARDS[id]&&CARDS[id].r) fraDecks.add(id);
      pf.unlocked=[...fraDecks];
      const u=unlockedSetAf(pf);
      for(let i=0;i<2;i++){ const nyt=pickUnlock(u); if(nyt){ pf.unlocked.push(nyt); u.add(nyt); } }
      await stSet("ks-profil",pf,false);
    }
    setProfil(pf);
    const k=await stGet("ks-cls",false); if(k&&CLASSES[k]) setClsS(k);
    let c=await stGet("ks-cid",false);
    if(!c){ c="c"+Math.random().toString(36).slice(2,10); await stSet("ks-cid",c,false); }
    cid.current=c;
    setSkaerm("menu");
  })(); },[]);

  // kort-oplåsning: vind en kamp (solo/online) → lås et nyt kort op
  useEffect(()=>{
    const st=g?g.status:null;
    const foer=prevStatus.current; prevStatus.current=st;
    if(st!=="slut"||foer!=="igang") return;
    if(mode!=="solo"&&mode!=="online") return;
    const minSeat=mode==="solo"?0:seatRef.current;
    if(!profil) return;
    const pf={...profil, games:(profil.games||0)+1};
    if(g.winner===minSeat){
      pf.wins=(pf.wins||0)+1;
      const u=unlockedSetAf(pf);
      const nyt=pickUnlock(u);
      if(nyt){ pf.unlocked=[...(pf.unlocked||[]),nyt]; setUnlockPop(nyt); Audio8.sfx.win(); }
    }
    setProfil(pf); stSet("ks-profil",pf,false);
  },[g&&g.status]);

  const gemNavn=v=>{ setNavn(v); stSet("ks-navn",v,false); };
  const setCls=v=>{ setClsS(v); setDeckValg("auto"); stSet("ks-cls",v,false); };
  const gemDecks=v=>{ setDecks(v); stSet("ks-decks",v,false); };

  const pushSave=(state)=>{
    const c=kode.current; if(!c) return;
    saveQ.current=saveQ.current.then(()=>stSet("spil:"+c,state,true)).catch(()=>{});
  };
  const act=fn=>{
    const cur=gRef.current; if(!cur) return null;
    const g2=clone(cur);
    const err=fn(g2);
    if(err){ flash(err); return null; }
    g2.seq=(g2.seq||0)+1;
    applyG(g2);
    if(modeRef.current==="online") pushSave(g2);
    return g2;
  };

  // polling (online)
  useEffect(()=>{
    if(mode!=="online"||!kode.current) return;
    let stop=false;
    const tick=async()=>{
      const c=kode.current; if(!c||stop) return;
      const v=await stGet("spil:"+c,true);
      if(stop) return;
      if(!v){
        if(gRef.current||lobby){ flash("The game was closed."); tilMenu(); }
        return;
      }
      if(v.status==="venter"){ setLobby(v); return; }
      const cur=gRef.current;
      if(!cur||(v.seq||0)>(cur.seq||0)){
        if(cur&&cur.status==="slut"&&v.status==="slut"&&cur.rematch&&v.rematch
           &&cur.rematch[seatRef.current]&&!v.rematch[seatRef.current]){
          v.rematch[seatRef.current]=true; v.seq=(v.seq||0)+1; pushSave(v);
        }
        setLobby(null); applyG(v);
      }
    };
    tick();
    const t=setInterval(tick,2000);
    return ()=>{ stop=true; clearInterval(t); };
  },[mode,skaerm]);

  // online revanche: sæde 0 initialiserer når begge er klar
  useEffect(()=>{
    if(mode!=="online"||!g||g.status!=="slut") return;
    if(seat===0&&g.rematch[0]&&g.rematch[1]&&rematchGuard.current!==g.seq){
      rematchGuard.current=g.seq;
      const ng=mkState({mode:"online",code:kode.current,
        names:[g.players[0].name,g.players[1].name],
        cids:[g.players[0].cid,g.players[1].cid],
        decks:[g.players[0].list,g.players[1].list],
        classes:[g.players[0].cls,g.players[1].cls]});
      ng.seq=(g.seq||0)+1;
      applyG(ng); pushSave(ng);
    }
  },[g,mode,seat]);

  const findDeck=(valg,k,fri)=>{
    const pool=fri?null:(profil?[...unlockedSetAf(profil)]:null);
    if(valg==="auto") return autoDeck(k,pool);
    const d=decks.find(x=>x.name===valg&&(x.cls||"tek")===k);
    return d?d.cards.slice():autoDeck(k,pool);
  };

  const opretOnline=async()=>{
    if(!onlineOK) return flash("Online play is not available in this edition.");
    const deckIds=findDeck(deckValg,cls);
    const err=validateDeck(deckIds,cls); if(err) return flash(err);
    const c=codeGen(); kode.current=c;
    const lob={v:1,status:"venter",code:c,seq:1,host:{name:navn,cid:cid.current,deck:deckIds,cls}};
    const ok=await stSet("spil:"+c,lob,true);
    if(!ok) return flash("Couldn’t create the game.");
    stSet("seat:"+c,0,false);
    setMode("online"); setSeat(0); setLobby(lob); setG(null); setSkaerm("spil");
  };
  const deltagOnline=async()=>{
    if(!onlineOK) return flash("Online play is not available in this edition.");
    const c=joinKode.trim().toUpperCase();
    if(c.length!==4) return flash("The code is 4 characters.");
    const v=await stGet("spil:"+c,true);
    if(!v) return flash("No game found with code "+c+".");
    if(v.status==="venter"){
      if(v.host.cid===cid.current){
        kode.current=c; setMode("online"); setSeat(0); setLobby(v); setG(null); setSkaerm("spil"); return;
      }
      const deckIds=findDeck(deckValg,cls);
      const err=validateDeck(deckIds,cls); if(err) return flash(err);
      const ng=mkState({mode:"online",code:c,names:[v.host.name,navn],
        cids:[v.host.cid,cid.current],decks:[v.host.deck,deckIds],
        classes:[v.host.cls||"tek",cls]});
      ng.seq=(v.seq||1)+1;
      kode.current=c; setMode("online"); setSeat(1); setLobby(null); setG(ng); setSkaerm("spil");
      stSet("seat:"+c,1,false);
      pushSave(ng);
    } else {
      let s=v.players.findIndex(p=>p.cid===cid.current);
      if(s<0){ const st=await stGet("seat:"+c,false); if(st===0||st===1) s=st; }
      if(s<0) return flash("That game is already in progress between two other players.");
      kode.current=c; setMode("online"); setSeat(s); setLobby(null); setG(v); setSkaerm("spil");
    }
  };
  const startTutorial=()=>{
    kode.current=null; setMode("tutorial"); setTut(0);
    applyG(TUT.mk(navn)); setSkaerm("spil");
  };
  const startLokal=()=>{
    const d1=findDeck(deckValg,cls), d2=findDeck(deckValg2,cls2);
    let err=validateDeck(d1,cls)||validateDeck(d2,cls2); if(err) return flash(err);
    const ng=mkState({mode:"lokal",names:["Player 1","Player 2"],cids:["p1","p2"],
      decks:[d1,d2],classes:[cls,cls2]});
    kode.current=null; setMode("lokal"); setG(ng); setHandoff(true); setSkaerm("spil");
  };
  const tilMenu=()=>{ setG(null); setLobby(null); setMode(null); kode.current=null; setHandoff(false); setTut(0); setSkaerm("menu"); };

  const seatNu = mode==="lokal" ? (g?g.active:0) : ((mode==="tutorial"||mode==="rogue") ? 0 : seat);
  const minTur = !!g && g.status==="igang" && g.active===seatNu && (mode!=="lokal"||!handoff);

  const doAct=fn=>{
    const g2=act(fn);
    if(g2&&mode==="lokal"&&g2.status==="igang"&&g2.active!==seatNu) setHandoff(true);
  };
  const opgiv=()=>{
    act(x=>{ if(x.status!=="igang") return "The game is already over.";
      x.status="slut"; x.winner=1-seatNu; log(x,"§flag§ "+x.players[seatNu].name+" pulls the plug."); return null; });
  };
  const revanche=()=>{
    if(mode==="online"){ act(x=>{ x.rematch[seat]=true; return null; }); return; }
    const ng=mkState({mode,names:[g.players[0].name,g.players[1].name],
      cids:[g.players[0].cid,g.players[1].cid],
      decks:[g.players[0].list,g.players[1].list],
      classes:[g.players[0].cls,g.players[1].cls]});
    setG(ng); if(mode==="lokal") setHandoff(true);
  };
  const startSolo=()=>{
    const d1=findDeck(deckValg,cls), d2=findDeck(deckValg2,cls2,true);
    let err=validateDeck(d1,cls)||validateDeck(d2,cls2); if(err) return flash(err);
    const ng=mkState({mode:"solo",names:[(navn||"Technician").trim()||"Technician","The Bot"],
      cids:[cid.current||"p1","bot"],decks:[d1,d2],classes:[cls,cls2]});
    kode.current=null; setMode("solo"); setSeat(0); setHandoff(false); setG(ng); setSkaerm("spil");
  };
  const botSteps=useRef(0);
  useEffect(()=>{
    if((mode!=="solo"&&mode!=="rogue")||!g||g.status!=="igang") return;
    if(g.active!==1){ botSteps.current=0; return; }
    const t=setTimeout(()=>{
      doAct(x=>{
        if(x.status!=="igang"||x.active!==1) return null;
        if(botSteps.current++>40 || !botAction(x,1)) return endTurn(x,1);
        return null;
      });
    }, slowMs(botSteps.current===0?950:800));
    return ()=>clearTimeout(t);
  },[g,mode]);

  // ---- Meltdown Run ----
  const runStart=(rcls)=>{
    const r=runNyt(rcls);
    setRun(r); setMode(null); setG(null); setRunFase("kort"); setSkaerm("run");
  };
  const runStartKamp=()=>{
    const ng=runKamp(run,(navn||"Technician").trim()||"Technician");
    kode.current=null; setMode("rogue"); setSeat(0); setHandoff(false);
    setRunFase("kamp"); applyG(ng); setSkaerm("spil");
  };
  // fanger kampens udfald i rogue-mode (kører før den generelle unlock-effekt pga. mode-tjek)
  const runResult=useRef(-1);
  useEffect(()=>{
    if(mode!=="rogue"||!g) return;
    if(g.status!=="slut") return;
    if(runResult.current===g.seq) return; runResult.current=g.seq;
    const vandt=g.winner===0;
    const hp=g.players[0].hp;
    setTimeout(()=>{
      setRun(r=>{
        if(!r) return r;
        const nr={...r};
        const t=r.map[r.node], sidste=t==="boss";
        if(vandt){
          runSejr(nr,hp,t==="elite"||sidste);
          if(sidste){ setRunFase("sejr"); }
          else setRunFase("belon");
        } else {
          nr.status="tabt";
          setRunFase("tabt");
        }
        return nr;
      });
      setMode(null); setG(null); setSkaerm("run");
    }, slowMs(1200));
  },[g,mode]);
  const runVaelgKort=(id)=>{
    setRun(r=>({...r, deck:r.deck.concat([id])}));
    const t=run.map[run.node];
    if(t==="elite"||t==="boss") setRunFase("opgrad");
    else runNaeste();
  };
  const runVaelgOpgrad=(u)=>{
    setRun(r=>runTilfoej({...r,upg:r.upg.slice()},u));
    runNaeste();
  };
  const runNaeste=()=>{
    setRun(r=>{
      const nr={...r, node:r.node+1};
      if(nr.node>=RUN_LEN){ setRunFase("sejr"); return nr; }
      if(nr.map[nr.node]==="repair"){ runRepair(nr); }
      setRunFase("kort");   // næste node: vis kort-oversigt/klar-knap
      return nr;
    });
  };
  const runForlad=()=>{ setRun(null); setRunFase(null); setG(null); setMode(null); setSkaerm("menu"); };

  useEffect(()=>{
    if(mode!=="tutorial"||!g||g.status!=="igang"||g.active!==1) return;
    const t=setTimeout(()=>{
      doAct(x=>{
        if(x.status!=="igang"||x.active!==1) return null;
        if(TUT.opp[x.turn]) TUT.opp[x.turn](x);
        return endTurn(x,1);
      });
    },1100);
    return ()=>clearTimeout(t);
  },[g,mode]);
  const sletSpil=async()=>{ if(kode.current) await stDel("spil:"+kode.current,true); tilMenu(); };

  const deckMuligheder=(v,setV,k)=>(
    <select value={v} onChange={e=>setV(e.target.value)}>
      <option value="auto">Auto deck (random)</option>
      {decks.filter(d=>(d.cls||"tek")===k).map(d=><option key={d.name} value={d.name}>{d.name}</option>)}
    </select>
  );

  let indhold=null;
  if(skaerm==="indlaeser"){
    indhold=<div className="centrer"><div className="logo">CARD<b>WARE</b> CRASH</div><div className="ulinie">booting…</div></div>;
  }
  else if(skaerm==="menu"){
    indhold=(
      <div className="pane">
        <div style={{textAlign:"center",marginTop:14}}>
          <div className="logo">CARD<b>WARE</b> CRASH</div>
          <div className="ulinie">// 2-player electronics card game · 134 cards · 3 classes</div>
        </div>
        <div className="etiket">Your name</div>
        <input value={navn} maxLength={16} onChange={e=>gemNavn(e.target.value)}/>
        <div className="etiket">Your class</div>
        <ClassPick value={cls} onChange={setCls}/>
        <div className="etiket">Your deck</div>
        {deckMuligheder(deckValg,setDeckValg,cls)}
        <div className="etiket">Opponent (bot / player 2)</div>
        <ClassPick value={cls2} onChange={v=>{setCls2(v);setDeckValg2("auto");}}/>
        <div style={{height:8}}/>
        {deckMuligheder(deckValg2,setDeckValg2,cls2)}
        <div className="etiket">Solo</div>
        <button className="knap rogueknap" onClick={()=>{ setRun(null); setRunFase(null); setSkaerm("run"); }}>
          <Ico n="fire"/> Meltdown Run<small>Roguelike gauntlet — {RUN_LEN} escalating battles, upgrades, one life</small></button>
        <button className="knap cu" onClick={startSolo}><Ico n="robot"/> Play vs the bot<small>Built-in opponent — great for learning the cards</small></button>
        <button className="knap" onClick={startTutorial}><Ico n="graduate"/> Interactive tutorial<small>Learn the game in five guided turns</small></button>
        {onlineOK ? <>
          <div className="etiket">Online</div>
          <button className="knap" onClick={opretOnline}><Ico n="globe"/> Create online game<small>Get a code to share with your opponent</small></button>
          <div className="raek" style={{marginTop:10}}>
            <input placeholder="CODE" value={joinKode} maxLength={4}
              style={{textTransform:"uppercase",fontFamily:"var(--mono)",letterSpacing:3,width:110,flex:"none"}}
              onChange={e=>setJoinKode(e.target.value)}/>
            <button className="knap" style={{marginTop:0}} onClick={deltagOnline}><Ico n="arrow"/> Join / resume</button>
          </div>
        </> : <>
          <div className="etiket">Online</div>
          <p className="rt" style={{color:"var(--dim)"}}>Online play requires the Claude artifact edition with shared storage — solo and local play work here.</p>
        </>}
        <div className="etiket">Local</div>
        <button className="knap" onClick={startLokal}><Ico n="gamepad"/> Local 2-player game<small>Take turns on the same device</small></button>
        <div className="etiket">Other</div>
        <button className="knap" onClick={()=>setSkaerm("deck")}><Ico n="cards"/> Card library & deck builder</button>
        <button className="knap" onClick={()=>setSkaerm("regler")}><Ico n="book"/> Rules</button>
        <button className="knap" onClick={()=>setSkaerm("settings")}><Ico n="gear"/> Settings</button>
        {profil && (()=>{ const u=unlockedSetAf(profil);
          return <div className="samling"><Ico n="cards"/> Collection: <b>{u.size}</b>/{COLL.length} cards · <Ico n="trophy"/> {profil.wins||0} wins
            {u.size<COLL.length && <span className="samlinghint"> — win games to unlock more!</span>}</div>; })()}
      </div>
    );
  }
  else if(skaerm==="deck"){
    indhold=<DeckBuilder decks={decks} gemDecks={gemDecks} onBack={()=>setSkaerm("menu")} flash={flash} unlocked={profil?unlockedSetAf(profil):null}/>;
  }
  else if(skaerm==="run"){
    if(!run){ indhold=<RunClassPick onPick={runStart} onBack={()=>setSkaerm("menu")}/>; }
    else{
      indhold=<RunView run={run} fase={runFase} navn={navn}
        onStartBattle={runStartKamp} onPickCard={runVaelgKort} onPickUpgrade={runVaelgOpgrad}
        onLeave={runForlad} onNewRun={()=>{ setRun(null); setRunFase(null); }}/>;
    }
  }
  else if(skaerm==="regler"){
    indhold=<Regler onBack={()=>setSkaerm("menu")}/>;
  }
  else if(skaerm==="settings"){
    indhold=<div className="pane"><SettingsScreen onBack={()=>setSkaerm("menu")}/></div>;
  }
  else if(skaerm==="spil"){
    if(lobby&&!g){
      indhold=(
        <div className="centrer">
          <div className="logo" style={{fontSize:28}}>GAME READY</div>
          <p className="rt" style={{color:"var(--dim)"}}>Share the code with your opponent.<br/>You both need the same artifact link.</p>
          <div className="kodevis">{lobby.code}</div>
          <div className="ulinie">waiting for opponent…</div>
          <button className="knap" style={{maxWidth:260}} onClick={async()=>{await stDel("spil:"+kode.current,true);tilMenu();}}>Cancel game</button>
        </div>
      );
    } else if(g){
      indhold=(
        <>
          <GameView g={g} seat={seatNu} myTurn={minTur} act={doAct} mode={mode} pos={posRef} tut={tut} setTut={setTut}
            kode={kode.current}
            onLeave={tilMenu} onConcede={opgiv} onRematch={revanche} onDelete={sletSpil}/>
          {mode==="lokal"&&handoff&&g.status==="igang"&&(
            <div className="slor">
              <div className="ark" style={{textAlign:"center"}}>
                <div className="logo" style={{fontSize:26}}>{g.players[g.active].name.toUpperCase()}</div>
                <p className="rt" style={{color:"var(--dim)"}}>Hand over the device — no peeking!</p>
                <button className="knap cu" onClick={()=>setHandoff(false)}><Ico n="bolt"/> Start my turn</button>
              </div>
            </div>
          )}
        </>
      );
    } else {
      indhold=<div className="centrer"><div className="ulinie">connecting…</div></div>;
    }
  }

  return (
    <div className="app">
      <style>{CSS}</style>
      {indhold}
      {unlockPop&&<UnlockPop id={unlockPop} onClose={()=>setUnlockPop(null)}/>}
      {toast&&<div className="toast"><LogTekst t={toast}/></div>}
    </div>
  );
}
