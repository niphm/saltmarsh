import { describe, expect, it } from "vitest";
import type { Character, Item } from "../src/schema/character";
import { coinsInGp, derive } from "../src/engine/derive";
import {
  addItem,
  changeCoins,
  changeQuantity,
  removeItem,
  restoreCharge,
  setAttuned,
  setEquipped,
  spendCharge,
} from "../src/engine/inventory";
import { loadExample } from "./fixtures";

const item = (over: Partial<Item> & Pick<Item, "id" | "name" | "category">): Item => ({
  qty: 1, equipped: false, attuned: false, requiresAttunement: false, ...over,
});
const withItems = (c: Character, ...items: Item[]): Character => ({ ...c, inventory: { ...c.inventory, items: [...c.inventory.items, ...items] } });

describe("coins", () => {
  it("coinsInGp converts in whole copper", () => {
    expect(coinsInGp({ cp: 5, sp: 3, ep: 1, gp: 12, pp: 2 })).toBe(32.85);
    expect(coinsInGp({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 })).toBe(0);
  });

  it("derive exposes the gp total, weight and attunement count", () => {
    expect(derive(loadExample("kenpachi")).inventory).toEqual({ gp: 0, weight: 13, attuned: 0, attunementLimit: 3, charges: {} });
  });

  it("changeCoins adds and spends; logs it", () => {
    const k = changeCoins(loadExample("kenpachi"), { gp: 10, sp: 5 });
    expect(k.inventory.coins).toMatchObject({ gp: 10, sp: 5 });
    expect(k.state.log.at(-1)?.change).toBe("coins +5 sp +10 gp");
    const spent = changeCoins(k, { gp: -3 });
    expect(spent.inventory.coins.gp).toBe(7);
    expect(derive(spent).inventory.gp).toBe(7.5);
  });

  it("spending more than you have changes nothing (all or nothing)", () => {
    const k = changeCoins(loadExample("kenpachi"), { gp: 10 });
    expect(changeCoins(k, { gp: -15 })).toBe(k);
    expect(changeCoins(k, { gp: -5, sp: -1 })).toBe(k);
    expect(changeCoins(k, {})).toBe(k);
  });
});

describe("acceptance: equipped armor/shield changes AC via derive() (F1.7)", () => {
  const k = loadExample("kenpachi"); // Dex -1, shield +2 equipped -> AC 11

  it("unequipping the shield drops AC to 9; re-equipping restores 11", () => {
    const off = setEquipped(k, "i-shield", false);
    expect(derive(off).ac).toBe(9);
    expect(off.state.log.at(-1)?.change).toBe("Shield unequipped");
    expect(derive(setEquipped(off, "i-shield", true)).ac).toBe(11);
  });

  it("body armor sets the base and caps Dex; equipping new armor takes the old one off", () => {
    const armored = withItems(
      k,
      item({ id: "i-leather", name: "Leather Armor", category: "armor", equipEffect: { acBase: 11, acDexCap: null } }),
      item({ id: "i-breast", name: "Breastplate", category: "armor", equipEffect: { acBase: 14, acDexCap: 2 } }),
    );
    const leather = setEquipped(armored, "i-leather", true);
    expect(derive(leather).ac).toBe(12); // 11 - 1 + 2

    const breast = setEquipped(leather, "i-breast", true);
    expect(breast.inventory.items.find(i => i.id === "i-leather")?.equipped).toBe(false);
    expect(derive(breast).ac).toBe(15); // 14 - 1 + 2
    expect(breast.state.log.at(-1)?.change).toBe("Breastplate equipped (took off Leather Armor)");
  });

  it("only one shield at a time", () => {
    const two = withItems(k, item({ id: "i-shield2", name: "Spiked Shield", category: "shield", equipEffect: { acBonus: 2 } }));
    const r = setEquipped(two, "i-shield2", true);
    expect(r.inventory.items.filter(i => i.category === "shield" && i.equipped).map(i => i.id)).toEqual(["i-shield2"]);
    expect(derive(r).ac).toBe(11);
  });

  it("equipping something already equipped is a no-op", () => {
    expect(setEquipped(k, "i-shield", true)).toBe(k);
    expect(setEquipped(k, "nope", true)).toBe(k);
  });
});

