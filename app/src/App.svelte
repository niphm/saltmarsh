<script lang="ts">
  import { derive } from "@saltmarsh/schema";
  import { characters, type Change } from "./lib/store.svelte";
  import { router } from "./lib/route.svelte";
  import TopBar from "./components/TopBar.svelte";
  import StatusBar from "./components/StatusBar.svelte";
  import DiceBar from "./components/DiceBar.svelte";
  import CharacterSheet from "./components/CharacterSheet.svelte";
  import LoadError from "./components/LoadError.svelte";
  import Settings from "./components/Settings.svelte";

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
    document.title =
      router.route.name === "settings" ? "Settings - Saltmarsh" : current ? `${current.name} - Saltmarsh` : "Saltmarsh";
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
    <Settings />
  {:else if !characters.ready}
    <p class="text-ink-muted">Loading characters…</p>
  {:else if current?.ok && d}
    {#key current.id}
      <CharacterSheet character={current.character} {d} {act} />
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
