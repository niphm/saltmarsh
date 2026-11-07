/**
 * Expression language for derived values.
 *
 * Any field typed `Expr` is either a literal number or a short formula string
 * evaluated against the character's computed context. Keeping this tiny and
 * non-Turing-complete means homebrew can't break the app, and the whole
 * evaluator fits in ~60 lines.
 *
 * Variables available in formulas:
 *   level            total character level
 *   prof             proficiency bonus (derived from level)
 *   mod.str … mod.cha   ability modifiers
 *   score.str … score.cha  raw ability scores
 *   classLevel.<id>  level in a given class, e.g. classLevel.sorcerer (0 if none)
 *   spellMod         spellcasting ability modifier (if caster)
 *   spellDC          spell save DC (if caster)
 *   hitDie           hit die size of primary class (6, 8, 10, 12)
 *
 * Functions: max(a,b), min(a,b), floor(x), ceil(x)
 * Operators: + - * / ( )
 *
 * Examples:
 *   "prof"                  Adrenaline Rush uses (orc)
 *   "max(1, mod.wis)"       Wrath of the Storm uses
 *   "classLevel.sorcerer"   Sorcery Points
 *   "8 + prof + mod.wis"    Stunning Strike DC
 *   "floor(level / 2)"
 */
import { z } from "zod";

export const Expr = z.union([z.number(), z.string().min(1)]);
export type Expr = z.infer<typeof Expr>;

export interface ExprContext {
  level: number;
  prof: number;
  mod: Record<Ability, number>;
  score: Record<Ability, number>;
  classLevel: Record<string, number>;
  spellMod?: number;
  spellDC?: number;
  hitDie?: number;
}

export const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;
export type Ability = (typeof ABILITIES)[number];

/** Safe evaluator: tokenizes, validates against an allowlist, then evaluates. */
export function evalExpr(expr: Expr, ctx: ExprContext): number {
  if (typeof expr === "number") return expr;

  const tokens = expr.match(/\d+(\.\d+)?|[a-zA-Z_][\w.]*|[+\-*/(),]/g);
  if (!tokens || tokens.join("") !== expr.replace(/\s+/g, "")) {
    throw new Error(`Bad expression: ${expr}`);
  }

  const fns: Record<string, (...a: number[]) => number> = {
    max: Math.max, min: Math.min, floor: Math.floor, ceil: Math.ceil,
  };

  const resolve = (name: string): number => {
    if (name in fns) throw new Error(`Function used as value: ${name}`);
    const [root, key] = name.split(".");
    switch (root) {
      case "level": return ctx.level;
      case "prof": return ctx.prof;
      case "spellMod": return ctx.spellMod ?? 0;
      case "spellDC": return ctx.spellDC ?? 0;
      case "hitDie": return ctx.hitDie ?? 0;
      case "mod": return ctx.mod[key as Ability] ?? 0;
      case "score": return ctx.score[key as Ability] ?? 0;
      case "classLevel": return ctx.classLevel[key] ?? 0;
      default: throw new Error(`Unknown variable: ${name}`);
    }
  };

  // Recursive-descent parser over the token stream.
  let i = 0;
  const peek = () => tokens[i];
  const next = () => tokens[i++];

  const parsePrimary = (): number => {
    const t = next();
    if (t === undefined) throw new Error("Unexpected end");
    if (t === "(") { const v = parseAdd(); if (next() !== ")") throw new Error("Expected )"); return v; }
    if (t === "-") return -parsePrimary();
    if (/^\d/.test(t)) return parseFloat(t);
    if (t in fns) {
      if (next() !== "(") throw new Error(`Expected ( after ${t}`);
      const args: number[] = [parseAdd()];
      while (peek() === ",") { next(); args.push(parseAdd()); }
      if (next() !== ")") throw new Error("Expected )");
      return fns[t](...args);
    }
    return resolve(t);
  };
  const parseMul = (): number => {
    let v = parsePrimary();
    while (peek() === "*" || peek() === "/") { const op = next(); const r = parsePrimary(); v = op === "*" ? v * r : v / r; }
    return v;
  };
  const parseAdd = (): number => {
    let v = parseMul();
    while (peek() === "+" || peek() === "-") { const op = next(); const r = parseMul(); v = op === "+" ? v + r : v - r; }
    return v;
  };

  const result = parseAdd();
  if (i !== tokens.length) throw new Error(`Trailing tokens in: ${expr}`);
  return result;
}
