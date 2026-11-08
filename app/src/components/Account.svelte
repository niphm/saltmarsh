<script lang="ts">
  import { auth, MIN_PASSWORD } from "../lib/auth.svelte";
  import { characters } from "../lib/store.svelte";
  import { sync } from "../lib/sync/engine.svelte";

  // F2.1 sign in / create account / reset; F2.9 upload this device's characters.
  type Mode = "signin" | "signup" | "reset";
  let mode = $state<Mode>("signin");
  let email = $state("");
  let password = $state("");
  let displayName = $state("");
  let busy = $state(false);
  let error = $state<string | null>(null);
  let notice = $state<string | null>(null);

  let rename = $state("");
  let renameMsg = $state<string | null>(null);

  function switchTo(m: Mode) {
    mode = m;
    error = null;
    notice = null;
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    error = null;
    notice = null;
    if (mode === "signin") error = await auth.signIn(email, password);
    else if (mode === "signup") error = await auth.signUp(displayName, email, password);
    else {
      error = await auth.sendReset(email);
      if (!error) notice = "If that email has an account, a reset link is on its way. Open it on this device.";
    }
    busy = false;
    if (!error) password = "";
  }

  async function saveName(e: SubmitEvent) {
    e.preventDefault();
    renameMsg = await auth.rename(rename);
    if (!renameMsg) {
      renameMsg = "Saved.";
      rename = "";
    }
  }

  async function signOut() {
    busy = true;
    error = await auth.signOut();
    busy = false;
  }

  const SYNC_TEXT = {
    off: "Not syncing.",
    synced: "Everything on your account is up to date.",
    syncing: "Syncing…",
    offline: "Offline. Changes are saved on this device and upload when you reconnect.",
    error: "Sync hit a problem. It will try again.",
  } as const;

  function where(id: string): "linked" | "other" | "claimed" | "local" {
    const m = sync.metas[id];
    if (sync.claimed.includes(id)) return "claimed";
    if (!m) return "local";
    return m.ownerId === auth.account?.id ? "linked" : "other";
  }

  const WHERE_TEXT = {
    linked: "On your account",
    other: "On another account (not synced while you're signed in)",
    claimed: "Already on someone else's account: this device only",
    local: "This device only",
  } as const;
</script>

<section aria-labelledby="account-heading" class="mt-4 rounded-xl border border-line bg-card p-4">
  <h2 id="account-heading" class="font-display text-sm font-semibold tracking-widest text-accent uppercase">Account</h2>

  {#if !auth.configured}
    <p class="mt-1 text-sm text-ink-muted">Sync isn't set up in this build. Characters stay on this device.</p>
  {:else if !auth.ready}
    <p class="mt-1 text-sm text-ink-muted">Checking your account…</p>
  {:else if auth.account}
    {@const account = auth.account}
    <p class="mt-1 text-ink">Signed in as <span class="font-semibold">{account.displayName}</span>.</p>
    <p class="mt-1 text-sm {sync.status === 'error' ? 'text-danger' : 'text-ink-muted'}" role="status">
      {SYNC_TEXT[sync.status]}{#if sync.status === "error" && sync.error}<span> ({sync.error})</span>{/if}
    </p>

    <h3 class="mt-4 text-xs font-semibold tracking-wider text-ink-muted uppercase">Characters on this device</h3>
    <ul class="mt-1">
      {#each characters.characters as c (c.id)}
        {@const w = where(c.id)}
        <li class="flex min-h-12 items-center gap-3 border-b border-line py-1 last:border-b-0">
          <span class="min-w-0 flex-1">
            <span class="block text-ink">{c.identity.name}</span>
            <span class="block text-xs {w === 'linked' ? 'text-ok' : 'text-ink-muted'}">{WHERE_TEXT[w]}</span>
          </span>
          {#if w === "local"}
            <button type="button" class="btn text-sm" onclick={() => void sync.link([c.id])} aria-label="Add to account: {c.identity.name}">
              Add to account
            </button>
          {/if}
        </li>
      {/each}
    </ul>

    <form class="mt-4 flex flex-wrap items-end gap-2" onsubmit={saveName}>
      <label class="flex min-w-0 flex-1 flex-col gap-1 text-sm text-ink-muted">
        Display name (what the party sees)
        <input class="field" bind:value={rename} placeholder={account.displayName} maxlength="40" autocomplete="nickname" />
      </label>
      <button type="submit" class="btn" disabled={!rename.trim()}>Rename</button>
    </form>
    {#if renameMsg}<p class="mt-1 text-sm text-ink" role="status">{renameMsg}</p>{/if}

    <button type="button" class="btn mt-4" onclick={signOut} disabled={busy}>Sign out</button>
    <p class="mt-1 text-sm text-ink-muted">Signing out keeps your characters on this device.</p>
  {:else}
    <p class="mt-1 text-sm text-ink-muted">
      Sign in to keep your characters on all your devices and play with your party. Without an account everything stays on this device.
    </p>

    <div class="mt-3 flex gap-1 border-b border-line" role="group" aria-label="Account options">
      {#each [["signin", "Sign in"], ["signup", "Create account"], ["reset", "Forgot password"]] as [m, label] (m)}
        <button
          type="button"
          aria-pressed={mode === m}
          onclick={() => switchTo(m as Mode)}
          class="inline-flex min-h-11 items-center border-b-2 px-3 text-sm {mode === m ? 'border-accent font-semibold text-ink' : 'border-transparent text-ink-muted hover:text-ink'}"
          >{label}</button
        >
      {/each}
    </div>

    <form class="mt-3 grid gap-3" onsubmit={submit}>
      {#if mode === "signup"}
        <label class="flex flex-col gap-1 text-sm text-ink-muted">
          Display name (what the party sees)
          <input class="field" bind:value={displayName} required maxlength="40" autocomplete="nickname" />
        </label>
      {/if}
      <label class="flex flex-col gap-1 text-sm text-ink-muted">
        Email
        <input class="field" type="email" bind:value={email} required autocomplete="email" inputmode="email" />
      </label>
      {#if mode !== "reset"}
        <label class="flex flex-col gap-1 text-sm text-ink-muted">
          Password
          <input
            class="field"
            type="password"
            bind:value={password}
            required
            minlength={mode === "signup" ? MIN_PASSWORD : undefined}
            autocomplete={mode === "signup" ? "new-password" : "current-password"}
          />
        </label>
      {/if}
      <button type="submit" class="btn btn-primary" disabled={busy}>
        {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Email me a reset link"}
      </button>
    </form>
    {#if mode === "signup"}
      <p class="mt-2 text-sm text-ink-muted">Accounts are for the party only. Your DM closes sign-ups once everyone has one.</p>
    {/if}
  {/if}

  {#if error}
    <p role="alert" class="mt-3 rounded-lg border-2 border-danger p-3 text-sm text-ink">{error}</p>
  {/if}
  {#if notice}
    <p role="status" class="mt-3 rounded-lg border-2 border-ok p-3 text-sm text-ink">{notice}</p>
  {/if}
</section>
