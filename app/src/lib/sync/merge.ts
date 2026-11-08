/**
 * Pure pieces of character sync (F2.2). Conflicts resolve last-write-wins
 * per top-level field (`doc` vs `state`) by edit time, and the state log
 * keeps every entry from both sides.
 */
import { LOG_LIMIT, derive, type Character, type CharacterState, type HpBand, type Life } from "@saltmarsh/schema";

export type CharacterDoc = Omit<Character, "state">;
type LogEntry = CharacterState["log"][number];

export function splitCharacter(c: Character): { doc: CharacterDoc; state: CharacterState } {
  const { state, ...doc } = c;
  return { doc, state };
}

/** Raw (unvalidated) document + state from the server, ready for loadCharacter(). */
export function joinCharacter(doc: unknown, state: unknown): unknown {
  return { ...(doc as object), state };
}

/** Did anything outside `state` change? Engine changes keep untouched fields by reference. */
export function docChanged(prev: Character, next: Character): boolean {
  return (Object.keys(next) as (keyof Character)[]).some(k => k !== "state" && k !== "updatedAt" && next[k] !== prev[k]);
}

const time = (iso: string) => Date.parse(iso) || 0;

export const sameInstant = (a: string, b: string) => time(a) === time(b);

/** Both logs, oldest first, without duplicates, capped like the engine's log. */
export function mergeLogs(a: LogEntry[], b: LogEntry[]): LogEntry[] {
  const byKey = new Map<string, LogEntry>();
  for (const e of [...a, ...b]) byKey.set(`${time(e.at)}|${e.by ?? ""}|${e.change}`, e);
  return [...byKey.values()].sort((x, y) => time(x.at) - time(y.at)).slice(-LOG_LIMIT);
}

const sameLog = (a: LogEntry[], b: LogEntry[]) =>
  a.length === b.length && a.every((e, i) => time(e.at) === time(b[i].at) && e.change === b[i].change && e.by === b[i].by);

export interface Edit<T> {
  value: T;
  editedAt: string;
}

/** The newer edit wins; a tie goes to the server copy, which other devices already have. */
export const localWins = (local: Edit<unknown>, remote: Edit<unknown>) => time(local.editedAt) > time(remote.editedAt);

/**
 * Resolve a state conflict. The winner's values, with both logs merged.
 * `push` is true when the server copy needs the result (local won, or the
 * server is missing log entries that only this device has).
 */
export function resolveState(
  local: Edit<CharacterState>,
  remote: Edit<CharacterState>,
): { state: CharacterState; editedAt: string; push: boolean; localWon: boolean; localChanged: boolean } {
  const mine = localWins(local, remote);
  const winner = mine ? local : remote;
  const log = mergeLogs(local.value.log, remote.value.log);
  return {
    state: { ...winner.value, log },
    editedAt: winner.editedAt,
    push: mine || !sameLog(log, remote.value.log),
    localWon: mine,
    localChanged: !mine || !sameLog(log, local.value.log),
  };
}

/** What party members see for the party strip (F2.7), computed by derive(). */
export interface CharacterSummary {
  name: string;
  hpMax: number;
  hpBand: HpBand;
  life: Life;
  ac: number;
}

export function summarize(c: Character): CharacterSummary {
  const d = derive(c);
  return { name: c.identity.name, hpMax: d.hpMax, hpBand: d.hpBand, life: d.life, ac: d.ac };
}

const BANDS: readonly HpBand[] = ["full", "injured", "critical", "down"];
const LIVES: readonly Life[] = ["alive", "dying", "stable", "dead"];

/** Validate a summary from the server (another client wrote it). */
export function parseSummary(x: unknown): CharacterSummary | null {
  const s = x as Partial<CharacterSummary> | null;
  if (!s || typeof s.name !== "string" || typeof s.hpMax !== "number" || typeof s.ac !== "number") return null;
  if (!BANDS.includes(s.hpBand as HpBand) || !LIVES.includes(s.life as Life)) return null;
  return { name: s.name, hpMax: s.hpMax, hpBand: s.hpBand as HpBand, life: s.life as Life, ac: s.ac };
}
