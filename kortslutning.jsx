import { useState, useEffect, useRef, useMemo } from "react";

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
  jord:   { n:"Grounded",      ico:"⏚",  d:"Enemies must attack Grounded units first." },
  turbo:  { n:"Turbo",         ico:"»",  d:"Can attack units the turn it is played." },
  iso:    { n:"Insulated",     ico:"◈",  d:"Ignores the first damage it takes." },
  hoj:    { n:"High Voltage",  ico:"☠",  d:"Destroys any unit it damages." },
  dob:    { n:"Dual Core",     ico:"×2", d:"Can attack twice per turn." },
  host:   { n:"Energy Harvest",ico:"♥+", d:"Damage dealt by this unit repairs your hero for the same amount." },
  skjul:  { n:"Cloaked",       ico:"▒",  d:"Can’t be targeted until it attacks." },
  noHero: { n:"Units only",    ico:"⊘",  d:"Can’t attack heroes." },
};

// ---------- KORTDATABASE ----------
// t: 'enhed'|'program' · tr: stamme · r: 'A' alm / 'L' legendarisk
// fx(g,s,t): program-effekt · bc: Installation · dr: Nedbrud · end/start: tur-triggers
// tgt/bcTgt: 'any'|'eany'|'unit'|'eunit'|'funit'|'funitO' (+ f: ekstra filter)

