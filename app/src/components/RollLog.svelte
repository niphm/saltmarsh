<script lang="ts">
  import { setInspiration, type Character } from "@saltmarsh/schema";
  import { rolls } from "../lib/rolls.svelte";
  import type { Change } from "../lib/store.svelte";
  import { ROLL_MODE_LABEL, clockTime as time, rollExtras } from "../lib/format";
  import Dialog from "./Dialog.svelte";

  let { open = $bindable(false), c, act }: { open?: boolean; c: Character; act: (change: Change) => void } = $props();
</script>

<Dialog bind:open title="Rolls">
  <div class="flex items-center justify-between gap-3 rounded-lg bg-well p-3">
    <span class="font-semibold text-ink">Heroic Inspiration</span>
    <button
      type="button"
      role="switch"
      aria-checked={c.state.inspiration}
      aria-label="Heroic Inspiration"
      onclick={() => act(ch => setInspiration(ch, !ch.state.inspiration))}
      class="flex min-h-11 min-w-20 items-center justify-center rounded-full border-2 px-4 font-bold tracking-wider {c.state.inspiration
        ? 'border-accent bg-accent text-on-accent'
        : 'border-ink-muted text-ink-muted'}"
    >
      {c.state.inspiration ? "ON" : "OFF"}
    </button>
  </div>
  <p class="mt-2 text-sm text-ink-muted">Tap a die to reroll it and use the new result (Lucky, Heroic Inspiration).</p>

  {#if rolls.log.length}
    <ol class="mt-2">
      {#each rolls.log as e (e.id)}
        {@const r = e.roll}
        <li class="border-b border-line py-2 last:border-b-0">
          <div class="flex items-baseline justify-between gap-3">
            <span class="font-semibold text-ink">{r.label}</span>
            <span class="text-2xl font-bold text-ink tabular-nums">{r.total}</span>
          </div>
          <div class="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-ink-muted">
            {#each r.dice as die, i (i)}
              {@const used = r.kind === "damage" || i === r.kept}
              <button
                type="button"
                onclick={() => rolls.reroll(e.id, i)}
                aria-label="Reroll d{die.sides} showing {die.value}{used ? '' : ' (not used)'}{die.rerolled ? ', already rerolled' : ''}"
                class="flex size-11 flex-col items-center justify-center rounded-lg border-2 leading-none tabular-nums {used
                  ? 'border-accent font-bold text-ink'
                  : 'border-line text-ink-muted line-through'}"
              >
                <span>{die.value}{die.rerolled ? "*" : ""}</span>
                <span class="text-[10px] font-normal text-ink-muted no-underline">d{die.sides}</span>
              </button>
            {/each}
            <span>{rollExtras(r)}</span>
            {#if r.kind === "d20" && r.natural === 20}<span class="font-bold text-ok">Natural 20</span>{/if}
            {#if r.kind === "d20" && r.natural === 1}<span class="font-bold text-danger">Natural 1</span>{/if}
          </div>
          <p class="mt-0.5 text-xs text-ink-muted">
            {e.who} · {time(e.at)}{r.kind === "d20" && r.mode !== "normal" ? ` · ${ROLL_MODE_LABEL[r.mode]}` : ""}{r.kind === "damage" && r.type
              ? ` · ${r.type}`
              : ""}{r.dice.some(x => x.rerolled) ? " · * rerolled" : ""}
          </p>
        </li>
      {/each}
    </ol>
  {:else}
    <p class="mt-3 text-ink-muted">No rolls yet. Tap any bonus on the sheet to roll.</p>
  {/if}

  {#snippet footer()}
    <button type="button" class="btn" disabled={!rolls.log.length} onclick={() => rolls.clear()}>Clear</button>
    <button type="button" class="btn btn-primary" onclick={() => (open = false)}>Done</button>
  {/snippet}
</Dialog>
