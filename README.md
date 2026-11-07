# Saltmarsh Character App - Data Model

Source of truth for the new character app. Zod schemas validate at runtime, generate TypeScript types, and can emit JSON Schema for the Supabase side.

## Layout

```
src/schema/expression.ts   tiny formula language + safe evaluator ("prof", "max(1, mod.wis)")
src/schema/character.ts    Character document - identity, classes, resources, spells, attacks, inventory, state
src/schema/party.ts        Party, members/roles, shared inventory, journal, encounters
src/engine/derive.ts       pure function: Character -> every computed number on the sheet
src/engine/rest.ts         short/long rest + initiative recharge, driven only by resource tags
src/validate.ts            parses the examples and prints the derived sheet
examples/                  Tidewick and Kenpachi as real documents
```

Run `npm install && npm run validate`.

## The four rules

1. **Store choices, derive everything else.** Ability scores, level, class, features, equipped items are stored. Proficiency, DCs, slots, passive scores, AC, resource maxes are computed by `derive()`. The UI never does math.
2. **Every trackable thing is a `Resource`.** `{id, kind, max, recharge}`. Rage, Sorcery Points, Channel Divinity, free casts, Wild Magic, magic item charges all use the same four kinds (`pips`, `counter`, `toggle`, `state`). The rest buttons walk the list. Adding homebrew = adding an object.
3. **`state` is the only thing that changes at the table.** Everything else changes at level-up. Sync pushes `state` (small, frequent); the rest of the document syncs rarely. Undo = pop the log.
4. **No level in storage keys.** One record per character id. Level is a field. Level-up edits the document in place.

## Expressions

Any `max`, `rechargeAmount`, `bonusExpr` or `cost` accepts a number or a formula over `level`, `prof`, `mod.*`, `score.*`, `classLevel.*`, `spellMod`, `spellDC`, `hitDie` with `+ - * / max min floor ceil`. Not Turing-complete on purpose - bad homebrew can't hang the app.

## Resource kinds

| kind | renders as | example |
|---|---|---|
| `pips` | N circles | Rage 3/3, Channel Divinity, Innate Sorcery |
| `counter` | number with +/- | Sorcery Points, Focus Points, Lay on Hands pool |
| `toggle` | one checkbox | Relentless Endurance, each free cast |
| `state` | on/off mode that changes the sheet | Raging, Large Form, Wild Shape |

`state` resources carry `whileActive` effects (AC/speed/damage bonus, resistances, blocked actions) that `derive()` folds into the sheet while on.

## Recharge tags

`short`, `long`, `initiative` (Uncanny Metabolism), `dawn` (items), `turn`, `manual`. `rechargeAmount` gives partial recharges (Rage regains 1 on a short rest).

## Rules packs

Characters reference content by `pack:kind:slug` (`srd:spell:fireball`, `saltmarsh:feature:ship-sense`). The pack supplies text and mechanics; the character supplies the choice. Packs are plain JSON shipped with the app (SRD 5.2 is CC-BY) or loaded per party. A party lists its packs in override order so a homebrew pack can shadow an SRD entry.

## Party and DM

A `Party` holds members with `role: player | dm`, the shared inventory, visibility settings, and the enabled packs. `JournalEntry` is party-scoped with `visibility: party | dm | author`. `Encounter` is the DM's initiative tracker; PC combatants link to live character state, monsters carry their own HP.

## Supabase shape (v2)

```
characters   id, owner_id, party_id, doc jsonb, state jsonb, updated_at
parties      id, dm_user_id, doc jsonb
party_members party_id, user_id, role
journal      id, party_id, author_id, visibility, doc jsonb
encounters   id, party_id, doc jsonb
```

Split `state` into its own column so Realtime subscriptions on the party board only fire on table-state changes, not on backstory edits. RLS: owner can write `doc`; owner and party DM can write `state`; party members can read `state` subject to `visibility`.

## Open items found while modeling the party

- Kenpachi's AC 16 doesn't fall out of Unarmored Defense with Dex -1 / Con +0. He's either in medium armor that isn't on his inventory, or a stat is off. Stored as `acOverride` for now.
- Kenpachi's passive Perception derives to 15 (Wis +2, proficient +3) but the vault shows 12. One of the two is wrong.
- Azrael's vault shows 3 Channel Divinity uses; a level 5 Cleric has 2.
- Hit dice per class for multiclass is stubbed (`hitDiceSpent` is a single number). Fine until someone multiclasses.
- Spell effects (Mage Armor, Shield of Faith, Aid) are `acOverride` / `effects` free text for v1. v2 should make them `state` resources with `whileActive`, same as Rage.

## Next

1. Scaffold Vite + Svelte + PWA, render `derive()` output read-only from the two examples.
2. Add the resource/HP/slot interactions writing to `state`, persisted to IndexedDB.
3. Build the SRD pack (classes, slot tables, spells, items) as JSON.
4. Level-up wizard.
5. Supabase + party + DM board.
