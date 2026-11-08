<script lang="ts">
  import { party, type RosterEntry } from "../lib/party.svelte";
  import { sync } from "../lib/sync/engine.svelte";
  import { HP_BAND_LABEL, HP_BAND_TEXT, LIFE_LABEL, capitalize, refName } from "../lib/format";
  import { href } from "../lib/route.svelte";

  // F2.7: party members' HP as a status word by default; the DM can loosen it to a bar or exact numbers.
  let { full = false, exclude }: { full?: boolean; exclude?: string } = $props();

  const vis = $derived(party.current?.visibility);
  const entries = $derived(party.roster.filter(r => r.id !== exclude));

  /** The DM and a character's own player always see the numbers. */
  const mode = (r: RosterEntry) => (party.isDm || sync.isLinked(r.id) ? "exact" : (vis?.showHpToPlayers ?? "status"));
  const showConditions = (r: RosterEntry) => party.isDm || sync.isLinked(r.id) || vis?.showConditionsToPlayers !== false;
  const showConcentration = (r: RosterEntry) => party.isDm || sync.isLinked(r.id) || vis?.showConcentrationToPlayers !== false;

  const word = (r: RosterEntry) => (r.summary.life === "alive" ? HP_BAND_LABEL[r.summary.hpBand] : LIFE_LABEL[r.summary.life]);
  const pct = (r: RosterEntry) => (r.summary.hpMax > 0 ? Math.max(0, Math.min(100, (r.state.hp.current / r.summary.hpMax) * 100)) : 0);
  const conditionLabel = (c: RosterEntry["state"]["conditions"][number]) =>
    c.condition === "exhaustion" ? `Exhaustion ${c.level ?? 1}` : capitalize(c.condition);
</script>

{#if entries.length}
  <section aria-label="Party" class={full ? "" : "-mx-4 mb-3 overflow-x-auto px-4"}>
    <ul class={full ? "grid gap-2 sm:grid-cols-2" : "flex gap-2"}>
      {#each entries as r (r.id)}
        {@const m = mode(r)}
        <li class="rounded-lg border border-line bg-card px-3 py-2 {full ? '' : 'min-w-36 shrink-0'}">
          <p class="flex items-baseline justify-between gap-2">
            <span class="truncate font-semibold text-ink">{r.summary.name}</span>
            {#if m !== "hidden"}
              <span class="shrink-0 text-sm font-semibold {r.summary.life === 'alive' ? HP_BAND_TEXT[r.summary.hpBand] : 'text-danger'}">
                {#if m === "exact"}
                  <span class="tabular-nums">{r.state.hp.current}/{r.summary.hpMax}</span>{#if r.state.hp.temp}<span class="text-info tabular-nums"> +{r.state.hp.temp}</span>{/if}
                  <span class="sr-only">({word(r)})</span>
                {:else}
                  {word(r)}
                {/if}
              </span>
            {/if}
          </p>
          {#if m === "bar"}
            <div class="mt-1 h-2 overflow-hidden rounded-full bg-well" aria-hidden="true">
              <div class="h-full rounded-full {r.summary.hpBand === 'full' ? 'bg-ok' : r.summary.hpBand === 'injured' ? 'bg-warn' : 'bg-danger'}" style="width: {pct(r)}%"></div>
            </div>
          {/if}
          {#if showConcentration(r) && r.state.concentration}
            <p class="mt-1 truncate text-xs text-info">Concentrating: {refName(r.state.concentration.spell)}</p>
          {/if}
          {#if showConditions(r) && r.state.conditions.length}
            <p class="mt-1 flex flex-wrap gap-1">
              {#each r.state.conditions as c, i (i)}
                <span class="rounded-full border border-warn px-2 text-xs text-ink">{conditionLabel(c)}</span>
              {/each}
            </p>
          {/if}
          {#if full && sync.isLinked(r.id)}
            <a href={href.sheet(r.id)} class="mt-1 inline-flex min-h-11 items-center text-sm text-accent underline">Open sheet</a>
          {/if}
        </li>
      {/each}
    </ul>
  </section>
{/if}
