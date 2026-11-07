/**
 * N1.6: every ready theme defines every token and passes WCAG AA contrast
 * for the color pairs the components actually use.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { THEMES, THEME_TOKENS } from "../src/themes";

const dir = fileURLToPath(new URL("../src/themes/", import.meta.url));

const themes = readdirSync(dir)
  .filter(f => f.endsWith(".css"))
  .map(file => {
    const css = readFileSync(join(dir, file), "utf8");
    const id = css.match(/\[data-theme="([\w-]+)"\]/)?.[1];
    const tokens = Object.fromEntries(
      [...css.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map(m => [m[1], m[2].toLowerCase()]),
    ) as Record<string, string>;
    return { file, id, tokens };
  });

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map(i => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT = 4.5; // WCAG AA normal text
const UI = 3; // WCAG AA non-text (focus ring, pip outlines)
const SURFACES = ["page", "card", "well"];

/** [foreground, background, minimum ratio] */
const PAIRS: [string, string, number][] = [
  ...["ink", "ink-muted", "accent"].flatMap(fg => SURFACES.map(bg => [fg, bg, TEXT] as [string, string, number])),
  ...["danger", "warn", "ok", "info"].flatMap(fg => SURFACES.map(bg => [fg, bg, TEXT] as [string, string, number])),
  ["on-accent", "accent", TEXT],
  ...SURFACES.map(bg => ["focus", bg, UI] as [string, string, number]),
];

describe("theme registry", () => {
  it("every ready theme has a CSS file, and every CSS file is a ready theme", () => {
    const ready = THEMES.filter(t => t.ready).map(t => t.id).sort();
    expect(themes.map(t => t.id).sort()).toEqual(ready);
  });

  it("theme ids are unique", () => {
    expect(new Set(THEMES.map(t => t.id)).size).toBe(THEMES.length);
  });

  it("the default theme also provides the zero-specificity fallback", () => {
    const css = readFileSync(join(dir, "saltmarsh.css"), "utf8");
    expect(css).toContain(":where(:root)");
  });

  it("ships the six themes N1.6 names", () => {
    expect(THEMES.map(t => t.label)).toEqual(["Saltmarsh", "Parchment", "Ember", "Verdant", "Arcane", "High Contrast"]);
  });
});

describe.each(themes)("theme $id ($file)", ({ tokens }) => {
  it("defines every token as a 6-digit hex color", () => {
    expect(Object.keys(tokens).sort()).toEqual([...THEME_TOKENS].sort());
  });

  it.each(PAIRS)("%s on %s >= %d:1", (fg, bg, min) => {
    const ratio = contrast(tokens[fg], tokens[bg]);
    expect(ratio, `${fg} ${tokens[fg]} on ${bg} ${tokens[bg]} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(min);
  });
});

describe("contrast()", () => {
  it("matches known WCAG values", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });
});
