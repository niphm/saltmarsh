// Post-build guard: the generated service worker must take over on its own
// (skipWaiting + clientsClaim). Without that, registerType "autoUpdate"
// leaves new versions stuck in "waiting" and players keep the old app until
// every tab is closed.
import { readFileSync } from "node:fs";

const sw = readFileSync(new URL("../dist/sw.js", import.meta.url), "utf8");
const problems = [];
if (!/clientsClaim\(\)/.test(sw)) problems.push("clientsClaim() is missing");
if (sw.includes("SKIP_WAITING")) problems.push("worker waits for a SKIP_WAITING message instead of calling skipWaiting() itself");

if (problems.length) {
  console.error(`dist/sw.js won't auto-update: ${problems.join("; ")}`);
  process.exit(1);
}
console.log("dist/sw.js: skipWaiting + clientsClaim present");
