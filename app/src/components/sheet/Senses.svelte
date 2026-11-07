<script lang="ts">
  import type { Character, Derived } from "@saltmarsh/schema";
  import { capitalize } from "../../lib/format";
  import Card from "../Card.svelte";

  let { c, d }: { c: Character; d: Derived } = $props();

  const defenses = $derived(
    [
      ["Resistances", d.defenses.resistances],
      ["Immunities", d.defenses.immunities],
      ["Condition immunities", d.defenses.conditionImmunities],
    ].filter(([, list]) => list.length > 0) as [string, string[]][],
  );
</script>

<Card title="Senses">
  <dl class="grid grid-cols-3 gap-2 text-center">
    <div class="rounded-lg bg-well p-2">
      <dt class="text-xs text-ink-muted">Passive Perception</dt>
      <dd class="text-2xl font-semibold text-ink tabular-nums">{d.passive.perception}</dd>
    </div>
    <div class="rounded-lg bg-well p-2">
      <dt class="text-xs text-ink-muted">Passive Insight</dt>
      <dd class="text-2xl font-semibold text-ink tabular-nums">{d.passive.insight}</dd>
    </div>
    <div class="rounded-lg bg-well p-2">
      <dt class="text-xs text-ink-muted">Passive Investigation</dt>
      <dd class="text-2xl font-semibold text-ink tabular-nums">{d.passive.investigation}</dd>
    </div>
  </dl>

  <dl class="mt-3 space-y-2 text-sm">
    <div>
      <dt class="text-ink-muted">Special senses</dt>
      <dd class="text-ink">
        {#if c.senses.length}
          {c.senses.map(s => `${capitalize(s.kind)} ${s.range} ft`).join(", ")}
        {:else}
          None
        {/if}
      </dd>
    </div>
    {#each defenses as [label, list] (label)}
      <div>
        <dt class="text-ink-muted">{label}</dt>
        <dd class="text-ink">{list.map(capitalize).join(", ")}</dd>
      </div>
    {/each}
  </dl>
</Card>
