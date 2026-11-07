/**
 * HP changes. Pure functions: Character in, new Character out, one log entry
 * per call. The UI's damage/heal/temp controls call these and nothing else.
 */
import type { Character } from "../schema/character";
import { derive } from "./derive";
import { stamp } from "./log";

/** Whole, non-negative amount. Bad input becomes 0 rather than corrupting HP. */
const amount = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);
const why = (note?: string) => (note ? ` (${note})` : "");

/** Damage hits temp HP first, then current HP, which stops at 0. */
export function applyDamage(c: Character, n: number, note?: string): Character {
  const dmg = amount(n);
  const absorbed = Math.min(c.state.hp.temp, dmg);
  const hp = {
    ...c.state.hp,
    temp: c.state.hp.temp - absorbed,
    current: Math.max(0, c.state.hp.current - (dmg - absorbed)),
  };
  const change = `hp -${dmg}${absorbed ? ` (${absorbed} temp)` : ""}${why(note)}`;
  return { ...c, state: { ...c.state, hp, log: stamp(c, change) }, updatedAt: new Date().toISOString() };
}

/** Healing is clamped to max HP. Regaining any HP from 0 resets death saves. */
export function applyHealing(c: Character, n: number, note?: string): Character {
  const heal = amount(n);
  const max = derive(c).hpMax;
  const current = Math.min(max, c.state.hp.current + heal);
  const deathSaves = c.state.hp.current === 0 && current > 0 ? { success: 0, failure: 0 } : c.state.deathSaves;
  return {
    ...c,
    state: { ...c.state, hp: { ...c.state.hp, current }, deathSaves, log: stamp(c, `hp +${heal}${why(note)}`) },
    updatedAt: new Date().toISOString(),
  };
}

/** Temp HP doesn't stack (2024): the new value replaces the old one. */
export function setTempHp(c: Character, n: number, note?: string): Character {
  const temp = amount(n);
  return {
    ...c,
    state: { ...c.state, hp: { ...c.state.hp, temp }, log: stamp(c, `temp hp ${temp}${why(note)}`) },
    updatedAt: new Date().toISOString(),
  };
}
