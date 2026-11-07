#!/usr/bin/env node
/**
 * Builds packs/srd/spells.json from the SRD 5.2 spell data published by
 * Open5e (document "srd-2024", CC-BY 4.0). Run from the repo root:
 *
 *   npm run packs:srd
 *
 * The output is committed; CI never fetches. Fields the engine needs
 * (upcast dice, cantrip scaling, +spellcasting modifier) are extracted from
 * the SRD text here, so the app never parses rules prose.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const API = "https://api.open5e.com/v2/spells/?document__key=srd-2024&limit=100";
const OUT = fileURLToPath(new URL("../srd/spells.json", import.meta.url));

const ABILITY = { strength: "str", dexterity: "dex", constitution: "con", intelligence: "int", wisdom: "wis", charisma: "cha" };
const CASTING = { action: "Action", "bonus-action": "Bonus Action", reaction: "Reaction", "1minute": "1 minute", "10minutes": "10 minutes", "1hour": "1 hour", "8hours": "8 hours", "12hours": "12 hours", "24hours": "24 hours" };
const ROLL = /^(\d+d\d+)(?:\+(\d+))?$/; // "2d8", "1d4+1"
// The source's damage_roll isn't damage this spell deals (checked by hand against the SRD text).
const NOT_A_ROLL = new Set([
  "ray-of-enfeeblement", // 1d8 is subtracted from the target's damage rolls
  "resistance", // 1d4 reduces damage taken
  "teleport", // d100 is the mishap table
]);
const untyped = [];

const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

async function fetchAll() {
  const all = [];
  for (let url = API; url; ) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    const page = await res.json();
    all.push(...page.results);
    url = page.next;
  }
  return all;
}

function convert(s, warn) {
  const slug = s.key.replace(/^srd-2024_/, "");
  const desc = (s.desc ?? "").trim();
  const higher = (s.higher_level ?? "").trim();

  let castingTime = CASTING[s.casting_time];
  if (!castingTime) {
    warn(`${slug}: unknown casting_time ${s.casting_time}`);
    castingTime = s.casting_time;
  }
  if (s.casting_time === "reaction" && s.reaction_condition) castingTime += `, ${s.reaction_condition}`;

  const range = s.range_text === "Self" && s.shape_type && s.shape_size ? `Self (${s.shape_size}-foot ${s.shape_type})` : s.range_text;

  const attack = !s.attack_roll ? undefined : /melee spell attack/i.test(desc) ? "melee" : /ranged spell attack/i.test(desc) ? "ranged" : s.range_text === "Touch" ? "melee" : "ranged";

  let roll;
  const rollText = NOT_A_ROLL.has(slug) ? "" : (s.damage_roll ?? "").replace(/\s+/g, "");
  if (rollText) {
    const m = rollText.match(ROLL);
    const kind = s.damage_types?.length
      ? "damage"
      : /regains?\b/i.test(desc)
        ? "healing"
        : /temporary hit points/i.test(desc)
          ? undefined // temp HP spells (False Life) aren't damage
          : /\bdamage\b/i.test(desc)
            ? "damage" // a type you choose (Sorcerous Burst)
            : undefined;
    if (!m) warn(`${slug}: skipped unparseable roll "${s.damage_roll}"`);
    else if (kind) {
      const [, dice, flat] = m;
      const perSlot = higher.match(/(?:damage|healing)[^.]*?increases? by (\d+d\d+) for each (?:spell )?slot level above/i)?.[1];
      roll = {
        kind,
        dice,
        ...(flat ? { bonus: Number(flat) } : {}),
        types: s.damage_types ?? [],
        ...(perSlot ? { perSlot } : {}),
        cantripScaling: s.level === 0 && /when you reach levels? 5/i.test(higher),
        addSpellMod: new RegExp(`${dice}\\s*\\+?\\s*(plus )?your spellcasting ability modifier`, "i").test(desc),
      };
      if (kind === "damage" && !roll.types.length) untyped.push(`${slug} (${rollText})`);
    }
  }

  const spell = {
    id: `srd:spell:${slug}`,
    name: s.name,
    level: s.level,
    school: s.school.key,
    castingTime,
    range,
    components: {
      verbal: !!s.verbal,
      somatic: !!s.somatic,
      ...(s.material ? { material: s.material_specified || "a material component" } : {}),
    },
    duration: cap(s.duration),
    concentration: !!s.concentration,
    ritual: !!s.ritual,
    description: desc,
    ...(higher ? { higherLevels: higher } : {}),
    ...(attack ? { attack } : {}),
    ...(s.saving_throw_ability ? { save: ABILITY[s.saving_throw_ability] } : {}),
    ...(roll ? { roll } : {}),
    classes: (s.classes ?? []).map(c => c.name).sort(),
  };
  return spell;
}

const warnings = [];
const raw = await fetchAll();
const spells = raw
  .map(s => convert(s, w => warnings.push(w)))
  .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

// One spell per line: compact, but still diffs cleanly.
writeFileSync(OUT, `[\n${spells.map(s => JSON.stringify(s)).join(",\n")}\n]\n`);
console.log(`Wrote ${spells.length} spells to packs/srd/spells.json`);
for (const w of warnings) console.warn(`warning: ${w}`);
if (untyped.length) console.log(`Damage with no fixed type (check these): ${untyped.join(", ")}`);
