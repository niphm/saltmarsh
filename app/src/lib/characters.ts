import { Character } from "@saltmarsh/schema";
import { examples } from "@saltmarsh/schema/examples";

export type LoadResult =
  | { ok: true; id: string; name: string; character: Character }
  | { ok: false; id: string; name: string; issues: string[] };

/** Validate a raw document with the Zod schema. Never throws. */
export function loadCharacter(raw: unknown, fallbackId: string): LoadResult {
  const parsed = Character.safeParse(raw);
  if (parsed.success) {
    return { ok: true, id: parsed.data.id, name: parsed.data.identity.name, character: parsed.data };
  }
  const r = (raw ?? {}) as { id?: unknown; identity?: { name?: unknown } };
  return {
    ok: false,
    id: typeof r.id === "string" && r.id ? r.id : fallbackId,
    name: typeof r.identity?.name === "string" ? r.identity.name : "Unnamed character",
    issues: parsed.error.issues.map(i => `${i.path.length ? i.path.join(".") : "(document)"}: ${i.message}`),
  };
}

/** The bundled examples (Tidewick, Kenpachi), validated. */
export const bundled: LoadResult[] = examples.map((raw, i) => loadCharacter(raw, `example-${i + 1}`));
