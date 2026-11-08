/**
 * Character document schema.
 *
 * Design rules:
 *  1. Store choices, derive everything else. Ability scores, level, class,
 *     chosen features are stored. Proficiency bonus, DCs, slots, passive
 *     Perception, max resource uses are computed at render time.
 *  2. Every trackable thing is a `Resource`. The UI has no idea what Rage or
 *     Sorcery Points are - it renders pips/counters/toggles from this list and
 *     the rest engine recharges them from `recharge`.
 *  3. `state` is the only part that changes at the table. Everything above it
 *     changes at level-up. That split makes sync cheap (state is small) and
 *     makes "undo last change" trivial.
 *  4. No level in storage keys. One record per character; level is a field.
 */
import { z } from "zod";
import { Expr, ABILITIES } from "./expression";

/** v2: coins, equipped items and item charges moved from the document into `state` (see migrate.ts). */
export const SCHEMA_VERSION = 2;

const Id = z.string().min(1);
const Ability = z.enum(ABILITIES);
const Score = z.number().int().min(1).max(30);

// ---------------------------------------------------------------------------
// Rules-pack references
// Characters reference rules content by id (e.g. "srd:spell:fireball",
// "homebrew:feature:storms-thunder"). The pack supplies text and mechanics;
// the character supplies the choice. Homebrew is just another pack.
// ---------------------------------------------------------------------------
export const Ref = z.string().regex(/^[a-z0-9-]+:[a-z-]+:[a-z0-9-]+$/, "pack:kind:slug");

// ---------------------------------------------------------------------------
// Resources - the heart of the tracker
// ---------------------------------------------------------------------------
export const Recharge = z.enum([
  "short",       // regain on short or long rest
  "long",        // regain on long rest only
  "initiative",  // regain when initiative is rolled (Uncanny Metabolism)
  "dawn",        // regain at dawn (magic items)
  "turn",        // once per turn - UI resets automatically
  "manual",      // never auto-recharges (Tides of Chaos regain-on-surge, DM-granted)
]);
export type Recharge = z.infer<typeof Recharge>;

export const ResourceKind = z.enum([
  "pips",     // N discrete uses rendered as circles (Rage 3/3, Channel Divinity)
  "counter",  // numeric pool with +/- (Sorcery Points, Ki, Lay on Hands HP)
  "toggle",   // single on/off (Relentless Endurance, free cast of Misty Step)
  "state",    // persistent on/off mode that affects the sheet (Rage ON, Large Form)
]);

export const Resource = z.object({
  id: Id,                                  // stable key, e.g. "rage", "sorcery-points"
  name: z.string(),
  kind: ResourceKind,
  max: Expr,                               // 3, "prof", "classLevel.sorcerer", "max(1, mod.wis)"
  recharge: Recharge,
  rechargeAmount: Expr.optional(),         // partial recharge, e.g. Rage regains 1 on short rest. Omit = full.
  source: Ref.optional(),                  // feature that grants this, for tooltips
  group: z.string().optional(),            // UI section: "Class", "Species", "Magic Items", "Free Casts"
  description: z.string().optional(),
  /**
   * Optional effect the player may choose during a Short Rest (Sorcerous
   * Restoration). Choosing it spends one use of this resource and restores
   * `amount` spent uses of the resource `restores`.
   */
  shortRestTrigger: z.object({ restores: Id, amount: Expr }).optional(),
  /** Optional effects applied while a `state` resource is on. */
  whileActive: z.object({
    acBonus: z.number().optional(),
    speedBonus: z.number().optional(),
    damageBonus: Expr.optional(),
    resistances: z.array(z.string()).optional(),
    advantageOn: z.array(z.string()).optional(),   // free text tags: "str-checks", "str-saves"
    blocks: z.array(z.string()).optional(),         // "spellcasting", "concentration"
    /** Situational tags this state turns on; attack damage lines with a matching `when` apply. */
    tags: z.array(z.string()).optional(),           // "rage"
  }).optional(),
});
export type Resource = z.infer<typeof Resource>;

// ---------------------------------------------------------------------------
// Proficiencies
// ---------------------------------------------------------------------------
export const ProfLevel = z.enum(["none", "half", "proficient", "expert"]);

export const Skill = z.enum([
  "acrobatics", "animal-handling", "arcana", "athletics", "deception", "history",
  "insight", "intimidation", "investigation", "medicine", "nature", "perception",
  "performance", "persuasion", "religion", "sleight-of-hand", "stealth", "survival",
]);
export type Skill = z.infer<typeof Skill>;

export const Proficiencies = z.object({
  saves: z.array(Ability).default([]),
  skills: z.record(Skill, ProfLevel).default({}),
  armor: z.array(z.string()).default([]),
  weapons: z.array(z.string()).default([]),
  tools: z.array(z.string()).default([]),
  languages: z.array(z.string()).default([]),
  /** Weapon Mastery properties the character can use (2024 rules). */
  masteries: z.array(z.string()).default([]),   // "vex", "push", "slow", "nick", ...
});

