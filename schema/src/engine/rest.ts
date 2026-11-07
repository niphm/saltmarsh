/**
 * Rest engine. Walks the resource list and recharges by `recharge` tag.
 * The UI's "Short Rest" and "Long Rest" buttons call these and nothing else -
 * no character-specific code anywhere.
 */
import type { Character } from "../schema/character";
import { derive } from "./derive";

const stamp = (c: Character, change: string): Character["state"]["log"] =>
  [...c.state.log.slice(-49), { at: new Date().toISOString(), change }];

export interface ShortRestOptions {
  hitDiceToSpend?: number;
  /** Resource ids the player chose to trigger this rest (e.g. Sorcerous Restoration). */
  optionalTriggers?: string[];
}

export function shortRest(c: Character, opts: ShortRestOptions = {}): Character {
  const d = derive(c);
  const spent = { ...c.state.spent };

  for (const r of c.resources) {
    if (r.recharge !== "short") continue;
    if (r.rechargeAmount !== undefined) {
      const amt = Math.floor(evalAmount(r.rechargeAmount, d));
      spent[r.id] = Math.max(0, (spent[r.id] ?? 0) - amt);
    } else {
      delete spent[r.id];
    }
  }

  // Hit dice healing: player rolls; we just record the spend and let them apply HP
  const hitDiceSpent = c.state.hitDiceSpent + (opts.hitDiceToSpend ?? 0);

  return {
    ...c,
    state: { ...c.state, spent, hitDiceSpent, log: stamp(c, `short rest${opts.hitDiceToSpend ? ` (${opts.hitDiceToSpend} HD)` : ""}`) },
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
      active: [],
      slotsSpent: {},
      hitDiceSpent,
      deathSaves: { success: 0, failure: 0 },
      concentration: null,
      conditions: c.state.conditions
        .map(x => x.condition === "exhaustion" && (x.level ?? 1) > 1 ? { ...x, level: (x.level ?? 1) - 1 } : x)
        .filter(x => !(x.condition === "exhaustion" && (x.level ?? 1) <= 1)),
      log: stamp(c, "long rest"),
    },
    updatedAt: new Date().toISOString(),
  };
}

/** Uncanny Metabolism, Relentless Rage-style "when initiative is rolled" recharges. */
export function onInitiative(c: Character): Character {
  const spent = { ...c.state.spent };
  for (const r of c.resources) if (r.recharge === "initiative") delete spent[r.id];
  return { ...c, state: { ...c.state, spent, log: stamp(c, "initiative rolled") } };
}

function evalAmount(expr: number | string, d: ReturnType<typeof derive>): number {
  return typeof expr === "number" ? expr : require("../schema/expression").evalExpr(expr, d.ctx);
}
