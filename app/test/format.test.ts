import { describe, expect, it } from "vitest";
import { capitalize, classLine, groupBy, ordinal, refName, signed, skillName, titleCase } from "../src/lib/format";

describe("format", () => {
  it("signed uses a true minus sign", () => {
    expect(signed(2)).toBe("+2");
    expect(signed(0)).toBe("+0");
    expect(signed(-1)).toBe("−1");
  });

  it("titleCase keeps small words lowercase after the first", () => {
    expect(titleCase("sleight-of-hand")).toBe("Sleight of Hand");
    expect(titleCase("animal-handling")).toBe("Animal Handling");
    expect(titleCase("of-mice")).toBe("Of Mice");
  });

  it("refName reads the slug of pack:kind:slug", () => {
    expect(refName("srd:subclass:divine-soul")).toBe("Divine Soul");
    expect(refName("srd:species:halfling")).toBe("Halfling");
  });

  it("skillName", () => {
    expect(skillName("sleight-of-hand")).toBe("Sleight of Hand");
  });

  it("capitalize only touches the first letter", () => {
    expect(capitalize("simple")).toBe("Simple");
    expect(capitalize("Calligrapher's Supplies")).toBe("Calligrapher's Supplies");
  });

  it("classLine", () => {
    expect(classLine([{ class: "srd:class:sorcerer", subclass: "srd:subclass:divine-soul", level: 5, hitDie: 6 }])).toBe(
      "Sorcerer 5 (Divine Soul)",
    );
    expect(
      classLine([
        { class: "srd:class:fighter", level: 3, hitDie: 10 },
        { class: "srd:class:wizard", level: 2, hitDie: 6 },
      ]),
    ).toBe("Fighter 3 / Wizard 2");
  });

  it("ordinal for spell levels", () => {
    expect([1, 2, 3, 4, 9].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "9th"]);
  });

  it("groupBy preserves first-seen order", () => {
    const groups = groupBy([{ g: "Class" }, { g: "Species" }, { g: "Class" }], x => x.g);
    expect(groups.map(([k, v]) => [k, v.length])).toEqual([
      ["Class", 2],
      ["Species", 1],
    ]);
  });
});
