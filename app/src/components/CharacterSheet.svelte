<script lang="ts">
  import { derive, type Character } from "@saltmarsh/schema";
  import SheetHeader from "./sheet/SheetHeader.svelte";
  import VitalStats from "./sheet/VitalStats.svelte";
  import AbilityScores from "./sheet/AbilityScores.svelte";
  import ActiveEffects from "./sheet/ActiveEffects.svelte";
  import SavingThrows from "./sheet/SavingThrows.svelte";
  import Senses from "./sheet/Senses.svelte";
  import Skills from "./sheet/Skills.svelte";
  import Spellcasting from "./sheet/Spellcasting.svelte";
  import Resources from "./sheet/Resources.svelte";
  import Proficiencies from "./sheet/Proficiencies.svelte";
  import Features from "./sheet/Features.svelte";

  let { character }: { character: Character } = $props();

  // The only place numbers come from. Components display, they don't calculate.
  const d = $derived(derive(character));
</script>

<div class="grid gap-3 md:grid-cols-2 md:gap-4">
  <div class="md:col-span-2"><SheetHeader c={character} {d} /></div>
  <div class="md:col-span-2"><VitalStats c={character} {d} /></div>
  <div class="md:col-span-2"><AbilityScores c={character} {d} /></div>
  {#if d.active.ids.length}
    <div class="md:col-span-2"><ActiveEffects {d} /></div>
  {/if}
  <SavingThrows c={character} {d} />
  <Senses c={character} {d} />
  <div class="md:col-span-2"><Skills c={character} {d} /></div>
  {#if d.spell}
    <Spellcasting spell={d.spell} />
  {/if}
  <Resources {d} />
  <Proficiencies c={character} />
  <div class="md:col-span-2"><Features c={character} /></div>
</div>
