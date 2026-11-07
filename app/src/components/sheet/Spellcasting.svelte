<script lang="ts">
  import { restoreSlot, spendSlot, type Derived } from "@saltmarsh/schema";
  import type { Change } from "../../lib/store.svelte";
  import type { Roller } from "../../lib/rolls.svelte";
  import { ABILITY_NAME, ordinal, signed } from "../../lib/format";
  import Card from "../Card.svelte";
  import PipButtons from "../PipButtons.svelte";

  let { spell, act, roll }: { spell: NonNullable<Derived["spell"]>; act: (change: Change) => void; roll: Roller } = $props();
</script>

<Card title="Spellcasting">
  <dl class="grid grid-cols-3 gap-2 text-center">
    <div class="rounded-lg bg-well p-2">
      <dt class="text-xs text-ink-muted">Save DC</dt>
      <dd class="text-2xl font-semibold text-ink tabular-nums">{spell.dc}</dd>
    </div>
    <div class="flex">
      <dt class="sr-only">Spell attack</dt>
      <dd class="flex flex-1">
        <button
          type="button"
          onclick={() => roll.d20("Spell attack", spell.attack)}
          aria-label="Spell attack {signed(spell.attack)}. Roll a spell attack."
          class="flex flex-1 flex-col items-center rounded-lg border-2 border-accent bg-well p-2 hover:bg-card"
        >
          <span class="text-xs text-ink-muted" aria-hidden="true">Spell attack</span>
          <span class="text-2xl font-semibold text-ink tabular-nums" aria-hidden="true">{signed(spell.attack)}</span>
        </button>
      </dd>
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
        {@const level = i + 1}
        <li class="flex min-h-12 items-center gap-3 border-b border-line last:border-b-0">
          <span class="w-8 text-ink">{ordinal(level)}</span>
          <span class="text-sm text-ink-muted tabular-nums" aria-hidden="true">{spell.slotsRemaining[i]}/{total}</span>
          <span class="ml-auto">
            <PipButtons
              name="{ordinal(level)}-level slot"
              {total}
              filled={spell.slotsRemaining[i]}
              onspend={() => act(ch => spendSlot(ch, level))}
              onrestore={() => act(ch => restoreSlot(ch, level))}
            />
          </span>
        </li>
      {/each}
    </ul>
  {/if}
</Card>
