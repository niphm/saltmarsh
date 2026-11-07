import { describe, expect, it } from "vitest";
import { derive } from "../src/engine/derive";
import { applyDamage, applyHealing, setDeathSaves, setTempHp } from "../src/engine/hp";
import { loadExample, withState } from "./fixtures";

describe("dropping to 0 and death saves (2024)", () => {
  const t = loadExample("tidewick"); // max HP 34

  it("dropping to 0 starts fresh death saves and shows dying", () => {
    const stale = withState(t, { hp: { current: 5, temp: 0 }, deathSaves: { success: 1, failure: 1 } });
    const r = applyDamage(stale, 8);
    expect(r.state.hp.current).toBe(0);
    expect(r.state.deathSaves).toEqual({ success: 0, failure: 0 });
    expect(r.state.log.at(-1)?.change).toBe("hp -8 - down");
    expect(derive(r)).toMatchObject({ life: "dying", hpBand: "down" });
  });

  it("damage while at 0 is one failed death save; three is dead", () => {
    let r = withState(t, { hp: { current: 0, temp: 0 }, deathSaves: { success: 1, failure: 1 } });
    r = applyDamage(r, 3);
    expect(r.state.deathSaves).toEqual({ success: 1, failure: 2 });
    expect(r.state.log.at(-1)?.change).toBe("hp -3 - death save failed");
    r = applyDamage(r, 3);
    expect(r.state.deathSaves.failure).toBe(3);
    expect(derive(r).life).toBe("dead");
  });

  it("leftover damage >= max HP kills outright", () => {
    const r = applyDamage(withState(t, { hp: { current: 10, temp: 0 } }), 44);
    expect(r.state.deathSaves.failure).toBe(3);
    expect(derive(r).life).toBe("dead");
    expect(r.state.log.at(-1)?.change).toBe("hp -44 - killed outright");
  });

  it("damage >= max HP while at 0 kills outright", () => {
    const r = applyDamage(withState(t, { hp: { current: 0, temp: 0 } }), 34);
    expect(derive(r).life).toBe("dead");
  });

  it("temp HP that absorbs all the damage at 0 means no failed save", () => {
    const r = applyDamage(withState(t, { hp: { current: 0, temp: 5 } }), 4);
    expect(r.state.deathSaves).toEqual({ success: 0, failure: 0 });
    expect(r.state.hp.temp).toBe(1);
  });

  it("setDeathSaves clamps 0-3; three successes is stable", () => {
    const down = withState(t, { hp: { current: 0, temp: 0 } });
    const r = setDeathSaves(down, 5, -2);
    expect(r.state.deathSaves).toEqual({ success: 3, failure: 0 });
    expect(derive(r).life).toBe("stable");
    expect(setDeathSaves(r, 3, 0)).toBe(r);
  });
});

describe("HP bands (F2.7 thresholds)", () => {
  const k = loadExample("kenpachi"); // max 51; 25% = 12.75
  it.each([
    [51, "full"],
    [50, "injured"],
    [13, "injured"],
    [12, "critical"],
    [1, "critical"],
    [0, "down"],
  ] as const)("%d/51 is %s", (current, band) => {
    expect(derive(withState(k, { hp: { current, temp: 0 } })).hpBand).toBe(band);
  });
});

describe("no-ops return the same object", () => {
  const k = loadExample("kenpachi");
  it("zero damage, healing at full, unchanged temp", () => {
    expect(applyDamage(k, 0)).toBe(k);
    expect(applyHealing(k, 5)).toBe(k);
    expect(setTempHp(k, 0)).toBe(k);
  });

  it("healing logs what was actually healed", () => {
    const t = withState(loadExample("tidewick"), { hp: { current: 30, temp: 0 } });
    expect(applyHealing(t, 100).state.log.at(-1)?.change).toBe("hp +4");
  });
});

describe("acceptance: temp HP absorbs damage first (REQUIREMENTS 7)", () => {
  it("take 10 damage with 4 temp HP: temp goes to 0, HP drops 6", () => {
    const k = withState(loadExample("kenpachi"), { hp: { current: 51, temp: 4 } });
    const r = applyDamage(k, 10);
    expect(r.state.hp.temp).toBe(0);
    expect(r.state.hp.current).toBe(45);
  });

  it("damage smaller than temp HP only reduces temp", () => {
    const k = withState(loadExample("kenpachi"), { hp: { current: 51, temp: 4 } });
    const r = applyDamage(k, 3);
    expect(r.state.hp).toMatchObject({ current: 51, temp: 1 });
  });

  it("HP never drops below 0", () => {
    const r = applyDamage(withState(loadExample("tidewick"), { hp: { current: 5, temp: 0 } }), 50);
    expect(r.state.hp.current).toBe(0);
  });

  it("logs the change", () => {
    const k = withState(loadExample("kenpachi"), { hp: { current: 51, temp: 4 } });
    expect(applyDamage(k, 10, "Fireball").state.log.at(-1)?.change).toBe("hp -10 (4 temp) (Fireball)");
  });
});

describe("acceptance: heal above max is clamped (REQUIREMENTS 7)", () => {
  it("clamps to derived max HP", () => {
    const t = withState(loadExample("tidewick"), { hp: { current: 30, temp: 0 } });
    expect(applyHealing(t, 100).state.hp.current).toBe(34);
  });

  it("respects maxOverride", () => {
    const t = withState(loadExample("tidewick"), { hp: { current: 30, temp: 0, maxOverride: 39 } });
    expect(applyHealing(t, 100).state.hp.current).toBe(39);
  });

  it("does not touch temp HP", () => {
    const t = withState(loadExample("tidewick"), { hp: { current: 30, temp: 5 } });
    expect(applyHealing(t, 2).state.hp).toMatchObject({ current: 32, temp: 5 });
  });

  it("healing from 0 resets death saves", () => {
    const t = withState(loadExample("tidewick"), { hp: { current: 0, temp: 0 }, deathSaves: { success: 2, failure: 1 } });
    const r = applyHealing(t, 1);
    expect(r.state.hp.current).toBe(1);
    expect(r.state.deathSaves).toEqual({ success: 0, failure: 0 });
  });
});

describe("temp HP", () => {
  it("sets temp HP (2024: temp HP doesn't stack, the new value replaces)", () => {
    const k = withState(loadExample("kenpachi"), { hp: { current: 51, temp: 4 } });
    expect(setTempHp(k, 3).state.hp.temp).toBe(3);
  });

  it("negative or fractional amounts are sanitised", () => {
    const k = loadExample("kenpachi");
    expect(setTempHp(k, -5).state.hp.temp).toBe(0);
    expect(applyDamage(k, -5).state.hp.current).toBe(51);
    expect(applyDamage(k, 2.9).state.hp.current).toBe(49);
  });

  it("never mutates its input", () => {
    const k = withState(loadExample("kenpachi"), { hp: { current: 20, temp: 4 } });
    const before = structuredClone(k);
    applyDamage(k, 10);
    applyHealing(k, 10);
    setTempHp(k, 8);
    expect(k).toEqual(before);
  });
});
