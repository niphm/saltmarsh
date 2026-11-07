/**
 * Local IndexedDB store (Dexie). Writes land here first (N1.3, principle 4);
 * Phase 2 sync will read from here.
 */
import Dexie, { type EntityTable } from "dexie";
import type { Character, CharacterState } from "@saltmarsh/schema";

export interface SettingRow {
  key: string;
  value: unknown;
}

/** What undo puts back: the previous state, plus the previous inventory when the change touched it. */
export interface UndoStep {
  state: CharacterState;
  inventory?: Character["inventory"];
}

/** Undo stack for one character, oldest first. Rows saved before inventory undo hold bare states. */
export interface HistoryRow {
  id: string;
  stack: (UndoStep | CharacterState)[];
}

/** Normalize a stored stack entry (old rows stored the state itself). */
export const toUndoStep = (x: UndoStep | CharacterState): UndoStep => ("hp" in x ? { state: x } : x);

export const db = new Dexie("saltmarsh") as Dexie & {
  /** One record per character id (README rule 4: no level in storage keys). */
  characters: EntityTable<Character, "id">;
  settings: EntityTable<SettingRow, "key">;
  history: EntityTable<HistoryRow, "id">;
};

db.version(1).stores({
  characters: "id, partyId, updatedAt",
  settings: "key",
  history: "id",
});
