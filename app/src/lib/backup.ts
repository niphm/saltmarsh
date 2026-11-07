/**
 * Export and import (F1.1, F1.13). A character export is the Character
 * document itself; a backup wraps every character on the device. Imports
 * accept either (or a plain array of characters) and validate each with Zod.
 */
import type { Character } from "@saltmarsh/schema";
import { loadCharacter } from "./characters";

export const BACKUP_KIND = "saltmarsh-backup";
export const BACKUP_VERSION = 1;

export interface Backup {
  kind: typeof BACKUP_KIND;
  version: number;
  exportedAt: string;
  characters: Character[];
}

export const characterJson = (c: Character) => `${JSON.stringify(c, null, 2)}\n`;

export function backupJson(chars: Character[], exportedAt: string): string {
  const backup: Backup = { kind: BACKUP_KIND, version: BACKUP_VERSION, exportedAt, characters: chars };
  return `${JSON.stringify(backup, null, 2)}\n`;
}

/** "tidewick-grayholt-2026-11-07.json" */
export function exportFileName(name: string, isoDate: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "saltmarsh";
  return `${slug}-${isoDate.slice(0, 10)}.json`;
}

export interface ImportPlan {
  kind: "backup" | "character" | "list";
  /** Valid characters, ready to import. */
  characters: Character[];
  /** Documents that failed validation, with readable field errors. */
  problems: { name: string; issues: string[] }[];
}

export type ImportResult = { ok: true; plan: ImportPlan } | { ok: false; error: string };

export function parseImport(text: string): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file isn't valid JSON." };
  }

  let kind: ImportPlan["kind"];
  let docs: unknown[];
  if (Array.isArray(data)) {
    kind = "list";
    docs = data;
  } else if (data && typeof data === "object" && (data as { kind?: unknown }).kind === BACKUP_KIND) {
    const list = (data as { characters?: unknown }).characters;
    if (!Array.isArray(list)) return { ok: false, error: "This backup has no characters list." };
    kind = "backup";
    docs = list;
  } else if (data && typeof data === "object" && "schemaVersion" in data) {
    kind = "character";
    docs = [data];
  } else {
    return { ok: false, error: "This doesn't look like a Saltmarsh character or backup." };
  }

  const plan: ImportPlan = { kind, characters: [], problems: [] };
  docs.forEach((doc, i) => {
    const r = loadCharacter(doc, `imported-${i + 1}`);
    if (r.ok) plan.characters.push(r.character);
    else plan.problems.push({ name: r.name, issues: r.issues });
  });
  if (!plan.characters.length && !plan.problems.length) return { ok: false, error: "The file has no characters in it." };
  return { ok: true, plan };
}
