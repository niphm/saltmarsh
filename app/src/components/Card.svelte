<script lang="ts">
  import type { Snippet } from "svelte";

  let { title, children, class: klass = "" }: { title: string; children: Snippet; class?: string } = $props();

  const headingId = $derived(`card-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`);
</script>

<section aria-labelledby={headingId} class="rounded-xl border border-line bg-card p-4 {klass}">
  <h2 id={headingId} class="mb-3 font-display text-sm font-semibold tracking-widest text-accent uppercase">
    {title}
  </h2>
  {@render children()}
</section>
