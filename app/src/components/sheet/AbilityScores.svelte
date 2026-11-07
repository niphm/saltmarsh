<script lang="ts">
  import { ABILITIES, type Character, type Derived } from "@saltmarsh/schema";
  import type { Roller } from "../../lib/rolls.svelte";
  import { ABILITY_NAME, abilityAbbr, signed } from "../../lib/format";

  let { c, d, roll }: { c: Character; d: Derived; roll: Roller } = $props();
</script>

<section aria-labelledby="abilities-heading">
  <h2 id="abilities-heading" class="sr-only">Ability scores (tap to roll a check)</h2>
  <ul class="grid grid-cols-3 gap-2 md:grid-cols-6">
    {#each ABILITIES as a (a)}
      <li>
        <button
          type="button"
          onclick={() => roll.d20(`${ABILITY_NAME[a]} check`, d.mods[a])}
          aria-label="{ABILITY_NAME[a]} {c.abilityScores[a]}, modifier {signed(d.mods[a])}. Roll a {ABILITY_NAME[a]} check."
          class="flex w-full flex-col items-center rounded-xl border border-line bg-card px-2 pt-2 pb-3 hover:bg-well"
        >
          <span class="text-xs font-semibold tracking-widest text-accent" aria-hidden="true">{abilityAbbr(a)}</span>
          <span class="text-3xl font-semibold text-ink tabular-nums" aria-hidden="true">{signed(d.mods[a])}</span>
          <span class="mt-1 rounded-full bg-well px-2.5 py-0.5 text-sm text-ink tabular-nums" aria-hidden="true">{c.abilityScores[a]}</span>
        </button>
      </li>
    {/each}
  </ul>
</section>
