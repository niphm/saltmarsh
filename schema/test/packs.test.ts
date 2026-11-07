import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PackMeta, SpellList } from "../src/schema/pack";
import { examples } from "../src/examples";
import { Character } from "../src/schema/character";
import { loadAllSpells } from "./fixtures";

const PACKS = fileURLToPath(new URL("../../packs/", import.meta.url));
const packIds = readdirSync(PACKS, { withFileTypes: true })
  .filter(e => e.isDirectory() && existsSync(join(PACKS, e.name, "pack.json")))
  .map(e => e.name);

const read = (id: string, file: string) => JSON.parse(readFileSync(join(PACKS, id, file), "utf8"));

describe("rules packs", () => {
  it("finds the srd and saltmarsh packs", () => {
    expect(packIds.sort()).toEqual(["saltmarsh", "srd"]);
  });

  it.each(packIds)("%s: pack.json is valid", id => {
    const meta = PackMeta.parse(read(id, "pack.json"));
    expect(meta.id).toBe(id);
    expect(meta.attribution.length).toBeGreaterThan(20);
  });

  it.each(packIds)("%s: spells validate, ids are unique and carry the pack's prefix", id => {
    const spells = SpellList.parse(read(id, "spells.json"));
    const ids = spells.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every(x => x.startsWith(`${id}:spell:`))).toBe(true);
  });

  it("SRD pack: all 339 SRD 5.2 spells, CC-BY attribution, not marked homebrew", () => {
    expect(SpellList.parse(read("srd", "spells.json"))).toHaveLength(339);
    const meta = PackMeta.parse(read("srd", "pack.json"));
    expect(meta.license).toBe("CC-BY-4.0");
    expect(meta.attribution).toContain("System Reference Document 5.2");
    expect(meta.homebrew).toBe(false);
  });

  it("no non-SRD spell sneaks into the SRD pack", () => {
    const srd = new Set(SpellList.parse(read("srd", "spells.json")).map(s => s.id));
    expect(srd.has("srd:spell:blade-ward")).toBe(false);
    expect(srd.has("srd:spell:witch-bolt")).toBe(false);
  });

  it("every spell a bundled character knows resolves to a pack entry", () => {
    const all = loadAllSpells();
    const missing = examples
      .map(raw => Character.parse(raw))
      .flatMap(c => (c.spellcasting?.spells ?? []).map(s => s.ref))
      .filter(ref => !all.has(ref));
    expect(missing).toEqual([]);
  });

  it("spot checks against the SRD text", () => {
    const all = loadAllSpells();
    expect(all.get("srd:spell:hypnotic-pattern")).toMatchObject({ level: 3, school: "illusion", concentration: true, save: "wis" });
    expect(all.get("srd:spell:fog-cloud")).toMatchObject({ level: 1, concentration: true });
    expect(all.get("srd:spell:fireball")).toMatchObject({ level: 3, save: "dex", roll: { kind: "damage", dice: "8d6", types: ["fire"], perSlot: "1d6" } });
    expect(all.get("srd:spell:cure-wounds")?.roll).toMatchObject({ kind: "healing", dice: "2d8", perSlot: "2d8", addSpellMod: true });
    expect(all.get("srd:spell:chill-touch")).toMatchObject({ attack: "melee", roll: { dice: "1d10", cantripScaling: true } });
    expect(all.get("srd:spell:eldritch-blast")?.roll?.cantripScaling).toBe(false); // more beams, not more dice
    expect(all.get("srd:spell:magic-missile")?.roll).toMatchObject({ dice: "1d4", bonus: 1 });
    expect(all.get("srd:spell:misty-step")).toMatchObject({ level: 2, castingTime: "Bonus Action", concentration: false });
    expect(all.get("srd:spell:resistance")?.roll).toBeUndefined();
  });
});
