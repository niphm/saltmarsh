<script lang="ts">
  import type { Character } from "@saltmarsh/schema";
  import { capitalize } from "../../lib/format";
  import Card from "../Card.svelte";

  let { c }: { c: Character } = $props();

  const rows = $derived([
    ["Armor", c.proficiencies.armor],
    ["Weapons", c.proficiencies.weapons],
    ["Weapon mastery", c.proficiencies.masteries],
    ["Tools", c.proficiencies.tools],
    ["Languages", c.proficiencies.languages],
  ] as [string, string[]][]);
</script>

<Card title="Proficiencies & Languages">
  <dl class="space-y-2 text-sm">
    {#each rows as [label, list] (label)}
      <div>
        <dt class="text-ink-muted">{label}</dt>
        <dd class="text-ink">{list.length ? list.map(capitalize).join(", ") : "None listed"}</dd>
      </div>
    {/each}
  </dl>
</Card>