// ---------------------------------------------------------------------------
// Class levels (multiclass-ready from day one)
// ---------------------------------------------------------------------------
export const ClassLevel = z.object({
  class: Ref,                              // "srd:class:sorcerer"
  subclass: Ref.optional(),                // "srd:subclass:divine-soul"
  level: z.number().int().min(1).max(20),
  hitDie: z.number().int(),                // 6, 8, 10, 12 - copied from pack for offline safety
});

// ---------------------------------------------------------------------------
// Spellcasting
// ---------------------------------------------------------------------------
export const SpellcastingBlock = z.object({
  ability: Ability,
  /** "full" | "half" | "third" | "pact" | "none" - drives slot table lookup. */
  progression: z.enum(["full", "half", "third", "pact", "none"]),
  /** Spells the character knows or has prepared. */
  spells: z.array(z.object({
    ref: Ref,
    prepared: z.boolean().default(true),
    alwaysPrepared: z.boolean().default(false),   // domain/subclass spells
    source: z.string().optional(),                // "Sorcerer", "Magic Initiate (Wizard)", "Tempest Domain"
    /** Free cast once per long rest without a slot (Fey Touched, Magic Initiate, species spells). */
    freeCastResource: Id.optional(),              // points at a Resource id of kind "toggle"
  })).default([]),
  /** Metamagic / Invocations / Maneuvers - option-style features keyed by class. */
  options: z.array(z.object({ ref: Ref, cost: Expr.optional() })).default([]),
  /** Override computed slots (homebrew, multiclass edge cases). Index = spell level. */
  slotOverride: z.array(z.number().int()).optional(),
});

// ---------------------------------------------------------------------------
// Attacks
// ---------------------------------------------------------------------------
export const Attack = z.object({
  id: Id,
  name: z.string(),
  itemId: Id.optional(),                   // links to an Inventory item if it's a weapon
  ability: Ability,                        // which mod applies (Monk uses dex; Finesse chooses)
  proficient: z.boolean().default(true),
  attackBonusExtra: z.number().default(0), // magic weapon +1, Archery style +2
  damage: z.array(z.object({
    dice: z.string(),                      // "1d8", "2d6", "1d4"
    bonusExpr: Expr.optional(),            // "mod.dex", "mod.str + 2"
    type: z.string(),                      // "slashing", "fire"
    when: z.string().optional(),           // "rage", "frenzy", "two-handed", "sneak-attack"
  })),
  properties: z.array(z.string()).default([]),   // "light", "finesse", "thrown (20/60)", "versatile (1d10)"
  mastery: z.string().optional(),          // "vex"
  range: z.string().optional(),            // "5 ft", "150/600"
  notes: z.string().optional(),
});
export type Attack = z.infer<typeof Attack>;

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------
export const ItemCategory = z.enum([
  "weapon", "armor", "shield", "gear", "tool", "consumable", "magic-item", "treasure", "quest-item", "other",
]);

export const Item = z.object({
  id: Id,
  name: z.string(),
  ref: Ref.optional(),                     // link to rules pack entry for description/stats
  category: ItemCategory,
  qty: z.number().min(0).default(1),
  weight: z.number().optional(),           // lb each
  value: z.object({ amount: z.number(), unit: z.enum(["cp", "sp", "ep", "gp", "pp"]) }).optional(),
  // Whether it's equipped, and charges used, are table state: `state.equipped`, `state.chargesSpent`.
  attuned: z.boolean().default(false),
  requiresAttunement: z.boolean().default(false),
  /** Charges recharge by `recharge` like resources; spent charges live in `state.chargesSpent`. */
  charges: z.object({ max: Expr, recharge: Recharge }).optional(),
  /** Mechanical effect while equipped. Keeps AC computed, not typed. */
  equipEffect: z.object({
    acBase: z.number().optional(),         // armor: 11 (leather), 14 (breastplate)
    acBonus: z.number().optional(),        // shield +2, ring +1
    acDexCap: z.number().nullable().optional(),  // medium armor = 2, heavy = 0, light = null (uncapped)
    stealthDisadvantage: z.boolean().optional(),
    strRequirement: z.number().optional(),
  }).optional(),
  notes: z.string().optional(),
});
export type Item = z.infer<typeof Item>;

export const Coins = z.object({
  cp: z.number().int().min(0).default(0),
  sp: z.number().int().min(0).default(0),
  ep: z.number().int().min(0).default(0),
  gp: z.number().int().min(0).default(0),
  pp: z.number().int().min(0).default(0),
});

// ---------------------------------------------------------------------------
// Table state - the only part that changes mid-session
// ---------------------------------------------------------------------------
export const Condition = z.enum([
  "blinded", "charmed", "deafened", "exhaustion", "frightened", "grappled", "incapacitated",
  "invisible", "paralyzed", "petrified", "poisoned", "prone", "restrained", "stunned", "unconscious",
]);
export type Condition = z.infer<typeof Condition>;

