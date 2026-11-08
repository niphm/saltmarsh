<script lang="ts">
  import { party, type HpMode } from "../../lib/party.svelte";
  import { auth } from "../../lib/auth.svelte";
  import { characters } from "../../lib/store.svelte";
  import { sync } from "../../lib/sync/engine.svelte";
  import { href } from "../../lib/route.svelte";
  import PartyStrip from "../PartyStrip.svelte";
  import Dialog from "../Dialog.svelte";

  // F2.3 membership and F2.7 visibility settings.
  let error = $state<string | null>(null);
  let copied = $state(false);
  let confirmLeave = $state(false);

  const p = $derived(party.current!);
  const mine = $derived(characters.characters);

  async function run(fn: () => Promise<string | null>) {
    error = await fn();
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(p.inviteCode);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      error = "Couldn't copy. Select the code and copy it yourself.";
    }
  }

  const HP_MODES: { id: HpMode; label: string; hint: string }[] = [
    { id: "status", label: "Status word", hint: "Full, Injured, Critical, Down" },
    { id: "bar", label: "Bar", hint: "A health bar, no numbers" },
    { id: "exact", label: "Exact", hint: "Current and max HP" },
    { id: "hidden", label: "Hidden", hint: "Players don't see each other's HP" },
  ];

  async function leave() {
    confirmLeave = false;
    await run(() => (party.isDm ? party.deleteParty() : party.removeMember(auth.account!.id)));
  }
</script>

<PartyStrip full />
{#if !party.roster.length}
  <p class="text-ink-muted">No characters in the party yet. Add yours below.</p>
{/if}

<section aria-labelledby="your-chars" class="mt-4 rounded-xl border border-line bg-card p-4">
  <h2 id="your-chars" class="font-display text-sm font-semibold tracking-widest text-accent uppercase">Your characters</h2>
  <ul class="mt-2">
    {#each mine as c (c.id)}
      {@const linked = sync.isLinked(c.id)}
      {@const inParty = sync.metas[c.id]?.partyId === p.id}
      <li class="flex min-h-12 items-center gap-3 border-b border-line py-1 last:border-b-0">
        <span class="min-w-0 flex-1">
          <span class="block text-ink">{c.identity.name}</span>
          {#if inParty}
            <span class="block text-xs text-ok">In the party</span>
          {:else if !linked && (sync.claimed.includes(c.id) || sync.metas[c.id])}
            <span class="block text-xs text-ink-muted">On someone else's account</span>
          {:else if !linked}
            <span class="block text-xs text-ink-muted">Add it to your account in <a class="underline" href={href.settings}>Settings</a> first</span>
          {/if}
        </span>
        {#if linked}
          {@const label = inParty ? "Take out of party" : "Add to party"}
          <button
            type="button"
            aria-label="{label}: {c.identity.name}"
            class="btn text-sm"
            onclick={() => run(async () => (await party.attach(c.id, !inParty)) ?? (await sync.pull(), null))}>{label}</button
          >
        {/if}
      </li>
    {/each}
  </ul>
</section>

<section aria-labelledby="members-heading" class="mt-4 rounded-xl border border-line bg-card p-4">
  <h2 id="members-heading" class="font-display text-sm font-semibold tracking-widest text-accent uppercase">Members</h2>
  <ul class="mt-2">
    {#each party.members as m (m.userId)}
      <li class="flex min-h-12 items-center gap-3 border-b border-line py-1 last:border-b-0">
        <span class="flex-1 text-ink">{m.displayName}{m.userId === auth.account?.id ? " (you)" : ""}</span>
        <span class="text-sm text-ink-muted">{m.role === "dm" ? "DM" : "Player"}</span>
        {#if party.isDm && m.role === "player"}
          <button type="button" class="btn text-sm" aria-label="Remove {m.displayName} from the party" onclick={() => run(() => party.removeMember(m.userId))}>
            Remove
          </button>
        {/if}
      </li>
    {/each}
  </ul>

  {#if party.isDm}
    <h3 class="mt-4 text-xs font-semibold tracking-wider text-ink-muted uppercase">Invite code</h3>
    <p class="mt-1 text-sm text-ink-muted">Players enter this on their Party page to join.</p>
    <div class="mt-2 flex flex-wrap items-center gap-2">
      <output class="rounded-lg bg-well px-3 py-2 font-mono text-2xl tracking-widest text-ink select-all" aria-label="Invite code">{p.inviteCode}</output>
      <button type="button" class="btn" onclick={copyCode}>{copied ? "Copied" : "Copy"}</button>
      <button type="button" class="btn" onclick={() => run(() => party.newInviteCode())}>New code</button>
    </div>
  {/if}
</section>

{#if party.isDm}
  <section aria-labelledby="vis-heading" class="mt-4 rounded-xl border border-line bg-card p-4">
    <h2 id="vis-heading" class="font-display text-sm font-semibold tracking-widest text-accent uppercase">What players see of each other</h2>
    <fieldset class="mt-2">
      <legend class="text-sm text-ink-muted">Hit points</legend>
      <div class="mt-1 grid gap-2 sm:grid-cols-2">
        {#each HP_MODES as hm (hm.id)}
          <label class="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border-2 p-2 {p.visibility.showHpToPlayers === hm.id ? 'border-accent bg-well' : 'border-line'}">
            <input
              type="radio"
              name="hp-mode"
              class="size-5 accent-accent"
              checked={p.visibility.showHpToPlayers === hm.id}
              onchange={() => run(() => party.setVisibility({ showHpToPlayers: hm.id }))}
            />
            <span class="flex flex-col"><span class="font-semibold text-ink">{hm.label}</span><span class="text-xs text-ink-muted">{hm.hint}</span></span>
          </label>
        {/each}
      </div>
    </fieldset>
    <label class="mt-3 flex min-h-11 cursor-pointer items-center gap-3">
      <input
        type="checkbox"
        class="size-5 accent-accent"
        checked={p.visibility.showConditionsToPlayers}
        onchange={e => run(() => party.setVisibility({ showConditionsToPlayers: e.currentTarget.checked }))}
      />
      <span class="text-ink">Conditions</span>
    </label>
    <label class="flex min-h-11 cursor-pointer items-center gap-3">
      <input
        type="checkbox"
        class="size-5 accent-accent"
        checked={p.visibility.showConcentrationToPlayers}
        onchange={e => run(() => party.setVisibility({ showConcentrationToPlayers: e.currentTarget.checked }))}
      />
      <span class="text-ink">Concentration</span>
    </label>
    <p class="mt-2 text-sm text-ink-muted">You always see everything, and players always see their own characters in full.</p>
  </section>
{/if}

{#if error}
  <p role="alert" class="mt-3 rounded-lg border-2 border-danger p-3 text-sm text-ink">{error}</p>
{/if}

<button type="button" class="btn btn-danger mt-4" onclick={() => (confirmLeave = true)}>{party.isDm ? "Delete party" : "Leave party"}</button>

<Dialog bind:open={confirmLeave} title={party.isDm ? `Delete ${p.name}?` : `Leave ${p.name}?`}>
  <p class="text-ink">
    {#if party.isDm}
      This deletes the party, its shared inventory and its journal for everyone. Characters stay with their players. It can't be undone.
    {:else}
      Your characters leave the party with you. You can rejoin with the invite code.
    {/if}
  </p>
  {#snippet footer()}
    <button type="button" class="btn" onclick={() => (confirmLeave = false)}>Cancel</button>
    <button type="button" class="btn btn-danger" onclick={leave}>{party.isDm ? "Delete party" : "Leave"}</button>
  {/snippet}
</Dialog>
