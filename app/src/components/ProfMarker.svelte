<script lang="ts">
  import { PROF_LABEL, type ProfLevel } from "../lib/format";

  // Shape, not color, carries the meaning: empty / half / full circle, diamond for expertise.
  let { level }: { level: ProfLevel } = $props();
</script>

<svg viewBox="0 0 16 16" class="size-4 shrink-0 {level === 'none' ? 'text-ink-muted' : 'text-accent'}" aria-hidden="true">
  {#if level === "expert"}
    <path d="M8 1.5 14.5 8 8 14.5 1.5 8Z" fill="currentColor" />
  {:else if level === "proficient"}
    <circle cx="8" cy="8" r="6" fill="currentColor" />
  {:else if level === "half"}
    <circle cx="8" cy="8" r="5.25" fill="none" stroke="currentColor" stroke-width="1.5" />
    <path d="M8 2.75a5.25 5.25 0 0 0 0 10.5Z" fill="currentColor" />
  {:else}
    <circle cx="8" cy="8" r="5.25" fill="none" stroke="currentColor" stroke-width="1.5" />
  {/if}
</svg>
<span class="sr-only">{PROF_LABEL[level]}</span>
