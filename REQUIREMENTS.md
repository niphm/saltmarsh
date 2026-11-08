# Saltmarsh Character App - Requirements

Owner: David. Status: draft for Claude Code kickoff. Companion to `README.md` (data model) and `src/` (schemas, engine, examples), which are the source of truth for data shape and take precedence over anything here that conflicts.

## 1. Purpose

Replace the five hand-built character pages at niphm.github.io/characters with one data-driven app that:
- renders any D&D 2024 character from a JSON document
- tracks table state (HP, resources, slots, conditions) with correct rest behavior
- shares party state across devices and players
- gives the DM a live view of the party

Users: 5 players and 1 DM in one campaign today. Design so a second party could use it, but do not build multi-tenant features beyond what parties already require.

## 2. Non-goals (v1-v3)

- Character builder from scratch (pick species/class/background step by step). Characters are authored as JSON, then edited in-app.
- Virtual tabletop, maps, tokens, fog of war.
- Monster manual / full bestiary. Encounters take ad-hoc monster rows.
- Rules editions other than D&D 2024 (SRD 5.2). No 2014 toggle.
- Accounts for anyone outside the party. No public sign-up page.
- Native mobile apps. PWA only.

## 3. Principles (these resolve most design arguments)

1. Store choices, derive everything else. The UI never does rules math; `derive()` does.
2. Every trackable thing is a `Resource`. No feature-specific UI code.
3. Table state is small and changes often; the rest of the document changes at level-up. They sync differently.
4. Works offline at the table. Sync is a feature, not a dependency.
5. One codebase, two lenses: player sees own sheet; DM sees everyone's state plus hidden notes.
6. Thumb-first. Primary device is a phone on a table next to dice and beer.

## 4. Phases

### Phase 1 - Local sheet (ship to GitHub Pages)

Functional:
- F1.1 Load a character from a JSON file (import) or from bundled examples; validate with the Zod schema; show a readable error on failure.
- F1.2 Sheet view renders all of `derive()`: header (name, species, class/subclass, level), ability scores and modifiers, saves, skills with proficiency markers, passive Perception/Insight/Investigation, initiative, speed, senses, proficiencies, languages.
- F1.3 HP: current / max / temp. Controls: -1/+1, "damage N" and "heal N" numeric entry, set temp HP. Damage consumes temp HP first. Dropping to 0 shows death saves.
- F1.4 Resources render by `kind` (pips, counter, toggle, state) grouped by `group`. Tapping spends/regains. `state` resources show as a prominent ON/OFF switch and apply `whileActive` effects to the sheet.
- F1.5 Spell slots per level as pips. Spell list filtered by level, concentration, prepared. Casting a spell spends a slot (or a linked free-cast toggle) and, if concentration, sets concentration (prompt if already concentrating).
- F1.6 Attacks list: name, to-hit, damage lines (with `when` conditions shown as chips), properties, mastery.
- F1.7 Inventory: coins with converted GP total, items with category filter, equipped/attuned toggles, quantity, charges. Equipped armor/shield changes AC via `derive()`.
- F1.8 Conditions as tappable chips (the 15 standard conditions, exhaustion with level). Free-text effects list for anything else.
- F1.9 Rests: Short Rest (choose hit dice to spend, confirm optional triggers like Sorcerous Restoration), Long Rest, "Initiative rolled" (for `initiative` recharges). All driven by `rest.ts`.
- F1.10 Dice roller: tap any modifier (skill, save, attack, damage line) to roll; roll log with last 20 rolls; advantage/disadvantage toggle; reroll support for Lucky/Inspiration.
- F1.11 Sticky status bar at top of sheet: HP (with temp), AC, concentration spell, active conditions, active `state` resources.
- F1.12 Undo last state change (pop from `state.log`).
- F1.13 Export character as JSON; export full local data as one backup file; import a backup.
- F1.14 Notes tab: markdown scratchpad per character.

Non-functional:
- N1.1 Deployed to GitHub Pages from `main` via GitHub Actions on every push.
- N1.2 Installable PWA; works fully offline after first load (service worker, app shell + rules pack cached).
- N1.3 State persisted to IndexedDB; survives refresh and app restart.
- N1.4 First meaningful render under 2s on a mid-range phone over 4G.
- N1.5 Keyboard and screen-reader accessible; all tap targets at least 44px; passes axe with no critical issues.
- N1.6 Preset color themes, user-selectable from Settings and remembered per device. Ship at least six: **Saltmarsh** (default - the current deep navy and brass nautical palette), **Parchment** (light, warm paper and ink), **Ember** (dark, charcoal and orange), **Verdant** (dark forest green and gold), **Arcane** (dark violet and silver), **High Contrast** (black/white, large focus rings, WCAG AAA). Themes are CSS custom-property sets only - no component changes per theme - so adding a theme is one file. Every theme must pass WCAG AA contrast on text and interactive elements; status colors (HP critical, concentration, conditions) must stay distinguishable in every theme and never rely on hue alone. Respect `prefers-color-scheme` only for the initial pick before the user chooses.

### Phase 2 - Sync and party

