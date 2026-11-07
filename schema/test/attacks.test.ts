import { describe, expect, it } from "vitest";
import { setInspiration } from "../src/engine/conditions";
import { derive } from "../src/engine/derive";
import { setActive } from "../src/engine/resources";
import { loadExample } from "./fixtures";

describe("derived attacks (F1.6)", () => {
  const k = loadExample("kenpachi"); // Str +4, Dex -1, prof +3, masteries vex/push/slow

  it("to-hit = ability mod + proficiency + extra", () => {
    const d = derive(k);
    expect(d.attacks.map(a => [a.name, a.toHit])).toEqual([
      ["Warhammer", 7],
      ["Javelin", 7],
      ["Pistol", 2],
    ]);
  });

  it("damage bonuses are evaluated; `when` lines are inactive until a state turns their tag on", () => {
    const hammer = derive(k).attacks[0];
    expect(hammer.damage).toEqual([
      { dice: "1d8", bonus: 4, type: "bludgeoning", when: undefined, active: true },
      { dice: "1d10", bonus: 4, type: "bludgeoning", when: "two-handed", active: false },
      { dice: "0", bonus: 2, type: "bludgeoning", when: "rage", active: false },
      { dice: "2d6", bonus: 0, type: "bludgeoning", when: "frenzy", active: false },
    ]);
  });

  it("acceptance: Raging on lights up the `when: rage` lines (and only those)", () => {
    const d = derive(setActive(k, "rage-active", true));
    expect(d.active.tags).toEqual(["rage"]);
    const lit = d.attacks.flatMap(a => a.damage.filter(l => l.when && l.active).map(l => `${a.name}:${l.when}`));
    expect(lit).toEqual(["Warhammer:rage", "Javelin:rage"]);
  });

  it("mastery is usable only when it's in proficiencies.masteries", () => {
    expect(derive(k).attacks.map(a => [a.mastery, a.masteryActive])).toEqual([
      ["push", true],
      ["slow", true],
      ["vex", true],
    ]);
    const t = derive(loadExample("tidewick")).attacks[0];
    expect(t).toMatchObject({ name: "Dagger", toHit: 5, mastery: "nick", masteryActive: false });
    expect(t.damage[0]).toMatchObject({ dice: "1d4", bonus: 2 });
  });

  it("negative bonuses carry through (Pistol uses Dex -1)", () => {
    expect(derive(k).attacks[2].damage[0]).toMatchObject({ dice: "1d10", bonus: -1 });
  });
});

describe("setInspiration", () => {
  it("toggles and logs; repeating is a no-op", () => {
    const t = loadExample("tidewick");
    const on = setInspiration(t, true);
    expect(on.state.inspiration).toBe(true);
    expect(on.state.log.at(-1)?.change).toBe("inspiration gained");
    expect(setInspiration(on, true)).toBe(on);
    expect(setInspiration(on, false).state.log.at(-1)?.change).toBe("inspiration used");
  });
});
