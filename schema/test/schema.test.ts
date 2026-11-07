import { describe, expect, it } from "vitest";
import { Character } from "../src/schema/character";
import { examples } from "../src/examples";
import tidewickJson from "../examples/tidewick.json";

describe("Character schema", () => {
  it("every bundled example validates", () => {
    for (const ex of examples) expect(Character.safeParse(ex).success).toBe(true);
  });

  // Regression: abilityScores was z.record(Ability, ...), which accepts
  // missing keys - a document without `wis` parsed fine and derived NaN.
  it("rejects a document missing an ability score", () => {
    const doc = structuredClone(tidewickJson) as { abilityScores: Record<string, number> };
    delete doc.abilityScores.wis;
    const result = Character.safeParse(doc);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(["abilityScores", "wis"]);
  });

  it("requires hpMax or hpByLevel", () => {
    const doc = structuredClone(tidewickJson) as { hpMax?: number };
    delete doc.hpMax;
    expect(Character.safeParse(doc).success).toBe(false);
  });
});
