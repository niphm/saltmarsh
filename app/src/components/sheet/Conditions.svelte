<script lang="ts">
  import {
    Condition,
    MAX_EXHAUSTION,
    addEffect,
    removeEffect,
    setExhaustion,
    toggleCondition,
    type Character,
    type Derived,
  } from "@saltmarsh/schema";
  import type { Change } from "../../lib/store.svelte";
  import { capitalize } from "../../lib/format";
  import Card from "../Card.svelte";

  // F1.8. The 15 standard conditions come from the schema enum.
  let { c, d, act }: { c: Character; d: Derived; act: (change: Change) => void } = $props();

  const CONDITIONS = Condition.options.filter(x => x !== "exhaustion");
  let effectText = $state("");

  function addFx(e: SubmitEvent) {
    e.preventDefault();
    const text = effectText;
    if (!text.trim()) return;
    act(ch => addEffect(ch, text));
    effectText = "";
  }
</script>

<Card title="Conditions">
  <ul class="flex flex-wrap gap-2">
    {#each CONDITIONS as cond (cond)}
      {@const on = c.state.conditions.some(k => k.condition === cond)}
      <li>
        <button
          type="button"
          aria-pressed={on}
          onclick={() => act(ch => toggleCondition(ch, cond))}
          class="inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 px-3 text-sm font-semibold {on
            ? 'border-warn bg-warn text-page'
            : 'border-line text-ink hover:bg-well'}"
        >
          {#if on}
            <svg viewBox="0 0 16 16" class="size-3.5" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
              <path d="M3 8.5 6.5 12 13 4.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          {/if}
          {capitalize(cond)}
        </button>
      </li>
    {/each}
  </ul>

  <div class="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3">
    <div>
      <p id="exh-label" class="font-semibold text-ink">Exhaustion</p>
      {#if d.exhaustion.level > 0}
        <p class="text-sm text-warn">−{d.exhaustion.d20Penalty} to D20 Tests · −{d.exhaustion.speedPenalty} ft speed</p>
      {/if}
    </div>
    <div role="group" aria-labelledby="exh-label" class="flex items-center gap-2">
      <button
        type="button"
        class="btn text-xl"
        aria-label="Lower exhaustion"
        disabled={d.exhaustion.level === 0}
        onclick={() => act(ch => setExhaustion(ch, d.exhaustion.level - 1))}>−</button
      >
      <output class="w-8 text-center text-xl font-semibold text-ink tabular-nums" aria-live="polite">{d.exhaustion.level}</output>
      <button
        type="button"
        class="btn text-xl"
        aria-label="Raise exhaustion"
        disabled={d.exhaustion.level >= MAX_EXHAUSTION}
        onclick={() => act(ch => setExhaustion(ch, d.exhaustion.level + 1))}>+</button
      >
    </div>
  </div>

  <div class="mt-3 border-t border-line pt-3">
    <h3 class="text-xs font-semibold tracking-wider text-ink-muted uppercase">Other effects</h3>
    {#if c.state.effects.length}
      <ul class="mt-1">
        {#each c.state.effects as fx (fx.id)}
          <li class="flex min-h-11 items-center gap-2 border-b border-line">
            <span class="flex-1 text-ink">
              {fx.text}
              {#if fx.until}<span class="block text-xs text-ink-muted">until {fx.until}</span>{/if}
            </span>
            <button type="button" class="btn border-transparent text-xl" aria-label="Remove {fx.text}" onclick={() => act(ch => removeEffect(ch, fx.id))}>×</button>
          </li>
        {/each}
      </ul>
    {/if}
    <form class="mt-2 flex gap-2" onsubmit={addFx}>
      <label for="fx-text" class="sr-only">New effect</label>
      <input id="fx-text" class="field flex-1" placeholder="e.g. Bless: +1d4 to attacks and saves" bind:value={effectText} />
      <button type="submit" class="btn" disabled={!effectText.trim()}>Add</button>
    </form>
  </div>
</Card>
