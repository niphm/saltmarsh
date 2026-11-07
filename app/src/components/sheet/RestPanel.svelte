<script lang="ts">
  import { longRest, onInitiative, shortRest, type Derived } from "@saltmarsh/schema";
  import type { Change } from "../../lib/store.svelte";
  import Card from "../Card.svelte";
  import Dialog from "../Dialog.svelte";

  // F1.9. The dialogs collect choices; rest.ts decides what recharges.
  let { d, act }: { d: Derived; act: (change: Change) => void } = $props();

  let shortOpen = $state(false);
  let longOpen = $state(false);
  let hd = $state(0);
  let hpRolled = $state<number | null>(null);
  let triggers = $state<string[]>([]);

  const hdLeft = $derived(d.hitDice.reduce((n, h) => n + h.remaining, 0));
  const hdSizes = $derived(d.hitDice.map(h => `d${h.size}`).join(" / "));
  const triggerOptions = $derived(d.resources.filter(r => r.shortRestTrigger && r.remaining > 0));
  const hasInitiative = $derived(d.resources.some(r => r.recharge === "initiative"));
  const nameOf = (id: string) => d.resources.find(r => r.id === id)?.name ?? id;

  function openShort() {
    hd = 0;
    hpRolled = null;
    triggers = [];
    shortOpen = true;
  }

  function confirmShort() {
    const opts = {
      hitDiceToSpend: hd,
      hpRegained: hd > 0 && typeof hpRolled === "number" ? hpRolled : 0,
      optionalTriggers: [...triggers],
    };
    act(ch => shortRest(ch, opts));
    shortOpen = false;
  }

  function confirmLong() {
    act(longRest);
    longOpen = false;
  }
</script>

<Card title="Rest">
  <div class="grid grid-cols-2 gap-2 {hasInitiative ? 'sm:grid-cols-3' : ''}">
    <button type="button" class="btn" onclick={openShort}>Short rest</button>
    <button type="button" class="btn" onclick={() => (longOpen = true)}>Long rest</button>
    {#if hasInitiative}
      <button type="button" class="btn col-span-2 sm:col-span-1" onclick={() => act(onInitiative)}>Initiative rolled</button>
    {/if}
  </div>
</Card>

<Dialog bind:open={shortOpen} title="Short rest">
  <div class="space-y-4">
    <div>
      <p id="hd-label" class="font-semibold text-ink">Hit dice to spend</p>
      <p class="text-sm text-ink-muted">{hdLeft} of {d.hitDice.reduce((n, h) => n + h.total, 0)} {hdSizes} left</p>
      <div class="mt-2 flex items-center gap-3" role="group" aria-labelledby="hd-label">
        <button type="button" class="btn text-xl" aria-label="One fewer hit die" disabled={hd <= 0} onclick={() => hd--}>−</button>
        <output class="w-10 text-center text-2xl font-semibold text-ink tabular-nums" aria-live="polite">{hd}</output>
        <button type="button" class="btn text-xl" aria-label="One more hit die" disabled={hd >= hdLeft} onclick={() => hd++}>+</button>
      </div>
    </div>

    {#if hd > 0}
      <div>
        <label for="hd-hp" class="font-semibold text-ink">HP regained</label>
        <p class="text-sm text-ink-muted">Roll the hit dice you're spending and enter the total.</p>
        <input id="hd-hp" type="number" inputmode="numeric" min="0" step="1" class="field mt-2 w-full" bind:value={hpRolled} />
      </div>
    {/if}

    {#if triggerOptions.length}
      <fieldset>
        <legend class="font-semibold text-ink">Also use</legend>
        {#each triggerOptions as r (r.id)}
          <label class="mt-2 flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border-2 border-line p-3 has-[:checked]:border-accent">
            <input type="checkbox" value={r.id} bind:group={triggers} class="mt-0.5 size-5 shrink-0 accent-accent" />
            <span>
              <span class="font-semibold text-ink">{r.name}</span>
              <span class="block text-sm text-ink-muted">
                Regain {r.shortRestTrigger?.amount} {nameOf(r.shortRestTrigger?.restores ?? "")}
              </span>
            </span>
          </label>
        {/each}
      </fieldset>
    {/if}
  </div>

  {#snippet footer()}
    <button type="button" class="btn" onclick={() => (shortOpen = false)}>Cancel</button>
    <button type="button" class="btn btn-primary" onclick={confirmShort}>Take short rest</button>
  {/snippet}
</Dialog>

<Dialog bind:open={longOpen} title="Long rest">
  <p class="text-ink">Everything that recharges on a long rest comes back. You can undo this afterwards.</p>
  {#snippet footer()}
    <button type="button" class="btn" onclick={() => (longOpen = false)}>Cancel</button>
    <button type="button" class="btn btn-primary" onclick={confirmLong}>Take long rest</button>
  {/snippet}
</Dialog>
