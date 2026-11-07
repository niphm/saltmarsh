import { describe, expect, it } from "vitest";
import { evalExpr, type ExprContext } from "../src/schema/expression";

const ctx: ExprContext = {
  level: 5, prof: 3,
  mod: { str: 4, dex: -1, con: 0, int: 3, wis: 2, cha: 3 },
  score: { str: 19, dex: 9, con: 11, int: 16, wis: 15, cha: 16 },
  classLevel: { barbarian: 5 },
  spellMod: 3, spellDC: 14, hitDie: 12,
};

describe("evalExpr", () => {
  it.each([
    [3, 3],
    ["prof", 3],
    ["classLevel.barbarian", 5],
    ["classLevel.sorcerer", 0],
    ["max(1, mod.wis)", 2],
    ["max(1, mod.dex)", 1],
    ["8 + prof + mod.wis", 13],
    ["floor(level / 2)", 2],
    ["ceil(level / 2)", 3],
    ["2 + 3 * 4", 14],
    ["(2 + 3) * 4", 20],
    ["-mod.dex", 1],
    ["score.str - 10", 9],
    ["spellDC", 14],
    ["hitDie", 12],
  ] as const)("%s = %d", (expr, expected) => {
    expect(evalExpr(expr, ctx)).toBe(expected);
  });

  it.each([
    "mod.str; alert(1)",
    "constructor",
    "max",
    "1 +",
    "(1 + 2",
    "1 2",
    "process.exit",
  ])("rejects %s", expr => {
    expect(() => evalExpr(expr, ctx)).toThrow();
  });
});
