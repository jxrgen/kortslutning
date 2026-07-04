// Bygger den statiske udgave (GitHub Pages + Electron-app) fra web/index.html-templaten
import { execSync } from "child_process";
import { mkdirSync, writeFileSync, readFileSync, copyFileSync, existsSync } from "fs";

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
