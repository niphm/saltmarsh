<script lang="ts">
  import type { Character, Derived } from "@saltmarsh/schema";
  import type { Change } from "../lib/store.svelte";
  import { rolls, type Roller } from "../lib/rolls.svelte";
  import SheetHeader from "./sheet/SheetHeader.svelte";
  import HpPanel from "./sheet/HpPanel.svelte";
  import RestPanel from "./sheet/RestPanel.svelte";
  import VitalStats from "./sheet/VitalStats.svelte";
  import AbilityScores from "./sheet/AbilityScores.svelte";
  import ActiveEffects from "./sheet/ActiveEffects.svelte";
  import Attacks from "./sheet/Attacks.svelte";
  import Resources from "./sheet/Resources.svelte";
  import Spellcasting from "./sheet/Spellcasting.svelte";
  import Conditions from "./sheet/Conditions.svelte";
  import SavingThrows from "./sheet/SavingThrows.svelte";
  import Senses from "./sheet/Senses.svelte";
  import Skills from "./sheet/Skills.svelte";
  import Proficiencies from "./sheet/Proficiencies.svelte";
  import Features from "./sheet/Features.svelte";

  // `d` comes from derive() in App - components display numbers, they never calculate them.
  // `act` applies an engine function to this character (saved + undoable).
  let { character, d, act }: { character: Character; d: Derived; act: (change: Change) => void } = $props();

  // Rolls for this character; d20 Tests carry the derived exhaustion penalty.
  const roll: Roller = {
    d20: (label, modifier) => rolls.d20(character.identity.name, label, modifier, d.exhaustion.d20Penalty),
    damage: (label, dice, bonus, type) => rolls.damage(character.identity.name, label, dice, bonus, type),
  };
</script>

<div class="grid gap-3 md:grid-cols-2 md:gap-4">
  <div class="md:col-span-2"><SheetHeader c={character} {d} /></div>
  <HpPanel c={character} {d} {act} />
  <div class="flex flex-col gap-3 md:gap-4">
    <RestPanel {d} {act} />
    <VitalStats c={character} {d} {roll} />
  </div>
  <div class="md:col-span-2"><AbilityScores c={character} {d} {roll} /></div>
  {#if d.active.ids.length}
    <div class="md:col-span-2"><ActiveEffects {d} /></div>
  {/if}
  <Attacks {d} {roll} />
  <Resources {d} {act} />
  {#if d.spell}
    <Spellcasting spell={d.spell} {act} {roll} />
  {/if}
  <Conditions c={character} {d} {act} />
  <SavingThrows c={character} {d} {roll} />
  <Senses c={character} {d} />
  <Proficiencies c={character} />
  <div class="md:col-span-2"><Skills c={character} {d} {roll} /></div>
  <div class="md:col-span-2"><Features c={character} /></div>
</div>
