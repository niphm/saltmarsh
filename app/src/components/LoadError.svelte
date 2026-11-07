<script lang="ts">
  let { name, issues }: { name: string; issues: string[] } = $props();
</script>

<section role="alert" class="rounded-xl border-2 border-danger bg-card p-4">
  <h1 class="flex items-center gap-2 font-display text-2xl font-semibold text-ink">
    <svg viewBox="0 0 24 24" class="size-6 shrink-0 text-danger" fill="currentColor" aria-hidden="true">
      <path d="M12 2 1 21h22L12 2Zm1 15h-2v-2h2v2Zm0-4h-2V9h2v4Z" />
    </svg>
    Couldn't load {name}
  </h1>
  <p class="mt-2 text-ink">
    This character file doesn't match the schema. Fix {issues.length === 1 ? "this field" : "these fields"} and reload:
  </p>
  <ul class="mt-3 space-y-1 rounded-lg bg-well p-3 font-mono text-sm text-ink">
    {#each issues as issue, i (i)}
      <li>{issue}</li>
    {/each}
  </ul>
</section>
