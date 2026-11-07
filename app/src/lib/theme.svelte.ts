import { DEFAULT_THEME, THEMES, isReadyTheme } from "../themes";

const KEY = "saltmarsh.theme";

function readSaved(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Saved choice if valid; otherwise prefers-color-scheme picks the first ready theme of that scheme. */
function initialTheme(): string {
  const saved = readSaved();
  if (isReadyTheme(saved)) return saved;
  const wantsLight = typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: light)").matches;
  return THEMES.find(t => t.ready && t.scheme === (wantsLight ? "light" : "dark"))?.id ?? DEFAULT_THEME;
}

function apply(id: string) {
  const root = document.documentElement;
  root.dataset.theme = id;
  // Keep the browser chrome (Android status bar, iOS PWA) in step with the page color.
  const page = getComputedStyle(root).getPropertyValue("--page").trim();
  if (page) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", page);
}

class ThemeStore {
  current = $state(DEFAULT_THEME);

  init() {
    this.current = initialTheme();
    apply(this.current);
  }

  set(id: string) {
    if (!isReadyTheme(id)) return;
    this.current = id;
    apply(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {
      // Private mode or storage blocked: the choice lasts for this session only.
    }
  }
}

export const theme = new ThemeStore();
