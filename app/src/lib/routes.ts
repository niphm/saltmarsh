/**
 * Hash routes: work on GitHub Pages (no server rewrites) and offline.
 *   #/                 first character
 *   #/c/<id>           a character sheet
 *   #/c/<id>/notes     that character's notes
 *   #/party            the party: members and the party strip
 *   #/party/inventory  shared party inventory
 *   #/party/journal    party journal
 *   #/settings         settings and account
 */
export type SheetView = "sheet" | "notes";
export type PartyTab = "members" | "inventory" | "journal";
export type Route =
  | { name: "sheet"; id?: string; view: SheetView }
  | { name: "party"; tab: PartyTab }
  | { name: "settings" };

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, "").replace(/\/$/, "");
  if (path === "settings") return { name: "settings" };
  const party = path.match(/^party(?:\/(inventory|journal))?$/);
  if (party) return { name: "party", tab: (party[1] as PartyTab | undefined) ?? "members" };
  const m = path.match(/^c\/([^/]+)(?:\/(notes))?$/);
  return m ? { name: "sheet", id: decodeURIComponent(m[1]), view: m[2] === "notes" ? "notes" : "sheet" } : { name: "sheet", view: "sheet" };
}

export const href = {
  sheet: (id: string) => `#/c/${encodeURIComponent(id)}`,
  notes: (id: string) => `#/c/${encodeURIComponent(id)}/notes`,
  party: (tab: PartyTab = "members") => (tab === "members" ? "#/party" : `#/party/${tab}`),
  settings: "#/settings",
};
