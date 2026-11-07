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
}

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
  ctx: ExprContext;
}

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
  let ac: number;
  if (c.state.acOverride !== undefined) {
    ac = c.state.acOverride;
  } else {
    const equipped = c.inventory.items.filter(i => i.equipped && i.equipEffect);
    const armor = equipped.find(i => i.equipEffect!.acBase !== undefined);
    const dexCap = armor?.equipEffect!.acDexCap;
    const dexPart = dexCap === null || dexCap === undefined ? mods.dex : Math.min(mods.dex, dexCap);
    ac = (armor?.equipEffect!.acBase ?? 10) + dexPart
       + equipped.reduce((n, i) => n + (i.equipEffect!.acBonus ?? 0), 0);
  }
  // Active state resources (Large Form etc.) can add
  const activeRes = c.resources.filter(r => c.state.active.includes(r.id));
  ac += activeRes.reduce((n, r) => n + (r.whileActive?.acBonus ?? 0), 0);
  const speed = (c.state.speedOverride ?? c.speed.walk) + activeRes.reduce((n, r) => n + (r.whileActive?.speedBonus ?? 0), 0);

  // Resources
  const resources: DerivedResource[] = c.resources.map(r => {
    const max = Math.max(0, Math.floor(evalExpr(r.max, ctx)));
    const spent = c.state.spent[r.id] ?? 0;
    return { id: r.id, name: r.name, kind: r.kind, group: r.group, max, spent, remaining: Math.max(0, max - spent), active: c.state.active.includes(r.id), recharge: r.recharge };
  });

  const hitDice = c.classes.map(k => ({ size: k.hitDie, total: k.level, remaining: k.level })); // TODO per-class spent
  if (hitDice[0]) hitDice[0].remaining = Math.max(0, hitDice[0].total - c.state.hitDiceSpent);

  return {
    level, prof, mods, saves, skills,
    passive: { perception: 10 + skills.perception, insight: 10 + skills.insight, investigation: 10 + skills.investigation },
    initiative: mods.dex,
    hpMax, ac, speed, spell, resources, hitDice, ctx,
  };
}
