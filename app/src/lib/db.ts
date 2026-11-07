/**
 * Local IndexedDB store (Dexie). Phase 1 scaffold: the read-only sheet still
 * renders straight from the bundled examples. F1.3+ will write table state
 * here so it survives refresh and works offline (N1.3).
 */
import Dexie, { type EntityTable } from "dexie";
import type { Character } from "@saltmarsh/schema";

export interface SettingRow {
  key: string;
  value: unknown;
}

export const db = new Dexie("saltmarsh") as Dexie & {
  /** One record per character id (README rule 4: no level in storage keys). */
  characters: EntityTable<Character, "id">;
  settings: EntityTable<SettingRow, "key">;
};

db.version(1).stores({
  characters: "id, partyId, updatedAt",
  settings: "key",
});
