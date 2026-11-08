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

/** What undo puts back: the previous state, plus any document field the change touched. */
export interface UndoStep {
  state: CharacterState;
  inventory?: Character["inventory"];
  notes?: string;
}

/** Undo stack for one character, oldest first. Rows saved before inventory undo hold bare states. */
export interface HistoryRow {
  id: string;
  stack: (UndoStep | CharacterState)[];
}

/** Normalize a stored stack entry (old rows stored the state itself). */
export const toUndoStep = (x: UndoStep | CharacterState): UndoStep => ("hp" in x ? { state: x } : x);

/**
 * Sync bookkeeping for a character linked to an account (F2.2). Versions are
 * the server row versions this device last saw (null = not on the server
 * yet); edit times are when this device last changed each part.
 */
export interface SyncMeta {
  id: string;
  ownerId: string;
  docVersion: number | null;
  stateVersion: number | null;
  docEditedAt: string;
  stateEditedAt: string;
  docDirty: boolean;
  stateDirty: boolean;
  partyId: string | null;
}

export const db = new Dexie("saltmarsh") as Dexie & {
  /** One record per character id (README rule 4: no level in storage keys). */
  characters: EntityTable<Character, "id">;
  settings: EntityTable<SettingRow, "key">;
  history: EntityTable<HistoryRow, "id">;
  sync: EntityTable<SyncMeta, "id">;
};

db.version(1).stores({
  characters: "id, partyId, updatedAt",
  settings: "key",
  history: "id",
});

db.version(2).stores({
  sync: "id, ownerId",
});
