<script lang="ts">
  import type { Character } from "@saltmarsh/schema";
  import Card from "../Card.svelte";

  let { c }: { c: Character } = $props();
</script>

<Card title="Features & Traits">
  {#if c.features.length}
    <ul class="grid gap-x-6 md:grid-cols-2">
      {#each c.features as f (f.ref)}
        <li class="border-b border-line py-2 last:border-b-0">
          <p class="flex flex-wrap items-baseline gap-x-2">
            <span class="font-semibold text-ink">{f.name}</span>
            <span class="text-xs text-ink-muted">{f.source}</span>
          </p>
          {#if f.textOverride ?? f.summary}
            <p class="mt-0.5 text-sm text-ink-muted">{f.textOverride ?? f.summary}</p>
          {/if}
        </li>
      {/each}
    </ul>
  {:else}
    <p class="text-sm text-ink-muted">No features listed.</p>
  {/if}
</Card>
