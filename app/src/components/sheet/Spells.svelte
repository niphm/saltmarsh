<script lang="ts">
  import { castChoices, spellRoll, type Character, type Derived, type Spell } from "@saltmarsh/schema";
  import type { Change } from "../../lib/store.svelte";
  import type { Roller } from "../../lib/rolls.svelte";
  import { loadSpells } from "../../lib/packs";
  import {
    ABILITY_NAME,
    capitalize,
    damageFormula,
    groupBy,
    refName,
    signed,
    spellComponents,
    spellDuration,
    spellLevelHeading,
    spellLevelLabel,
  } from "../../lib/format";
  import Card from "../Card.svelte";
  import CastDialog from "./CastDialog.svelte";

  // F1.5. Spell facts come from the rules pack; the character supplies which spells, slots and free casts.
  let { c, d, act, roll }: { c: Character; d: Derived; act: (change: Change) => void; roll: Roller } = $props();

  let index = $state<Map<string, Spell> | null>(null);
  let loadError = $state<string | null>(null);

  function load() {
    loadError = null;
    loadSpells()
      .then(m => (index = m))
      .catch(e => (loadError = e instanceof Error ? e.message : String(e)));
  }
  load();

  type Known = NonNullable<Character["spellcasting"]>["spells"][number];
  type Row = { known: Known; spell?: Spell };

  const rows = $derived.by((): Row[] => {
    const list = (c.spellcasting?.spells ?? []).map(known => ({ known, spell: index?.get(known.ref) }));
    return list.sort(
      (a, b) => (a.spell?.level ?? 99) - (b.spell?.level ?? 99) || (a.spell?.name ?? a.known.ref).localeCompare(b.spell?.name ?? b.known.ref),
    );
  });

  let levelFilter = $state<number | null>(null);
  let concentrationOnly = $state(false);
  let preparedOnly = $state(false);
  let expanded = $state<string | null>(null);
  let castOpen = $state(false);
  let castTarget = $state<Spell | null>(null);

  const levels = $derived([...new Set(rows.flatMap(r => (r.spell ? [r.spell.level] : [])))].sort((a, b) => a - b));
  const visible = $derived(
    rows.filter(
      r =>
        (levelFilter === null || r.spell?.level === levelFilter) &&
        (!concentrationOnly || r.spell?.concentration) &&
        (!preparedOnly || r.known.prepared || r.known.alwaysPrepared),
    ),
  );
  const groups = $derived(groupBy(visible, r => (r.spell ? spellLevelHeading(r.spell.level) : "Not in loaded packs")));

  function openCast(spell: Spell) {
    castTarget = spell;
    castOpen = true;
  }

  const baseRoll = (spell: Spell) =>
    d.spell ? spellRoll(spell, { slotLevel: spell.level, characterLevel: d.level, spellMod: d.spell.mod }) : undefined;
</script>

