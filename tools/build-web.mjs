// Bygger den statiske udgave (bruges af både GitHub Pages og Electron-appen)
import { execSync } from "child_process";
import { mkdirSync, writeFileSync, copyFileSync } from "fs";

const html = `<!doctype html>
<html lang="da">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>⚡ KORTSLUTNING</title>
<style>html,body{margin:0;height:100%;background:#0c1811}#root{height:100%}</style>
</head>
<body>
<div id="root"></div>
<script src="storage-shim.js"></script>
<script src="app.js"></script>
</body>
</html>
`;
for (const dir of ["docs", "desktop/app"]) {
  mkdirSync(dir, { recursive: true });
  execSync(`npx esbuild web/main.jsx --bundle --minify --jsx=automatic --loader:.jsx=jsx --outfile=${dir}/app.js`, { stdio: "inherit" });
  writeFileSync(`${dir}/index.html`, html);
  copyFileSync("web/storage-shim.js", `${dir}/storage-shim.js`);
}
console.log("Web-build OK → docs/ + desktop/app/");
