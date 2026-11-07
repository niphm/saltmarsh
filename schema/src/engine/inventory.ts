/**
 * Inventory changes (F1.7): coins, equipping, attunement, quantity, charges,
 * adding/removing items. Inventory lives in the document, not `state`, so
 * these touch `c.inventory` (and log to state.log like every other change).
 * No-ops return the same object.
 */
import type { Character, Item } from "../schema/character";
import { ATTUNEMENT_LIMIT, COIN_CP, derive, type Coin } from "./derive";
import { stamp } from "./log";

export const COINS = Object.keys(COIN_CP) as Coin[];

function withInventory(c: Character, inventory: Character["inventory"], change: string): Character {
  return { ...c, inventory, state: { ...c.state, log: stamp(c, change) }, updatedAt: new Date().toISOString() };
}

function withItems(c: Character, items: Item[], change: string): Character {
  return withInventory(c, { ...c.inventory, items }, change);
}

const find = (c: Character, id: string) => c.inventory.items.find(i => i.id === id);

/**
 * Add (positive) or spend (negative) coins. All or nothing: if any coin
 * would go below zero, nothing changes.
 */
export function changeCoins(c: Character, delta: Partial<Record<Coin, number>>): Character {
  const next = { ...c.inventory.coins };
  const parts: string[] = [];
  for (const k of COINS) {
    const d = Math.trunc(delta[k] ?? 0);
    if (!d) continue;
    next[k] += d;
    if (next[k] < 0) return c;
    parts.push(`${d > 0 ? "+" : ""}${d} ${k}`);
  }
  if (!parts.length) return c;
  return withInventory(c, { ...c.inventory, coins: next }, `coins ${parts.join(" ")}`);
}

/**
 * Equip or unequip. Equipping body armor (an item with equipEffect.acBase)
 * takes off any other body armor; equipping a shield takes off any other
 * shield. AC follows through derive().
 */
export function setEquipped(c: Character, id: string, on: boolean): Character {
  const item = find(c, id);
  if (!item || item.equipped === on) return c;
  const isArmor = item.equipEffect?.acBase !== undefined;
  const isShield = item.category === "shield";
  const removed: string[] = [];
  const items = c.inventory.items.map(i => {
    if (i.id === id) return { ...i, equipped: on };
    const clashes = on && i.equipped && ((isArmor && i.equipEffect?.acBase !== undefined) || (isShield && i.category === "shield"));
    if (!clashes) return i;
    removed.push(i.name);
    return { ...i, equipped: false };
  });
  return withItems(c, items, `${item.name} ${on ? "equipped" : "unequipped"}${removed.length ? ` (took off ${removed.join(", ")})` : ""}`);
}

/** Attune or end attunement. Only items that require attunement; at most three at once. */
export function setAttuned(c: Character, id: string, on: boolean): Character {
  const item = find(c, id);
  if (!item || item.attuned === on || (on && !item.requiresAttunement)) return c;
  if (on && c.inventory.items.filter(i => i.attuned).length >= ATTUNEMENT_LIMIT) return c;
  const items = c.inventory.items.map(i => (i.id === id ? { ...i, attuned: on } : i));
  return withItems(c, items, `${item.name} ${on ? "attuned" : "attunement ended"}`);
}

/** Change quantity by `delta`; never below 0 (the item stays until removed). */
export function changeQuantity(c: Character, id: string, delta: number): Character {
  const item = find(c, id);
  if (!item) return c;
  const qty = Math.max(0, item.qty + Math.trunc(delta));
  if (qty === item.qty) return c;
  const items = c.inventory.items.map(i => (i.id === id ? { ...i, qty } : i));
  return withItems(c, items, `${item.name} x${qty}`);
}

function setCharges(c: Character, id: string, change: (current: number, max: number) => number): Character {
  const item = find(c, id);
  const ch = derive(c).inventory.charges[id];
  if (!item?.charges || !ch) return c;
  const current = Math.min(ch.max, Math.max(0, change(ch.current, ch.max)));
  if (current === item.charges.current) return c;
  const items = c.inventory.items.map(i => (i.id === id && i.charges ? { ...i, charges: { ...i.charges, current } } : i));
  return withItems(c, items, `${item.name} charges ${current}/${ch.max}`);
}

export const spendCharge = (c: Character, id: string, n = 1) => setCharges(c, id, cur => cur - Math.trunc(n));
export const restoreCharge = (c: Character, id: string, n = 1) => setCharges(c, id, cur => cur + Math.trunc(n));

export interface NewItem {
  name: string;
  category: Item["category"];
  qty?: number;
  weight?: number;
  notes?: string;
}

/** Add a plain item (loot). Blank names are ignored. */
export function addItem(c: Character, input: NewItem): Character {
  const name = input.name.trim();
  if (!name) return c;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item";
  const item: Item = {
    id: `i-${slug}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    category: input.category,
    qty: Math.max(0, Math.trunc(input.qty ?? 1)),
    equipped: false,
    attuned: false,
    requiresAttunement: false,
    ...(input.weight !== undefined ? { weight: input.weight } : {}),
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
  };
  return withItems(c, [...c.inventory.items, item], `added ${name}${item.qty !== 1 ? ` x${item.qty}` : ""}`);
}

export function removeItem(c: Character, id: string): Character {
  const item = find(c, id);
  if (!item) return c;
  return withItems(c, c.inventory.items.filter(i => i.id !== id), `removed ${item.name}`);
}
