<script lang="ts">
  import { ABILITIES, type Character, type Derived } from "@saltmarsh/schema";
  import type { Roller } from "../../lib/rolls.svelte";
  import { ABILITY_NAME, signed } from "../../lib/format";
  import Card from "../Card.svelte";
  import ProfMarker from "../ProfMarker.svelte";

  let { c, d, roll }: { c: Character; d: Derived; roll: Roller } = $props();
</script>

<Card title="Saving Throws">
  <ul class="grid grid-cols-2 gap-x-4">
    {#each ABILITIES as a (a)}
      <li>
        <button
          type="button"
          onclick={() => roll.d20(`${ABILITY_NAME[a]} save`, d.saves[a])}
          class="-mx-1 flex min-h-11 w-[calc(100%+0.5rem)] items-center gap-2 rounded-lg px-1 text-left hover:bg-well"
        >
          <ProfMarker level={c.proficiencies.saves.includes(a) ? "proficient" : "none"} />
          <span class="text-ink">{ABILITY_NAME[a]}</span>
          <span class="ml-auto font-semibold text-ink tabular-nums">{signed(d.saves[a])}</span>
        </button>
      </li>
    {/each}
  </ul>
</Card>
