// Genererer grafiske assets for alle KORTSLUTNING-kort:
//   assets/svg/*.svg      vektorkilde, 750x1050
//   assets/png/*.png      rasteriseret 750x1050
//   assets/atlas/*        sprite-atlas (2500x3850) + JSON-koordinater
//   assets/manifest.json  alle kortdata -> filer
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import sharp from "sharp";

// ---------- kortdata fra motoren ----------
const src = readFileSync("kortslutning.jsx", "utf8");
const end = src.indexOf("/* __ENGINE_END__ */");
let code = src.slice(0, end).split("\n").filter(l => !l.startsWith("import ")).join("\n");
code += ";return {CARDS, COLL, CLASSES};";
const { CARDS, COLL, CLASSES } = new Function(code)();
const ALL = Object.keys(CARDS);

// ---------- palette ----------
const P = {
  bg0:"#0c1811", bg1:"#122419", bg2:"#173021", line:"#274a35",
  cu:"#c9814a", cu2:"#e8a96a", fos:"#5fe0a0", amber:"#f0b23e",
  rod:"#ff6d5a", guld:"#ffd166", txt:"#dbe7de", dim:"#87a693", mork:"#1c1405",
};
const ACCENT = { Component:P.cu2, Robot:"#9fc0e8", Drone:P.fos, Virus:"#c76bd9", program:"#e8e05f", none:P.guld };
const clsCol = d => d.cls&&CLASSES[d.cls] ? CLASSES[d.cls].col : null;
const accentFor = d => (d.cls&&d.t==="spell"&&CLASSES[d.cls]) ? CLASSES[d.cls].col
  : d.t==="spell" ? ACCENT.spell : (ACCENT[d.tr] || ACCENT.none);
// ---------- kort-tema (bund/artzone/plade pr. klasse el. stamme) ----------
const THEME = {
  // klasser — kraftige, tydeligt adskilte kulører
  tek:   { top:"#4a3410", mid:"#2c2109", bot:"#120d04", art:"#211803", plate:"#3a2a0c", edge:"#ffb347" },
  hack:  { top:"#3d1170", mid:"#260a45", bot:"#0f0420", art:"#1f0838", plate:"#340f5e", edge:"#c07bff" },
  over:  { top:"#5c1a08", mid:"#380f04", bot:"#160502", art:"#2a0b03", plate:"#4a1506", edge:"#ff6a3d" },
  // stammer (neutrale)
  Component:{ top:"#5a3806", mid:"#341f04", bot:"#130b02", art:"#241603", plate:"#452c05", edge:"#ffa726" },
  Robot:  { top:"#0d3566", mid:"#08213f", bot:"#030c18", art:"#061a33", plate:"#0b2c55", edge:"#4db4ff" },
  Drone:  { top:"#0a4a2c", mid:"#062e1b", bot:"#02120a", art:"#04220f", plate:"#08492a", edge:"#33e88a" },
  Virus:  { top:"#4a0f52", mid:"#2d0932", bot:"#120414", art:"#230827", plate:"#3d0d44", edge:"#e85adf" },
  spell:  { top:"#4a4708", mid:"#2b2905", bot:"#131202", art:"#232103", plate:"#3a3806", edge:"#f5ea3a" },
  none:   { top:"#1e3d1a", mid:"#12240f", bot:"#070f06", art:"#0d1c0b", plate:"#173015", edge:"#7dd960" },
};
function themeOf(d){
  if(d.cls && THEME[d.cls]) return THEME[d.cls];
  if(d.t==="spell") return THEME.spell;
  if(d.tr && THEME[d.tr]) return THEME[d.tr];
  return THEME.none;
}


// ---------- seedet PRNG pr. kort ----------
function seedOf(str){ let h=2166136261; for(const c of str){ h^=c.charCodeAt(0); h=Math.imul(h,16777619); } return h>>>0; }
function mulberry(a){ return function(){ a|=0; a=(a+0x6D2B79F5)|0; let t=Math.imul(a^(a>>>15),1|a);
  t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; }; }

const esc = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
function mix(a,b,t){
  const h=x=>[parseInt(x.slice(1,3),16),parseInt(x.slice(3,5),16),parseInt(x.slice(5,7),16)];
  const [r1,g1,b1]=h(a),[r2,g2,b2]=h(b);
  const c=v=>Math.round(v).toString(16).padStart(2,"0");
  return "#"+c(r1+(r2-r1)*t)+c(g1+(g2-g1)*t)+c(b1+(b2-b1)*t);
}

