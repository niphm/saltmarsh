/**
 * HP changes. Pure functions: Character in, new Character out, one log entry
 * per change. A call that changes nothing returns the same object, so callers
 * can skip saving and undo snapshots. The UI's HP controls call these and
 * nothing else.
 */
import type { Character } from "../schema/character";
import { derive } from "./derive";
import { stamp } from "./log";

/** Whole, non-negative amount. Bad input becomes 0 rather than corrupting HP. */
export const wholeAmount = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);
const why = (note?: string) => (note ? ` (${note})` : "");
const clampSaves = (n: number) => Math.min(3, Math.max(0, Math.floor(n)));

/**
 * Damage hits temp HP first, then current HP, which stops at 0.
 * 2024 rules: dropping to 0 starts fresh death saves; damage while already at
 * 0 is one failed death save; and if the damage left over (at 0 HP) equals or
 * exceeds max HP, the character dies outright.
 */
export function applyDamage(c: Character, n: number, note?: string): Character {
  const dmg = wholeAmount(n);
  if (dmg === 0) return c;
  const { current, temp } = c.state.hp;
  const absorbed = Math.min(temp, dmg);
  const toHp = dmg - absorbed;
  const newCurrent = Math.max(0, current - toHp);
  const leftover = toHp - current; // damage remaining once HP hits 0
  const hpMax = derive(c).hpMax;

  let deathSaves = c.state.deathSaves;
  let outcome = "";
  if (toHp > 0 && current === 0) {
    deathSaves = toHp >= hpMax
      ? { ...deathSaves, failure: 3 }
      : { ...deathSaves, failure: clampSaves(deathSaves.failure + 1) };
    outcome = deathSaves.failure >= 3 ? " - dead" : " - death save failed";
  } else if (current > 0 && newCurrent === 0) {
    deathSaves = leftover >= hpMax ? { success: 0, failure: 3 } : { success: 0, failure: 0 };
    outcome = leftover >= hpMax ? " - killed outright" : " - down";
  }

  const hp = { ...c.state.hp, temp: temp - absorbed, current: newCurrent };
  const change = `hp -${dmg}${absorbed ? ` (${absorbed} temp)` : ""}${why(note)}${outcome}`;
  return { ...c, state: { ...c.state, hp, deathSaves, log: stamp(c, change) }, updatedAt: new Date().toISOString() };
}

/** Healing is clamped to max HP. Regaining any HP from 0 resets death saves. */
export function applyHealing(c: Character, n: number, note?: string): Character {
  const heal = wholeAmount(n);
  const max = derive(c).hpMax;
  const current = Math.min(max, c.state.hp.current + heal);
  if (heal === 0 || current === c.state.hp.current) return c;
  const deathSaves = c.state.hp.current === 0 && current > 0 ? { success: 0, failure: 0 } : c.state.deathSaves;
  return {
    ...c,
    state: { ...c.state, hp: { ...c.state.hp, current }, deathSaves, log: stamp(c, `hp +${current - c.state.hp.current}${why(note)}`) },
    updatedAt: new Date().toISOString(),
  };
}

/** Temp HP doesn't stack (2024): the new value replaces the old one. */
export function setTempHp(c: Character, n: number, note?: string): Character {
  const temp = wholeAmount(n);
  if (temp === c.state.hp.temp) return c;
  return {
    ...c,
    state: { ...c.state, hp: { ...c.state.hp, temp }, log: stamp(c, `temp hp ${temp}${why(note)}`) },
    updatedAt: new Date().toISOString(),
  };
}

/** Record death save totals (each clamped 0-3), e.g. from tapping pips. */
export function setDeathSaves(c: Character, success: number, failure: number): Character {
  const next = { success: clampSaves(success), failure: clampSaves(failure) };
  if (next.success === c.state.deathSaves.success && next.failure === c.state.deathSaves.failure) return c;
  return {
    ...c,
    state: { ...c.state, deathSaves: next, log: stamp(c, `death saves ${next.success} success / ${next.failure} failure`) },
    updatedAt: new Date().toISOString(),
  };
}
