<script lang="ts">
  import { party } from "../lib/party.svelte";
  import { auth } from "../lib/auth.svelte";
  import { href, type Route } from "../lib/route.svelte";
  import type { PartyTab } from "../lib/routes";
  import PartyMembers from "./party/PartyMembers.svelte";
  import PartyInventory from "./party/PartyInventory.svelte";
  import Journal from "./party/Journal.svelte";

  // F2.3-F2.7. Party features need an account and a connection; the sheets never do.
  let { route }: { route: Extract<Route, { name: "party" }> } = $props();

  const TABS: [PartyTab, string][] = [
    ["members", "Members"],
    ["inventory", "Inventory"],
    ["journal", "Journal"],
  ];

  let partyName = $state("");
  let code = $state("");
  let error = $state<string | null>(null);
  let busy = $state(false);
  let showJoin = $state(false);

  async function create(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    error = await party.create(partyName);
    busy = false;
    if (!error) partyName = "";
  }

  async function join(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    error = await party.join(code);
    busy = false;
    if (!error) {
      code = "";
      showJoin = false;
    }
  }
</script>

{#snippet joinOrCreate()}
  <div class="grid gap-4 sm:grid-cols-2">
    <form class="rounded-xl border border-line bg-card p-4" onsubmit={join}>
      <h2 class="font-display text-sm font-semibold tracking-widest text-accent uppercase">Join a party</h2>
      <label class="mt-2 flex flex-col gap-1 text-sm text-ink-muted">
        Invite code from your DM
        <input class="field font-mono text-lg tracking-widest uppercase" bind:value={code} autocomplete="off" autocapitalize="characters" maxlength="12" />
      </label>
      <button type="submit" class="btn btn-primary mt-3 w-full" disabled={busy || !code.trim()}>Join</button>
    </form>
    <form class="rounded-xl border border-line bg-card p-4" onsubmit={create}>
      <h2 class="font-display text-sm font-semibold tracking-widest text-accent uppercase">Start a party</h2>
      <label class="mt-2 flex flex-col gap-1 text-sm text-ink-muted">
        Party name (you'll be the DM)
        <input class="field" bind:value={partyName} maxlength="80" placeholder="e.g. Ghosts of Saltmarsh" />
      </label>
      <button type="submit" class="btn mt-3 w-full" disabled={busy || !partyName.trim()}>Create</button>
    </form>
  </div>
{/snippet}

{#if !auth.configured}
  <h1 class="font-display text-3xl font-semibold text-ink">Party</h1>
  <p class="mt-2 text-ink-muted">Parties need sync, which isn't set up in this build.</p>
{:else if !auth.ready || (auth.account && !party.loaded)}
  <h1 class="font-display text-3xl font-semibold text-ink">Party</h1>
  <p class="mt-2 text-ink-muted">Loading…</p>
{:else if !auth.account}
  <h1 class="font-display text-3xl font-semibold text-ink">Party</h1>
  <p class="mt-2 text-ink">
    <a href={href.settings} class="text-accent underline">Sign in</a> to join your party, share loot and keep a journal together. Your character sheets work without an account.
  </p>
{:else if !party.current}
  <h1 class="font-display text-3xl font-semibold text-ink">Party</h1>
  {#if party.error}<p role="alert" class="mt-2 rounded-lg border-2 border-danger p-3 text-sm text-ink">{party.error}</p>{/if}
  <p class="mt-2 mb-4 text-ink-muted">You're not in a party yet.</p>
  {@render joinOrCreate()}
{:else}
  {@const p = party.current}
  <div class="flex flex-wrap items-center gap-2">
    <h1 class="min-w-0 flex-1 font-display text-3xl font-semibold text-ink">{p.name}</h1>
    {#if party.parties.length > 1}
      <label for="party-pick" class="sr-only">Switch party</label>
      <select id="party-pick" class="field" value={p.id} onchange={e => void party.choose(e.currentTarget.value)}>
        {#each party.parties as x (x.id)}<option value={x.id}>{x.name}</option>{/each}
      </select>
    {/if}
  </div>
  <p class="text-sm text-ink-muted">{party.isDm ? "You're the DM." : `DM: ${party.memberName(p.dmUserId)}`}</p>
  {#if party.error}<p role="alert" class="mt-2 rounded-lg border-2 border-danger p-3 text-sm text-ink">{party.error}</p>{/if}

  <nav aria-label="Party sections" class="mt-3 mb-3 flex gap-1 border-b border-line">
    {#each TABS as [tab, label] (tab)}
      <a
        href={href.party(tab)}
        aria-current={route.tab === tab ? "page" : undefined}
        class="inline-flex min-h-11 items-center border-b-2 px-3 {route.tab === tab ? 'border-accent font-semibold text-ink' : 'border-transparent text-ink-muted hover:text-ink'}"
        >{label}</a
      >
    {/each}
  </nav>

  {#if route.tab === "inventory"}
    <PartyInventory />
  {:else if route.tab === "journal"}
    <Journal />
  {:else}
    <PartyMembers />
    <div class="mt-6">
      {#if showJoin}
        {@render joinOrCreate()}
      {:else}
        <button type="button" class="btn" onclick={() => (showJoin = true)}>Join or start another party</button>
      {/if}
    </div>
  {/if}
{/if}

{#if error}
  <p role="alert" class="mt-3 rounded-lg border-2 border-danger p-3 text-sm text-ink">{error}</p>
{/if}
