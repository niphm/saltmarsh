/**
 * derive() against the bundled examples. The headline numbers are copied
 * verbatim from `npm run validate` (2026-11-07) - they are the Phase 1
 * acceptance numbers. If one of these changes, the sheet changed.
 */
import { describe, expect, it } from "vitest";
import { derive } from "../src/engine/derive";
import { longRest, shortRest } from "../src/engine/rest";
import { loadExample, remaining, spendAll, withState } from "./fixtures";

describe("derive: Tidewick Grayholt", () => {
  const c = loadExample("tidewick");
  const d = derive(c);

  it("level and proficiency (L5, prof +3)", () => {
    expect(d.level).toBe(5);
    expect(d.prof).toBe(3);
  });

  it("HP 34/34  AC 12  Speed 30  Init +2  PP 11", () => {
    expect(c.state.hp.current).toBe(34);
    expect(d.hpMax).toBe(34);
    expect(d.ac).toBe(12);
    expect(d.speed).toBe(30);
    expect(d.initiative).toBe(2);
    expect(d.passive.perception).toBe(11);
  });

  it("saves", () => {
    expect(d.saves).toEqual({ str: 0, dex: 2, con: 5, int: -1, wis: 1, cha: 6 });
  });

  it("spell: mod +3 DC 14 atk +6 slots [4,3,2]", () => {
    expect(d.spell).toMatchObject({ ability: "cha", mod: 3, dc: 14, attack: 6, slots: [4, 3, 2], slotsRemaining: [4, 3, 2] });
  });

  it("resources", () => {
    expect(d.resources.map(r => [r.group, r.name, r.remaining, r.max, r.kind, r.recharge])).toEqual([
      ["Class", "Sorcery Points", 5, 5, "counter", "long"],
      ["Class", "Innate Sorcery", 2, 2, "pips", "long"],
      ["Subclass", "Favored by the Gods", 1, 1, "toggle", "short"],
      ["Class", "Sorcerous Restoration", 1, 1, "toggle", "long"],
      ["Free Casts", "Mage Armor", 1, 1, "toggle", "long"],
      ["Free Casts", "Command", 1, 1, "toggle", "long"],
      ["Free Casts", "Misty Step", 1, 1, "toggle", "long"],
    ]);
  });

  it("rests from fully spent match validate output", () => {
    const spent = spendAll(c);
    expect(remaining(shortRest(spent))).toEqual({
      "sorcery-points": 0, "innate-sorcery": 0, "favored-by-the-gods": 1, "sorcerous-restoration": 0,
      "free-mage-armor": 0, "free-command": 0, "free-misty-step": 0,
    });
    expect(remaining(longRest(spent))).toEqual({
      "sorcery-points": 5, "innate-sorcery": 2, "favored-by-the-gods": 1, "sorcerous-restoration": 1,
      "free-mage-armor": 1, "free-command": 1, "free-misty-step": 1,
    });
  });

  it("modifiers, skills, other passives, hit dice", () => {
    expect(d.mods).toEqual({ str: 0, dex: 2, con: 2, int: -1, wis: 1, cha: 3 });
    expect(d.skills).toMatchObject({ arcana: 2, history: 2, insight: 4, religion: 2, perception: 1, stealth: 2, athletics: 0, persuasion: 3 });
    expect(d.passive).toEqual({ perception: 11, insight: 14, investigation: 9 });
    expect(d.hitDice).toEqual([{ size: 6, total: 5, remaining: 5 }]);
  });

  it("no resistances, nothing active", () => {
    expect(d.defenses).toEqual({ resistances: [], immunities: [], conditionImmunities: [] });
    expect(d.active).toEqual({ ids: [], damageBonus: 0, advantageOn: [], blocks: [], tags: [] });
  });

  it("slotsRemaining follows slotsSpent", () => {
    const after = derive(withState(c, { slotsSpent: { "1": 1, "3": 2 } }));
    expect(after.spell?.slotsRemaining).toEqual([3, 3, 0]);
  });
});

