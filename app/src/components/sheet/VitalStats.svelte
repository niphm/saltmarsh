<script lang="ts">
  import type { Character, Derived } from "@saltmarsh/schema";
  import { signed } from "../../lib/format";

  let { c, d }: { c: Character; d: Derived } = $props();

  const otherSpeeds = $derived(
    (["fly", "swim", "climb"] as const).flatMap(k => (c.speed[k] ? [`${k} ${c.speed[k]}`] : [])),
  );
</script>

<section aria-label="Combat stats">
  <dl class="grid grid-cols-4 gap-2">
    <div class="flex flex-col rounded-xl border border-line bg-card p-3">
      <dt class="text-xs font-semibold tracking-wider text-ink-muted uppercase">
        <abbr title="Armor Class" class="no-underline">AC</abbr>
      </dt>
      <dd class="mt-1 text-2xl font-semibold text-ink tabular-nums">{d.ac}</dd>
    </div>

    <div class="flex flex-col rounded-xl border border-line bg-card p-3">
      <dt class="text-xs font-semibold tracking-wider text-ink-muted uppercase">
        <abbr title="Initiative" class="no-underline">Init</abbr>
      </dt>
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
      <dt class="text-xs font-semibold tracking-wider text-ink-muted uppercase">
        <abbr title="Proficiency bonus" class="no-underline">Prof</abbr>
      </dt>
      <dd class="mt-1 text-2xl font-semibold text-ink tabular-nums">{signed(d.prof)}</dd>
    </div>
  </dl>
</section>