describe("attunement", () => {
  const ring = (n: number) => item({ id: `i-ring${n}`, name: `Ring ${n}`, category: "magic-item", requiresAttunement: true });
  const k = withItems(loadExample("kenpachi"), ring(1), ring(2), ring(3), ring(4));

  it("attunes up to three items", () => {
    let r = setAttuned(k, "i-ring1", true);
    r = setAttuned(r, "i-ring2", true);
    r = setAttuned(r, "i-ring3", true);
    expect(derive(r).inventory.attuned).toBe(3);
    expect(setAttuned(r, "i-ring4", true)).toBe(r);
    const freed = setAttuned(r, "i-ring1", false);
    expect(freed.state.log.at(-1)?.change).toBe("Ring 1 attunement ended");
    expect(setAttuned(freed, "i-ring4", true).inventory.items.find(i => i.id === "i-ring4")?.attuned).toBe(true);
  });

  it("items that don't require attunement can't be attuned", () => {
    expect(setAttuned(k, "i-shield", true)).toBe(k);
  });
});

describe("quantity, charges, add/remove", () => {
  const k = loadExample("kenpachi");

  it("changeQuantity never goes below zero", () => {
    const more = changeQuantity(k, "i-javelin", 4);
    expect(more.inventory.items.find(i => i.id === "i-javelin")?.qty).toBe(5);
    expect(more.state.log.at(-1)?.change).toBe("Javelin x5");
    expect(changeQuantity(more, "i-javelin", -10).inventory.items.find(i => i.id === "i-javelin")?.qty).toBe(0);
    expect(derive(more).inventory.weight).toBe(21);
    expect(changeQuantity(k, "nope", 1)).toBe(k);
  });

  it("charges spend and restore within an evaluated max", () => {
    const wand = withItems(k, item({ id: "i-wand", name: "Wand", category: "magic-item", charges: { current: 2, max: "prof", recharge: "dawn" } }));
    expect(derive(wand).inventory.charges["i-wand"]).toEqual({ current: 2, max: 3 });
    const used = spendCharge(wand, "i-wand");
    expect(used.inventory.items.find(i => i.id === "i-wand")?.charges?.current).toBe(1);
    expect(used.state.log.at(-1)?.change).toBe("Wand charges 1/3");
    const full = restoreCharge(wand, "i-wand", 5);
    expect(full.inventory.items.find(i => i.id === "i-wand")?.charges?.current).toBe(3);
    expect(spendCharge(k, "i-shield")).toBe(k); // no charges
  });

  it("adds and removes items; blank names are ignored", () => {
    const r = addItem(k, { name: "  Pearl of the Sea  ", category: "treasure", qty: 2 });
    const pearl = r.inventory.items.at(-1)!;
    expect(pearl).toMatchObject({ name: "Pearl of the Sea", category: "treasure", qty: 2, equipped: false });
    expect(pearl.id).toMatch(/^i-pearl-of-the-sea-/);
    expect(r.state.log.at(-1)?.change).toBe("added Pearl of the Sea x2");
    const gone = removeItem(r, pearl.id);
    expect(gone.inventory.items).toHaveLength(k.inventory.items.length);
    expect(addItem(k, { name: "   ", category: "gear" })).toBe(k);
  });

  it("never mutates its input", () => {
    const before = structuredClone(k);
    changeCoins(k, { gp: 5 });
    setEquipped(k, "i-shield", false);
    changeQuantity(k, "i-javelin", 1);
    addItem(k, { name: "Rope", category: "gear" });
    removeItem(k, "i-pistol");
    expect(k).toEqual(before);
  });
});
