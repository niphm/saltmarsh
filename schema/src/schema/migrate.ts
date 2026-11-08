/**
 * Upgrades saved character documents to the current schema version before
 * validation. Run it on everything read from storage, imports and (Phase 2)
 * the server: `Character.safeParse(migrateCharacter(raw))`.
 *
 * Returns the input unchanged (same object) when there's nothing to upgrade,
 * so callers can tell whether a document was migrated. Shapes it doesn't
 * recognise pass through untouched so Zod reports the real problem.
 */
import { derive } from "../engine/derive";
import { Character, SCHEMA_VERSION } from "./character";

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === "object" && x !== null && !Array.isArray(x);

/**
 * v1 -> v2: coins, equipped flags and item charges move from the document
 * into `state`, because they change at the table and the party DM can write
 * `state` but not the document (F2.8).
 *
 *   inventory.coins          -> state.coins
 *   items[].equipped = true  -> state.equipped (item ids)
 *   items[].charges.current  -> state.chargesSpent (max - current)
 */
function v1ToV2(doc: Obj): Obj {
  const inventory = isObj(doc.inventory) ? doc.inventory : undefined;
  const items: unknown[] = inventory && Array.isArray(inventory.items) ? inventory.items : [];

  const equipped: string[] = [];
  const chargesLeft: Record<string, number> = {};
  const nextItems = items.map(item => {
    if (!isObj(item)) return item;
    const { equipped: on, ...rest } = item;
    const id = typeof item.id === "string" ? item.id : undefined;
    if (on === true && id) equipped.push(id);
    if (!isObj(rest.charges)) return rest;
    const { current, ...charges } = rest.charges;
    if (typeof current === "number" && id) chargesLeft[id] = current;
    return { ...rest, charges };
  });

  const next: Obj = { ...doc, schemaVersion: 2 };
  if (inventory) {
    const { coins: _coins, ...invRest } = inventory;
    next.inventory = { ...invRest, ...(Array.isArray(inventory.items) ? { items: nextItems } : {}) };
  }
  if (!isObj(doc.state)) return next;

  const state: Obj = { ...doc.state, coins: inventory?.coins ?? {}, equipped, chargesSpent: {} };
  next.state = state;

  // Spent = max - current. Max can be an expression ("prof"), which needs the derived context.
  if (Object.keys(chargesLeft).length) {
    const parsed = Character.safeParse(next);
    if (parsed.success) {
      const { charges } = derive(parsed.data).inventory;
      state.chargesSpent = Object.fromEntries(Object.entries(chargesLeft).flatMap(([id, left]) => {
        const max = charges[id]?.max;
        const spent = max === undefined ? 0 : Math.max(0, max - Math.trunc(left));
        return spent > 0 ? [[id, spent]] : [];
      }));
    }
  }
  return next;
}

const STEPS: Record<number, (doc: Obj) => Obj> = { 1: v1ToV2 };

export function migrateCharacter(raw: unknown): unknown {
  if (!isObj(raw)) return raw;
  let doc = raw;
  while (typeof doc.schemaVersion === "number" && doc.schemaVersion < SCHEMA_VERSION && STEPS[doc.schemaVersion]) {
    doc = STEPS[doc.schemaVersion](doc);
  }
  return doc;
}
