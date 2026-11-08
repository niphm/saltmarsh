/**
 * Pure merge of bundled examples with what's saved in IndexedDB. No I/O here;
 * the store reads/writes and calls this.
 */
import { migrateCharacter, type Character } from "@saltmarsh/schema";
import { loadCharacter, type LoadResult } from "./characters";
import type { SettingRow } from "./db";

export const SEED_PREFIX = "seed:";

/** Seed value meaning "this device's copy owns the document" (imported): never refresh it from the example. */
export const SEED_LOCAL = "local";

export const nowIso = () => new Date().toISOString();

/** Hash of an example's document without its table state - detects repo edits to the example. */
export function docHash(raw: unknown): string {
  const { state: _state, ...doc } = (raw ?? {}) as Record<string, unknown>;
  const s = JSON.stringify(doc);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export interface SeedPlan {
  entries: LoadResult[];
  /** Characters to (re)write to IndexedDB. */
  writes: Character[];
  seedWrites: SettingRow[];
  /**
   * Saved characters that were on an older schema version and have been
   * upgraded (and are in `writes`). Their undo history holds old-shape
   * states, so the store drops it.
   */
  upgraded: string[];
}

/**
 * The example's new document, keeping what the player changes in the app:
 * table state, notes, and each item's quantity and attunement, plus items
 * they added. An item removed from the example stays if the saved copy has it.
 */
export function refreshExample(fresh: Character, saved: Character): Character {
  const savedItems = new Map(saved.inventory.items.map(i => [i.id, i]));
  const freshIds = new Set(fresh.inventory.items.map(i => i.id));
  const items = [
    ...fresh.inventory.items.map(i => {
      const s = savedItems.get(i.id);
      return s ? { ...i, qty: s.qty, attuned: s.attuned } : i;
    }),
    ...saved.inventory.items.filter(i => !freshIds.has(i.id)),
  ];
  return { ...fresh, inventory: { ...fresh.inventory, items }, notes: saved.notes, state: saved.state };
}

/**
 * Saved copies are first upgraded to the current schema version (written
 * back, listed in `upgraded`). Then:
 * - Example never saved: seed it.
 * - Saved and the example's document is unchanged: use the saved copy.
 * - Saved but the example's document changed in the repo: the new document
 *   with the player's state, notes and inventory edits kept (refreshExample).
 * - Saved copy no longer validates: reseed from the example (keeping its table state if that still fits).
 * - Saved copy was imported over the example (seed = SEED_LOCAL): always use the saved copy.
 * - Saved characters that aren't examples are kept, after the examples.
 */
export function planSeed(bundled: readonly unknown[], stored: readonly unknown[], seeds: readonly SettingRow[]): SeedPlan {
  const plan: SeedPlan = { entries: [], writes: [], seedWrites: [], upgraded: [] };
  const storedById = new Map<string, unknown>();
  for (const raw of stored) {
    const id = (raw as { id?: unknown } | null)?.id;
    if (typeof id !== "string") continue;
    const doc = migrateCharacter(raw);
    if (doc !== raw) plan.upgraded.push(id);
    storedById.set(id, doc);
  }
  const seedById = new Map(seeds.map(r => [r.key, r.value]));

  /** A saved copy used as is; written back if it was just upgraded. */
  const keep = (r: LoadResult): LoadResult => {
    if (r.ok && plan.upgraded.includes(r.id)) plan.writes.push(r.character);
    return r;
  };

  bundled.forEach((raw, i) => {
    const fresh = loadCharacter(raw, `example-${i + 1}`);
    if (!fresh.ok) {
      plan.entries.push(fresh);
      return;
    }
    const seedKey = SEED_PREFIX + fresh.id;
    const hash = docHash(raw);
    const saved = storedById.get(fresh.id);
    storedById.delete(fresh.id);

    if (saved && seedById.get(seedKey) === SEED_LOCAL) {
      // Imported over the example: keep it as is, even if it no longer validates (show the error, don't overwrite).
      plan.entries.push(keep(loadCharacter(saved, fresh.id)));
      return;
    }

    const parsed = saved ? loadCharacter(saved, fresh.id) : undefined;
    if (parsed && seedById.get(seedKey) === hash) {
      if (parsed.ok) {
        plan.entries.push(keep(parsed));
        return;
      }
      console.warn(`Saved copy of ${fresh.id} no longer validates; reseeding`, parsed.issues);
    }

    let next: LoadResult = fresh;
    if (parsed?.ok) {
      const merged = loadCharacter(refreshExample(fresh.character, parsed.character), fresh.id);
      if (merged.ok) next = merged;
    } else if (saved) {
      const merged = loadCharacter({ ...fresh.character, state: (saved as { state?: unknown }).state }, fresh.id);
      if (merged.ok) next = merged;
    }
    plan.entries.push(next);
    if (next.ok) plan.writes.push(next.character);
    plan.seedWrites.push({ key: seedKey, value: hash });
  });

  for (const [id, saved] of storedById) plan.entries.push(keep(loadCharacter(saved, id)));
  return plan;
}
