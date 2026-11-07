import { describe, expect, it } from "vitest";
import { Character } from "@saltmarsh/schema";
import { examples } from "@saltmarsh/schema/examples";
import { BACKUP_KIND, backupJson, characterJson, exportFileName, parseImport } from "../src/lib/backup";

const chars = examples.map(raw => Character.parse(raw));

describe("export (F1.13)", () => {
  it("a backup round-trips through import", () => {
    const text = backupJson(chars, "2026-11-07T20:00:00.000Z");
    const parsed = JSON.parse(text);
    expect(parsed).toMatchObject({ kind: BACKUP_KIND, version: 1, exportedAt: "2026-11-07T20:00:00.000Z" });
    const r = parseImport(text);
    expect(r.ok && r.plan.kind).toBe("backup");
    expect(r.ok && r.plan.characters.map(c => c.id)).toEqual(["c_tidewick", "c_kenpachi"]);
    expect(r.ok && r.plan.characters[0]).toEqual(chars[0]);
  });

  it("a single character export imports as one character", () => {
    const r = parseImport(characterJson(chars[1]));
    expect(r.ok && r.plan.kind).toBe("character");
    expect(r.ok && r.plan.characters.map(c => c.identity.name)).toEqual(["Kenpachi"]);
  });

  it("a plain array of characters also imports", () => {
    const r = parseImport(JSON.stringify(chars));
    expect(r.ok && r.plan.kind).toBe("list");
    expect(r.ok && r.plan.characters).toHaveLength(2);
  });

  it("file names are slugged and dated", () => {
    expect(exportFileName("Tidewick Grayholt", "2026-11-07T20:00:00Z")).toBe("tidewick-grayholt-2026-11-07.json");
    expect(exportFileName("!!!", "2026-11-07")).toBe("saltmarsh-2026-11-07.json");
  });
});

describe("import errors are readable (F1.1)", () => {
  it("not JSON", () => {
    expect(parseImport("{nope")).toEqual({ ok: false, error: "That file isn't valid JSON." });
  });

  it("JSON that isn't a character or backup", () => {
    expect(parseImport('{"hello": "world"}')).toEqual({ ok: false, error: "This doesn't look like a Saltmarsh character or backup." });
    expect(parseImport(`{"kind":"${BACKUP_KIND}"}`)).toEqual({ ok: false, error: "This backup has no characters list." });
    expect(parseImport("[]")).toEqual({ ok: false, error: "The file has no characters in it." });
  });

  it("an invalid character is reported by name with field-level issues; valid ones still import", () => {
    const broken = { ...structuredClone(examples[0] as object), abilityScores: { str: 10 } };
    const r = parseImport(JSON.stringify([broken, examples[1]]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.characters.map(c => c.id)).toEqual(["c_kenpachi"]);
    expect(r.plan.problems).toHaveLength(1);
    expect(r.plan.problems[0].name).toBe("Tidewick Grayholt");
    expect(r.plan.problems[0].issues).toContain("abilityScores.dex: Required");
  });
});