describe("derive: Kenpachi", () => {
  const c = loadExample("kenpachi");
  const d = derive(c);

  it("level and proficiency (L5, prof +3)", () => {
    expect(d.level).toBe(5);
    expect(d.prof).toBe(3);
  });

  it("HP 51/51  AC 11  Speed 40  Init -1  PP 12", () => {
    expect(c.state.hp.current).toBe(51);
    expect(d.hpMax).toBe(51);
    expect(d.ac).toBe(11);
    expect(d.speed).toBe(40);
    expect(d.initiative).toBe(-1);
    expect(d.passive.perception).toBe(12);
  });

  it("saves", () => {
    expect(d.saves).toEqual({ str: 7, dex: -1, con: 3, int: 3, wis: 2, cha: 3 });
  });

  it("not a spellcaster", () => {
    expect(d.spell).toBeUndefined();
  });

  it("resources", () => {
    expect(d.resources.map(r => [r.group, r.name, r.remaining, r.max, r.kind, r.recharge])).toEqual([
      ["Class", "Rage", 3, 3, "pips", "short"],
      ["Class", "Raging", 1, 1, "state", "manual"],
      ["Species", "Adrenaline Rush", 3, 3, "pips", "long"],
      ["Species", "Relentless Endurance", 1, 1, "toggle", "long"],
    ]);
  });

  it("rests from fully spent match validate output", () => {
    const spent = spendAll(c);
    expect(remaining(shortRest(spent))).toEqual({ "rage-uses": 1, "rage-active": 0, "adrenaline-rush": 0, "relentless-endurance": 0 });
    expect(remaining(longRest(spent))).toEqual({ "rage-uses": 3, "rage-active": 0, "adrenaline-rush": 3, "relentless-endurance": 1 });
  });

  it("modifiers, skills, other passives, hit dice", () => {
    expect(d.mods).toEqual({ str: 4, dex: -1, con: 0, int: 3, wis: 2, cha: 3 });
    expect(d.skills).toMatchObject({ athletics: 7, nature: 6, "animal-handling": 5, survival: 5, intimidation: 6, perception: 2, stealth: -1 });
    expect(d.passive).toEqual({ perception: 12, insight: 12, investigation: 13 });
    expect(d.hitDice).toEqual([{ size: 12, total: 5, remaining: 5 }]);
  });

  it("AC: shield adds +2 only while equipped", () => {
    const unequipped = { ...c, state: { ...c.state, equipped: c.state.equipped.filter(id => id !== "i-shield") } };
    expect(derive(unequipped).ac).toBe(9);
    // An equipped id with no matching item is ignored.
    expect(derive({ ...c, state: { ...c.state, equipped: [...c.state.equipped, "i-gone"] } }).inventory.equipped)
      .toEqual(["i-warhammer", "i-javelin", "i-pistol", "i-shield"]);
  });
});

describe("derive: state resources fold whileActive into the sheet", () => {
  const c = loadExample("kenpachi");

  it("Raging on: resistances, advantage, blocks and damage bonus are exposed", () => {
    const d = derive(withState(c, { active: ["rage-active"] }));
    expect(d.resources.find(r => r.id === "rage-active")?.active).toBe(true);
    expect(d.defenses.resistances).toEqual(["bludgeoning", "piercing", "slashing"]);
    expect(d.active).toEqual({
      ids: ["rage-active"],
      damageBonus: 2,
      advantageOn: ["str-checks", "str-saves"],
      blocks: ["spellcasting", "concentration"],
      tags: ["rage"],
    });
  });

  it("Raging off: none of it", () => {
    const d = derive(c);
    expect(d.defenses.resistances).toEqual([]);
    expect(d.active.ids).toEqual([]);
  });

  it("document resistances and active-state resistances merge without duplicates", () => {
    const fireRes = { ...c, damageResistances: ["fire", "slashing"] };
    const d = derive(withState(fireRes, { active: ["rage-active"] }));
    expect(d.defenses.resistances).toEqual(["fire", "slashing", "bludgeoning", "piercing"]);
  });

  it("acBonus and speedBonus from an active state apply", () => {
    const large = {
      ...c,
      resources: [...c.resources, { id: "large-form", name: "Large Form", kind: "state" as const, max: 1, recharge: "long" as const,
        whileActive: { acBonus: 1, speedBonus: 10 } }],
    };
    expect(derive(large).ac).toBe(11);
    const d = derive(withState(large, { active: ["large-form"] }));
    expect(d.ac).toBe(12);
    expect(d.speed).toBe(50);
  });
});
