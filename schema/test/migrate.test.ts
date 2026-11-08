import { describe, expect, it } from "vitest";
import { Character, SCHEMA_VERSION } from "../src/schema/character";
import { migrateCharacter } from "../src/schema/migrate";
import { derive } from "../src/engine/derive";
import kenpachiJson from "../examples/kenpachi.json";
import tidewickJson from "../examples/tidewick.json";

type Doc = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** The same character as a schema v1 document: coins, equipped flags and charges left in the document. */
function asV1(v2: unknown, charges: Record<string, { current: number; max: number | string; recharge: string }> = {}): Doc {
  const doc = structuredClone(v2) as Doc;
  const { coins, equipped, chargesSpent: _spent, ...state } = doc.state;
  return {
    ...doc,
    schemaVersion: 1,
    inventory: {
      coins,
      items: doc.inventory.items.map((i: Doc) => ({
        ...i,
        equipped: equipped.includes(i.id),
        ...(charges[i.id] ? { charges: charges[i.id] } : {}),
      })),
    },
    state,
  };
}

describe("migrateCharacter", () => {
  it("the bundled examples are on the current version", () => {
    expect(SCHEMA_VERSION).toBe(2);
    for (const ex of [kenpachiJson, tidewickJson]) expect(migrateCharacter(ex)).toBe(ex);
  });

  it("v1 -> v2: coins and equipped flags move into state, and the result is the v2 example", () => {
    const v1 = asV1(kenpachiJson);
    v1.inventory.coins = { gp: 12, sp: 3 };
    const v2 = migrateCharacter(v1) as Doc;
    expect(v2.schemaVersion).toBe(2);
    expect(v2.state.coins).toEqual({ gp: 12, sp: 3 });
    expect(v2.state.equipped).toEqual(["i-warhammer", "i-javelin", "i-pistol", "i-shield"]);
    expect(v2.inventory).not.toHaveProperty("coins");
    expect(v2.inventory.items.some((i: Doc) => "equipped" in i)).toBe(false);

    const c = Character.parse(v2);
    expect(derive(c).ac).toBe(11); // shield still equipped
    expect(derive(c).inventory.gp).toBe(12.3);
    expect(Character.parse(migrateCharacter(asV1(kenpachiJson)))).toEqual(Character.parse(structuredClone(kenpachiJson)));
  });

  it("unequipped items stay unequipped", () => {
    const v1 = asV1(kenpachiJson);
    v1.inventory.items.find((i: Doc) => i.id === "i-shield").equipped = false;
    const c = Character.parse(migrateCharacter(v1));
    expect(c.state.equipped).not.toContain("i-shield");
    expect(derive(c).ac).toBe(9);
  });

  it("charges left become spent charges, with an expression max evaluated", () => {
    const base = structuredClone(kenpachiJson) as Doc;
    base.inventory.items.push(
      { id: "i-wand", name: "Wand", category: "magic-item", qty: 1 },
      { id: "i-cube", name: "Cube", category: "magic-item", qty: 1 },
      { id: "i-orb", name: "Orb", category: "magic-item", qty: 1 },
    );
    const v1 = asV1(base, {
      "i-wand": { current: 1, max: "prof", recharge: "dawn" }, // prof 3 at level 5
      "i-cube": { current: 7, max: 7, recharge: "long" },
      "i-orb": { current: 0, max: 2, recharge: "manual" },
    });
    const c = Character.parse(migrateCharacter(v1));
    expect(c.state.chargesSpent).toEqual({ "i-wand": 2, "i-orb": 2 });
    expect(c.inventory.items.find(i => i.id === "i-wand")?.charges).toEqual({ max: "prof", recharge: "dawn" });
    expect(derive(c).inventory.charges).toEqual({
      "i-wand": { current: 1, max: 3 },
      "i-cube": { current: 7, max: 7 },
      "i-orb": { current: 0, max: 2 },
    });
  });

  it("keeps the rest of state (HP, spent resources, log)", () => {
    const v1 = asV1(kenpachiJson);
    v1.state.hp.current = 20;
    v1.state.spent = { "rage-uses": 2 };
    v1.state.log = [{ at: "2026-11-07T00:00:00Z", change: "rage on" }];
    const c = Character.parse(migrateCharacter(v1));
    expect(c.state).toMatchObject({ hp: { current: 20 }, spent: { "rage-uses": 2 }, log: [{ change: "rage on" }] });
  });

  it("leaves what it doesn't recognise for Zod to report", () => {
    expect(migrateCharacter(null)).toBe(null);
    expect(migrateCharacter("x")).toBe("x");
    const future = { schemaVersion: 99 };
    expect(migrateCharacter(future)).toBe(future);
    // A broken v1 document without state still fails validation, on the missing state.
    const broken = migrateCharacter({ schemaVersion: 1, id: "c_bad", identity: { name: "Bob" } }) as Doc;
    expect(broken).not.toHaveProperty("state");
    const r = Character.safeParse(broken);
    expect(r.success).toBe(false);
    expect(r.error?.issues.map(i => i.path.join("."))).toContain("state");
  });

  it("never mutates its input", () => {
    const v1 = asV1(kenpachiJson);
    const before = structuredClone(v1);
    migrateCharacter(v1);
    expect(v1).toEqual(before);
  });
});
