/**
 * Rules packs. A pack is a folder under packs/ with pack.json (metadata,
 * license, attribution) and one JSON file per kind (spells.json, ...).
 * Entries are keyed `pack:kind:slug`; characters reference them by that id.
 */
import { z } from "zod";
import { ABILITIES } from "./expression";
import { Ref } from "./character";

export const SpellSchool = z.enum([
  "abjuration", "conjuration", "divination", "enchantment", "evocation", "illusion", "necromancy", "transmutation",
]);

const Dice = z.string().regex(/^\d+d\d+$/, "NdM");

export const Spell = z.object({
  id: Ref,                                   // "srd:spell:fireball"
  name: z.string(),
  level: z.number().int().min(0).max(9),     // 0 = cantrip
  school: SpellSchool,
  castingTime: z.string(),                   // "Action", "Bonus Action", "Reaction, which you take when ...", "1 minute"
  range: z.string(),                         // "120 feet", "Touch", "Self (15-foot cube)"
  components: z.object({
    verbal: z.boolean(),
    somatic: z.boolean(),
    material: z.string().optional(),         // the material, if any
  }),
  duration: z.string(),                      // "Instantaneous", "1 minute" - see `concentration`
  concentration: z.boolean(),
  ritual: z.boolean(),
  description: z.string(),                   // plain text, paragraphs separated by blank lines
  higherLevels: z.string().optional(),       // upcast / cantrip upgrade text
  attack: z.enum(["melee", "ranged"]).optional(),
  save: z.enum(ABILITIES).optional(),
  /** Structured dice for the roll buttons. */
  roll: z.object({
    kind: z.enum(["damage", "healing"]),
    dice: Dice,                              // at the spell's own level
    bonus: z.number().int().default(0),      // flat bonus ("1d4 + 1")
    types: z.array(z.string()).default([]),  // damage types; empty = you choose (Sorcerous Burst)
    perSlot: Dice.optional(),                // added for each slot level above the spell's level
    cantripScaling: z.boolean().default(false), // dice count x2 / x3 / x4 at character levels 5 / 11 / 17
    addSpellMod: z.boolean().default(false), // "plus your spellcasting ability modifier"
  }).optional(),
  classes: z.array(z.string()).default([]),
});
export type Spell = z.infer<typeof Spell>;

export const PackMeta = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  version: z.string(),
  license: z.string(),
  /** Shown in Settings > About. Required by CC-BY for the SRD. */
  attribution: z.string(),
  source: z.string().url().optional(),
  homebrew: z.boolean().default(false),
});
export type PackMeta = z.infer<typeof PackMeta>;

export const SpellList = z.array(Spell);
