# Claude Code kickoff prompt

Paste everything below the line into a new Claude Code session opened in an empty folder that contains this bundle's contents (`REQUIREMENTS.md`, `README.md`, `src/`, `examples/`, `package.json`, `tsconfig.json`).

---

I'm building a D&D 2024 character and party tracker called Saltmarsh. This folder already contains the data model and engine; your job is to build the app around it.

**Read these first, in order, before writing any code:**
1. `REQUIREMENTS.md` - the product requirements, phases, decisions, and acceptance criteria. Section 8 has the decisions already made; don't re-ask them.
2. `README.md` - the data model and its four rules. The Zod schemas in `src/schema/` and the engine in `src/engine/` are the source of truth. Do not redesign them. If you find a bug in them, fix it and add a unit test.
3. Run `npm install && npm run validate` and keep the output - those numbers for Tidewick and Kenpachi are the acceptance tests for Phase 1.

**Accounts and infrastructure (already set up):**
- GitHub repo: `https://github.com/niphm/saltmarsh` (public, empty, no README). Pages source is set to GitHub Actions. Workflow permissions are read/write. The repo description has two typos - set it to "D&D character and party tracker for the Ghosts of Saltmarsh campaign - player sheets, DM board, offline-first PWA" with `gh repo edit`.
- Live URL will be `https://niphm.github.io/saltmarsh/`. Vite `base` and PWA scope must be `/saltmarsh/`.
- Supabase project: `DND Saltmarsh Character App`, ref `srrsipmhznzxrrpkfgfk`, region us-east-1.
  - URL: `https://srrsipmhznzxrrpkfgfk.supabase.co`
  - Publishable (anon) key: `sb_publishable_RHhZjAsKiuCNEcnMI5_YoA_xgy2EKbc`
  - Auth: email + password enabled, email confirmation OFF, new sign-ups ON (turn off after the six party accounts exist).
  - Site URL `https://niphm.github.io/saltmarsh/`; redirect URLs `https://niphm.github.io/saltmarsh/**` and `http://localhost:5173/saltmarsh/**`.
  - I will never give you the secret/service_role key. Everything goes through RLS.
- Supabase isn't needed until Phase 2. Phase 1 is fully local.

**First session - do this and stop:**
1. Write `CLAUDE.md` at the repo root that says: read `REQUIREMENTS.md` and `README.md` before any task; `src/schema` and `src/engine` are the source of truth; run `npm run validate` after any engine change; commit small and often with conventional-commit messages.
2. Restructure into the single-repo layout from REQUIREMENTS section 8.5: `schema/` (move `src/` and `examples/` here as an npm workspace package named `@saltmarsh/schema`), `app/` (Vite + Svelte 5 + TypeScript + Tailwind, PWA via vite-plugin-pwa/Workbox, Dexie for IndexedDB), `packs/` (empty for now), `supabase/` (empty `migrations/` folder). Root `package.json` uses npm workspaces.
3. Add unit tests (Vitest) for `derive()` and `rest.ts` that assert the exact numbers from `npm run validate` for both example characters, plus the Phase 1 acceptance criteria in REQUIREMENTS section 7 that can be tested at the engine level (temp HP absorption, exhaustion decrement on long rest, Rage partial recharge).
4. Add a GitHub Actions workflow: on push to `main` - install, lint, typecheck, test, build `app/`, deploy to Pages. Use `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from repo secrets; set them with `gh secret set` using the values above.
5. Build the Phase 1 read-only sheet: load Tidewick and Kenpachi from `examples/`, render everything `derive()` returns per F1.2, with the Saltmarsh theme and the theme switcher scaffolded (N1.6 - at least the Saltmarsh and Parchment presets working; stub the rest).
6. `git init`, first commit, push to `main`, confirm the Pages deploy succeeds and the live URL renders both characters.
7. Stop and report: what's deployed, what tests pass, what you'd do next session. Do not start Phase 1 interactions (F1.3+) until I've looked at the deployed sheet.

**Working rules for every session:**
- Read `CLAUDE.md` first.
- Never write to Supabase, GitHub settings, or secrets without telling me what you're about to do.
- Mobile first: check every screen at 390px width before desktop.
- Prefer boring, well-documented libraries. No UI component kits; Tailwind and hand-written Svelte components only.
- When a requirement is ambiguous, pick the option that keeps the UI ignorant of D&D rules (principle 1 and 2 in README) and tell me what you picked.
