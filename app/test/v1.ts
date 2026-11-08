/** Test helper: a current (v2) character as the previous app version saved it (schema v1). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type V1Doc = Record<string, any>;

export function asV1(v2: unknown): V1Doc {
  const doc = structuredClone(v2) as V1Doc;
  const { coins, equipped, chargesSpent: _spent, ...state } = doc.state;
  return {
    ...doc,
    schemaVersion: 1,
    inventory: {
      coins,
      items: doc.inventory.items.map((i: V1Doc) => ({ ...i, equipped: equipped.includes(i.id) })),
    },
    state,
  };
}
