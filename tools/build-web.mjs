// Bygger den statiske udgave (GitHub Pages + Electron-app) fra web/index.html-templaten
import { execSync } from "child_process";
import { mkdirSync, writeFileSync, readFileSync, copyFileSync, existsSync } from "fs";

// lille deterministisk PRNG så printbanerne ser ens ud ved hvert build
function mulberry(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }

// Genererer et felt af printbaner (kobberspor + loddeøer) der klippes til titlens
// bogstavform, så teksten ser ud til at være skåret ud af en printplade.
function pcbTraces(w,h,seed){
  const r=mulberry(seed); const step=26; let o="";
  const cu=()=>["#c98a4a","#d9a066","#b87333","#caa06a"][(r()*4)|0];
  for(let y=step; y<h; y+=step){
    for(let x=step; x<w; x+=step){
      if(r()<0.6) o+=`<path d="M${x} ${y}h${step}" stroke="${cu()}" stroke-width="${r()<0.2?3.5:2}" fill="none"/>`;
      if(r()<0.55) o+=`<path d="M${x} ${y}v${step}" stroke="${cu()}" stroke-width="${r()<0.2?3.5:2}" fill="none"/>`;
      if(r()<0.14){ // 45°-knæk
        const s=r()<0.5?1:-1;
        o+=`<path d="M${x} ${y}l${step} ${s*step}" stroke="${cu()}" stroke-width="2" fill="none"/>`;
      }
      if(r()<0.13){ // loddeø (via)
        o+=`<circle cx="${x}" cy="${y}" r="4.4" fill="none" stroke="#e0b878" stroke-width="2"/><circle cx="${x}" cy="${y}" r="1.4" fill="#0a1a12"/>`;
      } else if(r()<0.1){ // pad
        o+=`<rect x="${x-3}" y="${y-3}" width="6" height="6" rx="1.5" fill="#c98a4a"/>`;
      }
    }
  }
  return o;
}

// Bygger hele titlen som ét SVG: to linjer (CARDWARE / CRASH), begge udklippet til
// printbaner, med en kobberkant og en animeret elektrisk lysbue der løber langs
// bogstavernes kant.
function titleSvg(){
  const VB_W=960, VB_H=430;
  const t1={txt:"CARDWARE", y:150, fs:118, len:900};
  const t2={txt:"CRASH",    y:360, fs:172, len:760};
  const T=(o,extra)=>`<text x="480" y="${o.y}" text-anchor="middle" textLength="${o.len}" lengthAdjust="spacingAndGlyphs" font-family="'Arial Black','Helvetica Neue',Impact,sans-serif" font-weight="900" font-size="${o.fs}" ${extra}>${o.txt}</text>`;
  return `<svg class="pcbtitle" viewBox="0 0 ${VB_W} ${VB_H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Cardware Crash">
  <defs>
    <clipPath id="tclip">${T(t1,"")}${T(t2,"")}</clipPath>
    <filter id="elec" x="-30%" y="-30%" width="160%" height="160%">
      <feTurbulence type="fractalNoise" baseFrequency="0.02 0.06" numOctaves="2" seed="7" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="7" result="d"/>
      <feGaussianBlur in="d" stdDeviation="1.4" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="d"/></feMerge>
    </filter>
    <filter id="softglow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <!-- glød bag titlen -->
  <g filter="url(#softglow)" opacity="0.5">
    <text x="480" y="${t1.y}" text-anchor="middle" textLength="${t1.len}" lengthAdjust="spacingAndGlyphs" font-family="'Arial Black','Helvetica Neue',Impact,sans-serif" font-weight="900" font-size="${t1.fs}" fill="#0f5a38">${t1.txt}</text>
    <text x="480" y="${t2.y}" text-anchor="middle" textLength="${t2.len}" lengthAdjust="spacingAndGlyphs" font-family="'Arial Black','Helvetica Neue',Impact,sans-serif" font-weight="900" font-size="${t2.fs}" fill="#0f5a38">${t2.txt}</text>
  </g>
  <!-- printplade-fyld (klippet til bogstaverne) -->
  <g clip-path="url(#tclip)">
    <rect x="0" y="0" width="${VB_W}" height="${VB_H}" fill="#08331f"/>
    <rect x="0" y="0" width="${VB_W}" height="${VB_H}" fill="url(#maskgrad)"/>
    ${pcbTraces(VB_W,VB_H,20260711)}
  </g>
  <linearGradient id="maskgrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#0c4327"/><stop offset="1" stop-color="#06251733"/>
  </linearGradient>
  <!-- kobberkant på bogstaverne -->
  <g fill="none" stroke="#e6b877" stroke-width="2.2" opacity="0.85">${T(t1,"")}${T(t2,"")}</g>
  <!-- animeret elektrisk lysbue langs kanten -->
  <g class="arcs" fill="none" filter="url(#elec)">
    <g stroke="#eafdff" stroke-width="2.6" stroke-linecap="round" class="arc arcA">${T(t1,"")}${T(t2,"")}</g>
    <g stroke="#bfefff" stroke-width="2.2" stroke-linecap="round" class="arc arcB">${T(t1,"")}${T(t2,"")}</g>
    <g stroke="#ffe08a" stroke-width="1.8" stroke-linecap="round" class="arc arcC">${T(t1,"")}${T(t2,"")}</g>
  </g>
</svg>`;
}

