<script lang="ts">
  import type { Derived } from "@saltmarsh/schema";
  import { ABILITY_NAME, ordinal, signed } from "../../lib/format";
  import Card from "../Card.svelte";
  import Pips from "../Pips.svelte";

  let { spell }: { spell: NonNullable<Derived["spell"]> } = $props();
</script>

<Card title="Spellcasting">
  <dl class="grid grid-cols-3 gap-2 text-center">
    <div class="rounded-lg bg-well p-2">
      <dt class="text-xs text-ink-muted">Save DC</dt>
      <dd class="text-2xl font-semibold text-ink tabular-nums">{spell.dc}</dd>
    </div>
    <div class="rounded-lg bg-well p-2">
      <dt class="text-xs text-ink-muted">Spell attack</dt>
      <dd class="text-2xl font-semibold text-ink tabular-nums">{signed(spell.attack)}</dd>
    </div>
    <div class="rounded-lg bg-well p-2">
      <dt class="text-xs text-ink-muted">{ABILITY_NAME[spell.ability]}</dt>
      <dd class="text-2xl font-semibold text-ink tabular-nums">{signed(spell.mod)}</dd>
    </div>
  </dl>

  {#if spell.slots.length}
    <h3 class="mt-4 mb-1 text-xs font-semibold tracking-wider text-ink-muted uppercase">Spell slots</h3>
    <ul>
      {#each spell.slots as total, i (i)}
        <li class="flex min-h-9 items-center gap-3 border-b border-line last:border-b-0">
          <span class="w-8 text-ink">{ordinal(i + 1)}</span>
          <Pips {total} filled={spell.slotsRemaining[i]} />
          <span class="ml-auto text-sm text-ink-muted tabular-nums" aria-hidden="true">
            {spell.slotsRemaining[i]}/{total}
          </span>
        </li>
      {/each}
    </ul>
  {/if}
</Card>