{#snippet chip(label: string, pressed: boolean, onclick: () => void)}
  <button
    type="button"
    aria-pressed={pressed}
    {onclick}
    class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border-2 px-3 text-sm font-semibold {pressed
      ? 'border-accent bg-accent text-on-accent'
      : 'border-line text-ink hover:bg-well'}">{label}</button
  >
{/snippet}

<Card title="Spells">
  {#if loadError}
    <p role="alert" class="text-ink">
      {loadError}
      <button type="button" class="btn ml-2" onclick={load}>Retry</button>
    </p>
  {:else if !index}
    <p class="text-ink-muted">Loading spells…</p>
  {:else}
    <div class="flex flex-wrap gap-2" role="group" aria-label="Filter spells">
      {@render chip("All", levelFilter === null, () => (levelFilter = null))}
      {#each levels as level (level)}
        {@render chip(level === 0 ? "Cantrips" : String(level), levelFilter === level, () => (levelFilter = levelFilter === level ? null : level))}
      {/each}
      {@render chip("Concentration", concentrationOnly, () => (concentrationOnly = !concentrationOnly))}
      {@render chip("Prepared", preparedOnly, () => (preparedOnly = !preparedOnly))}
    </div>

    {#if !visible.length}
      <p class="mt-3 text-ink-muted">No spells match these filters.</p>
    {/if}

    {#each groups as [heading, list] (heading)}
      <h3 class="mt-4 mb-1 text-xs font-semibold tracking-wider text-ink-muted uppercase">{heading}</h3>
      <ul>
        {#each list as { known, spell } (known.ref)}
          <li class="border-b border-line py-2 last:border-b-0">
            {#if spell}
              {@const choices = castChoices(c, d, spell.id, spell.level)}
              {@const r = baseRoll(spell)}
              {@const open = expanded === spell.id}
              {@const concentratingOnThis = c.state.concentration?.spell === spell.id}
              <div class="flex items-start gap-2">
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls="spell-{spell.id}"
                  onclick={() => (expanded = open ? null : spell.id)}
                  class="-ml-1 flex min-h-11 flex-1 flex-col items-start rounded-lg px-1 py-1 text-left hover:bg-well"
                >
                  <span class="flex flex-wrap items-center gap-1.5">
                    <span class="font-semibold text-ink">{spell.name}</span>
                    {#if spell.concentration}
                      <span class="rounded-full border border-info px-1.5 text-xs font-semibold text-info" title="Concentration">C</span>
                      <span class="sr-only">Concentration</span>
                    {/if}
                    {#if spell.ritual}<span class="rounded-full border border-line px-1.5 text-xs text-ink-muted">Ritual</span>{/if}
                    {#if choices.freeCast?.available}<span class="rounded-full border border-accent px-1.5 text-xs font-semibold text-accent">Free cast</span>{/if}
                    {#if concentratingOnThis}<span class="rounded-full bg-info px-1.5 text-xs font-semibold text-page">Concentrating</span>{/if}
                    {#if spell.id.startsWith("saltmarsh:")}<span class="rounded-full border border-line px-1.5 text-xs text-ink-muted">Table pack</span>{/if}
                  </span>
                  <span class="text-xs text-ink-muted">{capitalize(spell.school)} · {spell.castingTime.split(",")[0]} · {spell.range}</span>
                </button>
                {#if spell.level > 0 || spell.concentration}
                  <button type="button" class="btn btn-primary shrink-0" onclick={() => openCast(spell)} aria-label="Cast {spell.name}">Cast</button>
                {/if}
              </div>

              {#if spell.attack || spell.save || r}
                <div class="mt-1 flex flex-wrap items-center gap-2">
                  {#if spell.attack && d.spell}
                    <button type="button" class="btn text-sm" onclick={() => roll.d20(`${spell.name} attack`, d.spell!.attack)}>
                      {signed(d.spell.attack)} {spell.attack} attack
                    </button>
                  {/if}
                  {#if spell.save && d.spell}
                    <span class="text-sm text-ink">{ABILITY_NAME[spell.save]} save, DC {d.spell.dc}</span>
                  {/if}
                  {#if r}
                    <button
                      type="button"
                      class="btn text-sm"
                      onclick={() => roll.damage(`${spell.name} ${r.kind}`, r.dice, r.bonus, r.kind === "healing" ? "healing" : r.types.join("/") || undefined)}
                      aria-label="{damageFormula(r.dice, r.bonus)} {r.kind === 'healing' ? 'healing' : r.types.join('/') || 'damage'}: roll {spell.name} {r.kind}{spell.level > 0
                        ? ` at ${spellLevelLabel(spell.level)}`
                        : ''}"
                    >
                      <span class="tabular-nums">{damageFormula(r.dice, r.bonus)}</span>
                      <span class="font-normal text-ink-muted">{r.kind === "healing" ? "healing" : r.types.join("/") || "damage"}</span>
                    </button>
                  {/if}
                </div>
              {/if}

              {#if open}
                <div id="spell-{spell.id}" class="mt-2 space-y-2 rounded-lg bg-well p-3 text-sm text-ink">
                  <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                    <dt class="text-ink-muted">Level</dt><dd>{spellLevelLabel(spell.level)} {spell.school}</dd>
                    <dt class="text-ink-muted">Casting time</dt><dd>{spell.castingTime}{spell.ritual ? " or Ritual" : ""}</dd>
                    <dt class="text-ink-muted">Range</dt><dd>{spell.range}</dd>
                    <dt class="text-ink-muted">Components</dt><dd>{spellComponents(spell.components)}</dd>
                    <dt class="text-ink-muted">Duration</dt><dd>{spellDuration(spell)}</dd>
                    {#if known.source}<dt class="text-ink-muted">Source</dt><dd>{known.source}</dd>{/if}
                  </dl>
                  {#each spell.description.split(/\n\s*\n/) as para, i (i)}
                    <p class="whitespace-pre-line">{para}</p>
                  {/each}
                  {#if spell.higherLevels}
                    <p><span class="font-semibold">{spell.level === 0 ? "Cantrip upgrade." : "At higher levels."}</span> {spell.higherLevels}</p>
                  {/if}
                </div>
              {/if}
            {:else}
              <p class="flex min-h-11 flex-col justify-center">
                <span class="font-semibold text-ink">{refName(known.ref)}</span>
                <span class="text-xs text-ink-muted">{known.ref} isn't in any loaded rules pack</span>
              </p>
            {/if}
          </li>
        {/each}
      </ul>
    {/each}
  {/if}
</Card>

{#if castTarget}
  <CastDialog bind:open={castOpen} {c} {d} spell={castTarget} {act} {roll} />
{/if}
