<script lang="ts">
  import type { Derived } from "@saltmarsh/schema";
  import { RECHARGE_LABEL, groupBy } from "../../lib/format";
  import Card from "../Card.svelte";
  import Pips from "../Pips.svelte";

  // Rendered purely by `kind` (README rule 2). Read-only until F1.4.
  let { d }: { d: Derived } = $props();

  const groups = $derived(groupBy(d.resources, r => r.group ?? "Other"));
</script>

<Card title="Resources">
  {#each groups as [group, resources] (group)}
    <h3 class="mt-3 mb-1 text-xs font-semibold tracking-wider text-ink-muted uppercase first:mt-0">{group}</h3>
    <ul>
      {#each resources as r (r.id)}
        <li class="flex min-h-11 items-center gap-3 border-b border-line last:border-b-0">
          <span class="flex flex-col">
            <span class="text-ink">{r.name}</span>
            <span class="text-xs text-ink-muted">{RECHARGE_LABEL[r.recharge]}</span>
          </span>
          <span class="ml-auto flex items-center gap-2">
            {#if r.kind === "pips"}
              <Pips total={r.max} filled={r.remaining} />
            {:else if r.kind === "counter"}
              <span class="text-lg font-semibold text-ink tabular-nums">
                {r.remaining}<span class="text-sm font-normal text-ink-muted"> / {r.max}</span>
              </span>
            {:else if r.kind === "toggle"}
              {@const ready = r.remaining > 0}
              <span
                class="flex size-5 items-center justify-center rounded border-2 {ready ? 'border-accent bg-accent' : 'border-ink-muted'}"
                aria-hidden="true"
              >
                {#if ready}
                  <svg viewBox="0 0 16 16" class="size-3.5 text-on-accent" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path d="M3 8.5 6.5 12 13 4.5" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                {/if}
              </span>
              <span class="w-12 text-sm {ready ? 'text-ink' : 'text-ink-muted'}">{ready ? "Ready" : "Used"}</span>
            {:else}
              <span
                class="rounded-full border-2 px-3 py-0.5 text-sm font-bold tracking-wider {r.active
                  ? 'border-accent bg-accent text-on-accent'
                  : 'border-ink-muted text-ink-muted'}"
              >
                {r.active ? "ON" : "OFF"}
              </span>
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
          {hd.remaining}<span class="text-sm font-normal text-ink-muted"> / {hd.total}</span>
        </span>
      </li>
    {/each}
  </ul>
</Card>