// ---------- generativt kredsløbsmønster ----------
function circuitPattern(rnd, x0, y0, x1, y1, color, n, op){
  const G=25, snap=v=>Math.round(v/G)*G;
  let out="";
  for(let i=0;i<n;i++){
    let x=snap(x0+rnd()*(x1-x0)), y=snap(y0+rnd()*(y1-y0));
    let d=`M ${x} ${y}`;
    out+=`<circle cx="${x}" cy="${y}" r="7" fill="none" stroke="${color}" stroke-width="4" opacity="${op}"/>`;
    const segs=1+Math.floor(rnd()*3);
    let dir=rnd()<0.5?0:1; // 0=vandret, 1=lodret
    for(let sgm=0;sgm<segs;sgm++){
      const len=G*(2+Math.floor(rnd()*5)), sgn=rnd()<0.5?-1:1;
      if(rnd()<0.35){ // 45 grader
        let nx=x+sgn*len, ny=y+(rnd()<0.5?-1:1)*len;
        nx=Math.max(x0,Math.min(x1,nx)); ny=Math.max(y0,Math.min(y1,ny));
        d+=` L ${nx} ${ny}`; x=nx; y=ny;
      } else if(dir===0){ let nx=Math.max(x0,Math.min(x1,x+sgn*len)); d+=` L ${nx} ${y}`; x=nx; dir=1; }
      else { let ny=Math.max(y0,Math.min(y1,y+sgn*len)); d+=` L ${x} ${ny}`; y=ny; dir=0; }
    }
    out+=`<path d="${d}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity="${op}"/>`;
    if(rnd()<0.6) out+=`<circle cx="${x}" cy="${y}" r="9" fill="${P.bg1}" stroke="${color}" stroke-width="4" opacity="${op}"/>`;
    else out+=`<rect x="${x-8}" y="${y-8}" width="16" height="16" fill="${color}" opacity="${op}"/>`;
  }
  // en lille IC-pad-række
  const px=snap(x0+rnd()*(x1-x0-100)), py=snap(y0+rnd()*(y1-y0));
  for(let k=0;k<4;k++) out+=`<rect x="${px+k*22}" y="${py}" width="14" height="20" fill="${color}" opacity="${op*0.9}"/>`;
  return out;
}

