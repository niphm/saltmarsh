<script lang="ts">
  /**
   * Tappable pips. Tap a filled pip to spend one, an empty pip to regain one.
   * Each pip is a 44px target around a smaller circle.
   */
  let {
    name,
    total,
    filled,
    onspend,
    onrestore,
  }: { name: string; total: number; filled: number; onspend: () => void; onrestore: () => void } = $props();
</script>

<div role="group" aria-label="{name}: {filled} of {total} left" class="-mr-2.5 flex flex-wrap justify-end">
  {#each { length: total }, i (i)}
    {@const isFilled = i < filled}
    <button
      type="button"
      onclick={() => (isFilled ? onspend() : onrestore())}
      aria-label={isFilled ? `Spend one ${name}` : `Regain one ${name}`}
      class="group flex size-11 items-center justify-center rounded-full"
    >
      <span
        class="size-5 rounded-full border-2 transition-colors {isFilled
          ? 'border-accent bg-accent'
          : 'border-ink-muted bg-transparent group-hover:border-ink'}"
      ></span>
    </button>
  {/each}
</div>
