<script lang="ts">
  import type { Character, Derived } from "@saltmarsh/schema";
  import { capitalize, classLine, refName } from "../../lib/format";

  let { c, d }: { c: Character; d: Derived } = $props();

  const species = $derived(`${refName(c.identity.species)}${c.identity.lineage ? ` (${c.identity.lineage})` : ""}`);
</script>

<header class="rounded-xl border border-line bg-card p-4">
  <h1 class="font-display text-3xl leading-tight font-semibold text-ink">{c.identity.name}</h1>
  <p class="mt-1 text-lg text-ink">{classLine(c.classes)}</p>
  <dl class="mt-3 flex flex-wrap gap-2 text-sm">
    <div class="flex gap-1 rounded-full bg-well px-3 py-1">
      <dt class="text-ink-muted">Level</dt>
      <dd class="font-semibold text-ink">{d.level}</dd>
    </div>
    <div class="flex gap-1 rounded-full bg-well px-3 py-1">
      <dt class="text-ink-muted">Species</dt>
      <dd class="text-ink">{species}</dd>
    </div>
    {#if c.identity.background}
      <div class="flex gap-1 rounded-full bg-well px-3 py-1">
        <dt class="text-ink-muted">Background</dt>
        <dd class="text-ink">{refName(c.identity.background)}</dd>
      </div>
    {/if}
    <div class="flex gap-1 rounded-full bg-well px-3 py-1">
      <dt class="text-ink-muted">Size</dt>
      <dd class="text-ink">{capitalize(c.size)}</dd>
    </div>
    {#if c.identity.alignment}
      <div class="flex gap-1 rounded-full bg-well px-3 py-1">
        <dt class="text-ink-muted">Alignment</dt>
        <dd class="text-ink">{c.identity.alignment}</dd>
      </div>
    {/if}
  </dl>
</header>
