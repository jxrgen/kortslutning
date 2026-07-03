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

const KWINFO = {
  jord:   { n:"Grounded",      ico:"⏚",  d:"Enemies must attack Grounded units first." },
  turbo:  { n:"Turbo",         ico:"»",  d:"Can attack units the turn it is played." },
  iso:    { n:"Insulated",     ico:"◈",  d:"Ignores the first damage it takes." },
  hoj:    { n:"High Voltage",  ico:"☠",  d:"Destroys any unit it damages." },
  dob:    { n:"Dual Core",     ico:"×2", d:"Can attack twice per turn." },
  host:   { n:"Energy Harvest",ico:"♥+", d:"Damage dealt by this unit repairs your hero for the same amount." },
  skjul:  { n:"Cloaked",       ico:"▒",  d:"Can\u2019t be targeted until it attacks." },
  noHero: { n:"Units only",    ico:"⊘",  d:"Can\u2019t attack heroes." },
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
s_loddetin:{ n:"Solder", e:"🔗", c:1, t:"spell", txt:"Give a friendly unit +0/+3.", tgt:"funit",
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
s_kabels:{ n:"Cable Spaghetti", e:"🍝", c:2, t:"spell", txt:"Swap a unit’s Attack and Health.", tgt:"unit",
  fx(g,s,t){ const u=refUnit(g,t); if(!u) return; const hpNow=Math.max(0,u.hM-u.dmg); const oldA=u.a;
    u.a=hpNow; u.hM=oldA; u.dmg=0; if(u.hM<=0){ u.dmg=999; } } },
s_reserve:{ n:"Spare Parts", e:"📦", c:2, t:"spell", txt:"Add 2 random Components to your hand.",
  fx(g,s){ for(let i=0;i<2;i++){ const id=pick(POOL_KOMP); if(id) addHand(g,s,id); } } },
s_firmware:{ n:"Firmware Update", e:"⬆️", c:3, t:"spell", txt:"Give all your units +1/+1.",
  fx(g,s){ for(const u of g.players[s].board){ u.a+=1; u.hM+=1; } } },
s_genoplad:{ n:"Recharge", e:"🔋", c:3, t:"spell", txt:"Repair your hero and all friendly units for 3.",
  fx(g,s){ healHero(g,s,3); for(const u of g.players[s].board) u.dmg=Math.max(0,u.dmg-3); } },
s_hack:{ n:"Hack", e:"🥷", c:3, t:"spell", txt:"Take control of an enemy unit with 2 or less Attack.",
  tgt:"eunit", f:(g,s,r,u)=>effAtk(g,r.s,u)<=2 && g.players[s].board.length<MAXBOARD,
  fx(g,s,t){ takeControl(g,s,t); } },
s_induk:{ n:"Induction", e:"🧲", c:3, t:"spell", txt:"Gain 1 energy this turn. Draw a card.",
  fx(g,s){ g.players[s].cur+=1; draw(g,s,1); } },
s_backup:{ n:"Backup", e:"🗄️", c:3, t:"spell", txt:"Add a copy of a friendly unit to your hand.", tgt:"funit",
  fx(g,s,t){ const u=refUnit(g,t); if(u) addHand(g,s,u.id); } },
s_kompil:{ n:"Compile", e:"⌨️", c:3, t:"spell", txt:"Draw a random Spell from your deck.",
  fx(g,s){ tutor(g,s,id=>CARDS[id].t==="spell"); } },
s_kadelyn:{ n:"Chain Lightning", e:"🌩️", c:4, t:"spell", txt:"Deal 3 damage to an enemy unit and 2 to its neighbors.", tgt:"eunit",
  fx(g,s,t){ const b=sig(g,s); const adj=neighbors(g,t); dmg(g,t,3+b,null); for(const r of adj) dmg(g,r,2+b,null); } },
s_magnet:{ n:"Magnetic Field", e:"🌀", c:4, t:"spell", txt:"Deal 2 damage to all enemy units.",
  fx(g,s){ aoe(g,1-s,2+sig(g,s)); } },
s_forstark:{ n:"Power Amplifier", e:"📢", c:4, t:"spell", txt:"Double a friendly unit’s Attack.", tgt:"funit",
  fx(g,s,t){ const u=refUnit(g,t); if(u) u.a*=2; } },
s_gendan:{ n:"System Restore", e:"💚", c:4, t:"spell", txt:"Repair your hero for 8.",
  fx(g,s){ healHero(g,s,8); } },
s_overbel:{ n:"Overload", e:"🔥", c:4, t:"spell", txt:"Deal 5 damage. Overheat (2).", tgt:"any",
  fx(g,s,t){ dmg(g,t,5+sig(g,s),null); g.players[s].ovlNext+=2; } },
s_ransom:{ n:"Ransomware", e:"💰", c:5, t:"spell", txt:"Destroy an enemy unit. Your opponent draws a card.", tgt:"eunit",
  fx(g,s,t){ const u=refUnit(g,t); if(u){ u.dmg=999; sweep(g); draw(g,1-s,1); } } },
s_printer:{ n:"3D Printer", e:"🖨️", c:5, t:"spell", txt:"Summon a copy of a friendly unit (base version).", tgt:"funit",
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
  fx(g,s){ const b=sig(g,s); dmg(g,{s:0,u:null},4+b,null); if(g.status==="igang") dmg(g,{s:1,u:null},4+b,null); aoe(g,0,4+b); aoe(g,1,4+b); } },

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
u_relae:{ n:"Relay", e:"🎏", c:3, t:"unit", tr:"Component", a:2, h:3, txt:"Install: Another friendly unit can attack immediately.",
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
u_loddebot:{ n:"Solderbot", e:"🦾", c:2, t:"unit", tr:"Robot", a:2, h:1, txt:"Install: Deal 1 damage.",
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
u_repbot:{ n:"Repairbot", e:"🚑", c:4, t:"unit", tr:"Robot", a:2, h:5, txt:"At the end of your turn: Repair a random damaged friendly unit for 2.",
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
l_overtek:{ n:"THE OVERTECHNICIAN", e:"🧙", c:9, t:"unit", tr:null, r:"L", a:6, h:6, txt:"Install: Give all your other units +2/+2.",
  bc(g,s,u){ for(const x of g.players[s].board) if(x.uid!==u.uid){ x.a+=2; x.hM+=2; } } },

// ===== TOKENS (ikke i samlingen) =====
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
function log(g,m){ g.log.push(m); if(g.log.length>60) g.log.shift(); }
function refUnit(g,r){ if(!r||r.u==null) return null; return g.players[r.s].board.find(x=>x.uid===r.u)||null; }
function checkWin(g){
  if(g.status!=="igang") return;
  const d0=g.players[0].hp<=0, d1=g.players[1].hp<=0;
  if(d0&&d1){ g.status="slut"; g.winner=2; log(g,"⚡ Double meltdown — it\u2019s a draw!"); }
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
    log(g,"◈ "+CARDS[u.id].n+"\u2019s insulation absorbs the damage."); return; }
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
    if(p.hand.length>=MAXHAND){ log(g,"🔥 "+p.name+"\u2019s hand is full — "+CARDS[id].n+" burns up."); }
    else p.hand.push({uid:nuid(g),id});
  }
}
function addHand(g,s,id){
  const p=g.players[s];
  if(p.hand.length>=MAXHAND){ log(g,"🔥 "+p.name+"\u2019s hand is full — "+CARDS[id].n+" burns up."); return; }
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
  if(!canPlay(g,s,id)) return "Can\u2019t be played right now.";
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
  if(!u) return "That unit doesn\u2019t exist.";
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
    const d=refUnit(g,tref); if(!d) return "The target doesn\u2019t exist.";
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
    n:"The Technician", ico:"🧑‍🔧",
    power:{ n:"Soldering Iron", ico:"🔧", c:2, txt:"Enemy: 1 damage · Friendly: repair 2." },
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
    turn:0, active:starter, n:1, last:null, log:[], fx:[], fxk:0, rematch:[false,false],
    players:[ mkPlayer(cfg.names[0],cfg.cids[0],cfg.decks[0],cfg.classes&&cfg.classes[0]),
              mkPlayer(cfg.names[1],cfg.cids[1],cfg.decks[1],cfg.classes&&cfg.classes[1]) ] };
  log(g,"⚡ KORTSLUTNING — "+g.players[0].name+" vs "+g.players[1].name+".");
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
function autoDeck(){
  const list=[]; const cnt={};
  let guard=0;
  while(list.length<DECKSIZE && guard++<2000){
    const id=pick(COLL);
    const d=CARDS[id];
    const max=d.r==="L"?1:2;
    if((cnt[id]||0)>=max) continue;
    const w=1/(1+Math.abs(d.c-3));
    if(Math.random()>w+0.15) continue;
    cnt[id]=(cnt[id]||0)+1; list.push(id);
  }
  while(list.length<DECKSIZE){
    const id=pick(COLL); const max=CARDS[id].r==="L"?1:2;
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
/* __ENGINE_END__ */

/* ============================================================
   UI
   ============================================================ */

const store = (typeof window !== "undefined" && window.storage) ? window.storage : null;
async function stGet(k,sh){ if(!store) return null; try{ const r=await store.get(k,sh); return r?JSON.parse(r.value):null; }catch(e){ return null; } }
async function stSet(k,v,sh){ if(!store) return false; try{ const r=await store.set(k,JSON.stringify(v),sh); return !!r; }catch(e){ return false; } }
async function stDel(k,sh){ if(!store) return; try{ await store.delete(k,sh); }catch(e){} }
function codeGen(){ const A="ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let c=""; for(let i=0;i<4;i++) c+=A[rnd(A.length)]; return c; }

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
  radial-gradient(1200px 500px at 50% -10%, #16301f 0%, transparent 60%),
  repeating-linear-gradient(0deg, transparent 0 34px, rgba(201,129,74,.06) 34px 35px),
  repeating-linear-gradient(90deg, transparent 0 34px, rgba(201,129,74,.06) 34px 35px),
  var(--bg0);
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
.mkort{position:relative;width:66px;height:92px;border-radius:9px;flex:none;
  background:linear-gradient(180deg,var(--bg2),var(--bg1));border:1px solid var(--line);
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;
  padding-bottom:7px;overflow:hidden;transition:transform .12s,border-color .12s,box-shadow .12s}
.mkort::after{content:"";position:absolute;left:8px;right:8px;bottom:0;height:6px;border-radius:2px 2px 0 0;
  background:repeating-linear-gradient(90deg,var(--guld) 0 4px,#3a2f12 4px 7px);opacity:.85}
.mkort.leg{border-color:var(--guld)}
.mkort.spil{border-color:var(--fos);box-shadow:0 0 10px rgba(95,224,160,.35);transform:translateY(-4px)}
.mkort .em{font-size:26px;line-height:1}
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
.helt{display:flex;align-items:center;gap:7px;padding:4px 10px;border-radius:10px;border:1px solid transparent}
.helt .hp{font-weight:700;font-size:16px;color:var(--fos)} .helt .hp.lav{color:var(--rod)}
.helt .nm{max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dim);font-size:12px}
.braet{flex:1;display:flex;align-items:center;justify-content:center;gap:7px;padding:6px 8px;min-height:74px;position:relative}
.braet.op{border-bottom:1px dashed var(--line)}
.enh{position:relative;width:58px;height:66px;border-radius:10px;background:linear-gradient(180deg,var(--bg2),var(--bg1));
  border:1.5px solid var(--line);display:flex;align-items:center;justify-content:center;transition:border-color .12s,box-shadow .12s}
.enh .em{font-size:26px}
.enh.klar{border-color:var(--fos);box-shadow:0 0 8px rgba(95,224,160,.3)}
.enh.leg{border-color:var(--guld)}
.enh.sover .em{opacity:.55}
.enh .zz{position:absolute;top:1px;right:4px;font-size:11px;color:var(--dim)}
.enh .ikoner{position:absolute;top:-8px;left:50%;transform:translateX(-50%);display:flex;gap:1px;
  font-size:9px;background:#0a140e;border:1px solid var(--line);border-radius:6px;padding:0 4px;white-space:nowrap;font-family:var(--mono)}
.enh .stat{bottom:1px;font-size:13px}
.enh.sil{filter:grayscale(.8)}
.enh .skjold{position:absolute;inset:-4px;border-radius:12px;border:1.5px solid var(--guld);opacity:.8;pointer-events:none}
.tgt{border-color:var(--rod) !important;box-shadow:0 0 0 2px rgba(255,109,90,.35),0 0 14px rgba(255,109,90,.5) !important;
  animation:puls 1s infinite}
@keyframes puls{50%{box-shadow:0 0 0 4px rgba(255,109,90,.2),0 0 18px rgba(255,109,90,.65)}}
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
  background:rgba(9,16,11,.75);border-top:1px solid var(--line);min-height:116px}
.kraft{width:44px;height:44px;border-radius:50%;border:1.5px solid var(--cu);background:radial-gradient(circle at 35% 30%,#3a2415,#20140a);
  font-size:19px;display:flex;align-items:center;justify-content:center;flex:none}
.kraft:disabled{opacity:.4;border-color:var(--line)}
.ryg{width:26px;height:38px;border-radius:4px;background:repeating-linear-gradient(45deg,#20140a 0 4px,#2a1a0e 4px 8px);
  border:1px solid var(--cu);margin-left:-14px}
/* ---- overlays ---- */
.slor{position:fixed;inset:0;background:rgba(5,10,7,.82);display:flex;align-items:center;justify-content:center;
  z-index:40;padding:18px;backdrop-filter:blur(2px)}
.ark{background:var(--bg1);border:1px solid var(--line);border-radius:16px;padding:18px;width:100%;max-width:360px;
  max-height:85dvh;overflow-y:auto}
.storkort{border:1px solid var(--line);border-radius:14px;padding:14px;background:linear-gradient(180deg,var(--bg2),var(--bg1));position:relative;overflow:hidden}
.storkort.leg{border-color:var(--guld)}
.storkort::after{content:"";position:absolute;left:14px;right:14px;bottom:0;height:8px;border-radius:3px 3px 0 0;
  background:repeating-linear-gradient(90deg,var(--guld) 0 6px,#3a2f12 6px 10px);opacity:.85}
.storkort .top{display:flex;gap:10px;align-items:center}
.storkort .em{font-size:44px}
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
.logpanel{position:fixed;left:8px;bottom:130px;z-index:36;width:min(320px,86vw);max-height:44dvh;overflow-y:auto;
  background:rgba(8,14,10,.96);border:1px solid var(--line);border-radius:12px;padding:0;
  font-family:var(--mono);font-size:11.5px;line-height:1.5;color:var(--dim)}
.logpanel .lhoved{position:sticky;top:0;display:flex;align-items:center;justify-content:space-between;
  background:rgba(8,14,10,.98);border-bottom:1px solid var(--line);padding:8px 10px;font-weight:700;color:var(--cu2)}
.logpanel .lluk{font-size:16px;line-height:1;padding:2px 6px;color:var(--dim)}
.logpanel .lkrop{padding:8px 10px}
.logknap{position:fixed;left:10px;bottom:calc(126px + env(safe-area-inset-bottom));z-index:36;width:38px;height:38px;border-radius:50%;
  background:var(--bg1);border:1px solid var(--line);font-size:16px}
.turban{position:fixed;top:38%;left:0;right:0;z-index:30;text-align:center;font-family:var(--disp);
  font-size:38px;letter-spacing:4px;color:var(--fos);text-shadow:0 0 24px rgba(95,224,160,.6);
  animation:tur 1.6s forwards;pointer-events:none}
@keyframes tur{0%{opacity:0;transform:scale(.8)}18%{opacity:1;transform:scale(1)}78%{opacity:1}100%{opacity:0}}
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
/* ---- dybde & liv ---- */
.mkort{box-shadow:0 4px 10px rgba(0,0,0,.45)}
.enh{box-shadow:0 3px 8px rgba(0,0,0,.4)}
.ark{box-shadow:0 18px 50px rgba(0,0,0,.6)}
.knap{transition:transform .12s,border-color .15s,box-shadow .15s}
.knap:hover{border-color:var(--cu);box-shadow:0 4px 14px rgba(0,0,0,.35)}
button:active{transform:scale(.97)}
.mkort.spil{animation:spilpuls 1.6s ease-in-out infinite}
@keyframes spilpuls{50%{box-shadow:0 0 18px rgba(95,224,160,.55),0 4px 10px rgba(0,0,0,.45)}}
.enh.klar{animation:klarpuls 2s ease-in-out infinite}
@keyframes klarpuls{50%{box-shadow:0 0 13px rgba(95,224,160,.45)}}
.enh{animation:enhind .38s cubic-bezier(.2,1.5,.4,1)}
@keyframes enhind{from{transform:scale(.3);opacity:0;filter:brightness(2.2)}}
.ryst{animation:ryst .32s ease-in-out !important}
@keyframes ryst{20%{transform:translateX(-4px)}40%{transform:translateX(4px)}60%{transform:translateX(-3px)}80%{transform:translateX(2px)}}
/* ---- FX-lag ---- */
.fxlag{position:fixed;inset:0;pointer-events:none;z-index:60;overflow:hidden}
.fxtal{position:fixed;transform:translate(-50%,-50%);font-family:var(--mono);font-weight:700;font-size:30px;
  text-shadow:0 0 12px currentColor;animation:fxtal .95s ease-out forwards;opacity:0}
@keyframes fxtal{0%{opacity:0;transform:translate(-50%,-28%) scale(.6)}14%{opacity:1;transform:translate(-50%,-50%) scale(1.18)}
  100%{opacity:0;transform:translate(-50%,-170%) scale(1)}}
.fxburst{position:fixed}
.fxburst i{position:absolute;width:7px;height:7px;border-radius:2px;background:currentColor;
  box-shadow:0 0 9px currentColor;animation:gnist .65s ease-out forwards}
@keyframes gnist{to{transform:translate(var(--dx),var(--dy)) rotate(220deg) scale(.15);opacity:0}}
.fxring{position:fixed;width:26px;height:26px;margin:-13px 0 0 -13px;border:3px solid;border-radius:50%;
  animation:fxring .6s ease-out forwards;box-shadow:0 0 12px currentColor}
@keyframes fxring{to{transform:scale(3.6);opacity:0}}
.fxzap{position:fixed;inset:0;width:100vw;height:100vh;animation:zapfl .32s ease-out forwards;
  filter:drop-shadow(0 0 7px rgba(240,178,62,.9))}
.fxzap.spell{filter:drop-shadow(0 0 7px rgba(95,224,160,.9))}
@keyframes zapfl{0%{opacity:1}45%{opacity:.3}60%{opacity:1}100%{opacity:0}}
.fxflyv{position:fixed;font-size:42px;transform:translate(-50%,-50%);z-index:61;
  text-shadow:0 0 16px rgba(95,224,160,.9);animation:flyv .55s cubic-bezier(.3,.1,.55,1) forwards}
@keyframes flyv{55%{opacity:1}100%{transform:translate(calc(-50% + var(--tx)),calc(-50% + var(--ty))) scale(.35);opacity:0}}
/* ---- store skærme / landscape ---- */
@media (min-width:700px){
  .mkort{width:74px;height:104px}.mkort .em{font-size:30px}.mkort .nv{font-size:9.5px}
  .enh{width:68px;height:76px}.enh .em{font-size:30px}
}
@media (min-width:900px) and (orientation:landscape){
  .spilflade{max-width:1500px;width:100%;margin:0 auto}
  .mkort{width:92px;height:129px}.mkort .em{font-size:36px}.mkort .nv{font-size:11px;max-height:24px}
  .mkort .stat{font-size:15px}.pris{font-size:15px;min-width:24px;height:24px}
  .enh{width:88px;height:98px}.enh .em{font-size:40px}.enh .stat{font-size:16px}
  .enh .ikoner{font-size:11px}
  .braet{gap:12px;min-height:110px}
  .bar{font-size:15px;padding:10px 24px}
  .midt{padding:6px 24px;font-size:13px}
  .haand{justify-content:center;overflow:visible;padding-top:26px;min-height:176px;gap:0}
  .haand .mkort{margin:0 -7px;transform-origin:50% 135%;
    transform:rotate(calc(var(--o,0)*3.5deg)) translateY(calc(var(--a,0)*7px))}
  .haand .mkort.spil{transform:rotate(calc(var(--o,0)*3.5deg)) translateY(calc(var(--a,0)*7px - 8px))}
  .haand .mkort:hover{transform:rotate(0deg) translateY(-34px) scale(1.14);z-index:6}
  .kraft{width:54px;height:54px;font-size:24px}
  .logpanel{bottom:190px}.logknap{bottom:190px}
}
@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{animation-duration:.01ms !important;animation-iteration-count:1 !important;transition-duration:.01ms !important}
}
`;

// ---------- småkomponenter ----------
function kwIkoner(g,s,u){
  const out=[];
  for(const k of kws(g,s,u)){ if(KWINFO[k]) out.push(KWINFO[k].ico); }
  if(!u.sil && CARDS[u.id].sig) out.push("📶");
  return out;
}
function MiniCard({id,onClick,glow,count,style,dfx}){
  const d=CARDS[id];
  return (
    <button className={"mkort"+(d.r==="L"?" leg":"")+(glow?" spil":"")} onClick={onClick} style={style} data-fx={dfx}>
      <span className="pris">{d.c}</span>
      {count!=null && <span className="antal">{count}×</span>}
      <span className="em">{d.e}</span>
      <span className="nv">{d.n}</span>
      {d.t==="unit" && <><span className="stat a">{d.a}</span><span className="stat h">{d.h}</span></>}
    </button>
  );
}
function StorKort({id,unitInfo,g}){
  const d=CARDS[id];
  let live=null;
  if(unitInfo&&g){ const u=refUnit(g,{s:unitInfo.s,u:unitInfo.uid});
    if(u) live={a:effAtk(g,unitInfo.s,u),h:effHp(g,unitInfo.s,u),m:effMax(g,unitInfo.s,u),sil:u.sil,ik:kwIkoner(g,unitInfo.s,u)}; }
  return (
    <div className={"storkort"+(d.r==="L"?" leg":"")}>
      <div className="top">
        <span className="em">{d.e}</span>
        <div>
          <h3>{d.n}</h3>
          <div className="meta">{d.c}⚡ · {d.t==="unit"?"Unit":"Spell"}{d.tr?" · "+d.tr:""}{d.r==="L"?" · ★ Legendary":""}</div>
        </div>
      </div>
      <div className="txt">{live&&live.sil?<i>Reset — all text removed.</i>:(d.txt||"—")}</div>
      {d.t==="unit" && (
        <div className="statraek">
          <span style={{color:"var(--amber)"}}>⚔ {live?live.a:d.a}</span>
          <span style={{color:live&&live.h<live.m?"var(--rod)":"var(--fos)"}}>♥ {live?live.h+"/"+live.m:d.h}</span>
          {live&&live.ik.length>0&&<span style={{color:"var(--dim)",fontFamily:"var(--mono)",fontSize:12}}>{live.ik.join(" ")}</span>}
        </div>
      )}
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
function UnitTile({g,s,u,mine,onClick,hilite,ready,shake}){
  const d=CARDS[u.id];
  const hp=effHp(g,s,u), mx=effMax(g,s,u);
  const ik=kwIkoner(g,s,u);
  const sover=mine&&u.jp&&!hasKw(g,s,u,"turbo");
  return (
    <button className={"enh"+(d.r==="L"?" leg":"")+(hilite?" tgt":"")+(ready?" klar":"")+(u.sil?" sil":"")+(sover?" sover":"")+(shake?" ryst":"")}
      onClick={onClick} data-fx={u.uid}>
      {ik.length>0 && <span className="ikoner">{ik.join("")}</span>}
      {u.sh && <span className="skjold"/>}
      <span className="em" style={u.st?{opacity:.45}:null}>{d.e}</span>
      {sover && <span className="zz">z</span>}
      <span className="stat a">{effAtk(g,s,u)}</span>
      <span className={"stat h"+(hp<mx?" skadet":"")}>{hp}</span>
    </button>
  );
}
function HeltPlade({g,s,me,onClick,hilite,shake}){
  const p=g.players[s];
  return (
    <button className={"helt"+(hilite?" tgt":"")+(shake?" ryst":"")} onClick={onClick} style={{borderRadius:10}} data-fx={"h"+s}>
      <span style={{fontSize:20}}>{me?"🧑‍🔧":"🧑‍💻"}</span>
      <span>
        <span className="nm">{p.name}</span><br/>
        <span className={"hp"+(p.hp<=10?" lav":"")}>❤ {p.hp}</span>
      </span>
    </button>
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
    pts.push(x.toFixed(1)+","+y.toFixed(1));
  }
  return pts.join(" ");
}

// ---------- spilskærm ----------
function GameView({g,seat,myTurn,act,mode,onLeave,onConcede,onRematch,onDelete,pos}){
  const me=g.players[seat], op=g.players[1-seat];
  const K=CLASSES[me.cls]||CLASSES.tek;
  const [sel,setSel]=useState(null);
  const [tmode,setT]=useState(null);
  const [visLog,setVisLog]=useState(false);
  const [bekraeft,setBekraeft]=useState(false);
  const [ptoast,setPt]=useState(null);
  const [sparks,setSparks]=useState([]);
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
    const add=[], sh=[];
    for(const e of nye){
      const d=add.length*0.06, kk=e.k;
      if(e.t==="dmg"){ const P=posOf(e.s,e.u!==undefined?e.u:null); if(!P) continue;
        add.push({key:"t"+kk,type:"tal",x:P.x,y:P.y,txt:"−"+e.n,c:"var(--rod)",d});
        add.push({key:"b"+kk,type:"burst",x:P.x,y:P.y,n:7,c:"var(--amber)",d});
        sh.push(e.u!=null?e.u:"h"+e.s); }
      else if(e.t==="heal"){ const P=posOf(e.s,e.u); if(!P) continue;
        add.push({key:"t"+kk,type:"tal",x:P.x,y:P.y,txt:"+"+e.n,c:"var(--fos)",d});
        add.push({key:"r"+kk,type:"ring",x:P.x,y:P.y,c:"var(--fos)",d}); }
      else if(e.t==="boom"){ const P=posOf(e.s,e.u); if(!P) continue;
        add.push({key:"b"+kk,type:"burst",x:P.x,y:P.y,n:14,c:"var(--cu2)",stor:true,d}); }
      else if(e.t==="skjold"){ const P=posOf(e.s,e.u); if(!P) continue;
        add.push({key:"r"+kk,type:"ring",x:P.x,y:P.y,c:"var(--guld)",d}); }
      else if(e.t==="pop"){ const P=posOf(e.s,e.u); if(!P) continue;
        add.push({key:"b"+kk,type:"burst",x:P.x,y:P.y,n:6,c:"var(--fos)",d}); }
      else if(e.t==="cast"){ const P=posOf(e.s,null); if(!P) continue;
        add.push({key:"r"+kk,type:"ring",x:P.x,y:P.y,c:"var(--amber)",d}); }
      else if(e.t==="zap"){ const P1=posOf(e.fs,e.fu), P2=posOf(e.ts,e.tu); if(!P1||!P2) continue;
        add.push({key:"z"+kk,type:"zap",p1:P1,p2:P2,art:e.art,d}); }
      else if(e.t==="spil"){ const fra=posOf(e.s,e.hu)||posOf(e.s,null); if(!fra) continue;
        const til=e.ts!=null?posOf(e.ts,e.tu):null;
        const cx=(typeof window!=="undefined"?window.innerWidth/2:400);
        const cy=(typeof window!=="undefined"?window.innerHeight/2:400);
        add.push({key:"f"+kk,type:"flyv",x:fra.x,y:fra.y,
          tx:(til?til.x:cx)-fra.x,ty:(til?til.y:cy)-fra.y,id:e.id,d}); }
    }
    if(add.length){
      setSparks(x=>[...x,...add]);
      const keys=add.map(a=>a.key);
      setTimeout(()=>setSparks(x=>x.filter(f=>!keys.includes(f.key))),1400);
    }
    if(sh.length){ setShake(new Set(sh)); setTimeout(()=>setShake(new Set()),380); }
  },[g]);

  useEffect(()=>{ const L=g.last;
    if(L&&L.k!==lastK.current){ lastK.current=L.k;
      if(L.s!==seat){ setPt(L); const t=setTimeout(()=>setPt(null),2600); return ()=>clearTimeout(t); } }
  },[g.last&&g.last.k]);
  useEffect(()=>{ if(g.turn!==prevTurn.current){ prevTurn.current=g.turn;
      if(myTurn&&g.status==="igang") setTurban(x=>x+1); } },[g.turn,myTurn]);
  useEffect(()=>{ if(!myTurn){ setT(null); } },[myTurn]);

  const isTgt=r=>tmode&&tmode.list.some(x=>x.s===r.s&&x.u===r.u);
  const fire=r=>{ const run=tmode.run; setT(null); setSel(null); run(r); };

  const klikEnhed=(rs,u)=>{
    const ref={s:rs,u:u.uid};
    if(tmode){ if(isTgt(ref)) fire(ref); else setT(null); return; }
    if(rs===seat&&myTurn){
      const ts=attackTargets(g,seat,u.uid);
      if(ts.length){ setT({list:ts,label:"⚔ "+CARDS[u.id].n+" — choose a target",run:r=>act(x=>unitAttack(x,seat,u.uid,r))}); return; }
    }
    setSel({kind:"info",id:u.id,unit:{s:rs,uid:u.uid}});
  };
  const klikHelt=(rs)=>{
    const ref={s:rs,u:null};
    if(tmode){ if(isTgt(ref)) fire(ref); else setT(null); return; }
  };
  const spilFraArk=()=>{
    const c=sel; if(!c) return;
    const {need,list}=targetsForCard(g,seat,c.id,null);
    if(need&&list.length){
      setSel(null);
      setT({list,label:"▶ "+CARDS[c.id].n+" — choose a target",run:r=>act(x=>playCard(x,seat,c.uid,r))});
    } else { setSel(null); act(x=>playCard(x,seat,c.uid,null)); }
  };
  const kraft=()=>{
    if(tmode){ setT(null); return; }
    setT({list:heroTargets(g,seat),label:K.power.ico+" "+K.power.n+" — "+K.power.txt,
      run:r=>act(x=>heroPower(x,seat,r))});
  };

  const slut=g.status==="slut";
  const kanKraft=myTurn&&!me.heroUsed&&me.cur>=K.power.c;

  return (
    <div className="spilflade">
      {tmode && <button className="banner" onClick={()=>setT(null)}>{tmode.label} · tap here to cancel</button>}
      {turban>0 && myTurn && !slut && <div key={turban} className="turban">YOUR TURN</div>}

      {/* modstander */}
      <div className="bar">
        <HeltPlade g={g} s={1-seat} me={false} hilite={isTgt({s:1-seat,u:null})} shake={shake.has("h"+(1-seat))} onClick={()=>klikHelt(1-seat)}/>
        <Pips p={op}/>
        <span style={{marginLeft:"auto",display:"flex",alignItems:"center"}}>
          {Array.from({length:Math.min(op.hand.length,9)}).map((_,i)=><span key={i} className="ryg"/>)}
          <span style={{marginLeft:8,color:"var(--dim)"}}>🂠{op.deck.length}</span>
        </span>
      </div>
      <div className="braet op">
        {op.board.length===0&&<span style={{color:"var(--dim)",fontFamily:"var(--mono)",fontSize:11}}>— empty board —</span>}
        {op.board.map(u=>
          <UnitTile key={u.uid} g={g} s={1-seat} u={u} mine={false} shake={shake.has(u.uid)}
            hilite={isTgt({s:1-seat,u:u.uid})} onClick={()=>klikEnhed(1-seat,u)}/>)}
      </div>

      <div className="midt">
        <span>Round {Math.max(1,Math.ceil(g.turn/2))}</span>
        <span style={{color:myTurn?"var(--fos)":"var(--dim)"}}>{slut?"Game over":(myTurn?"⚡ Your turn":"Waiting for "+op.name+"…")}</span>
        <button className="slutknap" disabled={!myTurn||slut} onClick={()=>act(x=>endTurn(x,seat))}>END TURN</button>
      </div>

      <div className="braet">
        {me.board.length===0&&<span style={{color:"var(--dim)",fontFamily:"var(--mono)",fontSize:11}}>— empty board —</span>}
        {me.board.map(u=>
          <UnitTile key={u.uid} g={g} s={seat} u={u} mine={true} shake={shake.has(u.uid)}
            ready={myTurn&&attackTargets(g,seat,u.uid).length>0}
            hilite={isTgt({s:seat,u:u.uid})} onClick={()=>klikEnhed(seat,u)}/>)}
      </div>

      {/* mig */}
      <div className="bar min">
        <HeltPlade g={g} s={seat} me={true} hilite={isTgt({s:seat,u:null})} shake={shake.has("h"+seat)} onClick={()=>klikHelt(seat)}/>
        <Pips p={me}/>
        <button className="kraft" disabled={!kanKraft} onClick={kraft} title={K.power.n+" ("+K.power.c+"⚡)"}>{K.power.ico}</button>
        <span style={{marginLeft:"auto",color:"var(--dim)"}}>🂠{me.deck.length}</span>
        <button style={{color:"var(--dim)",fontSize:16,padding:"0 4px"}} onClick={()=>setBekraeft(true)}>🏳</button>
      </div>
      <div className="haand">
        {me.hand.length===0&&<span style={{color:"var(--dim)",fontFamily:"var(--mono)",fontSize:11,alignSelf:"center"}}>hand is empty</span>}
        {me.hand.map((c,i)=>{
          const o=i-(me.hand.length-1)/2;
          return <MiniCard key={c.uid} id={c.id} dfx={c.uid} glow={myTurn&&canPlay(g,seat,c.id)}
            style={{"--o":o,"--a":Math.abs(o)}}
            onClick={()=>{ if(tmode){setT(null);return;} setSel({kind:"hand",id:c.id,uid:c.uid}); }}/>;})}
      </div>

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
          if(f.type==="flyv") return <div key={f.key} className="fxflyv" style={{left:f.x,top:f.y,"--tx":f.tx+"px","--ty":f.ty+"px"}}>{CARDS[f.id].e}</div>;
          if(f.type==="zap"){
            const pts=zigzag(f.p1,f.p2), c=f.art==="spell"?"var(--fos)":"var(--amber)";
            return (
              <svg key={f.key} className={"fxzap"+(f.art==="spell"?" spell":"")} style={ds}>
                <polyline points={pts} fill="none" stroke={c} strokeWidth="3.5" strokeLinejoin="round"/>
                <polyline points={pts} fill="none" stroke="#ffffff" strokeWidth="1.3" opacity="0.9" strokeLinejoin="round"/>
              </svg>);
          }
          return null;
        })}
      </div>
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

      {ptoast && <div className="optoast"><MiniCard id={ptoast.id}/><span style={{fontFamily:"var(--mono)",fontSize:12,color:"var(--dim)"}}>{op.name}<br/>plays…</span></div>}

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
        <div className="slor">
          <div className="ark" style={{textAlign:"center"}}>
            <div className="logo" style={{fontSize:34}}>
              {g.winner===2?"DRAW":(g.winner===seat?"VICTORY ⚡":"BREAKDOWN")}
            </div>
            <p className="rt" style={{color:"var(--dim)"}}>
              {g.winner===2?"Both circuits burned out.":(g.winner===seat?"Your opponent\u2019s circuit burned out.":"Your circuit burned out.")}
            </p>
            {mode==="online" ? (
              <button className="knap cu" disabled={g.rematch[seat]} onClick={onRematch}>
                {g.rematch[seat]?"Waiting for opponent…":(g.rematch[1-seat]?"🔁 Rematch (opponent is ready!)":"🔁 Rematch")}
              </button>
            ) : (
              <button className="knap cu" onClick={onRematch}>🔁 Rematch</button>
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
function DeckBuilder({decks,gemDecks,onBack,flash}){
  const [cards,setCards]=useState([]);
  const [navn,setNavn]=useState("My deck");
  const [tab,setTab]=useState("bib");
  const [fC,setFC]=useState(null);
  const [fT,setFT]=useState(null);
  const [q,setQ]=useState("");
  const [sel,setSel]=useState(null);
  const cnt=useMemo(()=>{ const m={}; for(const id of cards) m[id]=(m[id]||0)+1; return m; },[cards]);
  const filt=COLL.filter(id=>{
    const d=CARDS[id];
    if(fC!=null && (fC===7?d.c<7:d.c!==fC)) return false;
    if(fT && d.t!==fT) return false;
    if(q && !d.n.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  const add=id=>{
    const max=CARDS[id].r==="L"?1:2;
    if((cnt[id]||0)>=max) return flash("Max "+max+"× "+CARDS[id].n+".");
    if(cards.length>=DECKSIZE) return flash("The deck is full ("+DECKSIZE+").");
    setCards(c=>[...c,id]);
  };
  const rem=id=>setCards(c=>{ const i=c.indexOf(id); if(i<0) return c; const n=c.slice(); n.splice(i,1); return n; });
  const gem=()=>{
    const err=validateDeck(cards); if(err) return flash(err);
    const n=navn.trim()||"My deck";
    const nx=decks.filter(d=>d.name!==n).concat([{name:n,cls:"tek",cards:cards.slice()}]);
    gemDecks(nx); flash("💾 \u201C"+n+"\u201D saved.");
  };
  const unik=Object.keys(cnt).sort((a,b)=>CARDS[a].c-CARDS[b].c||CARDS[a].n.localeCompare(CARDS[b].n,"en"));
  const kurve=[0,1,2,3,4,5,6,7].map(c=>cards.filter(id=>c===7?CARDS[id].c>=7:CARDS[id].c===c).length);
  const kMax=Math.max(1,...kurve);
  return (
    <div className="pane">
      <button className="tilbage" onClick={onBack}>← Back</button>
      <div className="logo" style={{fontSize:26}}>CARD LIBRARY</div>
      <div className="ulinie">{COLL.length} cards · deck: {cards.length}/{DECKSIZE}</div>
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
          {filt.map(id=><MiniCard key={id} id={id} count={cnt[id]||null} onClick={()=>setSel(id)}/>)}
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
            let guard=0;
            while(c.length<DECKSIZE&&guard++<2000){
              const id=pick(COLL); const max=CARDS[id].r==="L"?1:2;
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
              <span>🗂 {d.name}</span>
              <button className="x" style={{color:"var(--fos)"}} onClick={()=>{setCards(d.cards.slice());setNavn(d.name);flash("Loaded \u201C"+d.name+"\u201D.");}}>Load</button>
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
export default function App(){
  const [skaerm,setSkaerm]=useState("indlaeser");
  const [navn,setNavn]=useState("Technician");
  const [decks,setDecks]=useState([]);
  const [g,setG]=useState(null);
  const [mode,setMode]=useState(null);
  const [seat,setSeat]=useState(0);
  const [lobby,setLobby]=useState(null);
  const [toast,setToast]=useState(null);
  const [handoff,setHandoff]=useState(false);
  const [joinKode,setJoinKode]=useState("");
  const [deckValg,setDeckValg]=useState("auto");
  const [deckValg2,setDeckValg2]=useState("auto");
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
    const n=await stGet("ks-navn",false); if(n) setNavn(n);
    const d=await stGet("ks-decks",false); if(Array.isArray(d)) setDecks(d);
    let c=await stGet("ks-cid",false);
    if(!c){ c="c"+Math.random().toString(36).slice(2,10); await stSet("ks-cid",c,false); }
    cid.current=c;
    setSkaerm("menu");
  })(); },[]);

  const gemNavn=v=>{ setNavn(v); stSet("ks-navn",v,false); };
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
        decks:[g.players[0].list,g.players[1].list]});
      ng.seq=(g.seq||0)+1;
      applyG(ng); pushSave(ng);
    }
  },[g,mode,seat]);

  const findDeck=valg=>{
    if(valg==="auto") return autoDeck();
    const d=decks.find(x=>x.name===valg);
    return d?d.cards.slice():autoDeck();
  };

  const opretOnline=async()=>{
    if(!onlineOK) return flash("Online play is not available in this edition.");
    const deckIds=findDeck(deckValg);
    const err=validateDeck(deckIds); if(err) return flash(err);
    const c=codeGen(); kode.current=c;
    const lob={v:1,status:"venter",code:c,seq:1,host:{name:navn,cid:cid.current,deck:deckIds}};
    const ok=await stSet("spil:"+c,lob,true);
    if(!ok) return flash("Couldn\u2019t create the game.");
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
      const deckIds=findDeck(deckValg);
      const err=validateDeck(deckIds); if(err) return flash(err);
      const ng=mkState({mode:"online",code:c,names:[v.host.name,navn],
        cids:[v.host.cid,cid.current],decks:[v.host.deck,deckIds]});
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
  const startLokal=()=>{
    const d1=findDeck(deckValg), d2=findDeck(deckValg2);
    let err=validateDeck(d1)||validateDeck(d2); if(err) return flash(err);
    const ng=mkState({mode:"lokal",names:["Player 1","Player 2"],cids:["p1","p2"],decks:[d1,d2]});
    kode.current=null; setMode("lokal"); setG(ng); setHandoff(true); setSkaerm("spil");
  };
  const tilMenu=()=>{ setG(null); setLobby(null); setMode(null); kode.current=null; setHandoff(false); setSkaerm("menu"); };

  const seatNu = mode==="lokal" ? (g?g.active:0) : seat;
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
      decks:[g.players[0].list,g.players[1].list]});
    setG(ng); if(mode==="lokal") setHandoff(true);
  };
  const startSolo=()=>{
    const d1=findDeck(deckValg), d2=findDeck(deckValg2);
    let err=validateDeck(d1)||validateDeck(d2); if(err) return flash(err);
    const ng=mkState({mode:"solo",names:[(navn||"Technician").trim()||"Technician","🤖 The Bot"],
      cids:[cid.current||"p1","bot"],decks:[d1,d2]});
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
    }, botSteps.current===0?900:650);
    return ()=>clearTimeout(t);
  },[g,mode]);
  const sletSpil=async()=>{ if(kode.current) await stDel("spil:"+kode.current,true); tilMenu(); };

  const deckMuligheder=(v,setV)=>(
    <select value={v} onChange={e=>setV(e.target.value)}>
      <option value="auto">🎲 Auto deck (random)</option>
      {decks.map(d=><option key={d.name} value={d.name}>🗂 {d.name}</option>)}
    </select>
  );

  let indhold=null;
  if(skaerm==="indlaeser"){
    indhold=<div className="centrer"><div className="logo">KORT<b>SLUTNING</b></div><div className="ulinie">booting…</div></div>;
  }
  else if(skaerm==="menu"){
    indhold=(
      <div className="pane">
        <div style={{textAlign:"center",marginTop:14}}>
          <div className="logo">KORT<b>SLUTNING</b></div>
          <div className="ulinie">// 2-player electronics card game · 100 cards · class: The Technician</div>
        </div>
        <div className="etiket">Your name</div>
        <input value={navn} maxLength={16} onChange={e=>gemNavn(e.target.value)}/>
        <div className="etiket">Your deck</div>
        {deckMuligheder(deckValg,setDeckValg)}
        <div className="etiket">Opponent\u2019s deck (bot / player 2)</div>
        {deckMuligheder(deckValg2,setDeckValg2)}
        <div className="etiket">Solo</div>
        <button className="knap cu" onClick={startSolo}>🤖 Play vs the bot<small>Built-in opponent — great for learning the cards</small></button>
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
      </div>
    );
  }
  else if(skaerm==="deck"){
    indhold=<DeckBuilder decks={decks} gemDecks={gemDecks} onBack={()=>setSkaerm("menu")} flash={flash}/>;
  }
  else if(skaerm==="regler"){
    indhold=<Regler onBack={()=>setSkaerm("menu")}/>;
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
          <GameView g={g} seat={seatNu} myTurn={minTur} act={doAct} mode={mode} pos={posRef}
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
      {toast&&<div className="toast">{toast}</div>}
    </div>
  );
}
