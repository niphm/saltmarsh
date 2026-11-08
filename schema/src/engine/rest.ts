/**
 * Rest engine. Walks the resource list (and item charges) and recharges by
 * `recharge` tag. The UI's "Short Rest" and "Long Rest" buttons call these
 * and nothing else - no character-specific code anywhere.
 */
import type { Character, Recharge } from "../schema/character";
import { evalExpr } from "../schema/expression";
import { derive } from "./derive";
import { wholeAmount } from "./hp";
import { stamp } from "./log";

/**
 * Item charges after a recharge event: items whose `recharge` matches
 * `refills` come back in full (like resources without a `rechargeAmount`);
 * the rest keep their spent charges.
 */
function rechargeItems(c: Character, refills: (r: Recharge) => boolean): Record<string, number> {
  const chargesSpent = { ...c.state.chargesSpent };
  for (const i of c.inventory.items) if (i.charges && refills(i.charges.recharge)) delete chargesSpent[i.id];
  return chargesSpent;
}

export interface ShortRestOptions {
  /** Hit dice to spend. Clamped to the hit dice remaining. */
  hitDiceToSpend?: number;
  /** HP the player rolled on those hit dice. Clamped to max HP. */
  hpRegained?: number;
  /** Resource ids the player chose to trigger this rest (resources with `shortRestTrigger`, e.g. Sorcerous Restoration). */
  optionalTriggers?: string[];
}

export function shortRest(c: Character, opts: ShortRestOptions = {}): Character {
  const d = derive(c);
  const spent = { ...c.state.spent };
  const notes: string[] = [];

  for (const r of c.resources) {
    if (r.recharge !== "short") continue;
    if (r.rechargeAmount !== undefined) {
      const amt = Math.floor(evalExpr(r.rechargeAmount, d.ctx));
      spent[r.id] = Math.max(0, (spent[r.id] ?? 0) - amt);
    } else {
      delete spent[r.id];
    }
  }

  // Hit dice: the player rolls; we record the spend and apply the HP they rolled.
  const hdLeft = d.hitDice.reduce((n, h) => n + h.remaining, 0);
  const hd = Math.min(hdLeft, wholeAmount(opts.hitDiceToSpend ?? 0));
  const hitDiceSpent = c.state.hitDiceSpent + hd;
  if (hd) notes.push(`${hd} HD`);

  let hp = c.state.hp;
  let deathSaves = c.state.deathSaves;
  const heal = Math.min(d.hpMax - hp.current, wholeAmount(opts.hpRegained ?? 0));
  if (heal > 0) {
    if (hp.current === 0) deathSaves = { success: 0, failure: 0 };
    hp = { ...hp, current: hp.current + heal };
    notes.push(`+${heal} HP`);
  }

  // Optional triggers: spend one use of the trigger, restore uses of its target.
  for (const id of new Set(opts.optionalTriggers ?? [])) {
    const r = d.resources.find(x => x.id === id);
    if (!r?.shortRestTrigger || r.remaining <= 0) continue;
    spent[r.id] = (spent[r.id] ?? 0) + 1;
    const target = r.shortRestTrigger.restores;
    const left = Math.max(0, (spent[target] ?? 0) - r.shortRestTrigger.amount);
    if (left === 0) delete spent[target];
    else spent[target] = left;
    notes.push(r.name);
  }

  return {
    ...c,
    state: {
      ...c.state, hp, deathSaves, spent, hitDiceSpent,
      chargesSpent: rechargeItems(c, r => r === "short"),
      log: stamp(c, `short rest${notes.length ? ` (${notes.join(", ")})` : ""}`),
    },
    updatedAt: new Date().toISOString(),
  };
}

export function longRest(c: Character): Character {
  const d = derive(c);
  const spent: Record<string, number> = {};
  for (const r of c.resources) {
    if (r.recharge === "manual") spent[r.id] = c.state.spent[r.id] ?? 0;   // untouched
  }
  // Regain half of total hit dice (min 1)
  const totalHD = d.hitDice.reduce((n, h) => n + h.total, 0);
  const hitDiceSpent = Math.max(0, c.state.hitDiceSpent - Math.max(1, Math.floor(totalHD / 2)));

  return {
    ...c,
    state: {
      ...c.state,
      hp: { ...c.state.hp, current: d.hpMax, temp: 0 },
      spent,
      chargesSpent: rechargeItems(c, r => r !== "manual"),
      active: [],
      slotsSpent: {},
      hitDiceSpent,
      deathSaves: { success: 0, failure: 0 },
      concentration: null,
      // Conditions clear; exhaustion drops one level (REQUIREMENTS 7).
      conditions: c.state.conditions
        .filter(x => x.condition === "exhaustion" && (x.level ?? 1) > 1)
        .map(x => ({ ...x, level: (x.level ?? 1) - 1 })),
      log: stamp(c, "long rest"),
    },
    updatedAt: new Date().toISOString(),
  };
}

/** Uncanny Metabolism, Relentless Rage-style "when initiative is rolled" recharges. */
export function onInitiative(c: Character): Character {
  const spent = { ...c.state.spent };
  for (const r of c.resources) if (r.recharge === "initiative") delete spent[r.id];
  const chargesSpent = rechargeItems(c, r => r === "initiative");
  return { ...c, state: { ...c.state, spent, chargesSpent, log: stamp(c, "initiative rolled") } };
}