const CARDS = {

// ===== PROGRAMMER (33) =====
s_stod:{ n:"Static Shock", e:"🖐️", c:0, t:"spell", txt:"Deal 1 damage.", tgt:"any",
  fx(g,s,t){ dmg(g,t,1+sig(g,s),null); } },
s_nodstrom:{ n:"Emergency Power", e:"🔌", c:0, t:"spell", txt:"Gain 2 energy this turn. Overheat (2).",
  fx(g,s){ g.players[s].cur+=2; g.players[s].ovlNext+=2; } },
s_kortslut:{ n:"Short Circuit", e:"⚡", c:1, t:"spell", txt:"Deal 2 damage.", tgt:"any",
  fx(g,s,t){ dmg(g,t,2+sig(g,s),null); } },
s_loddetin:{ cls:"tek", n:"Solder", e:"🔗", c:1, t:"spell", txt:"Give a friendly unit +0/+3.", tgt:"funit",
  fx(g,s,t){ buff(g,t,0,3); } },
s_overclock:{ n:"Overclock", e:"🚀", c:1, t:"spell", txt:"Give a friendly unit +2/+0. It can attack immediately.", tgt:"funit",
  fx(g,s,t){ buff(g,t,2,0); const u=refUnit(g,t); if(u){ u.jp=false; u.atk=Math.max(u.atk,1); } } },
s_stoj:{ n:"Signal Noise", e:"📡", c:1, t:"spell", txt:"Give an enemy unit -2 Attack.", tgt:"eunit",
  fx(g,s,t){ const u=refUnit(g,t); if(u) u.a=Math.max(0,u.a-2); } },
s_datalak:{ n:"Data Leak", e:"💾", c:1, t:"spell", txt:"Draw a card. Chain: Draw 2 instead.",
  fx(g,s,t,combo){ draw(g,s,combo?2:1); } },
s_lynafleder:{ n:"Lightning Rod", e:"☂️", c:2, t:"spell", txt:"Give a friendly unit Grounded and +0/+2.", tgt:"funit",
  fx(g,s,t){ buff(g,t,0,2); const u=refUnit(g,t); if(u&&!u.akw.includes("jord")) u.akw.push("jord"); } },
s_genstart:{ n:"Reboot", e:"🔄", c:2, t:"spell", txt:"Return a unit to its owner’s hand.", tgt:"unit",
  fx(g,s,t){ bounce(g,t); } },
s_diag:{ n:"Diagnostics", e:"🩺", c:2, t:"spell", txt:"Draw 2 cards.",
  fx(g,s){ draw(g,s,2); } },
s_nulstil:{ n:"Reset", e:"🧽", c:2, t:"spell", txt:"Reset a unit (removes all text and buffs).", tgt:"unit",
  fx(g,s,t){ const u=refUnit(g,t); if(u) silence(g,u); } },
s_lysbue:{ n:"Arc Flash", e:"🔆", c:2, t:"spell", txt:"Deal 2 damage to an enemy unit and 1 to its neighbors.", tgt:"eunit",
  fx(g,s,t){ const b=sig(g,s); const adj=neighbors(g,t); dmg(g,t,2+b,null); for(const r of adj) dmg(g,r,1+b,null); } },
s_spids:{ n:"Voltage Spike", e:"📈", c:2, t:"spell", txt:"Deal 3 damage. Overheat (1).", tgt:"any",
  fx(g,s,t){ dmg(g,t,3+sig(g,s),null); g.players[s].ovlNext+=1; } },
s_kabels:{ cls:"tek", n:"Cable Spaghetti", e:"🍝", c:2, t:"spell", txt:"Swap a unit’s Attack and Health.", tgt:"unit",
  fx(g,s,t){ const u=refUnit(g,t); if(!u) return; const hpNow=Math.max(0,u.hM-u.dmg); const oldA=u.a;
    u.a=hpNow; u.hM=oldA; u.dmg=0; if(u.hM<=0){ u.dmg=999; } } },
s_reserve:{ cls:"tek", n:"Spare Parts", e:"📦", c:2, t:"spell", txt:"Add 2 random Components to your hand.",
  fx(g,s){ for(let i=0;i<2;i++){ const id=pick(POOL_KOMP); if(id) addHand(g,s,id); } } },
s_firmware:{ cls:"tek", n:"Firmware Update", e:"⬆️", c:3, t:"spell", txt:"Give all your units +1/+1.",
  fx(g,s){ for(const u of g.players[s].board){ u.a+=1; u.hM+=1; } } },
s_genoplad:{ cls:"tek", n:"Recharge", e:"🔋", c:3, t:"spell", txt:"Repair your hero and all friendly units for 3.",
  fx(g,s){ healHero(g,s,3); for(const u of g.players[s].board) u.dmg=Math.max(0,u.dmg-3); } },
s_hack:{ n:"Hack", e:"🥷", c:3, t:"spell", txt:"Take control of an enemy unit with 2 or less Attack.",
  tgt:"eunit", f:(g,s,r,u)=>effAtk(g,r.s,u)<=2 && g.players[s].board.length<MAXBOARD,
  fx(g,s,t){ takeControl(g,s,t); } },
s_induk:{ n:"Induction", e:"🧲", c:3, t:"spell", txt:"Gain 1 energy this turn. Draw a card.",
  fx(g,s){ g.players[s].cur+=1; draw(g,s,1); } },
s_backup:{ cls:"tek", n:"Backup", e:"🗄️", c:3, t:"spell", txt:"Add a copy of a friendly unit to your hand.", tgt:"funit",
  fx(g,s,t){ const u=refUnit(g,t); if(u) addHand(g,s,u.id); } },
s_kompil:{ n:"Compile", e:"⌨️", c:3, t:"spell", txt:"Draw a random Spell from your deck.",
  fx(g,s){ tutor(g,s,id=>CARDS[id].t==="spell"); } },
s_kadelyn:{ n:"Chain Lightning", e:"🌩️", c:4, t:"spell", txt:"Deal 3 damage to an enemy unit and 2 to its neighbors.", tgt:"eunit",
  fx(g,s,t){ const b=sig(g,s); const adj=neighbors(g,t); dmg(g,t,3+b,null); for(const r of adj) dmg(g,r,2+b,null); } },
s_magnet:{ n:"Magnetic Field", e:"🌀", c:4, t:"spell", txt:"Deal 2 damage to all enemy units.",
  fx(g,s){ aoe(g,1-s,2+sig(g,s)); } },
s_forstark:{ n:"Power Amplifier", e:"📢", c:4, t:"spell", txt:"Double a friendly unit’s Attack.", tgt:"funit",
  fx(g,s,t){ const u=refUnit(g,t); if(u) u.a*=2; } },
s_gendan:{ cls:"tek", n:"System Restore", e:"💚", c:4, t:"spell", txt:"Repair your hero for 8.",
  fx(g,s){ healHero(g,s,8); } },
s_overbel:{ n:"Overload", e:"🔥", c:4, t:"spell", txt:"Deal 5 damage. Overheat (2).", tgt:"any",
  fx(g,s,t){ dmg(g,t,5+sig(g,s),null); g.players[s].ovlNext+=2; } },
s_ransom:{ n:"Ransomware", e:"💰", c:5, t:"spell", txt:"Destroy an enemy unit. Your opponent draws a card.", tgt:"eunit",
  fx(g,s,t){ const u=refUnit(g,t); if(u){ u.dmg=999; sweep(g); draw(g,1-s,1); } } },
s_printer:{ cls:"tek", n:"3D Printer", e:"🖨️", c:5, t:"spell", txt:"Summon a copy of a friendly unit (base version).", tgt:"funit",
  fx(g,s,t){ const u=refUnit(g,t); if(u) summon(g,s,u.id); } },
s_uvejr:{ n:"Server Room Storm", e:"⛈️", c:5, t:"spell", txt:"Deal 2 damage to a random enemy, 4 times.",
  fx(g,s){ const b=sig(g,s); for(let i=0;i<4;i++){ const r=randEnemyRef(g,s); if(!r) break; dmg(g,r,2+b,null); } } },
s_oversp:{ n:"Power Surge", e:"🌊", c:6, t:"spell", txt:"Deal 4 damage to all enemy units.",
  fx(g,s){ aoe(g,1-s,4+sig(g,s)); } },
s_massep:{ n:"Mass Production", e:"🏭", c:6, t:"spell", txt:"Fill your board with 1/1 Microbots.",
  fx(g,s){ while(g.players[s].board.length<MAXBOARD){ if(!summon(g,s,"t_mikrobot")) break; } } },
s_emp:{ n:"EMP", e:"☢️", c:7, t:"spell", txt:"Destroy all units.",
  fx(g){ for(const p of g.players) for(const u of p.board) u.dmg=999; sweep(g); } },
s_nedsmelt:{ n:"Total Meltdown", e:"💀", c:8, t:"spell", txt:"Deal 4 damage to all heroes and units.",
  fx(g,s){ const n=4+sig(g,s);
    g.players[0].hp-=n; fxPush(g,{t:"dmg",s:0,u:null,n});
    g.players[1].hp-=n; fxPush(g,{t:"dmg",s:1,u:null,n});
    aoe(g,0,n); aoe(g,1,n); checkWin(g); } },

// ===== KOMPONENTER (18) =====
u_modstand:{ n:"Resistor", e:"🎚️", c:1, t:"unit", tr:"Component", a:0, h:3, kw:["jord"], txt:"Grounded." },
u_led:{ n:"LED", e:"💡", c:1, t:"unit", tr:"Component", a:1, h:1, txt:"Breakdown: Give a random friendly unit +1/+0.",
  dr(g,s){ const u=pick(g.players[s].board); if(u) u.a+=1; } },
u_kontakt:{ n:"Switch", e:"🔘", c:1, t:"unit", tr:"Component", a:1, h:2, txt:"Install — Chain: Draw a card.",
  bc(g,s,u,t,combo){ if(combo) draw(g,s,1); } },
u_sikring:{ n:"Fuse", e:"🧯", c:1, t:"unit", tr:"Component", a:0, h:2, kw:["jord"], txt:"Grounded. Breakdown: Repair your hero for 2.",
  dr(g,s){ healHero(g,s,2); } },
u_piezo:{ n:"Piezo Buzzer", e:"🔔", c:1, t:"unit", tr:"Component", a:1, h:1, txt:"Breakdown: Deal 1 damage to a random enemy unit.",
  dr(g,s){ const u=pick(g.players[1-s].board); if(u) dmg(g,{s:1-s,u:u.uid},1,null); } },
u_transistor:{ n:"Transistor", e:"🔺", c:2, t:"unit", tr:"Component", a:2, h:2, sig:1, txt:"Signal Strength +1 (your Spells deal +1 damage)." },
u_diode:{ n:"Diode", e:"➡️", c:2, t:"unit", tr:"Component", a:3, h:2, kw:["noHero"], txt:"Can’t attack heroes." },
u_kondens:{ n:"Capacitor", e:"🥫", c:2, t:"unit", tr:"Component", a:1, h:3, txt:"Breakdown: Store 1 energy in the capacitor bank.",
  dr(g,s){ addStored(g,s,1); } },
u_koleleg:{ n:"Heat Sink", e:"🧊", c:2, t:"unit", tr:"Component", a:0, h:5, kw:["jord"], txt:"Grounded." },
u_spole:{ n:"Coil", e:"🌪️", c:2, t:"unit", tr:"Component", a:2, h:3, txt:"“Hums a bit, but it holds.”" },
u_potmeter:{ n:"Potentiometer", e:"🎛️", c:2, t:"unit", tr:"Component", a:1, h:1, txt:"Install: Give another friendly unit +1/+1.",
  bcTgt:"funitO", bc(g,s,u,t){ if(t) buff(g,t,1,1); } },
u_krystal:{ n:"Crystal Oscillator", e:"💎", c:3, t:"unit", tr:"Component", a:2, h:2, txt:"At the start of your turn: +1 Attack.",
  start(g,s,u){ u.a+=1; } },
u_printplade:{ n:"Circuit Board", e:"🟩", c:3, t:"unit", tr:"Component", a:0, h:4, txt:"Your other Components have +1/+1.",
  aura:{ others:true, tribe:"Component", a:1, h:1 } },
u_transform:{ n:"Transformer", e:"🔀", c:3, t:"unit", tr:"Component", a:2, h:4, txt:"Install: Give another friendly unit +2/+0.",
  bcTgt:"funitO", bc(g,s,u,t){ if(t) buff(g,t,2,0); } },
u_relae:{ cls:"tek", n:"Relay", e:"🎏", c:3, t:"unit", tr:"Component", a:2, h:3, txt:"Install: Another friendly unit can attack immediately.",
  bcTgt:"funitO", bc(g,s,u,t){ const x=refUnit(g,t); if(x){ x.jp=false; x.atkLeft=Math.max(x.atkLeft,1); } } },
u_solpanel:{ n:"Solar Panel", e:"☀️", c:4, t:"unit", tr:"Component", a:1, h:5, txt:"At the start of your turn: Gain 1 energy this turn.",
  start(g,s){ g.players[s].cur+=1; } },
u_psu:{ n:"Power Supply", e:"🔌", c:4, t:"unit", tr:"Component", a:2, h:5, kw:["jord"], txt:"Grounded. Breakdown: Store 1 energy.",
  dr(g,s){ addStored(g,s,1); } },
u_superkond:{ n:"Supercapacitor", e:"🛢️", c:5, t:"unit", tr:"Component", a:3, h:5, txt:"Install: Store 2 energy in the capacitor bank.",
  bc(g,s){ addStored(g,s,2); } },

// ===== ROBOTTER (16) =====
u_skruebot:{ n:"Screwbot", e:"🪛", c:1, t:"unit", tr:"Robot", a:1, h:1, txt:"Install: Give another friendly Robot +1/+1.",
  bcTgt:"funitO", bcF:(g,s,r,u)=>CARDS[u.id].tr==="Robot", bc(g,s,u,t){ if(t) buff(g,t,1,1); } },
u_loddebot:{ cls:"tek", n:"Solderbot", e:"🦾", c:2, t:"unit", tr:"Robot", a:2, h:1, txt:"Install: Deal 1 damage.",
  bcTgt:"any", bc(g,s,u,t){ if(t) dmg(g,t,1,null); } },
u_skraldebot:{ n:"Garbagebot", e:"🗑️", c:2, t:"unit", tr:"Robot", a:2, h:3, txt:"Breakdown: Add a random Component to your hand.",
  dr(g,s){ const id=pick(POOL_KOMP); if(id) addHand(g,s,id); } },
u_vagtbot:{ n:"Guardbot", e:"👮", c:3, t:"unit", tr:"Robot", a:2, h:4, kw:["jord"], txt:"Grounded." },
u_byggebot:{ n:"Builderbot", e:"👷", c:3, t:"unit", tr:"Robot", a:2, h:2, txt:"Install: Summon a 1/1 Microbot.",
  bc(g,s){ summon(g,s,"t_mikrobot"); } },
u_speederbot:{ n:"Speedbot", e:"🛵", c:3, t:"unit", tr:"Robot", a:3, h:2, kw:["turbo"], txt:"Turbo." },
u_sumobot:{ n:"Sumobot", e:"🥋", c:4, t:"unit", tr:"Robot", a:3, h:5, kw:["jord"], txt:"Grounded." },
u_svejsebot:{ n:"Weldbot", e:"🔧", c:4, t:"unit", tr:"Robot", a:3, h:4, txt:"Install: Deal 2 damage. Chain: Deal 4 instead.",
  bcTgt:"any", bc(g,s,u,t,combo){ if(t) dmg(g,t,combo?4:2,null); } },
u_sergent:{ n:"Robo-Sergeant", e:"🎖️", c:4, t:"unit", tr:"Robot", a:3, h:3, txt:"Your other Robots have +1 Attack.",
  aura:{ others:true, tribe:"Robot", a:1 } },
u_repbot:{ cls:"tek", n:"Repairbot", e:"🚑", c:4, t:"unit", tr:"Robot", a:2, h:5, txt:"At the end of your turn: Repair a random damaged friendly unit for 2.",
  end(g,s){ const c=g.players[s].board.filter(x=>x.dmg>0); const u=pick(c); if(u) u.dmg=Math.max(0,u.dmg-2); } },
u_boksebot:{ n:"Boxerbot", e:"🥊", c:5, t:"unit", tr:"Robot", a:3, h:5, kw:["dob"], txt:"Dual Core." },
u_fabrik:{ n:"Robot Factory", e:"🏗️", c:5, t:"unit", tr:"Robot", a:0, h:6, txt:"At the end of your turn: Summon a 1/1 Microbot.",
  end(g,s){ summon(g,s,"t_mikrobot"); } },
u_kranbot:{ n:"Cranebot", e:"🏗", c:5, t:"unit", tr:"Robot", a:4, h:5, kw:["jord"], txt:"Grounded." },
u_nedriver:{ n:"Demolition Bot", e:"🧨", c:6, t:"unit", tr:"Robot", a:5, h:5, txt:"Install: Deal 2 damage to all other units.",
  bc(g,s,u){ for(const p of [0,1]) for(const x of g.players[p].board.map(v=>v.uid)){ if(x!==u.uid) dmg(g,{s:p,u:x},2,null); } } },
u_panserbot:{ n:"Armorbot", e:"🛡️", c:6, t:"unit", tr:"Robot", a:4, h:6, kw:["jord","iso"], txt:"Grounded. Insulated." },
u_kolos:{ n:"Mech Colossus", e:"🦿", c:7, t:"unit", tr:"Robot", a:7, h:7, txt:"Overheat (1).",
  bc(g,s){ g.players[s].ovlNext+=1; } },

// ===== DRONER (12) =====
u_nano:{ n:"Nanodrone", e:"🐝", c:1, t:"unit", tr:"Drone", a:1, h:1, kw:["turbo"], txt:"Turbo." },
u_spejder:{ n:"Scout Drone", e:"🔭", c:1, t:"unit", tr:"Drone", a:1, h:2, kw:["skjul"], txt:"Cloaked." },
u_kampdrone:{ n:"Combat Drone", e:"🛸", c:2, t:"unit", tr:"Drone", a:2, h:1, kw:["turbo"], txt:"Turbo." },
u_svarm:{ n:"Swarm Drone", e:"🐜", c:2, t:"unit", tr:"Drone", a:1, h:1, txt:"Install: Summon a 1/1 Nanodrone with Turbo.",
  bc(g,s){ summon(g,s,"u_nano"); } },
u_kamikaze:{ n:"Kamikaze Drone", e:"💣", c:2, t:"unit", tr:"Drone", a:2, h:1, txt:"Breakdown: Deal 2 damage to a random enemy unit.",
  dr(g,s){ const u=pick(g.players[1-s].board); if(u) dmg(g,{s:1-s,u:u.uid},2,null); } },
u_levering:{ n:"Delivery Drone", e:"📬", c:3, t:"unit", tr:"Drone", a:2, h:2, txt:"Install: Draw a card.",
  bc(g,s){ draw(g,s,1); } },
u_forer:{ n:"Drone Pilot", e:"🕹️", c:3, t:"unit", tr:"Drone", a:2, h:3, txt:"Your other Drones have Turbo.",
  aura:{ others:true, tribe:"Drone", kw:["turbo"] } },
u_jager:{ n:"Fighter Drone", e:"✈️", c:4, t:"unit", tr:"Drone", a:4, h:3, kw:["turbo"], txt:"Turbo." },
u_dronebase:{ n:"Drone Base", e:"📡", c:4, t:"unit", tr:"Drone", a:1, h:5, txt:"Your other Drones have +1 Attack.",
  aura:{ others:true, tribe:"Drone", a:1 } },
u_fragt:{ n:"Cargo Drone", e:"📦", c:5, t:"unit", tr:"Drone", a:3, h:4, txt:"Install: Summon two 1/1 Nanodrones with Turbo.",
  bc(g,s){ summon(g,s,"u_nano"); summon(g,s,"u_nano"); } },
u_stealthdrone:{ n:"Stealth Drone", e:"🌑", c:5, t:"unit", tr:"Drone", a:4, h:4, kw:["skjul"], txt:"Cloaked." },
u_hyper:{ n:"Hyperdrone", e:"🚁", c:6, t:"unit", tr:"Drone", a:3, h:4, kw:["turbo","dob"], txt:"Turbo. Dual Core." },

// ===== VIRUS (11) =====
u_datamide:{ n:"Data Mite", e:"🦠", c:1, t:"unit", tr:"Virus", a:1, h:1, kw:["hoj"], txt:"High Voltage." },
u_glitch:{ n:"Glitch", e:"👾", c:1, t:"unit", tr:"Virus", a:2, h:1, txt:"“Have you tried turning it off and on again?”" },
u_adware:{ n:"Adware", e:"🪧", c:2, t:"unit", tr:"Virus", a:3, h:2, txt:"Breakdown: Your opponent draws a card.",
  dr(g,s){ draw(g,1-s,1); } },
u_spion:{ n:"Spyware", e:"🕵️", c:2, t:"unit", tr:"Virus", a:1, h:3, txt:"Install: Copy a random card from your opponent’s hand to yours.",
  bc(g,s){ const h=g.players[1-s].hand; const c=pick(h); if(c) addHand(g,s,c.id); } },
u_snylter:{ n:"Data Leech", e:"🧛", c:3, t:"unit", tr:"Virus", a:3, h:3, kw:["host"], txt:"Energy Harvest." },
u_logikbombe:{ n:"Logic Bomb", e:"🧮", c:3, t:"unit", tr:"Virus", a:0, h:4, kw:["jord"], txt:"Grounded. Breakdown: Deal 2 damage to all enemy units.",
  dr(g,s){ aoe(g,1-s,2); } },
u_trojan:{ n:"Trojan Horse", e:"🐴", c:4, t:"unit", tr:"Virus", a:4, h:4, kw:["skjul"], txt:"Cloaked." },
u_replikator:{ n:"Replicator", e:"🧬", c:4, t:"unit", tr:"Virus", a:3, h:3, txt:"Breakdown: Summon two 1/1 Bugs.",
  dr(g,s){ summon(g,s,"t_bug"); summon(g,s,"t_bug"); } },
u_ormen:{ n:"The Worm", e:"🪱", c:5, t:"unit", tr:"Virus", a:4, h:4, txt:"At the end of your turn: +1/+1.",
  end(g,s,u){ u.a+=1; u.hM+=1; } },
u_rootkit:{ n:"Rootkit", e:"🗝️", c:5, t:"unit", tr:"Virus", a:4, h:5, txt:"Install: Reset an enemy unit.",
  bcTgt:"eunit", bc(g,s,u,t){ const x=refUnit(g,t); if(x) silence(g,x); } },
u_botnet:{ n:"Botnet Brain", e:"🧠", c:6, t:"unit", tr:"Virus", a:4, h:6, txt:"At the end of your turn: Summon a 1/1 Bug.",
  end(g,s){ summon(g,s,"t_bug"); } },

// ===== LEGENDARISKE (10) =====
l_praktikant:{ n:"The Intern", e:"🧑‍🎓", c:2, t:"unit", tr:null, r:"L", a:2, h:3, txt:"Install: Deal 2 damage to a COMPLETELY random target (anything can be hit).",
  bc(g,s,u){ const pool=[]; for(const p of [0,1]){ pool.push({s:p,u:null}); for(const x of g.players[p].board) if(x.uid!==u.uid) pool.push({s:p,u:x.uid}); }
    const t=pick(pool); if(t) dmg(g,t,2,null); } },
l_roomba:{ n:"ROOMBA PRIME", e:"🧹", c:5, t:"unit", tr:"Robot", r:"L", a:3, h:3, kw:["turbo","hoj"], txt:"Turbo. High Voltage. Vacuums up everything." },
l_gdpr:{ n:"GDPR Bot", e:"⚖️", c:6, t:"unit", tr:"Robot", r:"L", a:4, h:5, txt:"Install: Both players delete their hands and draw that many cards.",
  bc(g){ for(const p of [0,1]){ const n=g.players[p].hand.length; g.players[p].hand=[]; draw(g,p,n); } } },
l_moderkort:{ n:"THE MOTHERBOARD", e:"🖥️", c:6, t:"unit", tr:"Component", r:"L", a:0, h:8, kw:["jord"], txt:"Grounded. Your other units have +1/+1.",
  aura:{ others:true, a:1, h:1 } },
l_tesla:{ n:"TESLA COIL", e:"🗼", c:7, t:"unit", tr:"Component", r:"L", a:4, h:6, txt:"At the end of your turn: Deal 3 damage to a random enemy.",
  end(g,s){ const r=randEnemyRef(g,s); if(r) dmg(g,r,3,null); } },
l_virusx:{ n:"VIRUS X", e:"☣️", c:7, t:"unit", tr:"Virus", r:"L", a:5, h:5, kw:["hoj","host"], txt:"High Voltage. Energy Harvest." },
l_alan:{ n:"A.L.A.N.", e:"🤖", c:8, t:"unit", tr:"Robot", r:"L", a:6, h:6, txt:"Install: Draw 3 cards. (“I’m afraid I can’t do that, Dave.”)",
  bc(g,s){ draw(g,s,3); } },
l_kvante:{ n:"THE QUANTUM BOX", e:"📦", c:8, t:"unit", tr:"Component", r:"L", a:5, h:7, txt:"At the end of your turn: Add a random Spell to your hand.",
  end(g,s){ const id=pick(POOL_PROG); if(id) addHand(g,s,id); } },
l_titan:{ n:"TITAN-9000", e:"🗿", c:9, t:"unit", tr:"Robot", r:"L", a:8, h:8, kw:["jord"], txt:"Grounded. Install: Destroy the enemy unit with the highest Attack.",
  bc(g,s){ const b=g.players[1-s].board; if(!b.length) return; let m=b[0]; for(const x of b) if(effAtk(g,1-s,x)>effAtk(g,1-s,m)) m=x; m.dmg=999; sweep(g); } },
l_overtek:{ cls:"tek", n:"THE OVERTECHNICIAN", e:"🧙", c:9, t:"unit", tr:null, r:"L", a:6, h:6, txt:"Install: Give all your other units +2/+2.",
  bc(g,s,u){ for(const x of g.players[s].board) if(x.uid!==u.uid){ x.a+=2; x.hM+=2; } } },

// ===== RARE (◆) — stærkere end commons, findes sjældnere =====
r_fluxkond:{ n:"Flux Capacitor", e:"⏳", c:3, t:"unit", tr:"Component", r:"R", a:2, h:3,
  txt:"Install: Store 2 energy in your capacitor bank.",
  bc(g,s,u){ addStored(g,s,2); } },
r_brandmur:{ n:"Firewall Tower", e:"🧱", c:5, t:"unit", tr:"Component", r:"R", a:2, h:7, kw:["jord","iso"],
  txt:"Grounded. Insulated." },
r_stoedbolge:{ n:"Surge Wave", e:"🌊", c:4, t:"spell", r:"R",
  txt:"Deal 2 damage to ALL enemy units.",
  fx(g,s){ const n=2+sig(g,s); for(const u of [...g.players[1-s].board]) dmg(g,{s:1-s,u:u.uid},n,null); } },
r_cachelaeser:{ n:"Cache Reader", e:"📖", c:3, t:"spell", r:"R",
  txt:"Draw 2 cards.",
  fx(g,s){ draw(g,s,2); } },
r_magnetfelt:{ n:"Magnet Field", e:"🧲", c:3, t:"spell", r:"R", tgt:"eunit",
  txt:"Return an enemy unit to its owner’s hand.",
  fx(g,s,t){ bounce(g,t); } },
r_turbolader:{ n:"Turbo Charger", e:"🏎️", c:2, t:"spell", r:"R", tgt:"funit",
  txt:"Give a friendly unit +2 Attack and Turbo.",
  fx(g,s,t){ buff(g,t,2,0); const u=refUnit(g,t); if(u){ u.akw.push("turbo"); u.jp=false; } } },

// ===== FLERE LEGENDARIES (★) =====
l_spejlserver:{ n:"MIRROR SERVER", e:"🪞", c:6, t:"unit", tr:"Robot", r:"L", a:3, h:4,
  txt:"Install: Summon a fresh copy of a random enemy unit. If there are none, summon a 1/1 Bug.",
  bc(g,s,u){ if(g.players[s].board.length>=MAXBOARD) return;
    const eb=g.players[1-s].board;
    if(eb.length){ summon(g,s,pick(eb).id); } else { summon(g,s,"t_bug"); } } },
l_singularitet:{ n:"THE SINGULARITY", e:"🕳️", c:9, t:"unit", tr:null, r:"L", a:6, h:6, kw:["turbo"],
  txt:"Turbo. Install: Gains +1/+1 for every other unit in play.",
  bc(g,s,u){ let n=0; for(const p of [0,1]) for(const x of g.players[p].board) if(x.uid!==u.uid) n++;
    if(n>0){ u.a+=n; u.hM+=n; } } },
l_hovedafbryder:{ n:"MASTER BREAKER", e:"🎛️", c:8, t:"spell", r:"L",
  txt:"Destroy ALL units. Both heroes repair 4.",
  fx(g,s){ for(const p of [0,1]) for(const u of [...g.players[p].board]) dmg(g,{s:p,u:u.uid},99,null);
    healHero(g,0,4); healHero(g,1,4); } },
l_thorexe:{ n:"THOR.EXE", e:"🔨", c:7, t:"unit", tr:"Robot", r:"L", a:4, h:5, kw:["hoj"],
  txt:"High Voltage. Install: Deal 1 damage to all enemy units.",
  bc(g,s,u){ for(const x of [...g.players[1-s].board]) dmg(g,{s:1-s,u:x.uid},1,null); } },

// ===== TOKENS (ikke i samlingen) =====

// ---------- The Hacker (klassekort) ----------
hk_spoof:{ cls:"hack", n:"Spoof", e:"🎭", c:1, t:"spell", txt:"Give a friendly unit Cloaked.",
  tgt:"funit", fx(g,s,t){ const u=refUnit(g,t); if(u){ u.akw.push("skjul"); u.st=true; } } },
hk_phish:{ cls:"hack", n:"Phishing", e:"🎣", c:1, t:"spell", txt:"Copy a random card from your opponent’s hand to yours.",
  fx(g,s){ const oh=g.players[1-s].hand; if(oh.length) addHand(g,s,pick(oh).id); } },
hk_bugswarm:{ cls:"hack", n:"Bug Swarm", e:"🐛", c:2, t:"spell", txt:"Summon two 1/1 Bugs. Chain: Three instead.",
  fx(g,s,t,combo){ for(let i=0;i<(combo?3:2);i++) summon(g,s,"t_bug"); } },
hk_keylog:{ cls:"hack", n:"Keylogger", e:"⌨️", c:2, t:"unit", tr:"Virus", a:1, h:3, kw:["skjul"],
  txt:"Cloaked. Breakdown: Draw a card.", dr(g,s){ draw(g,s,1); } },
hk_ddos:{ cls:"hack", n:"DDoS", e:"🌊", c:3, t:"spell", txt:"Give all enemy units -2 Attack.",
  fx(g,s){ for(const u of g.players[1-s].board) buff(g,{s:1-s,u:u.uid},-2,0); } },
hk_crypto:{ cls:"hack", n:"Cryptojacker", e:"⛏️", c:3, t:"unit", tr:"Virus", a:2, h:3, kw:["host"],
  txt:"Energy Harvest. Install: Store 1 energy.", bc(g,s){ addStored(g,s,1); } },
hk_mitm:{ cls:"hack", n:"Man in the Middle", e:"🕵️", c:4, t:"unit", tr:"Virus", a:3, h:4,
  txt:"Install: Return an enemy unit to its owner’s hand.",
  bcTgt:"eunit", bc(g,s,u,t){ if(t) bounce(g,t); } },
hk_glitchstorm:{ cls:"hack", n:"Glitch Storm", e:"🌩️", c:4, t:"spell", txt:"Deal 1 damage to all enemy units, twice.",
  fx(g,s){ aoe(g,1-s,1); aoe(g,1-s,1); } },
hk_payload:{ cls:"hack", n:"Payload", e:"📦", c:5, t:"unit", tr:"Virus", a:4, h:4,
  txt:"Breakdown: Deal 3 damage to the enemy hero.", dr(g,s){ dmg(g,{s:1-s,u:null},3,null); } },
hk_zeroday:{ cls:"hack", n:"Zero-Day", e:"💀", c:5, t:"spell", txt:"Destroy a damaged enemy unit.",
  tgt:"eunit", f:(g,s,r,u)=>u.dmg>0, fx(g,s,t){ const u=refUnit(g,t); if(u){ u.dmg=999; sweep(g); } } },
hk_root:{ cls:"hack", n:"Root Access", e:"🔓", c:6, t:"spell", txt:"Take control of an enemy unit.",
  tgt:"eunit", f:(g,s,r,u)=>g.players[s].board.length<MAXBOARD, fx(g,s,t){ takeControl(g,s,t); } },
hk_mirror:{ cls:"hack", n:"M1RR0R", e:"🪞", c:7, t:"unit", tr:"Virus", r:"L", a:5, h:5,
  txt:"Install: Summon a base copy of an enemy unit.",
  bcTgt:"eunit", bc(g,s,u,t){ const e=refUnit(g,t); if(e) summon(g,s,e.id); } },
// ---------- The Overclocker (klassekort) ----------
ov_jolt:{ cls:"over", n:"Jolt", e:"⚡", c:1, t:"spell", txt:"Deal 2 damage. Overheat (1).",
  tgt:"any", fx(g,s,t){ dmg(g,t,2+sig(g,s),null); g.players[s].ovlNext+=1; } },
ov_boost:{ cls:"over", n:"Turbo Boost", e:"🚀", c:2, t:"spell", txt:"Give a friendly unit Turbo and +1/+0.",
  tgt:"funit", fx(g,s,t){ const u=refUnit(g,t); if(u){ u.akw.push("turbo"); buff(g,t,1,0); } } },
ov_coolant:{ cls:"over", n:"Coolant Flush", e:"🧊", c:2, t:"spell", txt:"Unlock all your overheated energy (this turn and pending).",
  fx(g,s){ const p=g.players[s]; p.cur+=p.ovlShown; p.ovlShown=0; p.ovlNext=0; } },
ov_reactor:{ cls:"over", n:"Micro Reactor", e:"☢️", c:3, t:"unit", tr:"Component", a:0, h:6,
  txt:"At the start of your turn: Store 1 energy.", start(g,s,u){ addStored(g,s,1); } },
ov_amped:{ cls:"over", n:"Amped Up", e:"📈", c:3, t:"spell", txt:"Give a friendly unit +3/+3. Overheat (1).",
  tgt:"funit", fx(g,s,t){ buff(g,t,3,3); g.players[s].ovlNext+=1; } },
ov_press:{ cls:"over", n:"Hydraulic Press", e:"🗜️", c:4, t:"unit", tr:"Robot", a:5, h:2,
  txt:"Overheat (1).", bc(g,s){ g.players[s].ovlNext+=1; } },
ov_flux:{ cls:"over", n:"Flux Capacitor", e:"🔋", c:4, t:"unit", tr:"Component", a:1, h:5,
  txt:"Install: Store 2 energy.", bc(g,s){ addStored(g,s,2); } },
ov_heatwave:{ cls:"over", n:"Heat Wave", e:"🥵", c:5, t:"spell", txt:"Deal 3 damage to all enemy units. Overheat (2).",
  fx(g,s){ aoe(g,1-s,3+sig(g,s)); g.players[s].ovlNext+=2; } },
ov_dynamo:{ cls:"over", n:"Dynamo", e:"🌀", c:5, t:"unit", tr:"Component", a:4, h:5,
  txt:"At the end of your turn: Deal 1 damage to the enemy hero for each stored energy.",
  end(g,s,u){ const n=g.players[s].stored; if(n>0) dmg(g,{s:1-s,u:null},n,null); } },
ov_golem:{ cls:"over", n:"Scrap Golem", e:"🗑️", c:6, t:"unit", tr:"Robot", a:7, h:7,
  txt:"Overheat (2).", bc(g,s){ g.players[s].ovlNext+=2; } },
ov_core:{ cls:"over", n:"Fission Core", e:"☢️", c:7, t:"unit", tr:"Component", a:6, h:6, kw:["jord"],
  txt:"Grounded. Breakdown: Deal 3 damage to all other units and both heroes.",
  dr(g,s){
    g.players[0].hp-=3; fxPush(g,{t:"dmg",s:0,u:null,n:3});
    g.players[1].hp-=3; fxPush(g,{t:"dmg",s:1,u:null,n:3});
    aoe(g,0,3); aoe(g,1,3); checkWin(g);
  } },
ov_giga:{ cls:"over", n:"GIGAWATT", e:"🌩️", c:10, t:"unit", tr:"Robot", r:"L", a:10, h:10, kw:["turbo"],
  txt:"Turbo. Overheat (3).", bc(g,s){ g.players[s].ovlNext+=3; } },
// ---------- nye neutrale ----------
n_jumper:{ n:"Jumper Wires", e:"🔗", c:0, t:"spell", txt:"Give a friendly unit +1/+1.",
  tgt:"funit", fx(g,s,t){ buff(g,t,1,1); } },
n_multimeter:{ n:"Multimeter", e:"🔍", c:1, t:"unit", tr:"Component", a:1, h:2,
  txt:"Install: Draw a card. Overheat (1).", bc(g,s){ draw(g,s,1); g.players[s].ovlNext+=1; } },
n_fan:{ n:"Cooling Fan", e:"🌀", c:2, t:"unit", tr:"Component", a:1, h:4,
  txt:"Install: Unlock 1 overheated energy.",
  bc(g,s){ const p=g.players[s]; if(p.ovlShown>0){ p.ovlShown--; p.cur++; } else if(p.ovlNext>0) p.ovlNext--; } },
n_breadboard:{ n:"Breadboard", e:"🧩", c:2, t:"unit", tr:"Component", a:2, h:3,
  txt:"Install: Give your other Components +0/+1.",
  bc(g,s,u){ for(const q of g.players[s].board) if(q.uid!==u.uid&&CARDS[q.id].tr==="Component") buff(g,{s,u:q.uid},0,1); } },
n_oscillo:{ n:"Oscilloscope", e:"📟", c:3, t:"unit", tr:"Component", a:2, h:4, sig:1,
  txt:"Signal Strength +1 (your Spells deal +1 damage)." },
n_surgeprot:{ n:"Surge Protector", e:"🔌", c:3, t:"unit", tr:"Component", a:2, h:5, kw:["jord","iso"],
  txt:"Grounded. Insulated." },
n_ball:{ n:"Ball Lightning", e:"🔮", c:4, t:"unit", a:4, h:3, kw:["turbo"],
  txt:"Turbo. Overheat (1).", bc(g,s){ g.players[s].ovlNext+=1; } },
n_scrapyard:{ n:"Scrapyard", e:"🏗️", c:4, t:"unit", a:0, h:8, kw:["jord"],
  txt:"Grounded. Breakdown: Add a random Component to your hand.",
  dr(g,s){ addHand(g,s,pick(POOL_KOMP)); } },
n_datacenter:{ n:"Data Center", e:"🏢", c:5, t:"unit", a:3, h:7, kw:["jord"],
  txt:"Grounded. Breakdown: Store 2 energy.", dr(g,s){ addStored(g,s,2); } },
n_mainframe:{ n:"THE MAINFRAME", e:"🖥️", c:8, t:"unit", r:"L", a:6, h:8, kw:["jord"],
  txt:"Grounded. At the end of your turn: Draw a card.", end(g,s,u){ draw(g,s,1); } },
t_mikrobot:{ n:"Microbot", e:"🤖", c:1, t:"unit", tr:"Robot", a:1, h:1, tok:true, txt:"" },
t_bug:{ n:"Bug", e:"🐛", c:1, t:"unit", tr:"Virus", a:1, h:1, tok:true, txt:"" },
t_server:{ n:"Server", e:"🗃️", c:3, t:"unit", tr:"Component", a:3, h:3, kw:["jord"], tok:true, txt:"Grounded." },
t_powerbank:{ n:"Powerbank", e:"🔋", c:0, t:"spell", tok:true, txt:"Gain 1 energy this turn.",
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
function sig(g,s){ let n=0; for(const u of g.players[s].board){ if(!u.sil) n+=CARDS[u.id].sig||0; } return n; }

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
  if(d0&&d1){ g.status="slut"; g.winner=2; log(g,"⚡ Double meltdown — it’s a draw!"); }
  else if(d0){ g.status="slut"; g.winner=1; log(g,"🏆 "+g.players[1].name+" wins!"); }
  else if(d1){ g.status="slut"; g.winner=0; log(g,"🏆 "+g.players[0].name+" wins!"); }
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
    log(g,"◈ "+CARDS[u.id].n+"’s insulation absorbs the damage."); return; }
  u.dmg+=n;
  fxPush(g,{t:"dmg",s:ref.s,u:u.uid,n});
  if(src&&src.host) healHero(g,src.hs,n);
  if(src&&src.hoj) u.dmg=999;
  sweep(g);
}
function healHero(g,s,n){ const p=g.players[s]; const r=Math.min(30-p.hp,n);
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
    log(g,"✕ "+CARDS[dead.id].n+" breaks down.");
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
      log(g,"🕳️ "+p.name+" is out of cards and takes "+p.fat+" fatigue damage.");
      checkWin(g); continue;
    }
    const id=p.deck.pop();
    if(p.hand.length>=MAXHAND){ log(g,"🔥 "+p.name+"’s hand is full — "+CARDS[id].n+" burns up."); }
    else p.hand.push({uid:nuid(g),id});
  }
}
function addHand(g,s,id){
  const p=g.players[s];
  if(p.hand.length>=MAXHAND){ log(g,"🔥 "+p.name+"’s hand is full — "+CARDS[id].n+" burns up."); return; }
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
  if(p.hand.length>=MAXHAND) log(g,"🔥 "+CARDS[u.id].n+" burns up — the hand was full.");
  else p.hand.push({uid:nuid(g),id:u.id});
}
function takeControl(g,s,ref){
  const u=refUnit(g,ref); if(!u) return;
  if(g.players[s].board.length>=MAXBOARD) return;
  const b=g.players[ref.s].board; b.splice(b.indexOf(u),1);
  u.jp=true; g.players[s].board.push(u);
  fxPush(g,{t:"flyt",uid:u.uid,fra:ref.s,til:s,id:u.id});
  log(g,"🥷 "+g.players[s].name+" takes control of "+CARDS[u.id].n+"!");
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
  log(g,"▶ "+p.name+" plays "+d.n+".");
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
    log(g,"⚔ "+CARDS[u.id].n+" attacks "+g.players[tref.s].name+" ("+aA+").");
    dmg(g,tref,aA,srcA);
  } else {
    const d=refUnit(g,tref); if(!d) return "The target doesn’t exist.";
    const aD=effAtk(g,tref.s,d);
    const srcD={hoj:hasKw(g,tref.s,d,"hoj"),host:hasKw(g,tref.s,d,"host"),hs:tref.s};
    log(g,"⚔ "+CARDS[u.id].n+" ("+aA+") trades with "+CARDS[d.id].n+" ("+aD+").");
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
    n:"The Technician", ico:"🧑‍🔧", col:"#e8a96a",
    power:{ n:"Soldering Iron", ico:"🔥", svg:"loddekolbe", c:2, txt:"Enemy: 1 damage · Friendly: repair 2." },
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
        log(g,"🔧 "+p.name+" repairs 2 with the soldering iron.");
      } else {
        fxPush(g,{t:"zap",fs:s,fu:null,ts:tref.s,tu:tref.u,art:"power"});
        log(g,"🔧 "+p.name+" burns the enemy with the soldering iron (1).");
        dmg(g,tref,1,null);
      }
    },
  },
  hack:{
    n:"The Hacker", ico:"🧑‍💻", col:"#c76bd9",
    power:{ n:"Breach", ico:"🐛", c:2, txt:"Summon a 1/1 Bug." },
    powerTargets(g,s){ return g.players[s].board.length<MAXBOARD?[{s,u:null}]:[]; },
    powerFx(g,s,tref){
      summon(g,s,"t_bug");
      log(g,"🐛 "+g.players[s].name+" breaches the firewall — a Bug crawls out.");
    },
  },
  over:{
    n:"The Overclocker", ico:"🧑‍🏭", col:"#ff8c5a",
    power:{ n:"Charge", ico:"🔋", c:2, txt:"Store 2 energy in the capacitor bank." },
    powerTargets(g,s){ return g.players[s].stored<MAXSTORED?[{s,u:null}]:[]; },
    powerFx(g,s,tref){
      addStored(g,s,2);
      log(g,"🔋 "+g.players[s].name+" charges the capacitor bank.");
    },
  },
};
function clsOf(g,s){ return CLASSES[g.players[s].cls]||CLASSES.tek; }
function heroTargets(g,s){ return clsOf(g,s).powerTargets(g,s); }
function heroPower(g,s,tref){
  if(g.status!=="igang"||g.active!==s) return "Not your turn.";
  const p=g.players[s], K=clsOf(g,s);
  if(p.heroUsed) return K.power.n+" has already been used.";
  if(p.cur<K.power.c) return "Not enough energy.";
  if(!heroTargets(g,s).some(r=>r.s===tref.s&&r.u===tref.u)) return "Invalid target.";
  p.heroUsed=true; p.cur-=K.power.c;
  K.powerFx(g,s,tref);
  sweep(g); checkWin(g);
  return null;
}

