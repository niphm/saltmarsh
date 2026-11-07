/**
 * Theme registry. A theme is one CSS file in this folder that sets the
 * tokens below under `[data-theme="<id>"]`, plus one entry here.
 * `ready: false` entries are listed in Settings as "coming soon".
 *
 * Every ready theme must pass test/themes.test.ts (WCAG AA contrast).
 */
export const THEME_TOKENS = [
  "page", "card", "well", "line",
  "ink", "ink-muted", "accent", "on-accent", "focus",
  "danger", "warn", "ok", "info",
] as const;

export interface ThemeMeta {
  id: string;
  label: string;
  description: string;
  scheme: "dark" | "light";
  ready: boolean;
  /** Held to WCAG AAA (7:1) for text instead of AA. */
  aaa?: boolean;
}

export const THEMES: readonly ThemeMeta[] = [
  { id: "saltmarsh", label: "Saltmarsh", description: "Deep navy and brass", scheme: "dark", ready: true },
  { id: "parchment", label: "Parchment", description: "Warm paper and ink", scheme: "light", ready: true },
  { id: "ember", label: "Ember", description: "Charcoal and orange", scheme: "dark", ready: true },
  { id: "verdant", label: "Verdant", description: "Forest green and gold", scheme: "dark", ready: true },
  { id: "arcane", label: "Arcane", description: "Violet and silver", scheme: "dark", ready: true },
  { id: "high-contrast", label: "High Contrast", description: "Black and white, WCAG AAA", scheme: "dark", ready: true, aaa: true },
];

export const DEFAULT_THEME = "saltmarsh";

export const isReadyTheme = (id: unknown): id is string =>
  typeof id === "string" && THEMES.some(t => t.id === id && t.ready);
