<script lang="ts">
  /** Read-only row of circles: `filled` of `total`. */
  let { total, filled }: { total: number; filled: number } = $props();
</script>

<span class="inline-flex flex-wrap gap-1" aria-hidden="true">
  {#each { length: total }, i (i)}
    <span
      class="size-4 rounded-full border-2 {i < filled ? 'border-accent bg-accent' : 'border-ink-muted bg-transparent'}"
    ></span>
  {/each}
</span>
<span class="sr-only">{filled} of {total} remaining</span>
