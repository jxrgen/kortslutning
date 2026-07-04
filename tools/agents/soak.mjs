// SOAK — kører alle agenter i loop indtil en fejl findes eller N runder er nået.
// Brug: node tools/agents/soak.mjs [runder]   (default 20)
import { execSync } from "child_process";
const runder = parseInt(process.argv[2] || "20", 10);
let ok = 0;
for (let i = 1; i <= runder; i++) {
  try {
    const out = execSync("npm run --silent agents", { encoding: "utf8" });
    if (/✗|FEJL|CRASH/.test(out)) {
      console.log("✗ FEJL fundet i runde " + i + ":");
      console.log(out.split("\n").filter(l => /✗|FEJL|CRASH/.test(l)).join("\n"));
      process.exit(1);
    }
    ok++;
    process.stdout.write("runde " + i + "/" + runder + " ✓\r");
  } catch (e) {
    console.log("\n✗ agent crashede i runde " + i + ":\n" + (e.stdout || e.message));
    process.exit(1);
  }
}
console.log("\n✓ SOAK: " + ok + " runder uden fejl (~" + (ok * 1420) + " simulerede spil)");
