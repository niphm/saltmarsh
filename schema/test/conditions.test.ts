import { describe, expect, it } from "vitest";
import { addEffect, endConcentration, exhaustionLevel, removeEffect, setExhaustion, toggleCondition } from "../src/engine/conditions";
import { derive } from "../src/engine/derive";
import { longRest } from "../src/engine/rest";
import { loadExample, withState } from "./fixtures";

describe("conditions", () => {
  const k = loadExample("kenpachi");

  it("toggle adds then removes", () => {
    const on = toggleCondition(k, "poisoned");
    expect(on.state.conditions).toEqual([{ condition: "poisoned" }]);
    expect(on.state.log.at(-1)?.change).toBe("poisoned added");
    const off = toggleCondition(on, "poisoned");
    expect(off.state.conditions).toEqual([]);
    expect(off.state.log.at(-1)?.change).toBe("poisoned removed");
  });

  it("exhaustion toggles between 0 and 1", () => {
    const on = toggleCondition(k, "exhaustion");
    expect(exhaustionLevel(on)).toBe(1);
    expect(exhaustionLevel(toggleCondition(on, "exhaustion"))).toBe(0);
  });

  it("setExhaustion clamps 0-6 and keeps one entry", () => {
    const three = setExhaustion(k, 3);
    expect(three.state.conditions).toEqual([{ condition: "exhaustion", level: 3 }]);
    expect(exhaustionLevel(setExhaustion(three, 9))).toBe(6);
    expect(setExhaustion(three, -1).state.conditions).toEqual([]);
    expect(setExhaustion(three, 3)).toBe(three);
  });

  it("exhaustion folds into derive: -5 ft speed and -2 to d20 Tests per level", () => {
    const d = derive(setExhaustion(k, 2));
    expect(d.exhaustion).toEqual({ level: 2, d20Penalty: 4, speedPenalty: 10 });
    expect(d.speed).toBe(30);
    expect(derive(k).exhaustion.level).toBe(0);
  });

  it("acceptance: conditions added at the table clear on a long rest; exhaustion drops one", () => {
    const rough = setExhaustion(toggleCondition(toggleCondition(k, "poisoned"), "prone"), 2);
    expect(longRest(rough).state.conditions).toEqual([{ condition: "exhaustion", level: 1 }]);
  });
});

describe("effects and concentration", () => {
  const t = loadExample("tidewick");

  it("adds and removes free-text effects; blank is ignored", () => {
    const r = addEffect(t, "  Bless +1d4  ", "1 minute");
    expect(r.state.effects).toHaveLength(1);
    expect(r.state.effects[0]).toMatchObject({ text: "Bless +1d4", until: "1 minute" });
    expect(addEffect(t, "   ")).toBe(t);
    const gone = removeEffect(r, r.state.effects[0].id);
    expect(gone.state.effects).toEqual([]);
    expect(gone.state.log.at(-1)?.change).toBe("effect removed: Bless +1d4");
    expect(removeEffect(t, "missing")).toBe(t);
  });

  it("ends concentration", () => {
    const c = withState(t, { concentration: { spell: "srd:spell:hypnotic-pattern" } });
    const r = endConcentration(c);
    expect(r.state.concentration).toBeNull();
    expect(r.state.log.at(-1)?.change).toBe("concentration ended (hypnotic pattern)");
    expect(endConcentration(t)).toBe(t);
  });
});