const SPLASH = ["l_titan","l_kvante","hk_mirror","ov_giga","s_emp","hk_root",
                "ov_heatwave","u_spole","u_nano","u_datamide","l_moderkort","n_mainframe"];
const FAN = ["u_spole","hk_root","l_kvante","ov_heatwave","u_nano"];

// deterministiske flyveretninger: jævn vifte + variation
const splashTags = SPLASH.map((id, i) => {
  const a = (i / SPLASH.length) * Math.PI * 2 + 0.4;
  const tx = Math.round(Math.cos(a) * (52 + (i % 3) * 14));       // vw
  const ty = Math.round(Math.sin(a) * (34 + (i % 4) * 9)) - 8;     // vh
  const rz = -16 + (i * 7) % 33;
  const du = (5.4 + (i % 3) * 0.5).toFixed(1);
  const dl = (i * (5.4 / SPLASH.length)).toFixed(2);
  const sx = Math.round(Math.cos(a) * 30), sy = Math.round(Math.sin(a) * 18);
  return `<img class="flyv" src="cards/${id}.svg" alt="" loading="lazy" style="--tx:${tx}vw;--ty:${ty}vh;--rz:${rz}deg;--du:${du}s;--dl:${dl}s;--sx:${sx}vw;--sy:${sy}vh">`;
}).join("\n      ");

const fanTags = FAN.map((id, i) => {
  const o = i - (FAN.length - 1) / 2;
  return `<img src="cards/${id}.svg" alt="card: ${id}" style="--r:${o * 7}deg;--y:${Math.abs(o) * 12}px">`;
}).join("\n      ");

let html = readFileSync("web/index.html", "utf8")
  .replace("<!--TITLE-->", titleSvg())
  .replace("<!--SPLASH-->", splashTags)
  .replace("<!--FAN-->", fanTags);

for (const dir of ["docs", "desktop/app"]) {
  mkdirSync(dir + "/cards", { recursive: true });
  execSync(`npx esbuild web/main.jsx --bundle --minify --jsx=automatic --loader:.jsx=jsx --outfile=${dir}/app.js`, { stdio: "inherit" });
  writeFileSync(`${dir}/index.html`, html);
  copyFileSync("web/storage-shim.js", `${dir}/storage-shim.js`);
  for (const id of new Set([...SPLASH, ...FAN]))
    copyFileSync(`assets/svg/${id}.svg`, `${dir}/cards/${id}.svg`);
  if (existsSync("web/og.png")) copyFileSync("web/og.png", `${dir}/og.png`);
}
console.log("Web-build OK → docs/ + desktop/app/ (landing + " + SPLASH.length + " splash-kort)");
