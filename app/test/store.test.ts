/**
 * N1.3 (state survives refresh) and F1.12 (undo), against a real Dexie
 * database backed by fake-indexeddb.
 */
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  addItem,
  applyDamage,
  changeCoins,
  changeQuantity,
  derive,
  setEquipped,
  setNotes,
  setTempHp,
  spendResource,
  type Character,
} from "@saltmarsh/schema";
import { examples } from "@saltmarsh/schema/examples";
import { db } from "../src/lib/db";
import { CharacterStore, UNDO_LIMIT, docHash } from "../src/lib/store.svelte";
import { asV1, type V1Doc } from "./v1";

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

  it("a changed example document is refreshed but table state, notes and inventory edits are kept", async () => {
    const s = await reload();
    await s.apply("c_tidewick", c => applyDamage(c, 4));
    await s.apply("c_tidewick", c => setNotes(c, "Owe Skerrin 5 gp"));
    await s.apply("c_tidewick", c => changeQuantity(c, "i-dagger", 2));
    await s.apply("c_tidewick", c => addItem(c, { name: "Sea Charm", category: "magic-item" }));

    const edited = examples.map(raw => {
      const r = raw as { id: string; hpMax: number };
      return r.id === "c_tidewick" ? { ...r, hpMax: 40 } : r;
    });
    expect(docHash(edited[0])).not.toBe(docHash(examples[0]));

    const after = await reload(edited);
    const t = char(after, "c_tidewick");
    expect(derive(t).hpMax).toBe(40);
    expect(t.state.hp.current).toBe(30);
    expect(t.notes).toBe("Owe Skerrin 5 gp");
    expect(t.inventory.items.map(i => [i.name, i.qty])).toEqual([["Dagger", 3], ["Arcane Focus (crystal)", 1], ["Sea Charm", 1]]);
  });

  it("characters saved before schema v2 are upgraded, keeping coins, equipped items, notes and loot", async () => {
    // Kenpachi as the previous version saved him: an example whose seed hash is the old document's.
    const k1 = asV1(examples[1]);
    k1.inventory.coins = { gp: 30, sp: 4 };
    k1.inventory.items.find((i: { id: string }) => i.id === "i-shield").equipped = false;
    k1.inventory.items.push({ id: "i-sea-charm-abc12", name: "Sea Charm", category: "magic-item", qty: 1, equipped: true, attuned: false, requiresAttunement: false });
    k1.notes = "Owes Skerrin";
    k1.state.hp.current = 40;
    // Tidewick imported over the example (locally owned), and a character that isn't an example.
    const t1 = asV1(examples[0]);
    t1.inventory.coins = { pp: 2 };
    const a1: V1Doc = { ...asV1(examples[0]), id: "c_azrael" };
    await db.characters.bulkPut([k1, t1, a1] as unknown as Character[]);
    await db.settings.bulkPut([
      { key: "seed:c_kenpachi", value: docHash(asV1(examples[1])) },
      { key: "seed:c_tidewick", value: "local" },
    ]);
    await db.history.bulkPut([{ id: "c_kenpachi", stack: [{ state: k1.state }] }, { id: "c_azrael", stack: [a1.state] }]);

    const s = await reload();
    const k = char(s, "c_kenpachi");
    expect(k.schemaVersion).toBe(2);
    expect(k.state.coins).toMatchObject({ gp: 30, sp: 4 });
    expect(k.state.equipped).toEqual(["i-warhammer", "i-javelin", "i-pistol", "i-sea-charm-abc12"]);
    expect(derive(k).ac).toBe(9); // shield was off
    expect(k.notes).toBe("Owes Skerrin");
    expect(k.inventory.items.at(-1)?.name).toBe("Sea Charm");
    expect(k.state.hp.current).toBe(40);
    expect(char(s, "c_tidewick").state.coins.pp).toBe(2);
    expect(char(s, "c_azrael").state.equipped).toEqual(["i-dagger", "i-focus"]);

    // Old undo steps can't be restored onto the new shape, so they're dropped.
    expect(s.canUndo("c_kenpachi")).toBe(false);
    expect(s.canUndo("c_azrael")).toBe(false);
    expect(await db.history.count()).toBe(0);
    // Written back as v2, so the next load has nothing to upgrade.
    expect((await db.characters.toArray()).map(c => [c.id, c.schemaVersion]).sort()).toEqual([
      ["c_azrael", 2], ["c_kenpachi", 2], ["c_tidewick", 2],
    ]);
    await s.apply("c_kenpachi", c => changeCoins(c, { gp: -5 }));
    expect(char(await reload(), "c_kenpachi").state.coins.gp).toBe(25);
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

describe("import (F1.1, F1.13)", () => {
  it("replaces an existing character, clears its undo history, and survives reload", async () => {
    const s = await reload();
    await s.apply("c_kenpachi", c => applyDamage(c, 5));
    const imported = addItem(char(s, "c_kenpachi"), { name: "Sea Charm", category: "magic-item" });
    await s.importCharacters([imported]);

    expect(char(s, "c_kenpachi").inventory.items.at(-1)?.name).toBe("Sea Charm");
    expect(s.canUndo("c_kenpachi")).toBe(false);
    expect(s.announcement.text).toBe("Imported Kenpachi");
    expect(char(await reload(), "c_kenpachi").inventory.items.at(-1)?.name).toBe("Sea Charm");
  });

  it("adds a new character after the bundled ones", async () => {
    const s = await reload();
    const azrael = { ...char(s, "c_tidewick"), id: "c_azrael", identity: { ...char(s, "c_tidewick").identity, name: "Azrael" } };
    await s.importCharacters([azrael]);
    expect(s.entries.map(e => e.id)).toEqual(["c_tidewick", "c_kenpachi", "c_azrael"]);
    expect((await reload()).entries.map(e => e.id)).toEqual(["c_tidewick", "c_kenpachi", "c_azrael"]);
  });

  it("a character imported over an example isn't overwritten when the example changes", async () => {
    const s = await reload();
    const edited = { ...char(s, "c_tidewick"), hpMax: 99 };
    await s.importCharacters([edited]);

    const changedExamples = examples.map(raw => {
      const r = raw as { id: string; hpMax: number };
      return r.id === "c_tidewick" ? { ...r, hpMax: 40 } : r;
    });
    expect(derive(char(await reload(changedExamples), "c_tidewick")).hpMax).toBe(99);
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

  it("undo puts back coins and equipped items (state) and item changes (document)", async () => {
    const s = await reload();
    await s.apply("c_kenpachi", c => setEquipped(c, "i-shield", false));
    await s.apply("c_kenpachi", c => changeCoins(c, { gp: 25 }));
    await s.apply("c_kenpachi", c => changeQuantity(c, "i-javelin", 3));
    expect(derive(char(s, "c_kenpachi")).ac).toBe(9);

    await s.undo("c_kenpachi");
    expect(char(s, "c_kenpachi").inventory.items.find(i => i.id === "i-javelin")?.qty).toBe(1);
    expect(char(s, "c_kenpachi").state.coins.gp).toBe(25);
    await s.undo("c_kenpachi");
    expect(char(s, "c_kenpachi").state.coins.gp).toBe(0);
    await s.undo("c_kenpachi");
    expect(derive(char(s, "c_kenpachi")).ac).toBe(11);
  });

  it("undo puts back notes (a document field)", async () => {
    const s = await reload();
    await s.apply("c_tidewick", c => setNotes(c, "Owe Skerrin 5 gp"));
    expect(char(s, "c_tidewick").notes).toBe("Owe Skerrin 5 gp");
    await s.undo("c_tidewick");
    expect(char(s, "c_tidewick").notes).toBe("");
  });

  it("undo history saved before inventory undo (bare states) still works", async () => {
    const s = await reload();
    await s.apply("c_kenpachi", c => applyDamage(c, 5));
    const old = (await db.history.get("c_kenpachi"))!;
    await db.history.put({ id: "c_kenpachi", stack: old.stack.map(x => ("state" in x ? x.state : x)) });

    const after = await reload();
    await after.undo("c_kenpachi");
    expect(char(after, "c_kenpachi").state.hp.current).toBe(51);
  });

  it("each character has its own undo stack", async () => {
    const s = await reload();
    await s.apply("c_kenpachi", c => applyDamage(c, 1));
    expect(s.canUndo("c_kenpachi")).toBe(true);
    expect(s.canUndo("c_tidewick")).toBe(false);
  });
});
