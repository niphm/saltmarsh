/**
 * The Supabase client, loaded on demand so the first screen doesn't wait for
 * it (sync is a feature, not a dependency: REQUIREMENTS principle 4).
 * Builds without VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY run local-only.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const remoteConfigured = Boolean(url && key);

let client: Promise<SupabaseClient> | undefined;

export function remote(): Promise<SupabaseClient> {
  if (!url || !key) return Promise.reject(new Error("Sync isn't set up in this build."));
  client ??= import("@supabase/supabase-js").then(({ createClient }) =>
    createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Password-reset links land here with the session in the URL hash.
        detectSessionInUrl: true,
        storageKey: "saltmarsh-auth",
      },
    }),
  );
  return client;
}

/** Readable text for Supabase and network errors. */
export function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String(e.message) : String(e);
  if (/invalid login credentials/i.test(msg)) return "That email and password don't match an account.";
  if (/signups? (are )?not allowed|signup.*disabled/i.test(msg)) return "New accounts are closed. Ask your DM to add you.";
  if (/already registered|already exists/i.test(msg)) return "There's already an account with that email. Sign in instead.";
  if (/rate limit|too many/i.test(msg)) return "Too many tries. Wait a minute and try again.";
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) return "Can't reach the server. Check your connection.";
  return msg;
}
