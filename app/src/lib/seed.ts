/**
 * Pure merge of bundled examples with what's saved in IndexedDB. No I/O here;
 * the store reads/writes and calls this.
 */
import type { Character } from "@saltmarsh/schema";
import { loadCharacter, type LoadResult } from "./characters";
import type { SettingRow } from "./db";

export const SEED_PREFIX = "seed:";

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
}

/**
 * - Example never saved: seed it.
 * - Saved and the example's document is unchanged: use the saved copy.
 * - Saved but the example's document changed in the repo: new document, saved table state (doc vs state, F2.2).
 * - Saved copy no longer validates: reseed from the example.
 * - Saved characters that aren't examples are kept, after the examples.
 */
export function planSeed(bundled: readonly unknown[], stored: readonly Character[], seeds: readonly SettingRow[]): SeedPlan {
  const storedById = new Map(stored.map(c => [c.id, c]));
  const seedById = new Map(seeds.map(r => [r.key, r.value]));
  const plan: SeedPlan = { entries: [], writes: [], seedWrites: [] };

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

    if (saved && seedById.get(seedKey) === hash) {
      const parsed = loadCharacter(saved, fresh.id);
      if (parsed.ok) {
        plan.entries.push(parsed);
        return;
      }
      console.warn(`Saved copy of ${fresh.id} no longer validates; reseeding`, parsed.issues);
    }

    let next: LoadResult = fresh;
    if (saved) {
      const merged = loadCharacter({ ...fresh.character, state: saved.state }, fresh.id);
      if (merged.ok) next = merged;
    }
    plan.entries.push(next);
    if (next.ok) plan.writes.push(next.character);
    plan.seedWrites.push({ key: seedKey, value: hash });
  });

  for (const saved of storedById.values()) plan.entries.push(loadCharacter(saved, saved.id));
  return plan;
}
