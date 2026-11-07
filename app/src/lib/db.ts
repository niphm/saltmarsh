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

/** Undo stack for one character: previous `state` snapshots, oldest first. */
export interface HistoryRow {
  id: string;
  stack: CharacterState[];
}

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
