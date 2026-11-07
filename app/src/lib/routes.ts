/**
 * Hash routes: work on GitHub Pages (no server rewrites) and offline.
 *   #/            first character
 *   #/c/<id>      a character sheet
 *   #/settings    settings
 */
export type Route = { name: "sheet"; id?: string } | { name: "settings" };

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, "");
  if (path === "settings") return { name: "settings" };
  const m = path.match(/^c\/(.+)$/);
  return m ? { name: "sheet", id: decodeURIComponent(m[1]) } : { name: "sheet" };
}

export const href = {
  sheet: (id: string) => `#/c/${encodeURIComponent(id)}`,
  settings: "#/settings",
};
