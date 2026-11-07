import { describe, expect, it } from "vitest";
import { derive } from "../src/engine/derive";
import { restoreResource, restoreSlot, setActive, spendResource, spendSlot } from "../src/engine/resources";
import { loadExample, remaining, withState } from "./fixtures";

describe("spendResource / restoreResource", () => {
  const k = loadExample("kenpachi");

  it("spends one use and logs it", () => {
    const r = spendResource(k, "rage-uses");
    expect(remaining(r)["rage-uses"]).toBe(2);
    expect(r.state.log.at(-1)?.change).toBe("Rage -1");
  });

  it("clamps spending to what's left", () => {
    const r = spendResource(k, "rage-uses", 5);
    expect(remaining(r)["rage-uses"]).toBe(0);
    expect(r.state.log.at(-1)?.change).toBe("Rage -3");
  });

  it("spending with nothing left is a no-op (same object)", () => {
    const empty = withState(k, { spent: { "rage-uses": 3 } });
    expect(spendResource(empty, "rage-uses")).toBe(empty);
  });

  it("restores and clears the key when full", () => {
    const one = withState(k, { spent: { "rage-uses": 1 } });
    const r = restoreResource(one, "rage-uses");
    expect(r.state.spent).not.toHaveProperty("rage-uses");
    expect(r.state.log.at(-1)?.change).toBe("Rage +1");
    expect(restoreResource(r, "rage-uses")).toBe(r);
  });

  it("counters spend and restore by n", () => {
    const t = loadExample("tidewick");
    const r = restoreResource(spendResource(t, "sorcery-points", 4), "sorcery-points", 1);
    expect(remaining(r)["sorcery-points"]).toBe(2);
  });

  it("unknown ids and non-positive amounts are no-ops", () => {
    expect(spendResource(k, "nope")).toBe(k);
    expect(spendResource(k, "rage-uses", 0)).toBe(k);
    expect(restoreResource(k, "rage-uses", -1)).toBe(k);
  });
});

describe("setActive (acceptance: Raging on shows resistances)", () => {
  const k = loadExample("kenpachi");

  it("Raging on folds its resistances into derive()", () => {
    const r = setActive(k, "rage-active", true);
    expect(r.state.active).toEqual(["rage-active"]);
    expect(derive(r).defenses.resistances).toEqual(["bludgeoning", "piercing", "slashing"]);
    expect(r.state.log.at(-1)?.change).toBe("Raging on");
  });

  it("off removes it; repeating is a no-op", () => {
    const on = setActive(k, "rage-active", true);
    expect(setActive(on, "rage-active", true)).toBe(on);
    const off = setActive(on, "rage-active", false);
    expect(off.state.active).toEqual([]);
    expect(off.state.log.at(-1)?.change).toBe("Raging off");
  });

  it("only works on `state` resources", () => {
    expect(setActive(k, "rage-uses", true)).toBe(k);
  });

  it("a state that blocks concentration ends it", () => {
    const concentrating = withState(k, { concentration: { spell: "srd:spell:hex" } });
    const r = setActive(concentrating, "rage-active", true);
    expect(r.state.concentration).toBeNull();
    expect(r.state.log.at(-1)?.change).toBe("Raging on (concentration ended)");
  });
});

describe("spell slots", () => {
  const t = loadExample("tidewick");

  it("spend and restore one slot", () => {
    const r = spendSlot(t, 3);
    expect(derive(r).spell?.slotsRemaining).toEqual([4, 3, 1]);
    expect(r.state.log.at(-1)?.change).toBe("level 3 slot -1");
    const back = restoreSlot(r, 3);
    expect(back.state.slotsSpent).toEqual({});
    expect(derive(back).spell?.slotsRemaining).toEqual([4, 3, 2]);
  });

  it("can't spend a slot that isn't there", () => {
    const none = withState(t, { slotsSpent: { "3": 2 } });
    expect(spendSlot(none, 3)).toBe(none);
    expect(spendSlot(t, 4)).toBe(t);
    expect(spendSlot(t, 0)).toBe(t);
    expect(restoreSlot(t, 1)).toBe(t);
  });

  it("non-casters have no slots", () => {
    const k = loadExample("kenpachi");
    expect(spendSlot(k, 1)).toBe(k);
  });
});
