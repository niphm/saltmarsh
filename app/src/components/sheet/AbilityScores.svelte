<script lang="ts">
  import { ABILITIES, type Character, type Derived } from "@saltmarsh/schema";
  import { ABILITY_NAME, abilityAbbr, signed } from "../../lib/format";

  let { c, d }: { c: Character; d: Derived } = $props();
</script>

<section aria-labelledby="abilities-heading">
  <h2 id="abilities-heading" class="sr-only">Ability scores</h2>
  <dl class="grid grid-cols-3 gap-2 md:grid-cols-6">
    {#each ABILITIES as a (a)}
      <div class="flex flex-col items-center rounded-xl border border-line bg-card px-2 pt-2 pb-3">
        <dt class="text-xs font-semibold tracking-widest text-accent">
          <abbr title={ABILITY_NAME[a]} class="no-underline">{abilityAbbr(a)}</abbr>
        </dt>
        <dd class="flex flex-col items-center">
          <span class="text-3xl font-semibold text-ink tabular-nums">
            <span class="sr-only">modifier </span>{signed(d.mods[a])}
          </span>
          <span class="mt-1 rounded-full bg-well px-2.5 py-0.5 text-sm text-ink tabular-nums">
            <span class="sr-only">score </span>{c.abilityScores[a]}
          </span>
        </dd>
      </div>
    {/each}
  </dl>
</section>
