<script lang="ts">
  import { restoreResource, setActive, spendResource, type Derived } from "@saltmarsh/schema";
  import type { Change } from "../../lib/store.svelte";
  import { RECHARGE_LABEL, groupBy } from "../../lib/format";
  import Card from "../Card.svelte";
  import PipButtons from "../PipButtons.svelte";

  // F1.4: rendered purely by `kind`, grouped by `group` (README rule 2). No resource is special-cased.
  let { d, act }: { d: Derived; act: (change: Change) => void } = $props();

  const groups = $derived(groupBy(d.resources, r => r.group ?? "Other"));
</script>

<Card title="Resources">
  {#each groups as [group, resources] (group)}
    <h3 class="mt-3 mb-1 text-xs font-semibold tracking-wider text-ink-muted uppercase first:mt-0">{group}</h3>
    <ul>
      {#each resources as r (r.id)}
        <li class="flex min-h-12 items-center gap-3 border-b border-line py-0.5 last:border-b-0">
          <span class="flex min-w-0 flex-col">
            <span class="text-ink">{r.name}</span>
            <span class="text-xs text-ink-muted">{RECHARGE_LABEL[r.recharge]}</span>
          </span>
          <span class="ml-auto flex shrink-0 items-center gap-1">
            {#if r.kind === "pips"}
              <PipButtons
                name={r.name}
                total={r.max}
                filled={r.remaining}
                onspend={() => act(ch => spendResource(ch, r.id))}
                onrestore={() => act(ch => restoreResource(ch, r.id))}
              />
            {:else if r.kind === "counter"}
              <button type="button" class="btn text-xl" aria-label="Spend one {r.name}" disabled={r.remaining <= 0} onclick={() => act(ch => spendResource(ch, r.id))}>−</button>
              <output class="min-w-14 text-center text-lg font-semibold text-ink tabular-nums" aria-label="{r.name}: {r.remaining} of {r.max} left">
                {r.remaining}<span class="text-sm font-normal text-ink-muted">/{r.max}</span>
              </output>
              <button type="button" class="btn text-xl" aria-label="Regain one {r.name}" disabled={r.remaining >= r.max} onclick={() => act(ch => restoreResource(ch, r.id))}>+</button>
            {:else if r.kind === "toggle"}
              {@const ready = r.remaining > 0}
              <button
                type="button"
                role="switch"
                aria-checked={ready}
                aria-label="{r.name} available"
                onclick={() => act(ch => (ready ? spendResource(ch, r.id) : restoreResource(ch, r.id)))}
                class="flex min-h-11 items-center gap-2 rounded-lg px-2 hover:bg-well"
              >
                <span class="flex size-6 items-center justify-center rounded border-2 {ready ? 'border-accent bg-accent' : 'border-ink-muted'}" aria-hidden="true">
                  {#if ready}
                    <svg viewBox="0 0 16 16" class="size-4 text-on-accent" fill="none" stroke="currentColor" stroke-width="2.5">
                      <path d="M3 8.5 6.5 12 13 4.5" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                  {/if}
                </span>
                <span class="w-12 text-left text-sm {ready ? 'text-ink' : 'text-ink-muted'}" aria-hidden="true">{ready ? "Ready" : "Used"}</span>
              </button>
            {:else}
              <button
                type="button"
                role="switch"
                aria-checked={r.active}
                aria-label={r.name}
                onclick={() => act(ch => setActive(ch, r.id, !r.active))}
                class="flex min-h-11 min-w-20 items-center justify-center rounded-full border-2 px-4 text-base font-bold tracking-wider {r.active
                  ? 'border-accent bg-accent text-on-accent'
                  : 'border-ink-muted text-ink-muted hover:text-ink'}"
              >
                {r.active ? "ON" : "OFF"}
              </button>
            {/if}
          </span>
        </li>
      {/each}
    </ul>
  {/each}

  <h3 class="mt-3 mb-1 text-xs font-semibold tracking-wider text-ink-muted uppercase">Hit Dice</h3>
  <ul>
    {#each d.hitDice as hd, i (i)}
      <li class="flex min-h-11 items-center gap-3">
        <span class="text-ink">d{hd.size}</span>
        <span class="ml-auto text-lg font-semibold text-ink tabular-nums">
          {hd.remaining}<span class="text-sm font-normal text-ink-muted">/{hd.total}</span>
        </span>
      </li>
    {/each}
  </ul>
</Card>
