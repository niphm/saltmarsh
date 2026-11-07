<script lang="ts">
  import type { Snippet } from "svelte";

  /** Native <dialog>: focus trap, Escape to close and backdrop come from the browser. */
  let {
    open = $bindable(false),
    title,
    children,
    footer,
  }: { open?: boolean; title: string; children: Snippet; footer: Snippet } = $props();

  let el = $state<HTMLDialogElement>();
  const headingId = `dialog-${Math.random().toString(36).slice(2, 8)}`;

  $effect(() => {
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  });
</script>

<dialog
  bind:this={el}
  aria-labelledby={headingId}
  onclose={() => (open = false)}
  class="m-auto max-h-[calc(100dvh-2rem)] w-[min(30rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-line bg-card p-0 text-ink backdrop:bg-page/80"
>
  <div class="p-4">
    <h2 id={headingId} class="font-display text-xl font-semibold text-ink">{title}</h2>
    <div class="mt-3">{@render children()}</div>
  </div>
  <div class="flex flex-wrap justify-end gap-2 border-t border-line p-4">
    {@render footer()}
  </div>
</dialog>
