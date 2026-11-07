/**
 * N1.3 (state survives refresh) and F1.12 (undo), against a real Dexie
 * database backed by fake-indexeddb.
 */
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { applyDamage, derive, setTempHp, spendResource, type Character } from "@saltmarsh/schema";
import { examples } from "@saltmarsh/schema/examples";
import { db } from "../src/lib/db";
import { CharacterStore, UNDO_LIMIT, docHash } from "../src/lib/store.svelte";

const char = (s: CharacterStore, id: string): Character => {
  const e = s.find(id);
  if (!e?.ok) throw new Error(`${id} not loaded`);
  return e.character;
};

/** A fresh store over the same database = a page reload. */
async function reload(bundled: readonly unknown[] = examples) {
  const s = new CharacterStore();
  await s.init(bundled);
  return s;
}

beforeEach(async () => {
  await db.delete({ disableAutoOpen: false });
  await db.open();
});

describe("persistence (N1.3)", () => {
  it("seeds the bundled examples on first run", async () => {
    const s = await reload();
    expect(s.ready).toBe(true);
    expect(s.entries.map(e => e.id)).toEqual(["c_tidewick", "c_kenpachi"]);
    expect((await db.characters.toArray()).map(c => c.id).sort()).toEqual(["c_kenpachi", "c_tidewick"]);
    expect(s.storageError).toBeNull();
  });

  it("table state survives a reload", async () => {
    const s = await reload();
    await s.apply("c_kenpachi", c => spendResource(c, "rage-uses", 2));
    await s.apply("c_kenpachi", c => applyDamage(c, 10));

    const after = await reload();
    const k = char(after, "c_kenpachi");
    expect(derive(k).resources.find(r => r.id === "rage-uses")?.remaining).toBe(1);
    expect(k.state.hp.current).toBe(41);
  });

  it("a changed example document is refreshed but table state is kept", async () => {
    const s = await reload();
    await s.apply("c_tidewick", c => applyDamage(c, 4));

    const edited = examples.map(raw => {
      const r = raw as { id: string; hpMax: number };
      return r.id === "c_tidewick" ? { ...r, hpMax: 40 } : r;
    });
    expect(docHash(edited[0])).not.toBe(docHash(examples[0]));

    const after = await reload(edited);
    const t = char(after, "c_tidewick");
    expect(derive(t).hpMax).toBe(40);
    expect(t.state.hp.current).toBe(30);
  });

  it("a saved copy that no longer validates is reseeded from the example", async () => {
    await reload();
    const broken = { ...(await db.characters.get("c_kenpachi"))!, abilityScores: { str: 19 } } as unknown as Character;
    await db.characters.put(broken);
    const after = await reload();
    expect(after.find("c_kenpachi")?.ok).toBe(true);
  });

  it("reset forgets local changes", async () => {
    const s = await reload();
    await s.apply("c_kenpachi", c => applyDamage(c, 10));
    await s.reset();
    expect(char(s, "c_kenpachi").state.hp.current).toBe(51);
    expect(s.canUndo("c_kenpachi")).toBe(false);
    expect(char(await reload(), "c_kenpachi").state.hp.current).toBe(51);
  });
});

describe("undo (F1.12)", () => {
  it("restores the previous state and pops the log entry", async () => {
    const s = await reload();
    await s.apply("c_kenpachi", c => setTempHp(c, 4));
    await s.apply("c_kenpachi", c => applyDamage(c, 10));
    expect(char(s, "c_kenpachi").state.log.at(-1)?.change).toBe("hp -10 (4 temp)");

    await s.undo("c_kenpachi");
    const k = char(s, "c_kenpachi");
    expect(k.state.hp).toMatchObject({ current: 51, temp: 4 });
    expect(k.state.log.at(-1)?.change).toBe("temp hp 4");
    expect(s.announcement.text).toBe("Undid: hp -10 (4 temp)");
  });

  it("undo history survives a reload", async () => {
    const s = await reload();
    await s.apply("c_kenpachi", c => applyDamage(c, 10));
    const after = await reload();
    expect(after.canUndo("c_kenpachi")).toBe(true);
    await after.undo("c_kenpachi");
    expect(char(after, "c_kenpachi").state.hp.current).toBe(51);
  });

  it("engine no-ops don't save or add undo steps", async () => {
    const s = await reload();
    await s.apply("c_kenpachi", c => applyDamage(c, 0));
    expect(s.canUndo("c_kenpachi")).toBe(false);
  });

  it("undo with nothing to undo does nothing", async () => {
    const s = await reload();
    const before = char(s, "c_kenpachi");
    await s.undo("c_kenpachi");
    expect(char(s, "c_kenpachi")).toBe(before);
  });

  it(`keeps at most ${UNDO_LIMIT} steps`, async () => {
    const s = await reload();
    for (let i = 0; i < UNDO_LIMIT + 5; i++) {
      await s.apply("c_kenpachi", c => setTempHp(c, i + 1));
    }
    expect(s.undoStacks["c_kenpachi"]).toHaveLength(UNDO_LIMIT);
  });

  it("each character has its own undo stack", async () => {
    const s = await reload();
    await s.apply("c_kenpachi", c => applyDamage(c, 1));
    expect(s.canUndo("c_kenpachi")).toBe(true);
    expect(s.canUndo("c_tidewick")).toBe(false);
  });
});
