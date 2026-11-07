<script lang="ts">
  import type { Character, Derived } from "@saltmarsh/schema";
  import { signed } from "../../lib/format";

  let { c, d }: { c: Character; d: Derived } = $props();

  const otherSpeeds = $derived(
    (["fly", "swim", "climb"] as const).flatMap(k => (c.speed[k] ? [`${k} ${c.speed[k]}`] : [])),
  );
</script>

<section aria-label="Combat stats">
  <dl class="grid grid-cols-3 gap-2 md:grid-cols-6">
    <div class="col-span-2 flex flex-col rounded-xl border border-line bg-card p-3">
      <dt class="text-xs font-semibold tracking-wider text-ink-muted uppercase">Hit Points</dt>
      <dd class="mt-1">
        <span class="text-3xl font-semibold text-ink tabular-nums">{c.state.hp.current}</span>
        <span class="text-xl text-ink-muted tabular-nums">/ {d.hpMax}</span>
        {#if c.state.hp.temp > 0}
          <span class="ml-1 rounded-full bg-well px-2 py-0.5 text-sm font-semibold text-info">+{c.state.hp.temp} temp</span>
        {/if}
      </dd>
    </div>

    <div class="flex flex-col rounded-xl border border-line bg-card p-3">
      <dt class="text-xs font-semibold tracking-wider text-ink-muted uppercase">
        <abbr title="Armor Class" class="no-underline">AC</abbr>
      </dt>
      <dd class="mt-1 text-3xl font-semibold text-ink tabular-nums">{d.ac}</dd>
    </div>

    <div class="flex flex-col rounded-xl border border-line bg-card p-3">
      <dt class="text-xs font-semibold tracking-wider text-ink-muted uppercase">Initiative</dt>
      <dd class="mt-1 text-2xl font-semibold text-ink tabular-nums">{signed(d.initiative)}</dd>
    </div>

    <div class="flex flex-col rounded-xl border border-line bg-card p-3">
      <dt class="text-xs font-semibold tracking-wider text-ink-muted uppercase">Speed</dt>
      <dd class="mt-1">
        <span class="text-2xl font-semibold text-ink tabular-nums">{d.speed}</span>
        <span class="text-sm text-ink-muted">ft</span>
        {#if otherSpeeds.length}
          <span class="block text-xs text-ink-muted">{otherSpeeds.join(", ")}</span>
        {/if}
      </dd>
    </div>

    <div class="flex flex-col rounded-xl border border-line bg-card p-3">
      <dt class="text-xs font-semibold tracking-wider text-ink-muted uppercase">Proficiency</dt>
      <dd class="mt-1 text-2xl font-semibold text-ink tabular-nums">{signed(d.prof)}</dd>
    </div>
  </dl>
</section>
