import { describe, expect, it } from "vitest";
import { ROLL_LOG_LIMIT, RollStore } from "../src/lib/rolls.svelte";

describe("roll store (F1.10)", () => {
  it("logs d20 rolls newest first with the penalty applied", () => {
    const s = new RollStore();
    s.d20("Kenpachi", "Athletics", 7, 2);
    s.d20("Kenpachi", "Stealth", -1, 0);
    expect(s.log.map(e => e.roll.label)).toEqual(["Stealth", "Athletics"]);
    const ath = s.log[1].roll;
    expect(ath.kind).toBe("d20");
    if (ath.kind === "d20") expect(ath.total).toBe(ath.natural + 7 - 2);
  });

  it("advantage applies to one roll, then resets to normal", () => {
    const s = new RollStore();
    s.mode = "advantage";
    s.d20("T", "Perception", 1, 0);
    expect(s.mode).toBe("normal");
    const r = s.log[0].roll;
    expect(r.kind === "d20" && r.mode).toBe("advantage");
    expect(r.dice).toHaveLength(2);
  });

  it(`keeps the last ${ROLL_LOG_LIMIT} rolls`, () => {
    const s = new RollStore();
    for (let i = 0; i < ROLL_LOG_LIMIT + 5; i++) s.damage("K", `hit ${i}`, "1d8", 4);
    expect(s.log).toHaveLength(ROLL_LOG_LIMIT);
    expect(s.log[0].roll.label).toBe(`hit ${ROLL_LOG_LIMIT + 4}`);
  });

  it("reroll replaces one die in place and marks it", () => {
    const s = new RollStore();
    s.damage("K", "Frenzy", "2d6", 0);
    const id = s.log[0].id;
    s.reroll(id, 1);
    const r = s.log[0].roll;
    expect(s.log[0].id).toBe(id);
    expect(r.dice[1].rerolled).toBe(true);
    expect(r.total).toBe(r.dice[0].value + r.dice[1].value);
  });

  it("clear empties the log", () => {
    const s = new RollStore();
    s.damage("K", "x", "1d4", 0);
    s.clear();
    expect(s.log).toEqual([]);
  });
});
