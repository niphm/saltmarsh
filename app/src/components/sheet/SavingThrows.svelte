<script lang="ts">
  import { ABILITIES, type Character, type Derived } from "@saltmarsh/schema";
  import { ABILITY_NAME, signed } from "../../lib/format";
  import Card from "../Card.svelte";
  import ProfMarker from "../ProfMarker.svelte";

  let { c, d }: { c: Character; d: Derived } = $props();
</script>

<Card title="Saving Throws">
  <ul class="grid grid-cols-2 gap-x-4">
    {#each ABILITIES as a (a)}
      <li class="flex min-h-9 items-center gap-2">
        <ProfMarker level={c.proficiencies.saves.includes(a) ? "proficient" : "none"} />
        <span class="text-ink">{ABILITY_NAME[a]}</span>
        <span class="ml-auto font-semibold text-ink tabular-nums">{signed(d.saves[a])}</span>
      </li>
    {/each}
  </ul>
</Card>
