import { describe, expect, it } from "vitest";
import { Character, LOG_LIMIT, applyDamage, setNotes, toggleCondition, type CharacterState } from "@saltmarsh/schema";
import { examples } from "@saltmarsh/schema/examples";
import { loadCharacter } from "../src/lib/characters";
import {
  docChanged,
  joinCharacter,
  localWins,
  mergeLogs,
  parseSummary,
  resolveState,
  splitCharacter,
  summarize,
} from "../src/lib/sync/merge";

const kenpachi = () => Character.parse(structuredClone(examples[1]));
const entry = (at: string, change: string) => ({ at, change });
const withLog = (s: CharacterState, log: CharacterState["log"]) => ({ ...s, log });

describe("splitting and joining (doc vs state rows)", () => {
  it("round-trips through loadCharacter", () => {
    const k = kenpachi();
    const { doc, state } = splitCharacter(k);
    expect(doc).not.toHaveProperty("state");
    const back = loadCharacter(JSON.parse(JSON.stringify(joinCharacter(doc, state))), "x");
    expect(back.ok && back.character).toEqual(k);
  });

  it("a v1 document from an older client is upgraded when joined", () => {
    const k = kenpachi();
    const { doc, state } = splitCharacter(k);
    const { coins: _c, equipped: _e, chargesSpent: _s, ...oldState } = state;
    const oldDoc = { ...doc, schemaVersion: 1, inventory: { coins: { gp: 9 }, items: doc.inventory.items.map(i => ({ ...i, equipped: true })) } };
    const back = loadCharacter(joinCharacter(oldDoc, oldState), "x");
    expect(back.ok && back.character.state.coins.gp).toBe(9);
  });

  it("docChanged sees document edits but not table-state changes", () => {
    const k = kenpachi();
    expect(docChanged(k, applyDamage(k, 5))).toBe(false);
    expect(docChanged(k, toggleCondition(k, "prone"))).toBe(false);
    expect(docChanged(k, setNotes(k, "Owes Skerrin"))).toBe(true);
  });
});

describe("last write wins (F2.2)", () => {
  it("newer edit wins; a tie goes to the server", () => {
    expect(localWins({ value: 1, editedAt: "2026-11-08T10:00:01Z" }, { value: 2, editedAt: "2026-11-08T10:00:00Z" })).toBe(true);
    expect(localWins({ value: 1, editedAt: "2026-11-08T10:00:00Z" }, { value: 2, editedAt: "2026-11-08T10:00:00.000+00:00" })).toBe(false);
  });

  it("merges logs without duplicates, oldest first, capped", () => {
    const a = [entry("2026-11-08T10:00:00Z", "rage on"), entry("2026-11-08T10:02:00Z", "hp -5")];
    const b = [entry("2026-11-08T10:00:00.000+00:00", "rage on"), entry("2026-11-08T10:01:00Z", "prone on")];
    expect(mergeLogs(a, b).map(e => e.change)).toEqual(["rage on", "prone on", "hp -5"]);
    const many = Array.from({ length: LOG_LIMIT + 10 }, (_, i) => entry(new Date(Date.UTC(2026, 10, 8, 0, i)).toISOString(), `c${i}`));
    expect(mergeLogs(many, [])).toHaveLength(LOG_LIMIT);
    expect(mergeLogs(many, []).at(-1)?.change).toBe(`c${LOG_LIMIT + 9}`);
  });

  it("server newer: take its values, keep this device's log entries, and push them back", () => {
    const k = kenpachi();
    const mine = withLog(applyDamage(k, 10).state, [entry("2026-11-08T10:00:00Z", "hp -10")]);
    const theirs = withLog(applyDamage(k, 3).state, [entry("2026-11-08T10:05:00Z", "hp -3")]);
    const r = resolveState({ value: mine, editedAt: "2026-11-08T10:00:00Z" }, { value: theirs, editedAt: "2026-11-08T10:05:00Z" });
    expect(r.state.hp.current).toBe(48);
    expect(r.state.log.map(e => e.change)).toEqual(["hp -10", "hp -3"]);
    expect(r.editedAt).toBe("2026-11-08T10:05:00Z");
    expect(r.push).toBe(true);
  });

  it("server newer and nothing extra here: just adopt it", () => {
    const s = kenpachi().state;
    const log = [entry("2026-11-08T10:00:00Z", "rage on")];
    const r = resolveState({ value: withLog(s, log), editedAt: "2026-11-08T10:00:00Z" }, { value: withLog(s, log), editedAt: "2026-11-08T10:01:00Z" });
    expect(r.push).toBe(false);
  });

  it("this device newer: keep its values and push", () => {
    const k = kenpachi();
    const r = resolveState(
      { value: applyDamage(k, 10).state, editedAt: "2026-11-08T10:09:00Z" },
      { value: applyDamage(k, 3).state, editedAt: "2026-11-08T10:05:00Z" },
    );
    expect(r.state.hp.current).toBe(41);
    expect(r.push).toBe(true);
  });
});

describe("party strip summary (F2.7)", () => {
  it("comes from derive() and validates", () => {
    const k = applyDamage(kenpachi(), 40);
    const s = summarize(k);
    expect(s).toEqual({ name: "Kenpachi", hpMax: 51, hpBand: "critical", life: "alive", ac: 11 });
    expect(parseSummary(JSON.parse(JSON.stringify(s)))).toEqual(s);
    expect(parseSummary({ name: "X" })).toBeNull();
    expect(parseSummary({ ...s, hpBand: "fine" })).toBeNull();
  });
});
