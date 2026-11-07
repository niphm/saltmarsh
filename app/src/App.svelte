<script lang="ts">
  import { derive } from "@saltmarsh/schema";
  import { characters, type Change } from "./lib/store.svelte";
  import { href, router } from "./lib/route.svelte";

  // Not on the first screen: loaded on demand to keep the main bundle small (precached for offline).
  const loadNotes = () => import("./components/Notes.svelte");
  const loadSettings = () => import("./components/Settings.svelte");
  import TopBar from "./components/TopBar.svelte";
  import StatusBar from "./components/StatusBar.svelte";
  import DiceBar from "./components/DiceBar.svelte";
  import CharacterSheet from "./components/CharacterSheet.svelte";
  import LoadError from "./components/LoadError.svelte";

  const current = $derived.by(() => {
    const route = router.route;
    if (route.name !== "sheet") return undefined;
    return characters.find(route.id) ?? characters.entries[0];
  });

  // The one place derive() runs for the open sheet.
  const d = $derived(current?.ok ? derive(current.character) : undefined);

  function act(change: Change) {
    if (current?.ok) void characters.apply(current.id, change);
  }

  $effect(() => {
    const route = router.route;
    document.title =
      route.name === "settings"
        ? "Settings - Saltmarsh"
        : current
          ? `${route.view === "notes" ? "Notes - " : ""}${current.name} - Saltmarsh`
          : "Saltmarsh";
  });
</script>

<TopBar characters={characters.entries} currentId={current?.id} onSettings={router.route.name === "settings"} />

{#if current?.ok && d}
  <StatusBar
    c={current.character}
    {d}
    {act}
    canUndo={characters.canUndo(current.id)}
    onundo={() => void characters.undo(current.id)}
  />
{/if}

<main id="main" tabindex="-1" class="mx-auto max-w-5xl px-4 pt-4 pb-[calc(6rem+env(safe-area-inset-bottom))] outline-none">
  {#if characters.storageError}
    <p role="alert" class="mb-3 rounded-lg border-2 border-danger bg-card p-3 text-sm text-ink">
      <span class="font-semibold text-danger">Not saving:</span>
      {characters.storageError}
    </p>
  {/if}

  {#if router.route.name === "settings"}
    {#await loadSettings() then { default: Settings }}
      <Settings />
    {/await}
  {:else if !characters.ready}
    <p class="text-ink-muted">Loading characters…</p>
  {:else if current?.ok && d}
    {@const view = router.route.name === "sheet" ? router.route.view : "sheet"}
    <nav aria-label="Character views" class="mb-3 flex gap-1 border-b border-line">
      {#each [["sheet", "Sheet", href.sheet(current.id)], ["notes", "Notes", href.notes(current.id)]] as [v, label, url] (v)}
        <a
          href={url}
          aria-current={view === v ? "page" : undefined}
          class="inline-flex min-h-11 items-center border-b-2 px-4 {view === v ? 'border-accent font-semibold text-ink' : 'border-transparent text-ink-muted hover:text-ink'}"
          >{label}</a
        >
      {/each}
    </nav>
    {#key current.id}
      {#if view === "notes"}
        {#await loadNotes() then { default: Notes }}
          <Notes c={current.character} />
        {/await}
      {:else}
        <CharacterSheet character={current.character} {d} {act} />
      {/if}
    {/key}
  {:else if current && !current.ok}
    <LoadError name={current.name} issues={current.issues} />
  {:else}
    <p class="text-ink-muted">No characters yet.</p>
  {/if}
</main>

{#if router.route.name === "sheet" && current?.ok}
  <DiceBar c={current.character} {act} />
{/if}

<!-- Announces each change and undo to screen readers. -->
<div class="sr-only" aria-live="polite" aria-atomic="true">
  {#key characters.announcement.seq}
    <span>{characters.announcement.text}</span>
  {/key}
</div>