- F2.1 Sign in with email + password via Supabase Auth (closest supported match to today's username/password; Supabase Auth keys accounts by email). Show a display name, not the email, everywhere in the UI. Password reset by email. Magic link is the fallback only if email+password proves unworkable.
- F2.2 Characters sync to Supabase. Local-first: writes go to IndexedDB immediately, then to Supabase via a queue; conflicts resolved last-write-wins per top-level field (`doc` vs `state`), with the `state.log` preserved.
- F2.3 Parties: DM creates a party and gets an invite code; players join with the code and attach a character. Membership carries `role`.
- F2.4 Shared party inventory (coins + items, with "held by" per item), editable by all members.
- F2.5 Party journal: entries of kind session / npc / location / quest / lore / note, with `visibility: party | dm | author`. Session entries carry structured key events, NPCs, locations, loot, follow-ups. Tag filter and search.
- F2.6 Realtime: party members' `state` updates propagate within 2s to every open client in the party.
- F2.7 Player-side party strip: see each party member's HP as a status word, not a number: **Full** (100%), **Injured** (25-99%), **Critical** (below 25%), plus **Down** (0). Conditions and concentration shown. DM can change the party's `showHpToPlayers` to `bar` or `exact`; `status` is the default.
- F2.8 RLS enforces: owner writes `doc`; owner and party DM write `state` (players cannot edit each other's state); members read `state` and `party`-visible journal; only DM reads `dm`-visible journal.
- F2.9 "No account" mode keeps working with local data only; signing in later uploads local characters.

### Phase 3 - DM board and level-up

- F3.1 DM dashboard route: one card per PC with HP bar, temp HP, AC, passives, conditions, concentration, active `state` resources. Tap to open full sheet (editable).
- F3.2 Party-wide actions: apply damage/healing/condition to selected PCs; trigger short or long rest for everyone.
- F3.3 Encounter tracker: add PCs (pre-filled initiative bonus) and monsters (name, HP, AC, notes); roll or enter initiative; round and turn counters; "your turn" indicator pushed to the active player's client; combat log.
- F3.4 DM notes and NPC/location/quest entries with a "reveal to party" action that flips visibility.
- F3.5 Level-up wizard: increment class level, pick HP (roll or average), add features and resources from the rules pack, pick spells, ASI/feat. Produces a new `doc`; previous version kept for rollback.
- F3.6 Rules pack editor (DM only): add homebrew features, resources, spells, items as pack entries; party pack order with override.
- F3.7 Print / PDF export of a character sheet.

## 5. Rules pack (SRD 5.2)

- Shipped as JSON in the repo under `packs/srd/`. Entries keyed `srd:kind:slug`.
- Required kinds for v1: `class` (with slot progression, hit die, saves, resource templates by level), `subclass`, `species`, `background`, `feature`, `spell`, `item`, `condition`, `metamagic`.
- Spells need: level, school, casting time, range, components, duration, concentration, ritual, description, damage/save summary for the card.
- Pack content is licensed CC-BY 4.0; include the attribution notice in the app's About screen. Do not include non-SRD content (Tempest Domain, Divine Soul, Wild Magic, Goliath, Orc are SRD 5.2; verify each before adding).

## 6. Tech constraints

- Vite + Svelte 5 + TypeScript. Tailwind for styling. Zod for validation (already in `src/schema`).
- Dexie for IndexedDB. Workbox for service worker.
- Supabase (free tier) for auth, Postgres, Realtime. Schema per `README.md` "Supabase shape". All DDL and RLS in `supabase/migrations/`.
- GitHub Actions: lint, typecheck, unit tests, build, deploy to Pages.
- Tests: `derive()` and `rest.ts` get unit tests against the example characters (expected numbers are in `README.md` and the validate output). Add a test per bug fixed.
- No analytics, no third-party scripts beyond Supabase.

## 7. Acceptance criteria for Phase 1

- Tidewick and Kenpachi load from `examples/` and every number on screen matches `npm run validate` output.
- Spend 2 Rage uses, short rest: Rage shows 2/3. Long rest: 3/3, HP full, conditions cleared, exhaustion reduced by 1.
- Cast Hypnotic Pattern: a level 3 slot is spent and concentration shows it; cast Fog Cloud: prompted to drop Hypnotic Pattern.
- Take 10 damage with 4 temp HP: temp goes to 0, HP drops 6. Heal above max is clamped.
- Toggle Raging on: damage lines flagged `when: rage` highlight, resistances shown in status bar.
- Kill the network, reload: app opens and all state is intact.
- Lighthouse PWA installable; offline audit passes.

## 8. Decisions (made 2026-11-07)

1. Framework: Svelte 5.
2. Auth: email + password (F2.1). Magic link only as fallback.
3. HP visibility to other players: status word (Full / Injured / Critical / Down), thresholds in F2.7. DM may loosen to bar or exact.
4. Players editing each other's `state`: no. DM and owner only.
5. Repo layout: single repo - `app/`, `packs/`, `supabase/`, `schema/` as an npm workspace package consumed by `app/`.
6. Hosting: `https://niphm.github.io/saltmarsh/`. Vite `base` and the PWA scope are `/saltmarsh/`; Supabase Site URL and redirect URLs already point there.
7. Themes: selectable presets (N1.6), not a single dark/light toggle.
8. Coins, equipped items and spent item charges are table state (`state.coins`, `state.equipped`, `state.chargesSpent`; schema v2), not document fields, so the party DM can hand out gold under F2.8 and they sync on the state path. Item definitions, quantity and attunement stay in the document. (2026-11-08)

## 9. Data corrections applied to examples

- Kenpachi AC: sheet says 16, but Unarmored Defense is 9 and the shield is +2. Resolved to **11** in `examples/kenpachi.json` (shield added to inventory, `acOverride` removed, AC now derives).
- Kenpachi passive Perception: resolved to **12** - he is not Perception-proficient (Athletics, Nature, Animal Handling, Survival, Intimidation are). Example skills corrected; Savage Attacker and Tough feats added.
- Azrael Channel Divinity: **2** uses at level 5 (sheet and vault both show 3; 2024 rules give 2 until level 6).
