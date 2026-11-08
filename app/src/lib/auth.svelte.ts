/**
 * Accounts (F2.1): email + password via Supabase Auth. The UI shows the
 * display name from `profiles`, never the email (except on the account
 * screen, to the account's owner).
 */
import type { User } from "@supabase/supabase-js";
import { friendlyError, remote, remoteConfigured } from "./remote";

export interface Account {
  id: string;
  email: string;
  displayName: string;
}

type Listener = (account: Account | null) => void;

/** Error text, or null on success. */
type Result = Promise<string | null>;

export const MIN_PASSWORD = 8;

export class AuthStore {
  readonly configured = remoteConfigured;
  ready = $state(false);
  account = $state.raw<Account | null>(null);
  /** Opened a password-reset link: ask for a new password. */
  recovering = $state(false);

  #listeners: Listener[] = [];

  onChange(fn: Listener) {
    this.#listeners.push(fn);
  }

  async init() {
    if (!this.configured) {
      this.ready = true;
      return;
    }
    try {
      const sb = await remote();
      sb.auth.onAuthStateChange((event, session) => {
        if (event === "PASSWORD_RECOVERY") this.recovering = true;
        // Supabase advises not awaiting other calls inside this callback.
        setTimeout(() => void this.#setUser(session?.user ?? null), 0);
      });
      const { data } = await sb.auth.getSession();
      await this.#setUser(data.session?.user ?? null);
    } catch (e) {
      console.warn("Account service unavailable", e);
    }
    this.ready = true;
  }

  async #setUser(user: User | null) {
    if (!user) {
      if (this.account) this.#set(null);
      return;
    }
    const fallback = String(user.user_metadata?.display_name ?? "") || "Adventurer";
    const same = this.account?.id === user.id;
    if (!same) this.#set({ id: user.id, email: user.email ?? "", displayName: fallback });
    // The profile is the source of truth (accounts made in the dashboard have no metadata). Offline: keep the fallback.
    try {
      const sb = await remote();
      const { data } = await sb.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
      if (data?.display_name && data.display_name !== this.account?.displayName && this.account?.id === user.id) {
        this.account = { ...this.account, displayName: data.display_name };
      }
    } catch {
      /* offline */
    }
  }

  #set(account: Account | null) {
    this.account = account;
    for (const fn of this.#listeners) fn(account);
  }

  async signIn(email: string, password: string): Result {
    return this.#try(async sb => {
      const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
    });
  }

  async signUp(displayName: string, email: string, password: string): Result {
    const name = displayName.trim();
    if (!name) return "Choose a display name.";
    if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters for the password.`;
    return this.#try(async sb => {
      const { data, error } = await sb.auth.signUp({ email: email.trim(), password, options: { data: { display_name: name.slice(0, 40) } } });
      if (error) throw error;
      if (!data.session) throw new Error("Account created. Check your email to confirm it, then sign in.");
    });
  }

  async signOut(): Result {
    return this.#try(async sb => {
      const { error } = await sb.auth.signOut({ scope: "local" });
      if (error) throw error;
    });
  }

  /** Email a password-reset link that opens this app. */
  async sendReset(email: string): Result {
    return this.#try(async sb => {
      const redirectTo = location.origin + import.meta.env.BASE_URL;
      const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (error) throw error;
    });
  }

  async setPassword(password: string): Result {
    if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters for the password.`;
    const err = await this.#try(async sb => {
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw error;
    });
    if (!err) this.recovering = false;
    return err;
  }

  async rename(displayName: string): Result {
    const name = displayName.trim().slice(0, 40);
    const account = this.account;
    if (!name) return "Choose a display name.";
    if (!account) return "Sign in first.";
    const err = await this.#try(async sb => {
      const upd = await sb.from("profiles").update({ display_name: name }).eq("id", account.id).select("id");
      if (upd.error) throw upd.error;
      if (!upd.data.length) {
        const ins = await sb.from("profiles").insert({ id: account.id, display_name: name });
        if (ins.error) throw ins.error;
      }
      await sb.auth.updateUser({ data: { display_name: name } });
    });
    if (!err && this.account?.id === account.id) this.account = { ...this.account, displayName: name };
    return err;
  }

  async #try(fn: (sb: Awaited<ReturnType<typeof remote>>) => Promise<void>): Result {
    try {
      await fn(await remote());
      return null;
    } catch (e) {
      return friendlyError(e);
    }
  }
}

export const auth = new AuthStore();
