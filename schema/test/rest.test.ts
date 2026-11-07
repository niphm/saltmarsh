import { describe, expect, it } from "vitest";
import { derive } from "../src/engine/derive";
import { longRest, onInitiative, shortRest } from "../src/engine/rest";
import { loadExample, remaining, withState } from "./fixtures";

describe("acceptance: Rage partial recharge (REQUIREMENTS 7)", () => {
  it("spend 2 Rage, short rest -> 2/3; long rest -> 3/3", () => {
    const k = withState(loadExample("kenpachi"), { spent: { "rage-uses": 2 } });
    expect(remaining(k)["rage-uses"]).toBe(1);

    const afterShort = shortRest(k);
    expect(remaining(afterShort)["rage-uses"]).toBe(2);

    const afterLong = longRest(afterShort);
    expect(remaining(afterLong)["rage-uses"]).toBe(3);
  });

  it("partial recharge never goes below zero spent", () => {
    const k = withState(loadExample("kenpachi"), { spent: { "rage-uses": 0 } });
    expect(shortRest(k).state.spent["rage-uses"]).toBe(0);
  });
});

describe("acceptance: long rest (REQUIREMENTS 7)", () => {
  const hurt = withState(loadExample("kenpachi"), {
    hp: { current: 7, temp: 3 },
    spent: { "rage-uses": 3, "adrenaline-rush": 2 },
    conditions: [
      { condition: "poisoned" },
      { condition: "frightened", source: "Sea hag" },
      { condition: "exhaustion", level: 3 },
    ],
  });
  const rested = longRest(hurt);

  it("HP full, temp HP gone", () => {
    expect(rested.state.hp.current).toBe(derive(hurt).hpMax);
    expect(rested.state.hp.temp).toBe(0);
  });

  it("resources full", () => {
    expect(remaining(rested)).toMatchObject({ "rage-uses": 3, "adrenaline-rush": 3 });
  });

  it("conditions cleared, exhaustion reduced by 1", () => {
    expect(rested.state.conditions).toEqual([{ condition: "exhaustion", level: 2 }]);
  });

  it("exhaustion 1 is removed entirely", () => {
    const tired = withState(loadExample("tidewick"), { conditions: [{ condition: "exhaustion", level: 1 }] });
    expect(longRest(tired).state.conditions).toEqual([]);
  });

  it("exhaustion with no level counts as level 1", () => {
    const tired = withState(loadExample("tidewick"), { conditions: [{ condition: "exhaustion" }] });
    expect(longRest(tired).state.conditions).toEqual([]);
  });

  it("clears slots, concentration, death saves and active states", () => {
    const t = withState(loadExample("tidewick"), {
      slotsSpent: { "1": 4, "3": 2 },
      concentration: { spell: "srd:spell:hypnotic-pattern" },
      deathSaves: { success: 1, failure: 2 },
      active: ["something"],
    });
    const r = longRest(t);
    expect(r.state.slotsSpent).toEqual({});
    expect(derive(r).spell?.slotsRemaining).toEqual([4, 3, 2]);
    expect(r.state.concentration).toBeNull();
    expect(r.state.deathSaves).toEqual({ success: 0, failure: 0 });
    expect(r.state.active).toEqual([]);
  });

  it("keeps `manual` resources spent", () => {
    const k = withState(loadExample("kenpachi"), { spent: { "rage-active": 1 } });
    expect(longRest(k).state.spent["rage-active"]).toBe(1);
  });

  it("regains half of total hit dice (min 1)", () => {
    const k = withState(loadExample("kenpachi"), { hitDiceSpent: 5 });
    expect(longRest(k).state.hitDiceSpent).toBe(3);
    expect(derive(longRest(k)).hitDice[0].remaining).toBe(2);
  });

  it("logs the rest", () => {
    expect(rested.state.log.at(-1)?.change).toBe("long rest");
  });
});

describe("short rest", () => {
  it("full recharge for `short` resources without rechargeAmount; `long` untouched", () => {
    const t = withState(loadExample("tidewick"), { spent: { "favored-by-the-gods": 1, "sorcery-points": 3 } });
    const r = shortRest(t);
    expect(r.state.spent["favored-by-the-gods"]).toBeUndefined();
    expect(r.state.spent["sorcery-points"]).toBe(3);
  });

  it("records hit dice spent and logs them", () => {
    const r = shortRest(loadExample("kenpachi"), { hitDiceToSpend: 2 });
    expect(r.state.hitDiceSpent).toBe(2);
    expect(derive(r).hitDice[0].remaining).toBe(3);
    expect(r.state.log.at(-1)?.change).toBe("short rest (2 HD)");
  });

  it("does not touch HP or conditions", () => {
    const k = withState(loadExample("kenpachi"), { hp: { current: 10, temp: 0 }, conditions: [{ condition: "poisoned" }] });
    const r = shortRest(k);
    expect(r.state.hp.current).toBe(10);
    expect(r.state.conditions).toEqual([{ condition: "poisoned" }]);
  });

  // Regression: rest.ts used `require()` for formula recharge amounts, which
  // throws in ESM (Vite, Vitest, the browser). Only numeric amounts worked.
  it("evaluates a formula rechargeAmount", () => {
    const base = loadExample("kenpachi");
    const k = {
      ...base,
      resources: base.resources.map(r => r.id === "rage-uses" ? { ...r, rechargeAmount: "floor(prof / 2)" } : r),
      state: { ...base.state, spent: { "rage-uses": 3 } },
    };
    expect(shortRest(k).state.spent["rage-uses"]).toBe(2);
  });
});

describe("initiative recharge", () => {
  it("resets only `initiative` resources", () => {
    const base = loadExample("kenpachi");
    const k = {
      ...base,
      resources: [...base.resources, { id: "uncanny", name: "Uncanny Metabolism", kind: "toggle" as const, max: 1, recharge: "initiative" as const }],
      state: { ...base.state, spent: { uncanny: 1, "rage-uses": 2 } },
    };
    const r = onInitiative(k);
    expect(r.state.spent.uncanny).toBeUndefined();
    expect(r.state.spent["rage-uses"]).toBe(2);
    expect(r.state.log.at(-1)?.change).toBe("initiative rolled");
  });
});

describe("rest engine hygiene", () => {
  it("never mutates its input", () => {
    const k = withState(loadExample("kenpachi"), { spent: { "rage-uses": 2 }, conditions: [{ condition: "exhaustion", level: 2 }] });
    const before = structuredClone(k);
    shortRest(k);
    longRest(k);
    onInitiative(k);
    expect(k).toEqual(before);
  });

  it("caps the log at 50 entries", () => {
    const k = withState(loadExample("kenpachi"), {
      log: Array.from({ length: 50 }, (_, i) => ({ at: "2026-11-07T00:00:00Z", change: `old ${i}` })),
    });
    const r = longRest(k);
    expect(r.state.log).toHaveLength(50);
    expect(r.state.log[0].change).toBe("old 1");
    expect(r.state.log.at(-1)?.change).toBe("long rest");
  });
});
