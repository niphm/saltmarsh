import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { Character } from "./schema/character";
import { migrateCharacter } from "./schema/migrate";
import { derive } from "./engine/derive";
import { shortRest, longRest } from "./engine/rest";

// With no arguments, validate every example. (Shell globs like examples/*.json
// don't expand on Windows, so the default lives here instead of package.json.)
const examplesDir = fileURLToPath(new URL("../examples", import.meta.url));
const files = process.argv.length > 2
  ? process.argv.slice(2)
  : readdirSync(examplesDir).filter(f => f.endsWith(".json")).sort().map(f => join(examplesDir, f));

for (const file of files) {
  const doc = Character.parse(migrateCharacter(JSON.parse(readFileSync(file, "utf8"))));
  const d = derive(doc);
  console.log(`\n== ${doc.identity.name} (L${d.level}, prof +${d.prof}) ==`);
  console.log(`HP ${doc.state.hp.current}/${d.hpMax}  AC ${d.ac}  Speed ${d.speed}  Init ${d.initiative >= 0 ? "+" : ""}${d.initiative}  PP ${d.passive.perception}`);
  console.log(`Saves:`, Object.entries(d.saves).map(([k, v]) => `${k} ${v >= 0 ? "+" : ""}${v}`).join("  "));
  if (d.spell) console.log(`Spell: mod +${d.spell.mod} DC ${d.spell.dc} atk +${d.spell.attack} slots [${d.spell.slots.join(",")}]`);
  for (const r of d.resources) console.log(`  ${r.group ?? "-"} / ${r.name}: ${r.remaining}/${r.max} (${r.kind}, ${r.recharge})`);

  // Exercise the rest engine
  const spentAll = { ...doc, state: { ...doc.state, spent: Object.fromEntries(d.resources.map(r => [r.id, r.max])) } };
  const afterShort = derive(shortRest(spentAll)).resources.map(r => `${r.id}=${r.remaining}`).join(" ");
  const afterLong = derive(longRest(spentAll)).resources.map(r => `${r.id}=${r.remaining}`).join(" ");
  console.log(`  after short rest: ${afterShort}`);
  console.log(`  after long rest:  ${afterLong}`);
}
