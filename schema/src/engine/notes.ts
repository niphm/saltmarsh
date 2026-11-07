/** The player's markdown scratchpad (F1.14). Part of the document, not table state. */
import type { Character } from "../schema/character";
import { stamp } from "./log";

/** Replace the notes. Unchanged text is a no-op. */
export function setNotes(c: Character, notes: string): Character {
  if (notes === c.notes) return c;
  return { ...c, notes, state: { ...c.state, log: stamp(c, "notes edited") }, updatedAt: new Date().toISOString() };
}
