<script lang="ts">
  import type { Derived } from "@saltmarsh/schema";
  import type { Roller } from "../../lib/rolls.svelte";
  import { capitalize, damageFormula, signed, titleCase } from "../../lib/format";
  import Card from "../Card.svelte";

  // F1.6. Numbers come from derive(); a damage line is "active" when its `when` tag is on (e.g. Raging -> rage).
  let { d, roll }: { d: Derived; roll: Roller } = $props();

  /** Range only if no property already states it ("thrown (30/120)"). */
  const details = (a: Derived["attacks"][number]) =>
    [...a.properties, ...(a.range && !a.properties.some(p => p.includes(a.range!)) ? [`range ${a.range}`] : [])].map(capitalize);
</script>

<Card title="Attacks">
  {#if d.attacks.length}
    <ul>
      {#each d.attacks as a (a.id)}
        <li class="border-b border-line py-3 first:pt-0 last:border-b-0 last:pb-0">
          <div class="flex items-center gap-3">
            <div class="min-w-0 flex-1">
              <p class="font-semibold text-ink">{a.name}</p>
              {#if details(a).length}
                <p class="text-xs text-ink-muted">{details(a).join(" · ")}</p>
              {/if}
            </div>
            <button
              type="button"
              class="btn btn-primary flex-col gap-0 px-3 leading-tight"
              aria-label="Roll {a.name} attack, {signed(a.toHit)} to hit"
              onclick={() => roll.d20(`${a.name} attack`, a.toHit)}
            >
              <span class="text-lg tabular-nums">{signed(a.toHit)}</span>
              <span class="text-[11px] font-semibold uppercase">to hit</span>
            </button>
          </div>

          <ul class="mt-2 flex flex-wrap gap-2" aria-label="{a.name} damage">
            {#each a.damage as line, i (i)}
              {@const situational = line.when !== undefined}
              <li>
                <button
                  type="button"
                  onclick={() => roll.damage(`${a.name} damage${line.when ? ` (${line.when})` : ""}`, line.dice, line.bonus, line.type)}
                  aria-label="{damageFormula(line.dice, line.bonus)} {line.type}{situational ? ` ${titleCase(line.when ?? '')}` : ''}: roll {a.name} damage{situational
                    ? `, only when ${line.when}${line.active ? ', applies now' : ''}`
                    : ''}"
                  class="inline-flex min-h-11 items-center gap-1.5 rounded-lg border-2 px-3 text-left hover:bg-well {!situational
                    ? 'border-line text-ink'
                    : line.active
                      ? 'border-accent bg-well text-ink'
                      : 'border-dashed border-line text-ink-muted'}"
                >
                  <span class="font-semibold tabular-nums">{damageFormula(line.dice, line.bonus)}</span>
                  <span class="text-sm">{line.type}</span>
                  {#if situational}
                    <span
                      class="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold {line.active
                        ? 'bg-accent text-on-accent'
                        : 'border border-line text-ink-muted'}"
                    >
                      {#if line.active}
                        <svg viewBox="0 0 16 16" class="size-3" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
                          <path d="M3 8.5 6.5 12 13 4.5" stroke-linecap="round" stroke-linejoin="round" />
                        </svg>
                      {/if}
                      {titleCase(line.when ?? "")}
                    </span>
                  {/if}
                </button>
              </li>
            {/each}
          </ul>

          {#if a.mastery}
            <p class="mt-2 text-sm">
              <span class="text-ink-muted">Mastery</span>
              <span class={a.masteryActive ? "font-semibold text-ink" : "text-ink-muted"}>
                {capitalize(a.mastery)}{a.masteryActive ? "" : " (not mastered)"}
              </span>
            </p>
          {/if}
          {#if a.notes}<p class="mt-1 text-sm text-ink-muted">{a.notes}</p>{/if}
        </li>
      {/each}
    </ul>
  {:else}
    <p class="text-sm text-ink-muted">No attacks listed.</p>
  {/if}
</Card>
