import { describe, expect, it } from "vitest";
import { bundled, loadCharacter } from "../src/lib/characters";
import { parseHash } from "../src/lib/routes";

describe("bundled examples (F1.1)", () => {
  it("Tidewick and Kenpachi load and validate, in that order", () => {
    expect(bundled.map(c => [c.ok, c.id, c.name])).toEqual([
      [true, "c_tidewick", "Tidewick Grayholt"],
      [true, "c_kenpachi", "Kenpachi"],
    ]);
  });

  it("an invalid document gives readable field-level errors instead of throwing", () => {
    const r = loadCharacter({ id: "c_bad", identity: { name: "Broken Bob" }, schemaVersion: 1 }, "fallback");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.id).toBe("c_bad");
    expect(r.name).toBe("Broken Bob");
    expect(r.issues).toContain("ownerId: Required");
    expect(r.issues.some(i => i.startsWith("identity.species"))).toBe(true);
  });

  it("garbage input still produces a result", () => {
    const r = loadCharacter(null, "fallback");
    expect(r).toMatchObject({ ok: false, id: "fallback", name: "Unnamed character" });
  });
});

describe("parseHash", () => {
  it.each([
    ["", { name: "sheet" }],
    ["#/", { name: "sheet" }],
    ["#/settings", { name: "settings" }],
    ["#/c/c_kenpachi", { name: "sheet", id: "c_kenpachi" }],
    ["#/c/a%20b", { name: "sheet", id: "a b" }],
    ["#/nonsense", { name: "sheet" }],
  ])("%s", (hash, route) => {
    expect(parseHash(hash)).toEqual(route);
  });
});
