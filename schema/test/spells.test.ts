import { describe, expect, it } from "vitest";
import { derive } from "../src/engine/derive";
import { castChoices, castSpell, spellRoll } from "../src/engine/spells";
import { setActive } from "../src/engine/resources";
import { loadAllSpells, loadExample, remaining, withState } from "./fixtures";

const spells = loadAllSpells();
const spell = (id: string) => {
  const s = spells.get(id);
  if (!s) throw new Error(`no ${id}`);
  return s;
};
const HP = spell("srd:spell:hypnotic-pattern");
const FOG = spell("srd:spell:fog-cloud");

describe("acceptance: casting and concentration (REQUIREMENTS 7)", () => {
  const t = loadExample("tidewick"); // slots [4,3,2]

  it("Cast Hypnotic Pattern: a level 3 slot is spent and concentration shows it", () => {
    const r = castSpell(t, HP);
    expect(derive(r).spell?.slotsRemaining).toEqual([4, 3, 1]);
    expect(r.state.concentration).toEqual({ spell: "srd:spell:hypnotic-pattern" });
    expect(r.state.log.at(-1)?.change).toBe("cast Hypnotic Pattern (level 3 slot)");
  });

  it("Cast Fog Cloud while concentrating: concentration moves to Fog Cloud (the UI asks first)", () => {
    const r = castSpell(castSpell(t, HP), FOG);
    expect(r.state.concentration).toEqual({ spell: "srd:spell:fog-cloud" });
    expect(derive(r).spell?.slotsRemaining).toEqual([3, 3, 1]);
    expect(r.state.log.at(-1)?.change).toBe("cast Fog Cloud (level 1 slot; ended concentration on hypnotic pattern)");
  });
});

describe("castSpell", () => {
  const t = loadExample("tidewick");

  it("upcasts with a chosen slot level", () => {
    const r = castSpell(t, FOG, { slotLevel: 2 });
    expect(derive(r).spell?.slotsRemaining).toEqual([4, 2, 2]);
  });

  it("defaults to the lowest available slot at or above the spell's level", () => {
    const noFirst = withState(t, { slotsSpent: { "1": 4 } });
    expect(derive(castSpell(noFirst, FOG)).spell?.slotsRemaining).toEqual([0, 2, 2]);
  });

  it("can't cast without a slot at or above its level; can't pick a slot below it", () => {
    const noThird = withState(t, { slotsSpent: { "3": 2 } });
    expect(castSpell(noThird, HP)).toBe(noThird);
    expect(castSpell(t, HP, { slotLevel: 1 })).toBe(t);
  });

  it("a free cast spends the linked toggle, not a slot, once per rest", () => {
    const armor = spell("srd:spell:mage-armor");
    const r = castSpell(t, armor, { freeCast: true });
    expect(remaining(r)["free-mage-armor"]).toBe(0);
    expect(derive(r).spell?.slotsRemaining).toEqual([4, 3, 2]);
    expect(r.state.log.at(-1)?.change).toBe("cast Mage Armor (free cast)");
    expect(castSpell(r, armor, { freeCast: true })).toBe(r);
    expect(castSpell(t, FOG, { freeCast: true })).toBe(t); // Fog Cloud has no free cast
  });

  it("a concentration cantrip sets concentration without a slot; other cantrips are no-ops", () => {
    const ward = spell("saltmarsh:spell:blade-ward");
    const r = castSpell(t, ward);
    expect(r.state.concentration).toEqual({ spell: "saltmarsh:spell:blade-ward" });
    expect(r.state.slotsSpent).toEqual({});
    expect(castSpell(t, spell("srd:spell:light"))).toBe(t);
  });

  it("recasting the same concentration spell doesn't log an ended concentration", () => {
    const once = castSpell(t, HP);
    expect(castSpell(once, HP).state.log.at(-1)?.change).toBe("cast Hypnotic Pattern (level 3 slot)");
  });

  it("a state that blocks spellcasting (Rage) blocks casting", () => {
    const raging = {
      ...t,
      resources: [...t.resources, { id: "rage-active", name: "Raging", kind: "state" as const, max: 1, recharge: "manual" as const, whileActive: { blocks: ["spellcasting"] } }],
    };
    const on = setActive(raging, "rage-active", true);
    expect(castChoices(on, derive(on), HP.id, HP.level).blockedBy).toEqual(["Raging"]);
    expect(castSpell(on, HP)).toBe(on);
  });
});

describe("castChoices", () => {
  const t = loadExample("tidewick");
  it("lists slot levels with slots left and the free cast", () => {
    const partly = withState(t, { slotsSpent: { "2": 3 }, spent: { "free-misty-step": 1 } });
    const misty = castChoices(partly, derive(partly), "srd:spell:misty-step", 2);
    expect(misty.slotLevels).toEqual([3]);
    expect(misty.freeCast).toEqual({ resourceId: "free-misty-step", name: "Misty Step", available: false });
    expect(castChoices(t, derive(t), "srd:spell:light", 0).slotLevels).toEqual([]);
  });
});

describe("spellRoll", () => {
  const base = { characterLevel: 5, spellMod: 3 };
  it.each([
    ["srd:spell:thunderwave", undefined, "2d8", 0],
    ["srd:spell:thunderwave", 3, "4d8", 0],
    ["srd:spell:cure-wounds", 1, "2d8", 3],
    ["srd:spell:cure-wounds", 2, "4d8", 3],
    ["srd:spell:fireball", 5, "10d6", 0],
    ["srd:spell:magic-missile", 1, "1d4", 1],
    ["saltmarsh:spell:witch-bolt", 2, "3d12", 0],
  ] as const)("%s at slot %s = %s + %d", (id, slotLevel, dice, bonus) => {
    expect(spellRoll(spell(id), { ...base, slotLevel })).toMatchObject({ dice, bonus });
  });

  it.each([
    [1, "1d10"],
    [5, "2d10"],
    [11, "3d10"],
    [17, "4d10"],
  ])("Chill Touch at character level %d = %s", (characterLevel, dice) => {
    expect(spellRoll(spell("srd:spell:chill-touch"), { characterLevel, spellMod: 3 })?.dice).toBe(dice);
  });

  it("spells without dice have no roll", () => {
    expect(spellRoll(HP, base)).toBeUndefined();
  });
});