// ---------- tur-flow ----------
function startTurn(g){
  const s=g.active, p=g.players[s];
  g.turn++;
  p.maxE=Math.min(10,p.maxE+1);
  p.ovlShown=p.ovlNext; p.ovlNext=0;
  p.cur=Math.max(0,p.maxE-p.ovlShown)+p.stored;
  p.stored=0; p.played=0; p.heroUsed=false;
  for(const u of p.board){ u.jp=false; u.atkLeft=hasKw(g,s,u,"dob")?2:1; }
  log(g,"— Turn "+g.turn+": "+p.name+" ("+p.cur+"⚡"+(p.ovlShown?", "+p.ovlShown+" locked by overheat":"")+") —");
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
  if(gem>0){ p.stored+=gem; log(g,"🔋 "+p.name+" stores "+gem+" energy in the capacitor bank."); }
  p.cur=0;
  g.active=1-s;
  startTurn(g);
  return null;
}

// ---------- opsætning ----------
function mkPlayer(name,cid,deckIds,cls){
  return { name, cid, cls:cls||"tek", hp:30, maxE:0, cur:0, stored:0, ovlNext:0, ovlShown:0,
    heroUsed:false, played:0, fat:0, grave:0, list:deckIds.slice(),
    deck:shuffle(deckIds), hand:[], board:[] };
}
function mkState(cfg){
  const starter=cfg.starter!=null?cfg.starter:rnd(2);
  const g={ v:1, seq:1, mode:cfg.mode, code:cfg.code||null, status:"igang", winner:null,
    turn:0, active:starter, n:1, last:null, log:[], fx:[], fxk:0, hist:[], hk:0, rematch:[false,false],
    players:[ mkPlayer(cfg.names[0],cfg.cids[0],cfg.decks[0],cfg.classes&&cfg.classes[0]),
              mkPlayer(cfg.names[1],cfg.cids[1],cfg.decks[1],cfg.classes&&cfg.classes[1]) ] };
  log(g,"⚡ CARDWARE CRASH — "+g.players[0].name+" vs "+g.players[1].name+".");
  log(g,"🎲 "+g.players[starter].name+" goes first.");
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
function autoDeck(cls,allowed){
  cls=cls||"tek";
  const base=allowed&&allowed.length?COLL.filter(id=>allowed.includes(id)):COLL;
  const pool=base.filter(id=>!CARDS[id].cls||CARDS[id].cls===cls);
  const list=[]; const cnt={};
  let guard=0;
  while(list.length<DECKSIZE && guard++<2000){
    const id=pick(pool);
    const d=CARDS[id];
    const max=d.r==="L"?1:2;
    if((cnt[id]||0)>=max) continue;
    const w=1/(1+Math.abs(d.c-3));
    if(Math.random()>w+0.15) continue;
    cnt[id]=(cnt[id]||0)+1; list.push(id);
  }
  while(list.length<DECKSIZE){
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
    g.log=[]; log(g,"🎓 Tutorial started — TUTOR-9000 runs on a low battery (7 HP).");
    return g;
  },
  opp:{
    2(g){ tutPlay(g,"u_modstand"); },
    4(g){ tutPlay(g,"u_led"); },
    6(g){ tutPlay(g,"u_kampdrone");
      const d=g.players[1].board.find(u=>u.id==="u_kampdrone");
      const c=g.players[0].board.find(u=>u.id==="u_spole");
      if(d&&c) unitAttack(g,1,d.uid,{s:0,u:c.uid}); },
    8(g){ log(g,"🤖 TUTOR-9000 idles. It believes in you."); },
  },
  steps:[
    { t:"Welcome, Technician! ⚡ You only have 1 energy this turn — both cards in your hand cost more, so there\u2019s nothing to play yet. End your turn: your unspent energy is stored in the capacitor bank 🔋 for next turn.",
      hi:["end"], allow:{end:1}, done:g=>g.turn>1 },
    { t:"TUTOR-9000 plays a Resistor. Note the ⏚ — Grounded units must be attacked first.",
      hi:[], allow:{}, done:g=>g.turn===3 },
    { t:"3⚡ this turn: 2 new + 1 from the bank. Play your Coil!",
      hi:["hand:u_spole"], allow:{play:"u_spole"}, done:g=>g.players[0].board.some(u=>u.id==="u_spole") },
    { t:"Units sleep the turn they arrive (unless they have Turbo »). End your turn.",
      hi:["end"], allow:{end:1}, done:g=>g.turn===4 },
    { t:"An LED lights up on the other side…",
      hi:[], allow:{}, done:g=>g.turn===5 },
    { t:"Attack! Tap your Coil, then the Resistor — the ⏚ Grounded unit blocks everything else.",
      hi:["unit:u_spole","eunit:u_modstand"], allow:{atk:"u_spole"},
      done:g=>g.players[1].board.some(u=>u.id==="u_modstand"&&u.dmg>0) },
    { t:"It survived with 1 HP! Your hero power 🔧 Soldering Iron (2⚡) can finish it off.",
      hi:["kraft","eunit:u_modstand"], allow:{power:1,tgtUnit:"u_modstand"},
      done:g=>g.players[0].heroUsed&&!g.players[1].board.some(u=>u.id==="u_modstand") },
    { t:"Spells can hit anything targetable. Short Circuit the enemy hero!",
      hi:["hand:s_kortslut","h1"], allow:{play:"s_kortslut",tgtHero:1},
      done:g=>g.players[1].hp<=5 },
    { t:"Out of energy — end your turn.",
      hi:["end"], allow:{end:1}, done:g=>g.turn===6 },
    { t:"Turbo » units can attack units immediately — the Combat Drone rams your Coil and breaks down.",
      hi:[], allow:{}, done:g=>g.turn===7 },
    { t:"Voltage Spike deals 3 damage, but Overheat (1) locks 1⚡ next turn. Fire at the hero!",
      hi:["hand:s_spids","h1"], allow:{play:"s_spids",tgtHero:1},
      done:g=>g.players[1].hp<=2 },
    { t:"Deploy your own Combat Drone. Turbo » works on units only — heroes must wait a turn.",
      hi:["hand:u_kampdrone"], allow:{play:"u_kampdrone"},
      done:g=>g.players[0].board.some(u=>u.id==="u_kampdrone") },
    { t:"End your turn — and note the ⚠ Overheat warning on your energy bar.",
      hi:["end"], allow:{end:1}, done:g=>g.turn===8 },
    { t:"TUTOR-9000 idles…",
      hi:[], allow:{}, done:g=>g.turn===9 },
    { t:"See it? 1⚡ is locked by Overheat. Now finish it — attack the hero with your Drone!",
      hi:["unit:u_kampdrone","h1"], allow:{any:1}, done:g=>g.status==="slut" },
  ],
};

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
// langsomhed: 0 = normal fart, 1 = maks langsom. Skalerer ALLE animationers varighed.
const DEFAULT_SETTINGS = {
  slowness: 0.4,             // 40% langsommere som udgangspunkt — mere læsbart
  cardRevealMs: 1800,         // hvor længe et spillet kort vises midt på skærmen før effekten sker
  sound: true,              // lydeffekter
  music: true,              // 8-bit baggrundsmusik
  musicVol: 0.4,
  sfxVol: 0.6,
  fxMotion: true,           // partikler/rystelser
  showEnemyBanner: true,    // vis tydeligt hvad modstanderen gør
  keys: { end:" ", power:"q", cancel:"Escape", card1:"1",card2:"2",card3:"3",card4:"4",card5:"5",card6:"6",card7:"7",card8:"8",card9:"9",card10:"0" },
};
let SETTINGS = { ...DEFAULT_SETTINGS };
const _slisteners = new Set();
function applySettings(next){ SETTINGS = { ...SETTINGS, ...next }; for(const f of _slisteners) f(SETTINGS); stSet("settings", SETTINGS); }
async function loadSettings(){ const s=await stGet("settings"); if(s) SETTINGS={ ...DEFAULT_SETTINGS, ...s, keys:{ ...DEFAULT_SETTINGS.keys, ...(s.keys||{}) } }; for(const f of _slisteners) f(SETTINGS); return SETTINGS; }
function onSettings(fn){ _slisteners.add(fn); return ()=>_slisteners.delete(fn); }
// tempo-faktor: 1.0 ved 0% langsomhed, større = langsommere
function tempo(){ return 1 + SETTINGS.slowness*1.5; }
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

const CSS = `
:root{
  --bg0:#0c1811; --bg1:#12241a; --bg2:#173021; --line:#274a35;
  --cu:#c9814a; --cu2:#e8a96a; --fos:#5fe0a0; --amber:#f0b23e;
  --rod:#ff6d5a; --guld:#ffd166; --txt:#dbe7de; --dim:#87a693;
  --mono:ui-monospace,'Cascadia Mono','JetBrains Mono',Menlo,Consolas,monospace;
  --disp:'Impact','Haettenschweiler','Arial Narrow Bold',system-ui,sans-serif;
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
  background:url("data:image/svg+xml,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20width%3D'140'%20height%3D'140'%3E%3Cfilter%20id%3D'n'%3E%3CfeTurbulence%20type%3D'fractalNoise'%20baseFrequency%3D'0.85'%20numOctaves%3D'2'%20stitchTiles%3D'stitch'%2F%3E%3CfeColorMatrix%20values%3D'0%200%200%200%200.85%200%200%200%200%200.95%200%200%200%200%200.88%200%200%200%200.055%200'%2F%3E%3C%2Ffilter%3E%3Crect%20width%3D'140'%20height%3D'140'%20filter%3D'url(%23n)'%2F%3E%3C%2Fsvg%3E"),linear-gradient(180deg,var(--bg2),var(--bg1));
  background-blend-mode:overlay,normal;border:1px solid var(--line);
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;
  padding-bottom:7px;overflow:hidden;transition:transform .12s,border-color .12s,box-shadow .12s;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.07),inset 0 -2px 4px rgba(0,0,0,.35),0 3px 8px rgba(0,0,0,.4)}
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
  background:url("data:image/svg+xml,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20width%3D'140'%20height%3D'140'%3E%3Cfilter%20id%3D'n'%3E%3CfeTurbulence%20type%3D'fractalNoise'%20baseFrequency%3D'0.85'%20numOctaves%3D'2'%20stitchTiles%3D'stitch'%2F%3E%3CfeColorMatrix%20values%3D'0%200%200%200%200.85%200%200%200%200%200.95%200%200%200%200%200.88%200%200%200%200.055%200'%2F%3E%3C%2Ffilter%3E%3Crect%20width%3D'140'%20height%3D'140'%20filter%3D'url(%23n)'%2F%3E%3C%2Fsvg%3E"),linear-gradient(180deg,var(--bg2),var(--bg1));background-blend-mode:overlay,normal;
  border:1.5px solid var(--line);display:flex;align-items:center;justify-content:center;transition:border-color .12s,box-shadow .12s;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.08),inset 0 -3px 5px rgba(0,0,0,.4),0 4px 10px rgba(0,0,0,.45)}
.enh .art{width:40px;height:40px}
.enh.klar{border-color:var(--fos)!important;border-width:2px;box-shadow:0 0 15px rgba(95,224,160,.55)}
.enh.klar::after{content:"⚔";position:absolute;top:-9px;right:-6px;font-size:14px;background:var(--fos);color:#0c1811;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;box-shadow:0 0 8px rgba(95,224,160,.8);z-index:4}
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
.tgt::after{content:"🎯";position:absolute;top:-13px;left:50%;transform:translateX(-50%);
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
  background:url("data:image/svg+xml,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20width%3D'140'%20height%3D'140'%3E%3Cfilter%20id%3D'n'%3E%3CfeTurbulence%20type%3D'fractalNoise'%20baseFrequency%3D'0.85'%20numOctaves%3D'2'%20stitchTiles%3D'stitch'%2F%3E%3CfeColorMatrix%20values%3D'0%200%200%200%200.85%200%200%200%200%200.95%200%200%200%200%200.88%200%200%200%200.055%200'%2F%3E%3C%2Ffilter%3E%3Crect%20width%3D'140'%20height%3D'140'%20filter%3D'url(%23n)'%2F%3E%3C%2Fsvg%3E"),linear-gradient(180deg,var(--bg2),var(--bg1));background-blend-mode:overlay,normal;
  position:relative;overflow:hidden;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.06),inset 0 -3px 6px rgba(0,0,0,.35)}
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
.histknap{position:fixed;right:10px;bottom:calc(138px + env(safe-area-inset-bottom));z-index:36;width:38px;height:38px;border-radius:50%;
  background:var(--bg1);border:1px solid var(--line);font-size:15px}
.histknap.aktiv{border-color:var(--fos);color:var(--fos)}
.histrail{position:fixed;right:6px;top:70px;bottom:calc(150px + env(safe-area-inset-bottom));z-index:35;
  width:62px;display:flex;flex-direction:column;align-items:center;gap:6px;
  overflow-y:auto;overflow-x:hidden;scrollbar-width:none;
  padding:6px 4px;border-radius:12px;background:rgba(8,14,10,.72);border:1px solid var(--line)}
.histrail::-webkit-scrollbar{display:none}
.histrail .htop{position:sticky;top:-6px;z-index:2;width:100%;padding:2px 0 4px;text-align:center;
  background:rgba(8,14,10,.95);font-family:var(--mono);font-size:8.5px;letter-spacing:1px;color:var(--dim)}
.histrail .htom{font-family:var(--mono);font-size:9px;color:var(--dim);text-align:center;padding:10px 2px;line-height:1.4}
.hkort{position:relative;flex:none;width:50px;height:52px;border-radius:7px;cursor:pointer;
  display:flex;align-items:center;justify-content:center;
  background:linear-gradient(180deg,var(--ct),var(--cb));border:1px solid color-mix(in srgb,var(--ce) 45%,transparent);
  border-left:3px solid var(--dim);overflow:hidden;transition:transform .12s,box-shadow .12s;
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
  .histrail{width:74px;top:84px;bottom:214px}
  .hkort{width:60px;height:62px}.hkort .art{width:42px;height:42px}
  .histknap{bottom:204px}
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
.gitter{display:grid;grid-template-columns:repeat(auto-fill,minmax(66px,1fr));gap:8px;justify-items:center;padding-bottom:14px}
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
.mkort.tema{background:linear-gradient(180deg,var(--ct),var(--cb));border-color:color-mix(in srgb,var(--ce) 55%,transparent)}
.mkort.tema::after{background:var(--ce)}
.enh.tema{background:linear-gradient(180deg,var(--ct),var(--cb));border-color:color-mix(in srgb,var(--ce) 55%,transparent)}
.storkort.tema{background:linear-gradient(180deg,var(--ct),var(--cb));border-color:color-mix(in srgb,var(--ce) 60%,transparent)}
.storkort.tema .top{background:color-mix(in srgb,var(--ct) 60%,#0c1811);border-color:color-mix(in srgb,var(--ce) 40%,transparent)}
.storkort.tema.leg{border-color:var(--guld)}
/* ---- dybde & liv ---- */
.mkort{box-shadow:0 4px 10px rgba(0,0,0,.45)}
.enh{box-shadow:0 3px 8px rgba(0,0,0,.4)}
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
  .haand .mkort:hover{transform:rotate(0deg) translateY(-34px) scale(1.16);z-index:6}
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
const POWERSVG = {
  loddekolbe: '<svg viewBox="0 0 24 24" width="1em" height="1em" style="vertical-align:-0.12em"><path d="M20 4 L14 10" stroke="#c9814a" stroke-width="2.4" stroke-linecap="round"/><path d="M13 11 L9 15" stroke="#9aa7a0" stroke-width="3.2" stroke-linecap="round"/><path d="M9 15 L5 19 L4 20" stroke="#8b6cff" stroke-width="2" stroke-linecap="round" fill="none"/><path d="M6 18 c-1 1 -2 1 -2 2 c1 0 1 -1 2 -2" fill="#ffb347"/><circle cx="6.5" cy="17.5" r="1.6" fill="#ff8c3a"/></svg>',
};
function PowerIcon({p}){
  if(p&&p.svg&&POWERSVG[p.svg]) return <span className="pwsvg" dangerouslySetInnerHTML={{__html:POWERSVG[p.svg]}}/>;
  return <span>{p?p.ico:""}</span>;
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
function KwBadge({k,live,big}){
  const info=KWSVG[k]; if(!info) return null;
  const sz=big?31:26;
  return (
    <span className={"kwb"+(big?" big":"")} style={{color:info.c,borderColor:info.c}} title={info.t}
      dangerouslySetInnerHTML={{__html:'<svg viewBox="0 0 24 24" width="'+sz+'" height="'+sz+'">'+info.svg+'</svg>'}}/>
  );
}
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
          <span className="ctip-c">{d.c}⚡</span>
          <span className="ctip-n">{d.n}</span>
        </div>
        <div className="ctip-t">{d.t==="unit"?"Unit":"Spell"}{d.tr?" · "+d.tr:""}{d.cls&&CLASSES[d.cls]?" · "+CLASSES[d.cls].n:""}{d.r==="L"?" · ★ Legendary":""}{d.r==="R"?" · ◆ Rare":""}</div>
        {d.t==="unit" && <div className="ctip-s">⚔ {atk} &nbsp; ❤ {hp}</div>}
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
function MiniCard({id,onClick,glow,count,style,dfx,xcls,tip,onPointerDown}){
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
}
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
      {rec.kills.length>0 && <span className="hdoed">☠{rec.kills.length>1?rec.kills.length:""}</span>}
    </div>
  );
}
function HistTip({rec,pos,navne}){
  const d=CARDS[rec.id]; if(!d) return null;
  const opS=1-rec.s;
  const chips=[];
  const sMod=histSkade(rec,opS), sSelv=histSkade(rec,rec.s);
  const hMod=histHeal(rec,opS), hSelv=histHeal(rec,rec.s);
  if(sMod>0) chips.push(<span key="sm" className="chip skade">−{sMod} ❤ {navne[opS]}</span>);
  if(sSelv>0) chips.push(<span key="ss" className="chip skade">−{sSelv} ❤ {navne[rec.s]}</span>);
  if(hMod>0) chips.push(<span key="hm" className="chip heal">+{hMod} ❤ {navne[opS]}</span>);
  if(hSelv>0) chips.push(<span key="hs" className="chip heal">+{hSelv} ❤ {navne[rec.s]}</span>);
  for(const k of rec.kills) chips.push(
    <span key={"k"+chips.length} className={"chip doed"+(k.s===rec.s?" selv":"")}>
      ☠ {CARDS[k.id]?CARDS[k.id].n:"?"}{k.s===rec.s?" (own)":""}</span>);
  for(const u of rec.sum) chips.push(<span key={"s"+chips.length} className="chip">✦ {CARDS[u.id]?CARDS[u.id].n:"?"}</span>);
  // dødsfald står allerede som chips — undgå dobbeltinfo i log-linjerne
  const linjer=rec.lines.filter(l=>!l.startsWith("✕ "));
  const tomt = chips.length===0 && linjer.length===0;
  return (
    <div className="histtip" style={{...themeVars(d),top:pos.top,right:pos.right}}>
      <div className="hth"><b>{d.n}</b><span>{d.c}⚡</span></div>
      <div className="htmeta">{navne[rec.s]} · round {rec.r} · {d.t==="unit"?"unit":"spell"}</div>
      {chips.length>0 && <div className="htchips">{chips}</div>}
      {linjer.length>0 && <div className="htlinjer">{linjer.map((l,i)=><div key={i}>{l}</div>)}</div>}
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
    setTip({rec,pos:{top,right:vw-b.left+10}});
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
function StorKort({id,unitInfo,g}){
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
          <div className="meta">{d.c}⚡ · {d.cls&&CLASSES[d.cls]?CLASSES[d.cls].n+" · ":""}{d.t==="unit"?"Unit":"Spell"}{d.tr?" · "+d.tr:""}{d.r==="L"?" · ★ Legendary":""}</div>
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
          <span style={{color:"var(--amber)"}}>⚔ {live?live.a:d.a}</span>
          <span style={{color:live&&live.h<live.m?"var(--rod)":"var(--fos)"}}>♥ {live?live.h+"/"+live.m:d.h}</span>
        </div>
      )}
    </div>
  );
}
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
  return <span className="pips">{el}<span style={{marginLeft:5,color:"var(--amber)"}}>{p.cur}⚡</span></span>;
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
      <span className="heltikon">{K.ico}</span>
      <span className="heltinfo">
        <span className="nm">{p.name}</span>
        <span className="heltklasse">{K.n}</span>
        <span className={"hp"+(p.hp<=10?" lav":"")}>❤ {p.hp}</span>
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
function CardArt({id,pattern,className}){
  const inner=useMemo(()=>{
    const d=CARDS[id], ac=artAccent(d), rnd=mulberry(seedOf(id));
    let out="";
    if(pattern) out+=circuitArt(mulberry(seedOf(id+"p")),190,165,560,535,ARTC.cu,7,0.3)
                    +circuitArt(mulberry(seedOf(id+"q")),190,165,560,535,ac,3,0.2);
    out+=motifArt(d,ac,rnd,id);
    return out;
  },[id,pattern]);
  return <svg className={"art"+(className?" "+className:"")} viewBox="172 148 406 414"
    dangerouslySetInnerHTML={{__html:inner}}/>;
}

const CLS_LIST=["tek","hack","over"];
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
              <span style={{fontSize:22}}>{k.ico}</span><br/>{k.n.replace("The ","")}
            </button>);
        })}
      </div>
      <div className="kinfo"><PowerIcon p={K.power}/> <b>{K.power.n}</b> ({K.power.c}⚡): {K.power.txt}</div>
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
          <div className="chathead"><span>💬 Chat</span><button className="chatx" onClick={aabn}>✕</button></div>
          <div className="chatlist" ref={listRef}>
            {beskeder.length===0 && <div className="chattom">Say hi to {opNavn} 👋</div>}
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
            <button className="chatsend" onClick={send}>➤</button>
          </div>
        </div>
      )}
      <button className="chatknap" onClick={aabn} title="Chat">
        💬{uleste>0 && <span className="chatbadge">{uleste>9?"9+":uleste}</span>}
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
          ? "⚔ "+CARDS[u.id].n+" attacking — tap a red target"
          : "⚔ "+CARDS[u.id].n+" — Turbo can hit units only its first turn (hero next turn)";
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
      setT({list,label:"▶ "+CARDS[c.id].n+" — choose a target",run:r=>act(x=>playCard(x,seat,c.uid,r))});
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
  const kanKraft=myTurn&&!me.heroUsed&&me.cur>=K.power.c;
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

  const [slowUI,setSlowUI]=useState(SETTINGS.slowness);
  useEffect(()=>onSettings(s=>setSlowUI(s.slowness)),[]);
  const tempoVar=1+slowUI*1.5;
  const [keys,setKeys]=useState(SETTINGS.keys);
  useEffect(()=>onSettings(s=>setKeys(s.keys)),[]);
  // historik-skinnen: åben som udgangspunkt på brede skærme, ellers via knappen
  const [visHist,setVisHist]=useState(()=>typeof window!=="undefined" && window.innerWidth>=820);

  return (
    <div className={"spilflade"+(tmode?" targeting":"")+(tmode&&tmode.atk?" atkmode":"")} style={{"--tempo":tempoVar}}>
      <BoardDecor/>
      {mode==="online" && kode && <ChatBox kode={kode} seat={seat} navn={me.name} opNavn={op.name}/>}
      {tmode && <button className={"banner"+(tmode.atk?" atk":"")} onClick={()=>setT(null)}>{tmode.label}<span className="bx">· tap here to cancel</span></button>}
      {turban>0 && myTurn && !slut && <div key={turban} className="turban">YOUR TURN</div>}

      {/* modstander */}
      <div className="bar">
        <HeltPlade g={g} s={1-seat} me={false} tuthi={hiB("h1")} hilite={isTgt({s:1-seat,u:null})} shake={shake.has("h"+(1-seat))}
          dragtgt={isDragTgt({s:1-seat,u:null})}
          onClick={()=>klikHelt(1-seat)}/>
        <Pips p={op}/>
        <span style={{marginLeft:"auto",display:"flex",alignItems:"center"}}>
          {Array.from({length:Math.min(op.hand.length,9)}).map((_,i)=><span key={i} className="ryg"/>)}
          <span style={{marginLeft:8,color:"var(--dim)"}}>🂠{op.deck.length}</span>
        </span>
      </div>
      <div className="braet op" ref={opAreaRef}>
        {op.board.length===0&&<span style={{color:"var(--dim)",fontFamily:"var(--mono)",fontSize:11}}>— empty board —</span>}
        {op.board.map(u=>
          <UnitTile key={u.uid} g={g} s={1-seat} u={u} mine={false} tuthi={hiB("eunit:"+u.id)} shake={shake.has(u.uid)}
            dragtgt={isDragTgt({s:1-seat,u:u.uid})}
            hilite={isTgt({s:1-seat,u:u.uid})} onClick={()=>klikEnhed(1-seat,u)}/>)}
      </div>

      <div className="midt">
        <span>Round {Math.max(1,Math.ceil(g.turn/2))}</span>
        <span style={{color:myTurn?"var(--fos)":"var(--dim)"}}>{slut?"Game over":(myTurn?"⚡ Your turn":"Waiting for "+op.name+"…")}</span>
        <button className={"slutknap"+(hiB("end")?" tuthi":"")+(nedtael!=null?" haster":"")} disabled={!myTurn||slut}
          onClick={()=>{ if(!tOK("end")){nope();return;} Audio8.sfx.endturn(); act(x=>endTurn(x,seat)); }}>
          END TURN
          {nedtael!=null && <span className="nedtael">{nedtael}</span>}
        </button>
      </div>

      {kanAngribe>0 && mode!=="tutorial" &&
        <div className="atkhint">⚔ Tap a unit with a sword badge, then tap what you want to attack</div>}
      <div className={"braet"+(drag&&drag.over?" dropzone":"")} ref={braetRef}>
        {me.board.length===0&&<span style={{color:"var(--dim)",fontFamily:"var(--mono)",fontSize:11}}>— empty board —</span>}
        {me.board.map(u=>
          <UnitTile key={u.uid} g={g} s={seat} u={u} mine={true} tuthi={hiB("unit:"+u.id)} shake={shake.has(u.uid)}
            ready={myTurn&&attackTargets(g,seat,u.uid).length>0}
            onPointerDown={(e)=>startAttackDrag(u,e)}
            dragtgt={isDragTgt({s:seat,u:u.uid})}
            hilite={isTgt({s:seat,u:u.uid})} onClick={()=>klikEnhed(seat,u)}/>)}
      </div>

      {/* mig */}
      <div className="bar min">
        <HeltPlade g={g} s={seat} me={true} hilite={isTgt({s:seat,u:null})} shake={shake.has("h"+seat)} dragtgt={isDragTgt({s:seat,u:null})} onClick={()=>klikHelt(seat)}/>
        <Pips p={me}/>
        <button className={"kraft"+(hiB("kraft")?" tuthi":"")} disabled={!kanKraft} onClick={kraft} title={K.power.n+" ("+K.power.c+"⚡)"}><PowerIcon p={K.power}/></button>
        <span style={{marginLeft:"auto",color:"var(--dim)"}}>🂠{me.deck.length}</span>
        <button style={{color:"var(--dim)",fontSize:16,padding:"0 4px"}} onClick={()=>setBekraeft(true)}>🏳</button>
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
          <span className="cava">🤖</span>
          <div className="ctxt">{step.t}<div className="cnum">{tut+1} / {TUT.steps.length}</div></div>
          <button className="cx" onClick={onLeave} title="Skip tutorial">✕</button>
        </div>)}
      {drag && drag.kind==="play" && <div className={"dragkort"+((drag.over||drag.tgt)?" over":"")} style={{left:drag.x,top:drag.y}}><MiniCard id={drag.id}/></div>}
      {drag && drag.kind==="atk" && <div className={"dragatk"+(drag.tgt?" hit":"")} style={{left:drag.x,top:drag.y}}>⚔</div>}
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
      {visHist && <HistRail g={g} seat={seat} navne={[g.players[0].name,g.players[1].name]}/>}
      <button className={"histknap"+(visHist?" aktiv":"")} onClick={()=>setVisHist(v=>!v)}
        title="Played cards">🃏</button>
      <button className="logknap" onClick={()=>setVisLog(v=>!v)}>{visLog?"✕":"📜"}</button>
      {visLog && (
        <div className="logpanel">
          <div className="lhoved">
            <span>📜 Combat log</span>
            <button className="lluk" onClick={()=>setVisLog(false)}>✕</button>
          </div>
          <div className="lkrop">{g.log.slice().reverse().map((l,i)=><div key={i}>{l}</div>)}</div>
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
                ⚡ Play ({CARDS[sel.id].c} energy)
              </button>)}
            <button className="knap" onClick={()=>setSel(null)}>Close</button>
          </div>
        </div>
      )}

      {bekraeft && (
        <div className="slor" onClick={()=>setBekraeft(false)}>
          <div className="ark" onClick={e=>e.stopPropagation()}>
            <p className="rt">Do you want to concede?</p>
            <button className="knap cu" onClick={()=>{setBekraeft(false);onConcede();}}>🏳 Yes, concede</button>
            <button className="knap" onClick={()=>setBekraeft(false)}>No, keep playing</button>
          </div>
        </div>
      )}

      {slut && (
        <div className={"slor"+(g.winner===seat?" sejr":"")}>
          {g.winner===seat && <VictoryFX/>}
          <div className="ark" style={{textAlign:"center"}}>
            <div className={"logo"+(g.winner===seat?" vlogo":"")+(slut&&g.winner!==seat&&g.winner!==2?" neonwrap":"")} style={{fontSize:g.winner===seat?46:34}}>
              {g.winner===2?"DRAW":(g.winner===seat?"VICTORY":<BrokenNeon text="BREAKDOWN"/>)}
              {g.winner===seat && <span className="vbadge">⚡</span>}
            </div>
            <p className="rt" style={{color:"var(--dim)"}}>
              {g.winner===2?mode==="tutorial"?"Tutorial complete — you know the basics! Try the bot next. ⚡":"Both circuits burned out.":(g.winner===seat?(mode==="tutorial"?"Tutorial complete — you know the basics! Try the bot next. ⚡":"Your opponent’s circuit burned out."):"Your circuit burned out.")}
            </p>
            {mode==="online" ? (
              <button className="knap cu" disabled={g.rematch[seat]} onClick={onRematch}>
                {g.rematch[seat]?"Waiting for opponent…":(g.rematch[1-seat]?"🔁 Rematch (opponent is ready!)":"🔁 Rematch")}
              </button>
            ) : (
              mode==="tutorial"?null:<button className="knap cu" onClick={onRematch}>🔁 Rematch</button>
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
  const pct=Math.round(s.slowness*100);
  const keyName=(k)=> k===" "?"Space": k==="Escape"?"Esc": (k||"").length===1?k.toUpperCase():k;
  const shortcuts=[
    ["end","End turn"],["power","Hero power"],["cancel","Cancel / deselect"],
    ["card1","Play hand card 1"],["card2","Card 2"],["card3","Card 3"],["card4","Card 4"],["card5","Card 5"],
    ["card6","Card 6"],["card7","Card 7"],["card8","Card 8"],["card9","Card 9"],["card10","Card 10"],
  ];
  return (
    <div className="ark setwrap">
      <div className="logo" style={{fontSize:26,marginBottom:14}}>⚙️ SETTINGS</div>

      <div className="setsec">
        <div className="seth">Game speed</div>
        <p className="setnote">How slow and readable the animations play. Higher = slower, easier to follow what happens.</p>
        <div className="setrow">
          <input type="range" min="0" max="100" value={pct}
            onChange={e=>upd({slowness:(+e.target.value)/100})} className="slider"/>
          <span className="setval">{pct}% slow</span>
        </div>
        <div className="setpreset">
          {[0,25,50,75,100].map(v=>(
            <button key={v} className={"minknap"+(pct===v?" aktiv":"")} onClick={()=>upd({slowness:v/100})}>{v}%</button>
          ))}
        </div>
        <p className="setnote" style={{marginTop:14}}>How long a played card is shown in the centre of the screen before its effect happens. Set to 0 to turn it off.</p>
        <div className="setrow">
          <input type="range" min="0" max="4000" step="100" value={s.cardRevealMs}
            onChange={e=>upd({cardRevealMs:+e.target.value})} className="slider"/>
          <span className="setval">{s.cardRevealMs===0?"off":(s.cardRevealMs/1000).toFixed(1)+"s"}</span>
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
function DeckBuilder({decks,gemDecks,onBack,flash,unlocked}){
  const [cards,setCards]=useState([]);
  const [navn,setNavn]=useState("My deck");
  const [dbCls,setDbCls]=useState("tek");
  const [tab,setTab]=useState("bib");
  const [fC,setFC]=useState(null);
  const [fT,setFT]=useState(null);
  const [q,setQ]=useState("");
  const [sel,setSel]=useState(null);
  const cnt=useMemo(()=>{ const m={}; for(const id of cards) m[id]=(m[id]||0)+1; return m; },[cards]);
  const filt=COLL.filter(id=>{
    const d=CARDS[id];
    if(d.cls&&d.cls!==dbCls) return false;
    if(fC!=null && (fC===7?d.c<7:d.c!==fC)) return false;
    if(fT && d.t!==fT) return false;
    if(q && !d.n.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  const add=id=>{
    if(unlocked && !unlocked.has(id)) return flash("🔒 "+CARDS[id].n+" is locked — win games to unlock it!");
    const max=CARDS[id].r==="L"?1:2;
    if((cnt[id]||0)>=max) return flash("Max "+max+"× "+CARDS[id].n+".");
    if(cards.length>=DECKSIZE) return flash("The deck is full ("+DECKSIZE+").");
    setCards(c=>[...c,id]);
  };
  const rem=id=>setCards(c=>{ const i=c.indexOf(id); if(i<0) return c; const n=c.slice(); n.splice(i,1); return n; });
  const gem=()=>{
    const err=validateDeck(cards,dbCls); if(err) return flash(err);
    const n=navn.trim()||"My deck";
    const nx=decks.filter(d=>d.name!==n).concat([{name:n,cls:dbCls,cards:cards.slice()}]);
    gemDecks(nx); flash("💾 “"+n+"” saved.");
  };
  const unik=Object.keys(cnt).sort((a,b)=>CARDS[a].c-CARDS[b].c||CARDS[a].n.localeCompare(CARDS[b].n,"en"));
  const kurve=[0,1,2,3,4,5,6,7].map(c=>cards.filter(id=>c===7?CARDS[id].c>=7:CARDS[id].c===c).length);
  const kMax=Math.max(1,...kurve);
  return (
    <div className="pane">
      <button className="tilbage" onClick={onBack}>← Back</button>
      <div className="logo" style={{fontSize:26}}>CARD LIBRARY</div>
      <div className="ulinie">{COLL.length} cards · deck: {cards.length}/{DECKSIZE}</div>
      <ClassPick value={dbCls} onChange={c=>{
        if(c===dbCls) return;
        setDbCls(c);
        const rest=cards.filter(id=>!CARDS[id].cls||CARDS[id].cls===c);
        if(rest.length!==cards.length){ setCards(rest); flash("Removed cards from another class."); }
      }}/>
      <div className="faner">
        <button className={"fane"+(tab==="bib"?" aktiv":"")} onClick={()=>setTab("bib")}>Library</button>
        <button className={"fane"+(tab==="deck"?" aktiv":"")} onClick={()=>setTab("deck")}>Your deck ({cards.length}/{DECKSIZE})</button>
      </div>

      {tab==="bib" && <>
        <input placeholder="Search cards…" value={q} onChange={e=>setQ(e.target.value)}/>
        <div className="filterraek">
          {[0,1,2,3,4,5,6,7].map(c=>
            <button key={c} className={"fknap"+(fC===c?" aktiv":"")} onClick={()=>setFC(fC===c?null:c)}>{c===7?"7+":c}⚡</button>)}
          <button className={"fknap"+(fT==="unit"?" aktiv":"")} onClick={()=>setFT(fT==="unit"?null:"unit")}>Units</button>
          <button className={"fknap"+(fT==="spell"?" aktiv":"")} onClick={()=>setFT(fT==="spell"?null:"spell")}>Spells</button>
        </div>
        <div className="gitter">
          {filt.map(id=>{
            const laast=unlocked&&!unlocked.has(id);
            return <div key={id} className={"bibkort"+(laast?" laast":"")}>
              <MiniCard id={id} count={cnt[id]||null} onClick={()=>setSel(id)}/>
              {laast&&<span className="laas">🔒</span>}
            </div>;})}
        </div>
      </>}

      {tab==="deck" && <>
        <div className="kurve">
          {kurve.map((v,i)=>
            <div key={i} className="soejle" style={{height:(v/kMax*100)+"%"}}><i>{v||""}</i><b>{i===7?"7+":i}</b></div>)}
        </div>
        <div style={{height:16}}/>
        {unik.length===0 && <p className="rt" style={{color:"var(--dim)"}}>The deck is empty. Add cards from the library, or tap Auto-fill.</p>}
        {unik.map(id=>
          <div key={id} className="dlinje">
            <span className="c">{CARDS[id].c}</span>
            <span>{CARDS[id].e} {CARDS[id].n}{CARDS[id].r==="L"?" ★":""} {cnt[id]>1?"×"+cnt[id]:""}</span>
            <button className="x" onClick={()=>rem(id)}>−</button>
          </div>)}
        <div className="raek" style={{marginTop:14}}>
          <button className="knap" style={{marginTop:0}} onClick={()=>{
            const c=cards.slice(); const t={...cnt};
            const pool=COLL.filter(id=>!CARDS[id].cls||CARDS[id].cls===dbCls);
            let guard=0;
            while(c.length<DECKSIZE&&guard++<2000){
              const id=pick(pool); const max=CARDS[id].r==="L"?1:2;
              if((t[id]||0)>=max) continue; t[id]=(t[id]||0)+1; c.push(id);
            }
            setCards(c);
          }}>🎲 Auto-fill</button>
          <button className="knap" style={{marginTop:0}} onClick={()=>setCards([])}>Clear</button>
        </div>
        <div className="etiket">Save deck</div>
        <div className="raek">
          <input value={navn} onChange={e=>setNavn(e.target.value)} placeholder="Deck name"/>
          <button className="knap cu" style={{marginTop:0,width:"auto",flex:"none"}} onClick={gem}>💾 Save</button>
        </div>
        {decks.length>0 && <>
          <div className="etiket">Saved decks</div>
          {decks.map((d,i)=>
            <div key={i} className="dlinje">
              <span>{(CLASSES[d.cls||"tek"]||CLASSES.tek).ico} {d.name}</span>
              <button className="x" style={{color:"var(--fos)"}} onClick={()=>{setCards(d.cards.slice());setNavn(d.name);setDbCls(d.cls||"tek");flash("Loaded “"+d.name+"”.");}}>Load</button>
              <button className="x" onClick={()=>gemDecks(decks.filter((_,j)=>j!==i))}>Delete</button>
            </div>)}
        </>}
      </>}

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
      <h2 className="ov">Energy ⚡</h2>
      <p className="rt">You start with 1 energy and gain +1 per turn (max 10). Cards cost energy to play. The Soldering Iron (🔧, your hero power) costs 2⚡ and deals 1 damage to an enemy or repairs 2 on something friendly — once per turn.</p>
      <p className="rt"><b>The capacitor bank 🔋:</b> Unspent energy at the end of your turn is stored (up to 3) and added to your energy next turn. Some cards fill the bank directly.</p>
      <p className="rt"><b>Overheat:</b> Powerful cards lock part of your energy on the following turn. Cheap effect now, the bill arrives later.</p>
      <h2 className="ov">Combat</h2>
      <p className="rt">Units can’t attack the turn they are played (unless they have Turbo). When a unit attacks another, they damage each other simultaneously. Max 6 units on the board and 9 cards in hand. If your deck runs out, you take escalating fatigue damage.</p>
      <h2 className="ov">Classes</h2>
      <p className="rt">Each player picks a class. Class cards (marked with a colored dot) can only go in that class’s decks; all other cards are neutral.</p>
      {CLS_LIST.map(c=>{const k=CLASSES[c];return (
        <p className="rt" key={c}><b style={{color:k.col}}>{k.ico} {k.n}</b> — <PowerIcon p={k.power}/> {k.power.n} ({k.power.c}⚡): {k.power.txt}</p>);})}
      <h2 className="ov">Keywords</h2>
      <table className="kwtab"><tbody>
        {Object.values(KWINFO).map(k=><tr key={k.n}><td>{k.ico} {k.n}</td><td>{k.d}</td></tr>)}
        <tr><td>📶 Signal Strength +X</td><td>Your Spells deal X extra damage.</td></tr>
        <tr><td>Install</td><td>Effect that triggers when the card is played from your hand.</td></tr>
        <tr><td>Breakdown</td><td>Effect that triggers when the unit is destroyed.</td></tr>
        <tr><td>Chain</td><td>Bonus if you have already played another card this turn.</td></tr>
        <tr><td>Reset</td><td>Removes all card text and all buffs from a unit.</td></tr>
      </tbody></table>
      <h2 className="ov">Deck</h2>
      <p className="rt">Exactly {DECKSIZE} cards. Max 2 of each card, max 1 of each legendary (★). The second player starts with an extra card and a Powerbank (0⚡: gain 1 energy).</p>
      <h2 className="ov">Online</h2>
      <p className="rt">Create a game and share the 4-character code with your opponent — you both need <b>the same artifact link</b> open. The game syncs automatically with a couple of seconds’ delay. Note: game data is kept in the artifact’s shared storage and can in principle be seen by other users of the artifact.</p>
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
        <div className="unlocktitel">{d.r==="L"?"★ LEGENDARY UNLOCKED":"◆ NEW CARD UNLOCKED"}</div>
        <div className="unlockkort"><StorKort id={id}/></div>
        <p className="rt" style={{color:"var(--dim)",marginTop:8}}>Added to your collection — build it into a deck!</p>
        <button className="knap cu" onClick={onClose}>Nice!</button>
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

  const seatNu = mode==="lokal" ? (g?g.active:0) : (mode==="tutorial" ? 0 : seat);
  const minTur = !!g && g.status==="igang" && g.active===seatNu && (mode!=="lokal"||!handoff);

  const doAct=fn=>{
    const g2=act(fn);
    if(g2&&mode==="lokal"&&g2.status==="igang"&&g2.active!==seatNu) setHandoff(true);
  };
  const opgiv=()=>{
    act(x=>{ if(x.status!=="igang") return "The game is already over.";
      x.status="slut"; x.winner=1-seatNu; log(x,"🏳 "+x.players[seatNu].name+" pulls the plug."); return null; });
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
    const ng=mkState({mode:"solo",names:[(navn||"Technician").trim()||"Technician","🤖 The Bot"],
      cids:[cid.current||"p1","bot"],decks:[d1,d2],classes:[cls,cls2]});
    kode.current=null; setMode("solo"); setSeat(0); setHandoff(false); setG(ng); setSkaerm("spil");
  };
  const botSteps=useRef(0);
  useEffect(()=>{
    if(mode!=="solo"||!g||g.status!=="igang") return;
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
      <option value="auto">🎲 Auto deck (random)</option>
      {decks.filter(d=>(d.cls||"tek")===k).map(d=><option key={d.name} value={d.name}>🗂 {d.name}</option>)}
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
        <button className="knap cu" onClick={startSolo}>🤖 Play vs the bot<small>Built-in opponent — great for learning the cards</small></button>
        <button className="knap" onClick={startTutorial}>🎓 Interactive tutorial<small>Learn the game in five guided turns</small></button>
        {onlineOK ? <>
          <div className="etiket">Online</div>
          <button className="knap" onClick={opretOnline}>🌐 Create online game<small>Get a code to share with your opponent</small></button>
          <div className="raek" style={{marginTop:10}}>
            <input placeholder="CODE" value={joinKode} maxLength={4}
              style={{textTransform:"uppercase",fontFamily:"var(--mono)",letterSpacing:3,width:110,flex:"none"}}
              onChange={e=>setJoinKode(e.target.value)}/>
            <button className="knap" style={{marginTop:0}} onClick={deltagOnline}>➜ Join / resume</button>
          </div>
        </> : <>
          <div className="etiket">Online</div>
          <p className="rt" style={{color:"var(--dim)"}}>Online play requires the Claude artifact edition with shared storage — solo and local play work here.</p>
        </>}
        <div className="etiket">Local</div>
        <button className="knap" onClick={startLokal}>🎮 Local 2-player game<small>Take turns on the same device</small></button>
        <div className="etiket">Other</div>
        <button className="knap" onClick={()=>setSkaerm("deck")}>🃏 Card library & deck builder</button>
        <button className="knap" onClick={()=>setSkaerm("regler")}>📖 Rules</button>
        <button className="knap" onClick={()=>setSkaerm("settings")}>⚙️ Settings</button>
        {profil && (()=>{ const u=unlockedSetAf(profil);
          return <div className="samling">🃏 Collection: <b>{u.size}</b>/{COLL.length} cards · 🏆 {profil.wins||0} wins
            {u.size<COLL.length && <span className="samlinghint"> — win games to unlock more!</span>}</div>; })()}
      </div>
    );
  }
  else if(skaerm==="deck"){
    indhold=<DeckBuilder decks={decks} gemDecks={gemDecks} onBack={()=>setSkaerm("menu")} flash={flash} unlocked={profil?unlockedSetAf(profil):null}/>;
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
                <button className="knap cu" onClick={()=>setHandoff(false)}>⚡ Start my turn</button>
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
      {toast&&<div className="toast">{toast}</div>}
    </div>
  );
}
