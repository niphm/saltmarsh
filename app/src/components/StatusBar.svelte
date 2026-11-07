<script lang="ts">
  import { endConcentration, type Character, type Derived } from "@saltmarsh/schema";
  import type { Change } from "../lib/store.svelte";
  import { HP_BAND_LABEL, HP_BAND_TEXT, LIFE_LABEL, capitalize, refName } from "../lib/format";

  // F1.11: HP, AC, concentration, conditions, active states - always visible while scrolling.
  let {
    c,
    d,
    act,
    canUndo,
    onundo,
  }: { c: Character; d: Derived; act: (change: Change) => void; canUndo: boolean; onundo: () => void } = $props();

  const conditions = $derived(c.state.conditions.filter(k => k.condition !== "exhaustion"));
  const activeNames = $derived(d.resources.filter(r => r.active).map(r => r.name));
  const lastChange = $derived(c.state.log.at(-1)?.change);
  const hpWord = $derived(d.life === "alive" ? HP_BAND_LABEL[d.hpBand] : LIFE_LABEL[d.life]);
  const hasChips = $derived(
    !!c.state.concentration || activeNames.length > 0 || conditions.length > 0 || d.exhaustion.level > 0 || d.defenses.resistances.length > 0,
  );

  function goToHp() {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("hp-panel")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    document.getElementById("hp-amount")?.focus({ preventScroll: true });
  }
</script>

<div class="sticky top-0 z-30 border-b border-line bg-card pt-[env(safe-area-inset-top)]" role="region" aria-label="Status">
  <div class="mx-auto flex max-w-5xl items-center gap-3 px-4 py-1">
    <button
      type="button"
      onclick={goToHp}
      class="-ml-1 flex min-h-11 items-center gap-1.5 rounded-lg px-1 hover:bg-well"
      aria-label="Hit points {c.state.hp.current} of {d.hpMax}{c.state.hp.temp ? `, plus ${c.state.hp.temp} temporary` : ''}, {hpWord}. Go to HP controls."
    >
      <svg viewBox="0 0 24 24" class="size-5 {HP_BAND_TEXT[d.hpBand]}" fill="currentColor" aria-hidden="true">
        <path d="M12 21s-7.4-4.5-9.5-9.1C1.1 8.7 3.2 5 6.8 5c2 0 3.5 1.1 4.3 2.4h1.8C13.7 6.1 15.2 5 17.2 5c3.6 0 5.7 3.7 4.3 6.9C19.4 16.5 12 21 12 21Z" />
      </svg>
      <span class="text-xl font-semibold text-ink tabular-nums">
        {c.state.hp.current}<span class="text-base text-ink-muted">/{d.hpMax}</span>
      </span>
      {#if c.state.hp.temp > 0}
        <span class="text-sm font-semibold text-info tabular-nums">+{c.state.hp.temp}</span>
      {/if}
      <span class="text-xs font-bold tracking-wide uppercase {HP_BAND_TEXT[d.hpBand]}">{hpWord}</span>
    </button>

    <span class="flex items-center gap-1">
      <svg viewBox="0 0 24 24" class="size-5 text-ink-muted" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M12 3 4.5 6v5.5c0 4.5 3.2 8.4 7.5 9.5 4.3-1.1 7.5-5 7.5-9.5V6L12 3Z" stroke-linejoin="round" />
      </svg>
      <span class="sr-only">Armor class</span>
      <span class="text-xl font-semibold text-ink tabular-nums">{d.ac}</span>
    </span>

    <button
      type="button"
      class="btn ml-auto"
      disabled={!canUndo}
      onclick={onundo}
      aria-label={canUndo && lastChange ? `Undo: ${lastChange}` : "Undo (nothing to undo)"}
      title={canUndo && lastChange ? `Undo: ${lastChange}` : undefined}
    >
      <svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      Undo
    </button>
  </div>

  {#if hasChips}
    <ul class="mx-auto flex max-w-5xl flex-wrap items-center gap-1.5 px-4 pb-2 text-sm" aria-label="In effect">
      {#if c.state.concentration}
        <li class="inline-flex items-center rounded-full border-2 border-info pl-3 font-semibold text-info">
          Concentrating: {refName(c.state.concentration.spell)}
          <button
            type="button"
            class="flex size-11 items-center justify-center rounded-full text-lg"
            aria-label="End concentration on {refName(c.state.concentration.spell)}"
            onclick={() => act(endConcentration)}>×</button
          >
        </li>
      {/if}
      {#each activeNames as name (name)}
        <li class="rounded-full border-2 border-accent bg-accent px-3 py-0.5 font-bold text-on-accent">{name}</li>
      {/each}
      {#each conditions as k (k.condition)}
        <li class="rounded-full border-2 border-warn px-3 py-0.5 font-semibold text-warn">{capitalize(k.condition)}</li>
      {/each}
      {#if d.exhaustion.level > 0}
        <li class="rounded-full border-2 border-warn px-3 py-0.5 font-semibold text-warn">Exhaustion {d.exhaustion.level}</li>
      {/if}
      {#if d.defenses.resistances.length}
        <li class="rounded-full border-2 border-line px-3 py-0.5 text-ink">
          <span class="text-ink-muted">Resist</span> {d.defenses.resistances.map(capitalize).join(", ")}
        </li>
      {/if}
    </ul>
  {/if}
</div>