// ---------- stamme-motiver (centreret om 375,345) ----------
function motif(d, ac, rnd){
  const sc=(0.92+rnd()*0.16).toFixed(3);
  const wrap=inner=>`<g transform="translate(375 345) scale(${sc}) translate(-375 -345)">${inner}</g>`;
  const sw=10;
  if(d.t==="spell"){
    const hex=[...Array(6)].map((_,i)=>{const a=Math.PI/3*i-Math.PI/6;
      return `${375+158*Math.cos(a)},${345+158*Math.sin(a)}`;}).join(" ");
    return wrap(`<polygon points="${hex}" fill="none" stroke="${ac}" stroke-width="${sw}" stroke-linejoin="round"/>
      <polygon points="${hex}" fill="${ac}" opacity="0.07"/>
      <path d="M 402 232 L 322 372 L 372 372 L 344 462 L 434 318 L 380 318 Z" fill="${ac}" stroke="${P.bg0}" stroke-width="5" stroke-linejoin="round"/>`);
  }
  if(d.tr==="Component"){
    let ben="";
    for(let i=0;i<6;i++){ const y=268+i*32;
      ben+=`<rect x="228" y="${y}" width="30" height="14" rx="4" fill="${ac}"/>
            <rect x="492" y="${y}" width="30" height="14" rx="4" fill="${ac}"/>`; }
    return wrap(`${ben}<rect x="258" y="245" width="234" height="200" rx="16" fill="${P.bg2}" stroke="${ac}" stroke-width="${sw}"/>
      <circle cx="298" cy="285" r="11" fill="${ac}"/>
      <rect x="288" y="330" width="174" height="8" rx="4" fill="${ac}" opacity="0.55"/>
      <rect x="288" y="356" width="130" height="8" rx="4" fill="${ac}" opacity="0.35"/>`);
  }
  if(d.tr==="Robot"){
    return wrap(`<line x1="375" y1="252" x2="375" y2="208" stroke="${ac}" stroke-width="${sw}"/>
      <circle cx="375" cy="196" r="13" fill="${ac}"/>
      <rect x="262" y="252" width="226" height="188" rx="28" fill="${P.bg2}" stroke="${ac}" stroke-width="${sw}"/>
      <rect x="236" y="310" width="26" height="64" rx="8" fill="${ac}" opacity="0.7"/>
      <rect x="488" y="310" width="26" height="64" rx="8" fill="${ac}" opacity="0.7"/>
      <rect x="300" y="308" width="52" height="30" rx="8" fill="${ac}"/>
      <rect x="398" y="308" width="52" height="30" rx="8" fill="${ac}"/>
      <rect x="318" y="384" width="114" height="12" rx="6" fill="${ac}" opacity="0.6"/>`);
  }
  if(d.tr==="Drone"){
    const arm=(x2,y2)=>`<line x1="375" y1="345" x2="${x2}" y2="${y2}" stroke="${ac}" stroke-width="12" stroke-linecap="round"/>`;
    const rot=(x,y)=>`<circle cx="${x}" cy="${y}" r="52" fill="none" stroke="${ac}" stroke-width="8" opacity="0.85"/>
      <circle cx="${x}" cy="${y}" r="10" fill="${ac}"/>`;
    return wrap(`${arm(263,233)}${arm(487,233)}${arm(263,457)}${arm(487,457)}
      ${rot(263,233)}${rot(487,233)}${rot(263,457)}${rot(487,457)}
      <rect x="327" y="311" width="96" height="68" rx="16" fill="${P.bg2}" stroke="${ac}" stroke-width="${sw}"/>
      <circle cx="375" cy="345" r="13" fill="${ac}"/>`);
  }
  if(d.tr==="Virus"){
    let sp="";
    for(let i=0;i<8;i++){ const a=Math.PI/4*i+Math.PI/8;
      const x1=375+96*Math.cos(a), y1=345+96*Math.sin(a), x2=375+152*Math.cos(a), y2=345+152*Math.sin(a);
      sp+=`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${ac}" stroke-width="13" stroke-linecap="round"/>
           <circle cx="${x2.toFixed(1)}" cy="${y2.toFixed(1)}" r="15" fill="${ac}"/>`; }
    return wrap(`${sp}<circle cx="375" cy="345" r="96" fill="${P.bg2}" stroke="${ac}" stroke-width="${sw}"/>
      <circle cx="345" cy="322" r="14" fill="${ac}" opacity="0.85"/>
      <circle cx="404" cy="352" r="19" fill="${ac}" opacity="0.6"/>
      <circle cx="358" cy="386" r="10" fill="${ac}" opacity="0.75"/>`);
  }
  // legendariske uden stamme: energikerne
  return wrap(`<circle cx="375" cy="345" r="120" fill="none" stroke="${ac}" stroke-width="8" opacity="0.9"/>
    <circle cx="375" cy="345" r="150" fill="none" stroke="${ac}" stroke-width="3" opacity="0.4"/>
    <path d="M 375 205 L 405 315 L 515 345 L 405 375 L 375 485 L 345 375 L 235 345 L 345 315 Z"
      fill="${ac}" stroke="${P.bg0}" stroke-width="5" stroke-linejoin="round"/>`);
}

// ---------- tekst-wrap ----------
function wrapText(t, maxChars){
  const words=t.split(/\s+/), lines=[]; let cur="";
  for(const w of words){
    if((cur+" "+w).trim().length<=maxChars) cur=(cur+" "+w).trim();
    else { if(cur) lines.push(cur); cur=w; }
  }
  if(cur) lines.push(cur);
  return lines;
}

