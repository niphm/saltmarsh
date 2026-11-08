<script lang="ts">
  import { examples } from "@saltmarsh/schema/examples";
  import { auth, MIN_PASSWORD } from "../lib/auth.svelte";
  import { sync } from "../lib/sync/engine.svelte";
  import Dialog from "./Dialog.svelte";

  // Opened from a password-reset email: choose a new password (F2.1).
  let newPassword = $state("");
  let pwError = $state<string | null>(null);

  async function savePassword(e?: SubmitEvent) {
    e?.preventDefault();
    pwError = await auth.setPassword(newPassword);
    if (!pwError) newPassword = "";
  }

  // After signing in: offer to upload characters that are only on this device (F2.9). Once per account per device.
  const askedKey = (id: string) => `saltmarsh-link-asked:${id}`;
  const bundledIds = new Set(examples.map(raw => (raw as { id?: string }).id));
  let askOpen = $state(false);
  let chosen = $state<Record<string, boolean>>({});
  const candidates = $derived(sync.unlinked);

  $effect(() => {
    const account = auth.account;
    // Wait for the first sync, which links local copies the account already has.
    if (!account || sync.status !== "synced" || !candidates.length) return;
    let asked = false;
    try {
      asked = localStorage.getItem(askedKey(account.id)) === "1";
    } catch {
      /* private mode: ask every time */
    }
    if (asked || askOpen) return;
    // Imported characters are probably yours; the bundled ones belong to whoever plays them.
    chosen = Object.fromEntries(candidates.map(c => [c.id, !bundledIds.has(c.id)]));
    askOpen = true;
  });

  function close() {
    askOpen = false;
    try {
      if (auth.account) localStorage.setItem(askedKey(auth.account.id), "1");
    } catch {
      /* ignore */
    }
  }

  async function upload() {
    const ids = Object.entries(chosen).filter(([, on]) => on).map(([id]) => id);
    close();
    await sync.link(ids);
  }
</script>

<Dialog bind:open={() => auth.recovering, v => (auth.recovering = v)} title="Choose a new password">
  <form id="new-password-form" onsubmit={savePassword}>
    <label class="flex flex-col gap-1 text-sm text-ink-muted">
      New password (at least {MIN_PASSWORD} characters)
      <input class="field" type="password" bind:value={newPassword} minlength={MIN_PASSWORD} required autocomplete="new-password" />
    </label>
    {#if pwError}<p role="alert" class="mt-2 text-sm text-danger">{pwError}</p>{/if}
  </form>
  {#snippet footer()}
    <button type="button" class="btn" onclick={() => (auth.recovering = false)}>Later</button>
    <button type="submit" form="new-password-form" class="btn btn-primary">Save password</button>
  {/snippet}
</Dialog>

<Dialog bind:open={askOpen} title="Add characters to your account?">
  <p class="text-ink">These are only on this device. Characters on your account sync to your other devices and can join your party.</p>
  <ul class="mt-3 space-y-1">
    {#each candidates as c (c.id)}
      <li>
        <label class="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg bg-well px-3">
          <input type="checkbox" class="size-5 accent-accent" bind:checked={chosen[c.id]} />
          <span class="text-ink">{c.identity.name}</span>
        </label>
      </li>
    {/each}
  </ul>
  <p class="mt-3 text-sm text-ink-muted">Only add characters you play. You can add more later in Settings.</p>
  {#snippet footer()}
    <button type="button" class="btn" onclick={close}>Not now</button>
    <button type="button" class="btn btn-primary" onclick={upload} disabled={!Object.values(chosen).some(Boolean)}>Add to account</button>
  {/snippet}
</Dialog>
