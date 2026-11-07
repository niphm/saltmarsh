/**
 * Rules packs bundled with the app. Metadata is tiny and bundled; spell
 * lists are separate JSON assets fetched on first use (and precached by the
 * service worker, so they work offline - N1.2).
 */
import { PackMeta, SpellList, type Spell } from "@saltmarsh/schema";
import srdMeta from "../../../packs/srd/pack.json";
import srdSpellsUrl from "../../../packs/srd/spells.json?url";
import saltmarshMeta from "../../../packs/saltmarsh/pack.json";
import saltmarshSpellsUrl from "../../../packs/saltmarsh/spells.json?url";

/** In override order: a later pack wins for the same id. */
export const PACKS = [
  { meta: PackMeta.parse(srdMeta), spellsUrl: srdSpellsUrl },
  { meta: PackMeta.parse(saltmarshMeta), spellsUrl: saltmarshSpellsUrl },
];

let spellIndex: Promise<Map<string, Spell>> | undefined;

/** Every spell from every pack, keyed by id. Fetched and validated once; a failure can be retried. */
export function loadSpells(): Promise<Map<string, Spell>> {
  if (!spellIndex) {
    spellIndex = Promise.all(
      PACKS.map(async p => {
        const res = await fetch(p.spellsUrl);
        if (!res.ok) throw new Error(`Couldn't load ${p.meta.name} spells (${res.status})`);
        return SpellList.parse(await res.json());
      }),
    ).then(lists => new Map(lists.flat().map(s => [s.id, s])));
    spellIndex.catch(() => (spellIndex = undefined));
  }
  return spellIndex;
}
