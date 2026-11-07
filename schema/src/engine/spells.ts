/**
 * Casting (F1.5). Spends a slot or the spell's free-cast resource and sets
 * concentration. Spell facts (level, concentration, dice) come from the
 * rules pack entry; the character supplies slots, resources and state.
 * No-ops return the same object.
 */
import type { Character } from "../schema/character";
import type { Spell } from "../schema/pack";
import { derive, type Derived } from "./derive";
import { parseDice } from "./dice";
import { stamp } from "./log";

export type CastableSpell = Pick<Spell, "id" | "name" | "level" | "concentration">;

export interface CastOptions {
  /** Slot level to spend (upcasting). Default: the lowest available slot at or above the spell's level. */
  slotLevel?: number;
  /** Use the spell's free-cast resource instead of a slot. */
  freeCast?: boolean;
}

export interface CastChoices {
  /** Slot levels with a slot left, lowest first. Empty for cantrips. */
  slotLevels: number[];
  /** The spell's linked free-cast resource, if it has one. */
  freeCast?: { resourceId: string; name: string; available: boolean };
  /** Names of active states that block spellcasting (Raging). */
  blockedBy: string[];
}

export function castChoices(c: Character, d: Derived, spellId: string, spellLevel: number): CastChoices {
  const slotLevels =
    spellLevel === 0 || !d.spell ? [] : d.spell.slotsRemaining.flatMap((n, i) => (i + 1 >= spellLevel && n > 0 ? [i + 1] : []));
  const resId = c.spellcasting?.spells.find(s => s.ref === spellId)?.freeCastResource;
  const r = resId ? d.resources.find(x => x.id === resId) : undefined;
  const blockedBy = c.resources
    .filter(x => d.active.ids.includes(x.id) && x.whileActive?.blocks?.includes("spellcasting"))
    .map(x => x.name);
  return { slotLevels, freeCast: r ? { resourceId: r.id, name: r.name, available: r.remaining > 0 } : undefined, blockedBy };
}

/**
 * Cast a spell. A leveled spell spends a slot (or its free cast); a
 * concentration spell replaces any current concentration (the UI asks first).
 * A cantrip without concentration changes nothing, so it's a no-op.
 */
export function castSpell(c: Character, spell: CastableSpell, opts: CastOptions = {}): Character {
  const d = derive(c);
  const choices = castChoices(c, d, spell.id, spell.level);
  if (choices.blockedBy.length) return c;

  let state = c.state;
  const notes: string[] = [];

  if (opts.freeCast) {
    const fc = choices.freeCast;
    if (!fc?.available) return c;
    const spent = d.resources.find(x => x.id === fc.resourceId)?.spent ?? 0;
    state = { ...state, spent: { ...state.spent, [fc.resourceId]: spent + 1 } };
    notes.push("free cast");
  } else if (spell.level > 0) {
    const level = opts.slotLevel ?? choices.slotLevels[0];
    if (level === undefined || !choices.slotLevels.includes(level)) return c;
    const key = String(level);
    state = { ...state, slotsSpent: { ...state.slotsSpent, [key]: (state.slotsSpent[key] ?? 0) + 1 } };
    notes.push(`level ${level} slot`);
  }

  if (spell.concentration) {
    const prev = state.concentration?.spell;
    if (prev && prev !== spell.id) notes.push(`ended concentration on ${prev}`);
    state = { ...state, concentration: { spell: spell.id } };
  }

  if (state === c.state) return c;
  return {
    ...c,
    state: { ...state, log: stamp(c, `cast ${spell.name}${notes.length ? ` (${notes.join("; ")})` : ""}`) },
    updatedAt: new Date().toISOString(),
  };
}

export interface SpellRoll {
  kind: "damage" | "healing";
  dice: string;
  bonus: number;
  types: string[];
}

/**
 * The spell's damage/healing dice at a slot level: base dice, plus `perSlot`
 * for each level above the spell's own, cantrip dice multiplied at character
 * levels 5/11/17, plus the spellcasting modifier when the spell says so.
 */
export function spellRoll(spell: Spell, opts: { slotLevel?: number; characterLevel: number; spellMod: number }): SpellRoll | undefined {
  const r = spell.roll;
  if (!r) return undefined;
  const bySides = new Map<number, number>();
  const add = (dice: string, times: number) => {
    for (const t of parseDice(dice)) bySides.set(t.sides, (bySides.get(t.sides) ?? 0) + t.count * times);
  };
  const cantripTier = spell.level === 0 && r.cantripScaling ? 1 + [5, 11, 17].filter(l => opts.characterLevel >= l).length : 1;
  add(r.dice, cantripTier);
  if (r.perSlot && opts.slotLevel && opts.slotLevel > spell.level) add(r.perSlot, opts.slotLevel - spell.level);
  const dice = [...bySides]
    .sort((a, b) => b[0] - a[0])
    .map(([sides, count]) => `${count}d${sides}`)
    .join("+");
  return { kind: r.kind, dice, bonus: r.bonus + (r.addSpellMod ? opts.spellMod : 0), types: r.types };
}
