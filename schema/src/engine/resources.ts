/**
 * Spending and regaining resources and spell slots, and switching `state`
 * resources on/off. Driven only by resource ids and kinds - no
 * feature-specific code. No-ops return the same object.
 */
import type { Character } from "../schema/character";
import { derive } from "./derive";
import { stamp } from "./log";

const touch = (c: Character, state: Character["state"], change: string): Character => ({
  ...c,
  state: { ...state, log: stamp(c, change) },
  updatedAt: new Date().toISOString(),
});

/** Spend `n` uses (clamped to what's left). */
export function spendResource(c: Character, id: string, n = 1): Character {
  const r = derive(c).resources.find(x => x.id === id);
  if (!r || n <= 0) return c;
  const spent = Math.min(r.max, r.spent + Math.floor(n));
  if (spent === r.spent) return c;
  return touch(c, { ...c.state, spent: { ...c.state.spent, [id]: spent } }, `${r.name} -${spent - r.spent}`);
}

/** Regain `n` spent uses (clamped to max). */
export function restoreResource(c: Character, id: string, n = 1): Character {
  const r = derive(c).resources.find(x => x.id === id);
  if (!r || n <= 0) return c;
  const spent = Math.max(0, r.spent - Math.floor(n));
  if (spent === r.spent) return c;
  const next = { ...c.state.spent };
  if (spent === 0) delete next[id];
  else next[id] = spent;
  return touch(c, { ...c.state, spent: next }, `${r.name} +${r.spent - spent}`);
}

/**
 * Turn a `state` resource on or off. Turning on one whose whileActive blocks
 * "concentration" (Rage) ends any current concentration.
 */
export function setActive(c: Character, id: string, on: boolean): Character {
  const r = c.resources.find(x => x.id === id);
  if (!r || r.kind !== "state") return c;
  const isOn = c.state.active.includes(id);
  if (on === isOn) return c;

  const active = on ? [...c.state.active, id] : c.state.active.filter(x => x !== id);
  const breaksConcentration = on && c.state.concentration && r.whileActive?.blocks?.includes("concentration");
  const concentration = breaksConcentration ? null : c.state.concentration;
  const change = `${r.name} ${on ? "on" : "off"}${breaksConcentration ? " (concentration ended)" : ""}`;
  return touch(c, { ...c.state, active, concentration }, change);
}

/** Spend one spell slot of `level` (1-9), if one is left. */
export function spendSlot(c: Character, level: number): Character {
  const remaining = derive(c).spell?.slotsRemaining[level - 1] ?? 0;
  if (remaining <= 0) return c;
  const key = String(level);
  return touch(c, { ...c.state, slotsSpent: { ...c.state.slotsSpent, [key]: (c.state.slotsSpent[key] ?? 0) + 1 } }, `level ${level} slot -1`);
}

/** Regain one spent spell slot of `level`. */
export function restoreSlot(c: Character, level: number): Character {
  const key = String(level);
  const spent = c.state.slotsSpent[key] ?? 0;
  if (spent <= 0) return c;
  const slotsSpent = { ...c.state.slotsSpent };
  if (spent === 1) delete slotsSpent[key];
  else slotsSpent[key] = spent - 1;
  return touch(c, { ...c.state, slotsSpent }, `level ${level} slot +1`);
}
