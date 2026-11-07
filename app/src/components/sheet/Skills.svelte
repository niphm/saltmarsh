<script lang="ts">
  import { SKILL_ABILITY, type Character, type Derived, type Skill } from "@saltmarsh/schema";
  import { abilityAbbr, signed, skillName } from "../../lib/format";
  import Card from "../Card.svelte";
  import ProfMarker from "../ProfMarker.svelte";

  let { c, d }: { c: Character; d: Derived } = $props();

  const skills = (Object.keys(SKILL_ABILITY) as Skill[]).sort((x, y) => skillName(x).localeCompare(skillName(y)));
</script>

<Card title="Skills">
  <ul class="grid sm:grid-cols-2 sm:gap-x-6">
    {#each skills as s (s)}
      <li class="flex min-h-9 items-center gap-2 border-b border-line last:border-b-0 sm:[&:nth-last-child(2)]:border-b-0">
        <ProfMarker level={c.proficiencies.skills[s] ?? "none"} />
        <span class="text-ink">{skillName(s)}</span>
        <span class="text-xs text-ink-muted">{abilityAbbr(SKILL_ABILITY[s])}</span>
        <span class="ml-auto font-semibold text-ink tabular-nums">{signed(d.skills[s])}</span>
      </li>
    {/each}
  </ul>
</Card>
