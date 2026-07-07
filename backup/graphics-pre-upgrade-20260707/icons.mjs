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

export function iconFor(id, d, ac, bg, bg2, rnd){
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
