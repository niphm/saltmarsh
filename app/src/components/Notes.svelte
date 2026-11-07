<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import { setNotes, type Character } from "@saltmarsh/schema";
  import { characters } from "../lib/store.svelte";
  import { loadMarkdown } from "../lib/markdown";

  // F1.14: per-character markdown scratchpad. Autosaves after a pause and on leaving the field/page.
  let { c }: { c: Character } = $props();

  // Saves go to the character this view opened for, even if navigation has moved on by the time they fire.
  const id = untrack(() => c.id);
  let draft = $state(untrack(() => c.notes));
  let saved = $state(untrack(() => c.notes));
  let mode = $state<"edit" | "preview">(untrack(() => (c.notes.trim() ? "preview" : "edit")));
  let html = $state("");
  let timer: ReturnType<typeof setTimeout> | undefined;

  // Outside changes (undo, import) replace the draft unless there's unsaved typing.
  $effect(() => {
    const incoming = c.notes;
    untrack(() => {
      if (draft === saved) draft = incoming;
      saved = incoming;
    });
  });

  function save() {
    clearTimeout(timer);
    timer = undefined;
    const text = draft;
    if (text !== saved) void characters.apply(id, ch => setNotes(ch, text));
  }

  function scheduleSave() {
    clearTimeout(timer);
    timer = setTimeout(save, 800);
  }

  // Phones background tabs without warning: save when the page is hidden.
  $effect(() => {
    const onHide = () => document.visibilityState === "hidden" && save();
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  });
  onDestroy(save);

  $effect(() => {
    if (mode !== "preview") return;
    const text = draft;
    void loadMarkdown().then(render => (html = render(text)));
  });

  const MODES = [
    ["edit", "Edit"],
    ["preview", "Preview"],
  ] as const;
</script>

<section aria-labelledby="notes-heading" class="rounded-xl border border-line bg-card p-4">
  <div class="flex items-center justify-between gap-3">
    <h1 id="notes-heading" class="font-display text-sm font-semibold tracking-widest text-accent uppercase">
      Notes<span class="sr-only"> for {c.identity.name}</span>
    </h1>
    <div role="group" aria-label="Notes view" class="flex overflow-hidden rounded-lg border-2 border-line">
      {#each MODES as [m, label] (m)}
        <button
          type="button"
          aria-pressed={mode === m}
          onclick={() => {
            if (m === "preview") save();
            mode = m;
          }}
          class="min-h-11 min-w-11 px-3 text-sm font-semibold {mode === m ? 'bg-accent text-on-accent' : 'text-ink-muted hover:text-ink'}"
        >
          {label}
        </button>
      {/each}
    </div>
  </div>
  <p class="mt-1 text-xs text-ink-muted">
    {draft === saved ? "Saved on this device." : "Saving…"} Markdown works: # headings, - lists, **bold**, [links](https://example.com).
  </p>

  {#if mode === "edit"}
    <label for="notes-text" class="sr-only">Notes (markdown)</label>
    <textarea
      id="notes-text"
      bind:value={draft}
      oninput={scheduleSave}
      onblur={save}
      rows="16"
      spellcheck="true"
      placeholder="NPCs, debts, clues, rulings…"
      class="field mt-3 h-auto min-h-[50dvh] w-full py-2 font-mono text-sm leading-relaxed"
    ></textarea>
  {:else if draft.trim()}
    <!-- Sanitized by DOMPurify in lib/markdown.ts. -->
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    <div class="prose-notes mt-3">{@html html}</div>
  {:else}
    <p class="mt-3 text-ink-muted">No notes yet. Switch to Edit to start.</p>
  {/if}
</section>

{#if c.identity.description || c.identity.backstory}
  <section aria-labelledby="backstory-heading" class="mt-3 rounded-xl border border-line bg-card p-4">
    <h2 id="backstory-heading" class="font-display text-sm font-semibold tracking-widest text-accent uppercase">Character</h2>
    {#if c.identity.description}<p class="mt-2 whitespace-pre-line text-ink">{c.identity.description}</p>{/if}
    {#if c.identity.backstory}<p class="mt-2 whitespace-pre-line text-ink">{c.identity.backstory}</p>{/if}
  </section>
{/if}
