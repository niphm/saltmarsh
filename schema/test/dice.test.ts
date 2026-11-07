import { describe, expect, it } from "vitest";
import { parseDice, rerollDie, rollD20, rollDamage, rollDie, type Rng } from "../src/engine/dice";

/** Deterministic RNG that yields the given die faces for the given die size. */
const faces = (sides: number, ...values: number[]): Rng => {
  let i = 0;
  return () => (values[i++ % values.length] - 1 + 0.5) / sides;
};

describe("parseDice", () => {
  it.each([
    ["1d8", [{ count: 1, sides: 8 }]],
    ["2d6", [{ count: 2, sides: 6 }]],
    ["d20", [{ count: 1, sides: 20 }]],
    ["1d8 + 1d4", [{ count: 1, sides: 8 }, { count: 1, sides: 4 }]],
    ["0", []],
    ["", []],
  ])("%s", (spec, terms) => expect(parseDice(spec)).toEqual(terms));

  it.each(["2d", "d", "1d1", "abc", "1d6+", "0d6", "1d6-1"])("rejects %s", spec => {
    expect(() => parseDice(spec)).toThrow();
  });
});

describe("rollDie", () => {
  it("maps [0,1) onto 1..sides", () => {
    expect(rollDie(20, () => 0)).toBe(1);
    expect(rollDie(20, () => 0.999999)).toBe(20);
    expect(rollDie(6, faces(6, 4))).toBe(4);
  });

  it("the default (crypto) RNG stays in range", () => {
    for (let i = 0; i < 500; i++) {
      const v = rollDie(20);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(20);
    }
  });
});

describe("rollD20 (F1.10)", () => {
  it("normal: one die plus modifier", () => {
    const r = rollD20("Athletics", 7, "normal", 0, faces(20, 12));
    expect(r).toMatchObject({ dice: [{ sides: 20, value: 12 }], kept: 0, natural: 12, total: 19 });
  });

  it("advantage keeps the higher, disadvantage the lower", () => {
    expect(rollD20("x", 2, "advantage", 0, faces(20, 5, 17))).toMatchObject({ kept: 1, natural: 17, total: 19 });
    expect(rollD20("x", 2, "disadvantage", 0, faces(20, 5, 17))).toMatchObject({ kept: 0, natural: 5, total: 7 });
  });

  it("subtracts the exhaustion penalty", () => {
    expect(rollD20("x", 3, "normal", 4, faces(20, 10)).total).toBe(9);
  });
});

describe("rollDamage", () => {
  it("rolls every die and adds the bonus", () => {
    const r = rollDamage("Warhammer", "1d8", 4, "bludgeoning", faces(8, 6));
    expect(r).toMatchObject({ dice: [{ sides: 8, value: 6 }], bonus: 4, total: 10, type: "bludgeoning" });
    expect(rollDamage("Frenzy", "2d6", 0, undefined, faces(6, 3, 5)).total).toBe(8);
  });

  it("a flat line has no dice", () => {
    expect(rollDamage("Rage", "0", 2)).toMatchObject({ dice: [], total: 2 });
  });

  it("never totals below 0", () => {
    expect(rollDamage("Pistol", "1d4", -3, undefined, faces(4, 1)).total).toBe(0);
  });
});

describe("rerollDie (Lucky / Heroic Inspiration)", () => {
  it("replaces one die and rescores", () => {
    const first = rollD20("Stealth", 2, "normal", 0, faces(20, 1));
    const r = rerollDie(first, 0, faces(20, 14));
    expect(r.dice).toEqual([{ sides: 20, value: 14, rerolled: true }]);
    expect(r).toMatchObject({ natural: 14, total: 16 });
    expect(first.natural).toBe(1); // input untouched
  });

  it("with advantage, the kept die can change after a reroll", () => {
    const first = rollD20("x", 0, "advantage", 0, faces(20, 1, 9));
    expect(first.kept).toBe(1);
    const r = rerollDie(first, 0, faces(20, 18));
    expect(r).toMatchObject({ kept: 0, natural: 18, total: 18 });
  });

  it("damage rerolls recompute the total", () => {
    const first = rollDamage("x", "2d6", 1, undefined, faces(6, 1, 4));
    expect(rerollDie(first, 0, faces(6, 6)).total).toBe(11);
  });

  it("a bad index is a no-op", () => {
    const first = rollD20("x", 0, "normal", 0, faces(20, 5));
    expect(rerollDie(first, 3)).toBe(first);
  });
});
