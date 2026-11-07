/**
 * Conditions, exhaustion, free-text effects and concentration.
 * No-ops return the same object.
 */
import type { Character, Condition } from "../schema/character";
import { stamp } from "./log";

const touch = (c: Character, state: Character["state"], change: string): Character => ({
  ...c,
  state: { ...state, log: stamp(c, change) },
  updatedAt: new Date().toISOString(),
});

export const MAX_EXHAUSTION = 6;

export function exhaustionLevel(c: Character): number {
  const x = c.state.conditions.find(k => k.condition === "exhaustion");
  return x ? Math.min(MAX_EXHAUSTION, Math.max(1, x.level ?? 1)) : 0;
}

/** Set exhaustion 0-6. 0 removes it. */
export function setExhaustion(c: Character, level: number): Character {
  const next = Math.min(MAX_EXHAUSTION, Math.max(0, Math.floor(level)));
  if (next === exhaustionLevel(c)) return c;
  const others = c.state.conditions.filter(k => k.condition !== "exhaustion");
  const conditions = next > 0 ? [...others, { condition: "exhaustion" as const, level: next }] : others;
  return touch(c, { ...c.state, conditions }, `exhaustion ${next}`);
}

/** Add the condition if absent, remove it if present. Exhaustion toggles between 0 and 1. */
export function toggleCondition(c: Character, condition: Condition): Character {
  if (condition === "exhaustion") return setExhaustion(c, exhaustionLevel(c) > 0 ? 0 : 1);
  const has = c.state.conditions.some(k => k.condition === condition);
  const conditions = has
    ? c.state.conditions.filter(k => k.condition !== condition)
    : [...c.state.conditions, { condition }];
  return touch(c, { ...c.state, conditions }, `${condition} ${has ? "removed" : "added"}`);
}

/** Free-text reminder ("Bless +1d4 until end of turn"). Blank text is ignored. */
export function addEffect(c: Character, text: string, until?: string): Character {
  const t = text.trim();
  if (!t) return c;
  const id = `fx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const effect = until?.trim() ? { id, text: t, until: until.trim() } : { id, text: t };
  return touch(c, { ...c.state, effects: [...c.state.effects, effect] }, `effect added: ${t}`);
}

export function removeEffect(c: Character, id: string): Character {
  const fx = c.state.effects.find(e => e.id === id);
  if (!fx) return c;
  return touch(c, { ...c.state, effects: c.state.effects.filter(e => e.id !== id) }, `effect removed: ${fx.text}`);
}

/** Heroic Inspiration on/off. */
export function setInspiration(c: Character, on: boolean): Character {
  if (c.state.inspiration === on) return c;
  return touch(c, { ...c.state, inspiration: on }, on ? "inspiration gained" : "inspiration used");
}

export function endConcentration(c: Character): Character {
  if (!c.state.concentration) return c;
  return touch(c, { ...c.state, concentration: null }, `concentration ended (${c.state.concentration.spell})`);
}
