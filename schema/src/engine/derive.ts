/**
 * Derives every computed value on the sheet from a Character document.
 * Pure function: same input, same output. The UI never computes anything itself.
 */
import type { Character, Resource, Skill } from "../schema/character";
import { ABILITIES, type Ability, type ExprContext, evalExpr } from "../schema/expression";

export const SKILL_ABILITY: Record<Skill, Ability> = {
  athletics: "str",
  acrobatics: "dex", "sleight-of-hand": "dex", stealth: "dex",
  arcana: "int", history: "int", investigation: "int", nature: "int", religion: "int",
  "animal-handling": "wis", insight: "wis", medicine: "wis", perception: "wis", survival: "wis",
  deception: "cha", intimidation: "cha", performance: "cha", persuasion: "cha",
};

/** Full-caster slot table, index = character level, inner index = spell level 1..9. */
const FULL_SLOTS: number[][] = [
  [], [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

export const profBonus = (level: number) => Math.ceil(level / 4) + 1;
export const mod = (score: number) => Math.floor((score - 10) / 2);

export interface DerivedResource {
  id: string; name: string; kind: Resource["kind"]; group?: string;
  max: number; spent: number; remaining: number; active: boolean; recharge: Resource["recharge"];
  description?: string;
  /** Short-rest option this resource offers, with `amount` already evaluated. */
  shortRestTrigger?: { restores: string; amount: number };
}

export interface DerivedDamage {
  dice: string;          // "1d8", "0" for a flat bonus
  bonus: number;         // bonusExpr evaluated
  type: string;
  /** Situational tag ("rage", "two-handed"). Undefined = always applies. */
  when?: string;
  /** True for unconditional lines, and for `when` lines whose tag an active state turns on. */
  active: boolean;
}

export interface DerivedAttack {
  id: string; name: string; ability: Ability;
  toHit: number;
  damage: DerivedDamage[];
  properties: string[];
  range?: string;
  mastery?: string;
  /** The character can use this weapon's mastery property (it's in proficiencies.masteries). */
  masteryActive: boolean;
  notes?: string;
}

/** alive: HP > 0. dying: 0 HP, fewer than 3 successes/failures. stable: 3 successes. dead: 3 failures. */
export type Life = "alive" | "dying" | "stable" | "dead";

/** F2.7 bands: full 100%, injured 25-99%, critical below 25%, down at 0. */
export type HpBand = "full" | "injured" | "critical" | "down";

export interface Derived {
  level: number;
  prof: number;
  mods: Record<Ability, number>;
  saves: Record<Ability, number>;
  skills: Record<Skill, number>;
  passive: { perception: number; insight: number; investigation: number };
  initiative: number;
  hpMax: number;
  ac: number;
  speed: number;
  spell?: { ability: Ability; mod: number; dc: number; attack: number; slots: number[]; slotsRemaining: number[] };
  resources: DerivedResource[];
  hitDice: { size: number; total: number; remaining: number }[];
  /** Document defenses plus resistances granted by active `state` resources. */
  defenses: { resistances: string[]; immunities: string[]; conditionImmunities: string[] };
  /** Effects folded in from active `state` resources (Raging, Large Form, ...). `tags` light up matching damage lines. */
  active: { ids: string[]; damageBonus: number; advantageOn: string[]; blocks: string[]; tags: string[] };
  attacks: DerivedAttack[];
  life: Life;
  hpBand: HpBand;
  /** 2024 exhaustion: -2 per level to every D20 Test, -5 ft speed per level (already folded into `speed`). */
  exhaustion: { level: number; d20Penalty: number; speedPenalty: number };
  inventory: {
    /** All coins converted to gold pieces. */
    gp: number;
    /** Total carried weight in lb (quantity x weight). */
    weight: number;
    attuned: number;
    attunementLimit: number;
    /** Ids of equipped items that are in the inventory. */
    equipped: string[];
    /** Item charges with `max` evaluated, keyed by item id. */
    charges: Record<string, { current: number; max: number }>;
  };
  ctx: ExprContext;
}

const uniq = (xs: string[]) => [...new Set(xs)];

/** A creature can be attuned to at most three magic items at once. */
export const ATTUNEMENT_LIMIT = 3;

/** Coin values in copper pieces (1 pp = 10 gp, 1 ep = 5 sp). */
export const COIN_CP = { cp: 1, sp: 10, ep: 50, gp: 100, pp: 1000 } as const;
export type Coin = keyof typeof COIN_CP;

/** Total value in gp, computed in whole copper to avoid float drift. */
export const coinsInGp = (coins: Record<Coin, number>) =>
  (Object.keys(COIN_CP) as Coin[]).reduce((n, k) => n + (coins[k] ?? 0) * COIN_CP[k], 0) / 100;

export function derive(c: Character): Derived {
  const level = c.classes.reduce((n, k) => n + k.level, 0);
  const prof = profBonus(level);
  const mods = Object.fromEntries(ABILITIES.map(a => [a, mod(c.abilityScores[a])])) as Record<Ability, number>;
  const scores = c.abilityScores as Record<Ability, number>;

  const classLevel: Record<string, number> = {};
  for (const k of c.classes) classLevel[k.class.split(":")[2]] = k.level;

  // Spellcasting (computed early so expressions can reference spellMod/spellDC)
  let spell: Derived["spell"];
  if (c.spellcasting && c.spellcasting.progression !== "none") {
    const sMod = mods[c.spellcasting.ability];
    const casterLevel = c.classes.reduce((n, k) => {
      const p = c.spellcasting!.progression;
      return n + (p === "full" ? k.level : p === "half" ? Math.floor(k.level / 2) : p === "third" ? Math.floor(k.level / 3) : 0);
    }, 0);
    const slots = c.spellcasting.slotOverride ?? FULL_SLOTS[Math.min(casterLevel, 20)] ?? [];
    const slotsRemaining = slots.map((n, i) => n - (c.state.slotsSpent[String(i + 1)] ?? 0));
    spell = { ability: c.spellcasting.ability, mod: sMod, dc: 8 + prof + sMod, attack: prof + sMod, slots, slotsRemaining };
  }

  const ctx: ExprContext = {
    level, prof, mod: mods, score: scores, classLevel,
    spellMod: spell?.mod, spellDC: spell?.dc, hitDie: c.classes[0].hitDie,
  };

  // Saves and skills
  const saves = Object.fromEntries(ABILITIES.map(a =>
    [a, mods[a] + (c.proficiencies.saves.includes(a) ? prof : 0)])) as Record<Ability, number>;

  const skills = Object.fromEntries((Object.keys(SKILL_ABILITY) as Skill[]).map(s => {
    const lvl = c.proficiencies.skills[s] ?? "none";
    const bonus = lvl === "expert" ? prof * 2 : lvl === "proficient" ? prof : lvl === "half" ? Math.floor(prof / 2) : 0;
    return [s, mods[SKILL_ABILITY[s]] + bonus];
  })) as Record<Skill, number>;

  // HP
  const hpMax = c.state.hp.maxOverride ?? c.hpMax ?? c.hpByLevel!.reduce((n, h) => n + h + mods.con, 0);

  // AC: armor base + capped dex + shields/bonuses; else 10 + dex (+ unarmored defense via resource)
  const equippedItems = c.inventory.items.filter(i => c.state.equipped.includes(i.id));
  let ac: number;
  if (c.state.acOverride !== undefined) {
    ac = c.state.acOverride;
  } else {
    const worn = equippedItems.filter(i => i.equipEffect);
    const armor = worn.find(i => i.equipEffect!.acBase !== undefined);
    const dexCap = armor?.equipEffect!.acDexCap;
    const dexPart = dexCap === null || dexCap === undefined ? mods.dex : Math.min(mods.dex, dexCap);
    ac = (armor?.equipEffect!.acBase ?? 10) + dexPart
       + worn.reduce((n, i) => n + (i.equipEffect!.acBonus ?? 0), 0);
  }
  // Active state resources (Large Form etc.) can add
  const activeRes = c.resources.filter(r => c.state.active.includes(r.id));
  ac += activeRes.reduce((n, r) => n + (r.whileActive?.acBonus ?? 0), 0);

  // Exhaustion (2024): a level with no number counts as 1; 6 levels max.
  const exh = c.state.conditions.find(x => x.condition === "exhaustion");
  const exhaustionLevel = exh ? Math.min(6, Math.max(1, exh.level ?? 1)) : 0;
  const exhaustion = { level: exhaustionLevel, d20Penalty: 2 * exhaustionLevel, speedPenalty: 5 * exhaustionLevel };

  const speed = Math.max(0,
    (c.state.speedOverride ?? c.speed.walk)
    + activeRes.reduce((n, r) => n + (r.whileActive?.speedBonus ?? 0), 0)
    - exhaustion.speedPenalty);

  // Resources
  const resources: DerivedResource[] = c.resources.map(r => {
    const max = Math.max(0, Math.floor(evalExpr(r.max, ctx)));
    const spent = Math.min(max, c.state.spent[r.id] ?? 0);
    return {
      id: r.id, name: r.name, kind: r.kind, group: r.group, max, spent, remaining: max - spent,
      active: c.state.active.includes(r.id), recharge: r.recharge, description: r.description,
      shortRestTrigger: r.shortRestTrigger
        ? { restores: r.shortRestTrigger.restores, amount: Math.max(0, Math.floor(evalExpr(r.shortRestTrigger.amount, ctx))) }
        : undefined,
    };
  });

  const hitDice = c.classes.map(k => ({ size: k.hitDie, total: k.level, remaining: k.level })); // TODO per-class spent
  if (hitDice[0]) hitDice[0].remaining = Math.max(0, hitDice[0].total - c.state.hitDiceSpent);

  // whileActive effects from `state` resources that are on
  const defenses = {
    resistances: uniq([...c.damageResistances, ...activeRes.flatMap(r => r.whileActive?.resistances ?? [])]),
    immunities: uniq(c.damageImmunities),
    conditionImmunities: uniq(c.conditionImmunities),
  };
  const active = {
    ids: activeRes.map(r => r.id),
    damageBonus: activeRes.reduce((n, r) => n + (r.whileActive?.damageBonus !== undefined ? evalExpr(r.whileActive.damageBonus, ctx) : 0), 0),
    advantageOn: uniq(activeRes.flatMap(r => r.whileActive?.advantageOn ?? [])),
    blocks: uniq(activeRes.flatMap(r => r.whileActive?.blocks ?? [])),
    tags: uniq(activeRes.flatMap(r => r.whileActive?.tags ?? [])),
  };

  // Attacks: to-hit and damage bonuses evaluated; `when` lines light up from active state tags.
  const attacks: DerivedAttack[] = c.attacks.map(a => ({
    id: a.id, name: a.name, ability: a.ability,
    toHit: mods[a.ability] + (a.proficient ? prof : 0) + a.attackBonusExtra,
    damage: a.damage.map(l => ({
      dice: l.dice,
      bonus: l.bonusExpr !== undefined ? Math.floor(evalExpr(l.bonusExpr, ctx)) : 0,
      type: l.type,
      when: l.when,
      active: l.when === undefined || active.tags.includes(l.when),
    })),
    properties: a.properties, range: a.range, mastery: a.mastery,
    masteryActive: a.mastery !== undefined && c.proficiencies.masteries.includes(a.mastery),
    notes: a.notes,
  }));

  // Life and HP band
  const hp = c.state.hp.current;
  const { success, failure } = c.state.deathSaves;
  const life: Life = hp > 0 ? "alive" : failure >= 3 ? "dead" : success >= 3 ? "stable" : "dying";
  const hpBand: HpBand = hp <= 0 ? "down" : hp >= hpMax ? "full" : hp < hpMax / 4 ? "critical" : "injured";

  return {
    level, prof, mods, saves, skills,
    passive: { perception: 10 + skills.perception, insight: 10 + skills.insight, investigation: 10 + skills.investigation },
    initiative: mods.dex,
    hpMax, ac, speed, spell, resources, hitDice, defenses, active, attacks, life, hpBand, exhaustion,
    inventory: {
      gp: coinsInGp(c.state.coins),
      weight: Math.round(c.inventory.items.reduce((n, i) => n + i.qty * (i.weight ?? 0), 0) * 10) / 10,
      attuned: c.inventory.items.filter(i => i.attuned).length,
      attunementLimit: ATTUNEMENT_LIMIT,
      equipped: equippedItems.map(i => i.id),
      charges: Object.fromEntries(c.inventory.items.flatMap(i => {
        if (!i.charges) return [];
        const max = Math.max(0, Math.floor(evalExpr(i.charges.max, ctx)));
        return [[i.id, { current: max - Math.min(max, c.state.chargesSpent[i.id] ?? 0), max }]];
      })),
    },
    ctx,
  };
}