// ---------- kort-SVG ----------
const W=750, H=1050;
function cardSVG(id){
  const d=CARDS[id], ac=accentFor(d), rnd=mulberry(seedOf(id));
  const th=themeOf(d);
  const leg=d.r==="L", ramme=leg?P.guld:th.edge;
  const artY0=150, artY1=560;

  // navn
  let nameSize=46; if(d.n.length>13) nameSize=38; if(d.n.length>18) nameSize=32;

  // korttekst
  const quote=d.txt.startsWith("\u201C")||d.txt.startsWith("\u201E");
  let tSize=30, maxC=40; const lhF=1.38;
  let lines=wrapText(d.txt||"", maxC);
  if(lines.length>6){ tSize=26; maxC=46; lines=wrapText(d.txt, maxC); }
  if(lines.length>8){ tSize=23; maxC=52; lines=wrapText(d.txt, maxC); }
  const lh=tSize*lhF;
  const areaTop=646, areaBot = d.t==="unit" ? 862 : 972;
  const blockH=lines.length*lh;
  const tY0=areaTop + Math.max(0,(areaBot-areaTop-blockH))/2 + tSize;
  const textSvg=lines.map((l,i)=>
    `<text x="375" y="${(tY0+i*lh).toFixed(1)}" text-anchor="middle" font-family="DejaVu Sans" font-size="${tSize}"
      ${quote?'font-style="italic"':""} fill="${quote?P.dim:P.txt}">${esc(l)}</text>`).join("\n");

  // typelinje
  const kc=clsCol(d);
  const typeTxt = (leg?"\u2605 LEGENDARY \u00B7 ":"") + (kc?CLASSES[d.cls].n.toUpperCase()+" \u00B7 ":"")
    + (d.t==="spell"?"SPELL":"UNIT"+(d.tr?" \u00B7 "+d.tr.toUpperCase():"")) + (d.tok?" \u00B7 TOKEN":"");

  // gold fingers
  let fingers="";
  for(let x=70; x<=650; x+=34)
    fingers+=`<rect x="${x}" y="${H-46}" width="22" height="30" fill="url(#guldgrad)"/>`;

  // stats
  const stats = d.t==="unit" ? `
    <circle cx="95" cy="${H-115}" r="56" fill="${P.bg0}" stroke="${P.amber}" stroke-width="7"/>
    <text x="95" y="${H-96}" text-anchor="middle" font-family="DejaVu Sans" font-weight="bold" font-size="56" fill="${P.amber}">${d.a}</text>
    <circle cx="${W-95}" cy="${H-115}" r="56" fill="${P.bg0}" stroke="${P.fos}" stroke-width="7"/>
    <text x="${W-95}" y="${H-96}" text-anchor="middle" font-family="DejaVu Sans" font-weight="bold" font-size="56" fill="${P.fos}">${d.h}</text>` : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <linearGradient id="bggrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${th.top}"/><stop offset="0.5" stop-color="${th.mid}"/><stop offset="1" stop-color="${th.bot}"/>
  </linearGradient>
  <radialGradient id="artgrad" cx="0.5" cy="0.42" r="0.75">
    <stop offset="0" stop-color="${mix(th.art,th.edge,0.14)}"/><stop offset="1" stop-color="${th.art}"/>
  </radialGradient>
  <linearGradient id="guldgrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${P.guld}"/><stop offset="1" stop-color="#9a7422"/>
  </linearGradient>
  <clipPath id="artclip"><rect x="52" y="${artY0}" width="${W-104}" height="${artY1-artY0}" rx="14"/></clipPath>
</defs>
<rect x="6" y="6" width="${W-12}" height="${H-12}" rx="36" fill="url(#bggrad)" stroke="${ramme}" stroke-width="${leg?9:6}"/>
<rect x="22" y="22" width="${W-44}" height="${H-44}" rx="26" fill="none" stroke="${th.edge}" stroke-width="${leg?3:2}" opacity="0.7"/>
${circuitPattern(mulberry(seedOf(id+"bg")), 40, 620, W-40, H-70, P.cu, 5, 0.10)}
<g clip-path="url(#artclip)">
  <rect x="52" y="${artY0}" width="${W-104}" height="${artY1-artY0}" fill="url(#artgrad)"/>
  ${circuitPattern(rnd, 60, artY0+10, W-60, artY1-10, P.cu, 9, 0.30)}
  ${circuitPattern(rnd, 60, artY0+10, W-60, artY1-10, ac, 3, 0.22)}
  ${motif(d, ac, rnd)}
</g>
<rect x="52" y="${artY0}" width="${W-104}" height="${artY1-artY0}" rx="14" fill="none" stroke="${leg?P.guld:P.line}" stroke-width="3"/>
<text x="200" y="${102}" font-family="DejaVu Sans Condensed" font-weight="bold" font-size="${nameSize}"
  letter-spacing="2" fill="${leg?P.guld:P.txt}">${esc(d.n.toUpperCase())}</text>
<polygon points="95,28 152,61 152,127 95,160 38,127 38,61" fill="${P.amber}" stroke="${P.mork}" stroke-width="4"/>
<text x="95" y="118" text-anchor="middle" font-family="DejaVu Sans" font-weight="bold" font-size="74" fill="${P.mork}">${d.c}</text>
<text x="375" y="608" text-anchor="middle" font-family="DejaVu Sans Mono" font-size="26" letter-spacing="3"
  fill="${kc?kc:(leg?P.guld:P.dim)}">${esc(typeTxt)}</text>
<line x1="80" y1="626" x2="${W-80}" y2="626" stroke="${th.edge}" stroke-width="2" opacity="0.5"/>
<rect x="46" y="640" width="${W-92}" height="${(d.t==="unit"?862:972)-640+14}" rx="16" fill="${th.plate}" opacity="0.55"/>
${textSvg}
${stats}
${fingers}
<rect x="60" y="${H-50}" width="${W-120}" height="4" fill="${P.cu}" opacity="0.5"/>
</svg>`;
}

// ---------- kortbagside ----------
function backSVG(){
  const rnd=mulberry(seedOf("KORTSLUTNING-RYG"));
  const hex=[...Array(6)].map((_,i)=>{const a=Math.PI/3*i-Math.PI/6;
    return `${375+190*Math.cos(a)},${505+190*Math.sin(a)}`;}).join(" ");
  let fingers="";
  for(let x=70;x<=650;x+=34) fingers+=`<rect x="${x}" y="${H-46}" width="22" height="30" fill="url(#guldgrad)"/>`
    +`<rect x="${x}" y="16" width="22" height="30" fill="url(#guldgrad)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <linearGradient id="bggrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#1a3423"/><stop offset="1" stop-color="${P.bg0}"/>
  </linearGradient>
  <linearGradient id="guldgrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${P.guld}"/><stop offset="1" stop-color="#9a7422"/>
  </linearGradient>
</defs>
<rect x="6" y="6" width="${W-12}" height="${H-12}" rx="36" fill="url(#bggrad)" stroke="${P.cu}" stroke-width="7"/>
${circuitPattern(rnd, 40, 60, W-40, H-70, P.cu, 16, 0.22)}
${circuitPattern(mulberry(seedOf("ryg2")), 40, 60, W-40, H-70, P.fos, 5, 0.10)}
<polygon points="${hex}" fill="${P.bg0}" stroke="${P.cu2}" stroke-width="9"/>
<path d="M 408 350 L 318 545 L 372 545 L 340 660 L 448 470 L 386 470 Z" fill="${P.amber}" stroke="${P.bg0}" stroke-width="6"/>
<text x="375" y="810" text-anchor="middle" font-family="DejaVu Sans Condensed" font-weight="bold" font-size="72" letter-spacing="8" fill="${P.cu2}">KORTSLUTNING</text>
<text x="375" y="860" text-anchor="middle" font-family="DejaVu Sans Mono" font-size="26" letter-spacing="6" fill="${P.dim}">// THE TECHNICIAN</text>
${fingers}
</svg>`;
}

// ---------- kør ----------
mkdirSync("assets/svg",{recursive:true});
mkdirSync("assets/png",{recursive:true});
mkdirSync("assets/atlas",{recursive:true});

const manifest=[];
console.log("Genererer", ALL.length, "kort + bagside …");
for(const id of ALL){
  const svg=cardSVG(id);
  writeFileSync(`assets/svg/${id}.svg`, svg);
  await sharp(Buffer.from(svg)).png().toFile(`assets/png/${id}.png`);
  const d=CARDS[id];
  manifest.push({ id, name:d.n, cost:d.c, type:d.t, cls:d.cls||null, tribe:d.tr||null, rarity:d.r||null,
    attack:d.a??null, health:d.h??null, keywords:d.kw||[], spellDamage:d.sig||0,
    token:!!d.tok, collectible:COLL.includes(id), text:d.txt||"",
    files:{ svg:`svg/${id}.svg`, png:`png/${id}.png` } });
}
const back=backSVG();
writeFileSync("assets/svg/_bagside.svg", back);
await sharp(Buffer.from(back)).png().toFile("assets/png/_bagside.png");

// ---------- atlas ----------
const CW=230, CH=322, COLS=12;
const ids=[...ALL, "_bagside"];
const ROWS=Math.ceil(ids.length/COLS);
const frames={};
const comps=[];
for(let i=0;i<ids.length;i++){
  const x=(i%COLS)*CW, y=Math.floor(i/COLS)*CH;
  const buf=await sharp(`assets/png/${ids[i]}.png`).resize(CW,CH).png().toBuffer();
  comps.push({ input:buf, left:x, top:y });
  frames[ids[i]]={ frame:{x,y,w:CW,h:CH} };
}
await sharp({ create:{ width:COLS*CW, height:ROWS*CH, channels:4, background:{r:0,g:0,b:0,alpha:0} } })
  .composite(comps).png().toFile("assets/atlas/kort-atlas.png");
writeFileSync("assets/atlas/kort-atlas.json", JSON.stringify({
  frames, meta:{ image:"kort-atlas.png", size:{w:COLS*CW,h:ROWS*CH}, cell:{w:CW,h:CH}, format:"RGBA8888" }
}, null, 1));

writeFileSync("assets/manifest.json", JSON.stringify({
  game:"KORTSLUTNING", version:"1.0", cardSize:{w:W,h:H}, cardBack:{svg:"svg/_bagside.svg",png:"png/_bagside.png"},
  atlas:"atlas/kort-atlas.json", cards:manifest
}, null, 1));

console.log("Færdig:", ALL.length, "kort + bagside · atlas", COLS*CW+"x"+ROWS*CH);
