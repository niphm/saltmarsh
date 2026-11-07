/**
 * Characters in memory, persisted to IndexedDB on every change (N1.3), with
 * an undo stack per character (F1.12).
 *
 * Every change is an engine function (Character -> Character). The store
 * never edits a character itself: it swaps in what the engine returns, saves
 * it, and keeps what changed (state, and inventory if touched) so undo can
 * put it back.
 */
import type { Character } from "@saltmarsh/schema";
import { examples } from "@saltmarsh/schema/examples";
import { db, toUndoStep, type UndoStep } from "./db";
import { loadCharacter, type LoadResult } from "./characters";
import { SEED_LOCAL, SEED_PREFIX, nowIso, planSeed } from "./seed";

export { docHash } from "./seed";

export const UNDO_LIMIT = 50;

export type Change = (c: Character) => Character;

export class CharacterStore {
  entries = $state.raw<LoadResult[]>([]);
  undoStacks = $state.raw<Record<string, UndoStep[]>>({});
  ready = $state(false);
  /** Set when changes can't be saved on this device (storage blocked or a write failed). */
  storageError = $state<string | null>(null);
  /** Last change, for the screen-reader live region. `seq` changes even when the text repeats. */
  announcement = $state({ text: "", seq: 0 });

  #bundled: readonly unknown[] = examples;

  /** Load saved characters, seeding/refreshing the bundled examples (see planSeed). */
  async init(bundled: readonly unknown[] = examples) {
    this.#bundled = bundled;
    let plan;
    let history;
    try {
      const [stored, hist, seeds] = await Promise.all([
        db.characters.toArray(),
        db.history.toArray(),
        db.settings.where("key").startsWith(SEED_PREFIX).toArray(),
      ]);
      plan = planSeed(bundled, stored, seeds);
      history = hist;
    } catch (e) {
      console.error("IndexedDB unavailable", e);
      this.storageError = "This browser isn't letting Saltmarsh save. Changes will be lost when you close the page.";
      this.entries = bundled.map((raw, i) => loadCharacter(raw, `example-${i + 1}`));
      this.ready = true;
      return;
    }

    this.entries = plan.entries;
    this.undoStacks = Object.fromEntries(history.map(h => [h.id, h.stack.map(toUndoStep)]));
    this.ready = true;

    const { writes, seedWrites } = plan;
    if (writes.length || seedWrites.length) {
      await this.#persist(() =>
        db.transaction("rw", db.characters, db.settings, async () => {
          await db.characters.bulkPut(writes);
          await db.settings.bulkPut(seedWrites);
        }),
      );
    }
  }

  find(id: string | undefined): LoadResult | undefined {
    return this.entries.find(e => e.id === id);
  }

  /** Every character that loaded cleanly. */
  get characters(): Character[] {
    return this.entries.flatMap(e => (e.ok ? [e.character] : []));
  }

  canUndo(id: string): boolean {
    return (this.undoStacks[id]?.length ?? 0) > 0;
  }

  /** Apply an engine function to a character, save it, and remember what it replaced for undo. */
  async apply(id: string, change: Change): Promise<void> {
    const entry = this.find(id);
    if (!entry?.ok) return;
    const prev = entry.character;
    const next = change(prev);
    if (next === prev) return; // engine no-op: nothing to save or undo

    const step: UndoStep = {
      state: prev.state,
      ...(next.inventory !== prev.inventory ? { inventory: prev.inventory } : {}),
      ...(next.notes !== prev.notes ? { notes: prev.notes } : {}),
    };
    const stack = [...(this.undoStacks[id] ?? []), step].slice(-UNDO_LIMIT);
    this.#replace(id, next);
    this.undoStacks = { ...this.undoStacks, [id]: stack };
    this.#announce(next.state.log.at(-1)?.change ?? "Updated");
    await this.#save(next, stack);
  }

  /** Put back what the last change replaced (which also pops that change off state.log). */
  async undo(id: string): Promise<void> {
    const entry = this.find(id);
    const stack = this.undoStacks[id];
    if (!entry?.ok || !stack?.length) return;
    const step = stack[stack.length - 1];
    const undone = entry.character.state.log.at(-1)?.change;
    const next: Character = {
      ...entry.character,
      state: step.state,
      ...(step.inventory ? { inventory: step.inventory } : {}),
      ...(step.notes !== undefined ? { notes: step.notes } : {}),
      updatedAt: nowIso(),
    };
    const rest = stack.slice(0, -1);
    this.#replace(id, next);
    this.undoStacks = { ...this.undoStacks, [id]: rest };
    this.#announce(undone ? `Undid: ${undone}` : "Undid last change");
    await this.#save(next, rest);
  }

  /**
   * Add or replace characters from an import (F1.1, F1.13). Replaced
   * characters lose their undo history. One imported over a bundled example
   * is marked locally owned, so a later change to the example won't overwrite it.
   */
  async importCharacters(incoming: Character[]): Promise<void> {
    if (!incoming.length) return;
    // Plain copies: a caller's reactive $state proxy would make IndexedDB's structured clone throw.
    const chars = incoming.map(c => $state.snapshot(c) as Character);
    const bundledIds = this.#bundled.map(raw => (raw as { id?: unknown } | null)?.id).filter(id => typeof id === "string");
    const entries = [...this.entries];
    for (const c of chars) {
      const entry: LoadResult = { ok: true, id: c.id, name: c.identity.name, character: c };
      const i = entries.findIndex(e => e.id === c.id);
      if (i >= 0) entries[i] = entry;
      else entries.push(entry);
    }
    const ids = chars.map(c => c.id);
    const undo = { ...this.undoStacks };
    for (const id of ids) delete undo[id];
    this.entries = entries;
    this.undoStacks = undo;
    this.#announce(`Imported ${chars.map(c => c.identity.name).join(", ")}`);

    await this.#persist(() =>
      db.transaction("rw", db.characters, db.history, db.settings, async () => {
        await db.characters.bulkPut(chars);
        await db.history.bulkDelete(ids);
        await db.settings.bulkPut(ids.filter(id => bundledIds.includes(id)).map(id => ({ key: SEED_PREFIX + id, value: SEED_LOCAL })));
      }),
    );
  }

  /** Forget all local changes and reload the bundled examples. */
  async reset(): Promise<void> {
    await this.#persist(() =>
      db.transaction("rw", db.characters, db.history, db.settings, async () => {
        await db.characters.clear();
        await db.history.clear();
        await db.settings.where("key").startsWith(SEED_PREFIX).delete();
      }),
    );
    this.undoStacks = {};
    await this.init(this.#bundled);
    this.#announce("Local data reset");
  }

  #replace(id: string, character: Character) {
    this.entries = this.entries.map(e => (e.id === id ? { ok: true, id, name: character.identity.name, character } : e));
  }

  #announce(text: string) {
    this.announcement = { text, seq: this.announcement.seq + 1 };
  }

  #save(character: Character, stack: UndoStep[]) {
    return this.#persist(() =>
      db.transaction("rw", db.characters, db.history, async () => {
        await db.characters.put(character);
        await db.history.put({ id: character.id, stack });
      }),
    );
  }

  async #persist(write: () => Promise<unknown>) {
    try {
      await write();
    } catch (e) {
      console.error("Save failed", e);
      this.storageError = "Couldn't save the last change on this device. It will be lost when you close the page.";
    }
  }
}

export const characters = new CharacterStore();
