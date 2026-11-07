import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Character } from "../src/schema/character";
import { SpellList, type Spell } from "../src/schema/pack";
import { derive } from "../src/engine/derive";
import tidewickJson from "../examples/tidewick.json";
import kenpachiJson from "../examples/kenpachi.json";

const raw = { tidewick: tidewickJson, kenpachi: kenpachiJson } as const;

/** Fresh, schema-validated copy of a bundled example. */
export function loadExample(name: keyof typeof raw): Character {
  return Character.parse(structuredClone(raw[name]));
}

/** Same as validate.ts: every resource spent to its max. */
export function spendAll(c: Character): Character {
  const d = derive(c);
  return { ...c, state: { ...c.state, spent: Object.fromEntries(d.resources.map(r => [r.id, r.max])) } };
}

/** `{ resourceId: remaining }` - the format validate.ts prints. */
export function remaining(c: Character): Record<string, number> {
  return Object.fromEntries(derive(c).resources.map(r => [r.id, r.remaining]));
}

/** Every spell from every pack under packs/, validated. */
export function loadAllSpells(): Map<string, Spell> {
  const root = fileURLToPath(new URL("../../packs/", import.meta.url));
  const all = new Map<string, Spell>();
  for (const e of readdirSync(root, { withFileTypes: true })) {
    const file = join(root, e.name, "spells.json");
    if (!e.isDirectory() || !existsSync(file)) continue;
    for (const s of SpellList.parse(JSON.parse(readFileSync(file, "utf8")))) all.set(s.id, s);
  }
  return all;
}

export function withState(c: Character, patch: Partial<Character["state"]>): Character {
  return { ...c, state: { ...c.state, ...patch } };
}
