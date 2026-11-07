/// <reference types="svelte" />
/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** Supabase project URL (Phase 2). Set from repo secrets in CI. */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase publishable (anon) key (Phase 2). */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
