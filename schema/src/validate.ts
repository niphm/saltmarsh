import { readFileSync } from "node:fs";
import { Character } from "./schema/character";
import { derive } from "./engine/derive";
import { shortRest, longRest } from "./engine/rest";

for (const file of process.argv.slice(2)) {
  const doc = Character.parse(JSON.parse(readFileSync(file, "utf8")));
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
