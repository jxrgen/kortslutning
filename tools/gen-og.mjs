// Genererer web/og.png (1200x630) — social share-billede med kortvifte og logo
import sharp from "sharp";
import { readFileSync, writeFileSync } from "fs";

const FAN = ["hk_root","u_spole","l_kvante","ov_heatwave","u_nano"];
const W = 1200, H = 630;

let cards = "";
for (let i = 0; i < FAN.length; i++) {
  const o = i - (FAN.length - 1) / 2;
  const png = readFileSync(`assets/png/${FAN[i]}.png`).toString("base64");
  const cw = 250, ch = 350;
  const x = W / 2 + o * 148 - cw / 2;
  const y = 236 + Math.abs(o) * 26;
  cards += `<g transform="rotate(${o * 9} ${x + cw / 2} ${y + ch / 2})">
    <rect x="${x - 4}" y="${y - 4}" width="${cw + 8}" height="${ch + 8}" rx="18" fill="#000" opacity="0.45"/>
    <image href="data:image/png;base64,${png}" x="${x}" y="${y}" width="${cw}" height="${ch}"/></g>`;
}

let traces = "";
const pts = [[60,80,340,80],[900,60,1140,60],[80,540,300,540],[980,560,1150,560],[40,300,160,300]];
for (const [x1,y1,x2,y2] of pts)
  traces += `<path d="M${x1} ${y1} H${x2} l30 30" stroke="#c9814a" stroke-width="3" fill="none" opacity="0.16" stroke-linecap="round"/>
  <circle cx="${x1}" cy="${y1}" r="6" fill="none" stroke="#c9814a" stroke-width="3" opacity="0.2"/>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<defs>
  <radialGradient id="g" cx="50%" cy="20%" r="80%">
    <stop offset="0%" stop-color="#16301f"/><stop offset="60%" stop-color="#0c1811"/>
  </radialGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#g)"/>
${traces}
${cards}
<rect x="0" y="0" width="${W}" height="240" fill="#0c1811" opacity="0.4"/>
<text x="600" y="98" text-anchor="middle" font-family="DejaVu Sans Mono" font-weight="bold"
  font-size="80" letter-spacing="5" fill="#5fe0a0">CARD<tspan fill="#f0b23e">WARE</tspan></text>
<text x="600" y="178" text-anchor="middle" font-family="DejaVu Sans Mono" font-weight="bold"
  font-size="90" letter-spacing="14" fill="#ff5a4d">CRASH</text>
<text x="600" y="216" text-anchor="middle" font-family="DejaVu Sans" font-size="24" fill="#dff0e4">
  Build your deck. Manage the heat. Crash your rival\u2019s system.</text>
<g opacity="0.12">${[...Array(20)].map((_,i)=>`<rect x="0" y="${i*32}" width="${W}" height="2" fill="#000"/>`).join("")}</g></svg>`;

await sharp(Buffer.from(svg)).png().toFile("web/og.png");
console.log("og.png OK");
