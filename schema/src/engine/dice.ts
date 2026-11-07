/**
 * Dice. Pure functions with an injectable random source, so tests are
 * deterministic. The engine decides which die is kept and what the total
 * is; the UI only asks for a roll and shows the result.
 */

/** Uniform random number in [0, 1). */
export type Rng = () => number;

export const cryptoRng: Rng = () => {
  const a = new Uint32Array(1);
  globalThis.crypto.getRandomValues(a);
  return a[0] / 4294967296;
};

export const rollDie = (sides: number, rng: Rng = cryptoRng) => 1 + Math.floor(rng() * sides);

export interface DiceTerm {
  count: number;
  sides: number;
}

/** "2d6", "d20", "1d8+1d4". "0" or "" means no dice (a flat-bonus damage line). */
export function parseDice(spec: string): DiceTerm[] {
  const s = spec.replace(/\s+/g, "").toLowerCase();
  if (s === "" || s === "0") return [];
  return s.split("+").map(part => {
    const m = part.match(/^(\d*)d(\d+)$/);
    const count = m ? (m[1] === "" ? 1 : Number(m[1])) : 0;
    const sides = m ? Number(m[2]) : 0;
    if (!m || count < 1 || count > 100 || sides < 2 || sides > 1000) throw new Error(`Bad dice: ${spec}`);
    return { count, sides };
  });
}

export type RollMode = "normal" | "advantage" | "disadvantage";

export interface Die {
  sides: number;
  value: number;
  rerolled?: boolean;
}

export interface D20Roll {
  kind: "d20";
  label: string;
  mode: RollMode;
  /** One d20, or two with advantage/disadvantage. */
  dice: Die[];
  /** Index of the die that counts. */
  kept: number;
  natural: number;
  modifier: number;
  /** Subtracted from the total (exhaustion). */
  penalty: number;
  total: number;
}

export interface DamageRoll {
  kind: "damage";
  label: string;
  dice: Die[];
  bonus: number;
  type?: string;
  /** Never below 0. */
  total: number;
}

export type Roll = D20Roll | DamageRoll;

const sum = (dice: Die[]) => dice.reduce((n, d) => n + d.value, 0);

function scoreD20(r: D20Roll): D20Roll {
  const values = r.dice.map(d => d.value);
  const kept =
    r.dice.length < 2 || r.mode === "normal"
      ? 0
      : values.indexOf(r.mode === "advantage" ? Math.max(...values) : Math.min(...values));
  const natural = values[kept];
  return { ...r, kept, natural, total: natural + r.modifier - r.penalty };
}

/** A D20 Test (check, save, attack). `penalty` is subtracted - pass derive().exhaustion.d20Penalty. */
export function rollD20(label: string, modifier: number, mode: RollMode = "normal", penalty = 0, rng: Rng = cryptoRng): D20Roll {
  const dice = Array.from({ length: mode === "normal" ? 1 : 2 }, () => ({ sides: 20, value: rollDie(20, rng) }));
  return scoreD20({ kind: "d20", label, mode, dice, kept: 0, natural: 0, modifier, penalty, total: 0 });
}

/** A damage line: its dice plus a flat bonus. */
export function rollDamage(label: string, dice: string, bonus: number, type?: string, rng: Rng = cryptoRng): DamageRoll {
  const rolled = parseDice(dice).flatMap(t =>
    Array.from({ length: t.count }, () => ({ sides: t.sides, value: rollDie(t.sides, rng) })),
  );
  return { kind: "damage", label, dice: rolled, bonus, type, total: Math.max(0, sum(rolled) + bonus) };
}

/**
 * Reroll one die and use the new result (Lucky, Heroic Inspiration - the
 * engine doesn't care which). Kept die and total are recomputed.
 */
export function rerollDie<R extends Roll>(roll: R, index: number, rng: Rng = cryptoRng): R {
  const die = roll.dice[index];
  if (!die) return roll;
  const dice = roll.dice.map((d, i) => (i === index ? { sides: d.sides, value: rollDie(d.sides, rng), rerolled: true } : d));
  if (roll.kind === "d20") return scoreD20({ ...roll, dice }) as R;
  return { ...roll, dice, total: Math.max(0, sum(dice) + roll.bonus) } as R;
}
