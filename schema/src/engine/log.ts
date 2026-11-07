import type { Character } from "../schema/character";

/** Max entries kept in `state.log` (undo history and the DM's combat log). */
export const LOG_LIMIT = 50;

/** Append a change to the state log, keeping the last LOG_LIMIT entries. */
export const stamp = (c: Character, change: string): Character["state"]["log"] =>
  [...c.state.log.slice(-(LOG_LIMIT - 1)), { at: new Date().toISOString(), change }];
