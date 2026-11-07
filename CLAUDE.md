# CLAUDE.md

Saltmarsh: a D&D 2024 character and party tracker (offline-first PWA, Svelte 5, Supabase later).

## Before any task

1. Read `REQUIREMENTS.md` (product requirements, phases, decisions in section 8, acceptance criteria in section 7).
2. Read `README.md` (data model and its four rules).

Section 8 of `REQUIREMENTS.md` records decisions already made. Don't re-ask them.

## Source of truth

- `schema/src/schema/` (Zod schemas) and `schema/src/engine/` (`derive()`, rests, HP) are the source of truth for data shape and rules math. Don't redesign them.
- If you find a bug in them, fix it and add a unit test that fails without the fix.
- The UI never does rules math. If a screen needs a number, it comes from the engine. If the engine can't produce it, extend the engine (with a test), not the component.
- Every trackable thing is a `Resource`. No feature-specific UI code ("if rage then...").

## After any engine change

```bash
npm run validate
npm test
```

`npm run validate` prints the derived sheet for every example in `schema/examples/`. The numbers for Tidewick and Kenpachi are the Phase 1 acceptance tests and are asserted in `schema/test/`.

## Layout

```
schema/    @saltmarsh/schema - Zod schemas, engine, examples, unit tests (npm workspace)
app/       Vite + Svelte 5 + TypeScript + Tailwind 4, PWA (vite-plugin-pwa/Workbox), Dexie
packs/     rules packs as JSON (SRD 5.2 goes in packs/srd/)
supabase/  migrations/ - all DDL and RLS (Phase 2)
docs/      kickoff prompt and other notes
```

Root scripts: `npm run dev`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run validate`, `npm run build`.

## Conventions

- Commit small and often with conventional-commit messages (`feat:`, `fix:`, `test:`, `chore:`, `ci:`, `docs:`, `refactor:`).
- Mobile first: check every screen at 390px width before desktop. Tap targets at least 44px.
- Tailwind and hand-written Svelte components only. No UI component kits. Prefer boring, well-documented libraries.
- Themes are CSS custom-property sets in `app/src/themes/*.css`, one file per theme, no per-theme component changes. Every theme must pass the contrast test in `app/test/themes.test.ts`.
- Vite `base` and PWA scope are `/saltmarsh/`. Live at https://niphm.github.io/saltmarsh/.
- When a requirement is ambiguous, pick the option that keeps the UI ignorant of D&D rules, and say what you picked.

## Never without telling the user first

- Writing to Supabase (schema, data, auth settings).
- Changing GitHub repo settings or secrets.
- The Supabase service_role key is never used. Everything goes through RLS with the publishable key.
