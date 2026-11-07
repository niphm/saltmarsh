/**
 * Display formatting only. No rules math lives here - every number comes
 * from derive(); these helpers just turn values and ids into text.
 */
import type { Ability, Character, HpBand, Life, Resource, Skill } from "@saltmarsh/schema";

export type ProfLevel = NonNullable<Character["proficiencies"]["skills"][Skill]>;

/** +2 / −1 (true minus sign; screen readers read it as "minus"). */
export const signed = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);

const SMALL_WORDS = new Set(["a", "an", "and", "by", "for", "in", "of", "on", "the", "to"]);

/** "sleight-of-hand" -> "Sleight of Hand" */
export function titleCase(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

/** "srd:subclass:divine-soul" -> "Divine Soul" */
export const refName = (ref: string) => titleCase(ref.split(":")[2] ?? ref);

/** First letter up, rest untouched: "simple" -> "Simple", "Calligrapher's Supplies" unchanged. */
export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const ABILITY_NAME: Record<Ability, string> = {
  str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma",
};

export const abilityAbbr = (a: Ability) => a.toUpperCase();

export const skillName = (s: Skill) => titleCase(s);

export const PROF_LABEL: Record<ProfLevel, string> = {
  none: "Not proficient", half: "Half proficiency", proficient: "Proficient", expert: "Expertise",
};

export const RECHARGE_LABEL: Record<Resource["recharge"], string> = {
  short: "Short rest", long: "Long rest", initiative: "On initiative", dawn: "At dawn", turn: "Each turn", manual: "Manual",
};

export const HP_BAND_LABEL: Record<HpBand, string> = { full: "Full", injured: "Injured", critical: "Critical", down: "Down" };

/** Status color class per band. Always shown next to the label, never alone. */
export const HP_BAND_TEXT: Record<HpBand, string> = { full: "text-ok", injured: "text-warn", critical: "text-danger", down: "text-danger" };

export const LIFE_LABEL: Record<Life, string> = { alive: "Alive", dying: "Dying", stable: "Stable", dead: "Dead" };

/** "Sorcerer 5 (Divine Soul)" - joined with " / " for multiclass. */
export const classLine = (classes: Character["classes"]) =>
  classes.map(k => `${refName(k.class)} ${k.level}${k.subclass ? ` (${refName(k.subclass)})` : ""}`).join(" / ");

/** 1 -> "1st", 2 -> "2nd", 3 -> "3rd", 4 -> "4th" (spell levels 1-9). */
export const ordinal = (n: number) => `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;

/** Group items by key, preserving first-seen order. */
export function groupBy<T>(items: readonly T[], key: (t: T) => string): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    groups.set(k, [...(groups.get(k) ?? []), item]);
  }
  return [...groups];
}
