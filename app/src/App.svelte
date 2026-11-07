<script lang="ts">
  import { bundled } from "./lib/characters";
  import { router } from "./lib/route.svelte";
  import TopBar from "./components/TopBar.svelte";
  import CharacterSheet from "./components/CharacterSheet.svelte";
  import LoadError from "./components/LoadError.svelte";
  import Settings from "./components/Settings.svelte";

  const current = $derived.by(() => {
    const route = router.route;
    if (route.name !== "sheet") return undefined;
    return bundled.find(c => c.id === route.id) ?? bundled[0];
  });

  $effect(() => {
    document.title = router.route.name === "settings" ? "Settings - Saltmarsh" : current ? `${current.name} - Saltmarsh` : "Saltmarsh";
  });
</script>

<TopBar characters={bundled} currentId={current?.id} onSettings={router.route.name === "settings"} />

<main id="main" tabindex="-1" class="mx-auto max-w-5xl px-4 pt-4 pb-[calc(4rem+env(safe-area-inset-bottom))] outline-none">
  {#if router.route.name === "settings"}
    <Settings />
  {:else if current?.ok}
    {#key current.id}
      <CharacterSheet character={current.character} />
    {/key}
  {:else if current}
    <LoadError name={current.name} issues={current.issues} />
  {:else}
    <p class="text-ink-muted">No characters bundled.</p>
  {/if}
</main>
