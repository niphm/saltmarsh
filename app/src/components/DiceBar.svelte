<script lang="ts">
  import type { Character, RollMode } from "@saltmarsh/schema";
  import { rolls } from "../lib/rolls.svelte";
  import type { Change } from "../lib/store.svelte";
  import { rollSummary } from "../lib/format";
  import RollLog from "./RollLog.svelte";

  // F1.10: thumb-reach bar with the advantage toggle and the last roll; tap the result for the log.
  let { c, act }: { c: Character; act: (change: Change) => void } = $props();

  let logOpen = $state(false);
  const latest = $derived(rolls.log[0]);
  const MODES: [RollMode, string][] = [
    ["disadvantage", "Dis"],
    ["normal", "Normal"],
    ["advantage", "Adv"],
  ];
</script>

<div class="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card pb-[env(safe-area-inset-bottom)]">
  <div class="mx-auto flex max-w-5xl items-center gap-2 px-4 py-1.5">
    <fieldset class="flex shrink-0 overflow-hidden rounded-lg border-2 border-line">
      <legend class="sr-only">Next d20 roll</legend>
      {#each MODES as [mode, label] (mode)}
        <label
          class="flex min-h-11 min-w-11 cursor-pointer items-center justify-center px-2.5 text-sm font-semibold text-ink-muted hover:text-ink has-[:checked]:bg-accent has-[:checked]:text-on-accent has-[:focus-visible]:outline-3 has-[:focus-visible]:-outline-offset-3 has-[:focus-visible]:outline-focus"
        >
          <input type="radio" name="roll-mode" value={mode} checked={rolls.mode === mode} onchange={() => (rolls.mode = mode)} class="sr-only" />
          {label}
        </label>
      {/each}
    </fieldset>

    <button
      type="button"
      onclick={() => (logOpen = true)}
      class="ml-auto flex min-h-11 min-w-0 items-center justify-end gap-2 rounded-lg px-2 hover:bg-well"
      aria-label={latest ? `Last roll, ${rollSummary(latest.roll)}. Open roll log.` : "Open roll log"}
    >
      {#if latest}
        {@const r = latest.roll}
        <span class="min-w-0 truncate text-sm text-ink-muted">{r.label}</span>
        {#if r.kind === "d20" && r.natural === 20}<span class="shrink-0 text-xs font-bold text-ok">NAT 20</span>{/if}
        {#if r.kind === "d20" && r.natural === 1}<span class="shrink-0 text-xs font-bold text-danger">NAT 1</span>{/if}
        <span class="shrink-0 text-2xl font-bold text-ink tabular-nums">{r.total}</span>
      {:else}
        <span class="text-sm text-ink-muted">Tap a bonus to roll</span>
      {/if}
    </button>
  </div>
</div>

<!-- Announce each roll (and rerolls) to screen readers. -->
<div class="sr-only" aria-live="polite" aria-atomic="true">
  {#key latest ? `${latest.id}:${latest.roll.total}` : ""}
    <span>{latest ? rollSummary(latest.roll) : ""}</span>
  {/key}
</div>

<RollLog bind:open={logOpen} {c} {act} />