export const CharacterState = z.object({
  hp: z.object({
    current: z.number().int(),
    temp: z.number().int().min(0).default(0),
    maxOverride: z.number().int().optional(),   // for effects like Aid, or houseruled HP
  }),
  /** Spent uses per resource id. Missing key = nothing spent. Counters store the *spent* amount too. */
  spent: z.record(Id, z.number().int().min(0)).default({}),
  /** `state`-kind resources that are currently on. */
  active: z.array(Id).default([]),
  /** Spent spell slots by level: { "1": 2, "3": 1 }. */
  slotsSpent: z.record(z.string(), z.number().int().min(0)).default({}),
  hitDiceSpent: z.number().int().min(0).default(0),
  deathSaves: z.object({ success: z.number().int().min(0).max(3), failure: z.number().int().min(0).max(3) })
    .default({ success: 0, failure: 0 }),
  concentration: z.object({ spell: Ref, startedRound: z.number().optional() }).nullable().default(null),
  conditions: z.array(z.object({
    condition: Condition,
    level: z.number().int().optional(),    // exhaustion level
    source: z.string().optional(),
    until: z.string().optional(),          // free text: "end of next turn", "long rest"
  })).default([]),
  /** Free-text reminders that don't fit a condition. */
  effects: z.array(z.object({ id: Id, text: z.string(), until: z.string().optional() })).default([]),
  inspiration: z.boolean().default(false),
  acOverride: z.number().int().optional(), // for Mage Armor etc. until spell effects exist as data
  speedOverride: z.number().int().optional(),
  /**
   * Inventory that changes at the table. In `state` so it syncs on the fast
   * path and the party DM can change it (F2.8: only the owner writes the document).
   */
  coins: Coins.default({}),
  /** Ids of equipped items. Equipped armor and shields feed AC in derive(). */
  equipped: z.array(Id).default([]),
  /** Spent charges per item id, like `spent` for resources. Missing key = full. */
  chargesSpent: z.record(Id, z.number().int().min(0)).default({}),
  /** Last N state changes for undo and the DM's combat log. */
  log: z.array(z.object({
    at: z.string(),                        // ISO timestamp
    by: z.string().optional(),             // user id
    change: z.string(),                    // "hp -8 (Fireball)", "rage on", "long rest"
  })).default([]),
});
export type CharacterState = z.infer<typeof CharacterState>;

// ---------------------------------------------------------------------------
// The character
// ---------------------------------------------------------------------------
export const Character = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: Id,                                  // uuid - the storage key, never changes
  ownerId: Id,                             // user id
  partyId: Id.optional(),

  identity: z.object({
    name: z.string(),
    species: Ref,                          // "srd:species:halfling"
    lineage: z.string().optional(),        // "Lightfoot", "Storm Giant", "Abyssal"
    background: Ref.optional(),            // "srd:background:sage"
    alignment: z.string().optional(),
    portraitUrl: z.string().url().optional(),
    description: z.string().optional(),
    backstory: z.string().optional(),      // long markdown
  }),

  classes: z.array(ClassLevel).min(1),
  /** All six required: a z.record with enum keys accepts missing keys, which derived NaN everywhere. */
  abilityScores: z.object({ str: Score, dex: Score, con: Score, int: Score, wis: Score, cha: Score }),

  /** Base walking speed and extra movement modes from species/features. */
  speed: z.object({ walk: z.number().int(), fly: z.number().int().optional(), swim: z.number().int().optional(), climb: z.number().int().optional() }),
  size: z.enum(["tiny", "small", "medium", "large"]).default("medium"),
  senses: z.array(z.object({ kind: z.string(), range: z.number().int() })).default([]),   // darkvision 60
  damageResistances: z.array(z.string()).default([]),
  damageImmunities: z.array(z.string()).default([]),
  conditionImmunities: z.array(z.string()).default([]),

  proficiencies: Proficiencies,

  /** Chosen features: class, subclass, species, background, feats. Text lives in the pack. */
  features: z.array(z.object({
    ref: Ref,
    name: z.string(),                      // denormalized for offline display
    source: z.string(),                    // "Sorcerer 1", "Orc", "Soldier", "Feat"
    summary: z.string().optional(),        // one-liner for the tracker card
    /** Per-character overrides of the pack's text (DM rulings, houserules). */
    textOverride: z.string().optional(),
  })).default([]),

  resources: z.array(Resource).default([]),
  spellcasting: SpellcastingBlock.optional(),
  attacks: z.array(Attack).default([]),

  /** Item definitions. Coins, what's equipped and charges used are in `state`. */
  inventory: z.object({
    items: z.array(Item).default([]),
  }).default({}),

  /** HP as rolled/taken per level, so level-up math is auditable. Length = total level. */
  hpByLevel: z.array(z.number().int()).optional(),
  /** Explicit max HP if you don't want per-level tracking. One of the two is required. */
  hpMax: z.number().int().optional(),

  notes: z.string().default(""),           // player's private scratchpad, markdown

  state: CharacterState,

  createdAt: z.string(),
  updatedAt: z.string(),
}).refine(c => c.hpMax !== undefined || c.hpByLevel !== undefined, { message: "hpMax or hpByLevel required" });

export type Character = z.infer<typeof Character>;
