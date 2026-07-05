// Bumper versionsnummeret i desktop/package.json og laver et git-tag.
// Brug: node tools/bump.mjs patch|minor|major   (default patch)
import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";

const kind = process.argv[2] || "patch";
const p = "desktop/package.json";
const pkg = JSON.parse(readFileSync(p, "utf8"));
const [maj, min, pat] = pkg.version.split(".").map(Number);
const next = kind === "major" ? `${maj + 1}.0.0`
  : kind === "minor" ? `${maj}.${min + 1}.0`
  : `${maj}.${min}.${pat + 1}`;
pkg.version = next;
writeFileSync(p, JSON.stringify(pkg, null, 2) + "\n");
console.log(`Version: ${maj}.${min}.${pat} → ${next}`);
console.log(`Nu: git add -A && git commit -m "v${next}" && git tag v${next} && git push --follow-tags`);
