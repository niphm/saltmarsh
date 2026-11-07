/**
 * Hash routes: work on GitHub Pages (no server rewrites) and offline.
 *   #/                 first character
 *   #/c/<id>           a character sheet
 *   #/c/<id>/notes     that character's notes
 *   #/settings         settings
 */
export type SheetView = "sheet" | "notes";
export type Route = { name: "sheet"; id?: string; view: SheetView } | { name: "settings" };

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, "");
  if (path === "settings") return { name: "settings" };
  const m = path.match(/^c\/([^/]+)(?:\/(notes))?\/?$/);
  return m ? { name: "sheet", id: decodeURIComponent(m[1]), view: m[2] === "notes" ? "notes" : "sheet" } : { name: "sheet", view: "sheet" };
}

export const href = {
  sheet: (id: string) => `#/c/${encodeURIComponent(id)}`,
  notes: (id: string) => `#/c/${encodeURIComponent(id)}/notes`,
  settings: "#/settings",
};
