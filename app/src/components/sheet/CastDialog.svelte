<script lang="ts">
  import { untrack } from "svelte";
  import { castChoices, castSpell, spellRoll, type Character, type Derived, type Spell } from "@saltmarsh/schema";
  import type { Change } from "../../lib/store.svelte";
  import type { Roller } from "../../lib/rolls.svelte";
  import { damageFormula, ordinal, refName, spellLevelLabel } from "../../lib/format";
  import Dialog from "../Dialog.svelte";

  // F1.5: choose a slot (or the free cast), confirm dropping concentration, optionally roll.
  let {
    open = $bindable(false),
    c,
    d,
    spell,
    act,
    roll,
  }: { open?: boolean; c: Character; d: Derived; spell: Spell; act: (change: Change) => void; roll: Roller } = $props();

  const choices = $derived(castChoices(c, d, spell.id, spell.level));
  let how = $state<string>(""); // "free" or a slot level as text
  let alsoRoll = $state(true);

  // Reset each time the dialog opens (not when slots change underneath it):
  // free cast first (saves a slot), else the lowest slot.
  $effect(() => {
    if (!open) return;
    untrack(() => {
      how = choices.freeCast?.available ? "free" : choices.slotLevels.length ? String(choices.slotLevels[0]) : "";
      alsoRoll = true;
    });
  });

  const slotLevel = $derived(how === "free" || how === "" ? spell.level : Number(how));
  const rolled = $derived(
    d.spell ? spellRoll(spell, { slotLevel, characterLevel: d.level, spellMod: d.spell.mod }) : undefined,
  );
  const needsChoice = $derived(spell.level > 0);
  const canCast = $derived(!choices.blockedBy.length && (!needsChoice || how !== ""));
  const dropping = $derived(
    spell.concentration && c.state.concentration && c.state.concentration.spell !== spell.id
      ? refName(c.state.concentration.spell)
      : undefined,
  );

  function cast() {
    const opts = how === "free" ? { freeCast: true } : needsChoice ? { slotLevel: Number(how) } : {};
    act(ch => castSpell(ch, spell, opts));
    if (alsoRoll && rolled) {
      const label = `${spell.name} ${rolled.kind}`;
      roll.damage(label, rolled.dice, rolled.bonus, rolled.kind === "healing" ? "healing" : rolled.types.join("/") || undefined);
    }
    open = false;
  }
</script>

<Dialog bind:open title="Cast {spell.name}">
  <p class="text-sm text-ink-muted">{spellLevelLabel(spell.level)}{spell.concentration ? " · Concentration" : ""}</p>

  {#if choices.blockedBy.length}
    <p role="alert" class="mt-3 rounded-lg border-2 border-danger p-3 text-ink">
      You can't cast spells while {choices.blockedBy.join(" and ")} is on.
    </p>
  {:else if needsChoice}
    {#if choices.slotLevels.length || choices.freeCast?.available}
      <fieldset class="mt-3">
        <legend class="font-semibold text-ink">Spend</legend>
        <div class="mt-2 grid gap-2">
          {#if choices.freeCast?.available}
            <label class="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border-2 border-line px-3 has-[:checked]:border-accent">
              <input type="radio" name="cast-how" value="free" bind:group={how} class="size-5 accent-accent" />
              <span class="text-ink">Free cast <span class="text-sm text-ink-muted">({choices.freeCast.name}, no slot)</span></span>
            </label>
          {/if}
          {#each choices.slotLevels as level (level)}
            <label class="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border-2 border-line px-3 has-[:checked]:border-accent">
              <input type="radio" name="cast-how" value={String(level)} bind:group={how} class="size-5 accent-accent" />
              <span class="text-ink">
                {ordinal(level)}-level slot
                <span class="text-sm text-ink-muted">({d.spell?.slotsRemaining[level - 1]} left{level > spell.level ? ", upcast" : ""})</span>
              </span>
            </label>
          {/each}
        </div>
      </fieldset>
    {:else}
      <p role="alert" class="mt-3 rounded-lg border-2 border-warn p-3 text-ink">
        No spell slots left at {ordinal(spell.level)} level or higher{choices.freeCast ? `, and the free cast is used` : ""}.
      </p>
    {/if}
  {/if}

  {#if dropping && !choices.blockedBy.length}
    <p role="alert" class="mt-3 rounded-lg border-2 border-info p-3 text-ink">
      You're concentrating on <strong>{dropping}</strong>. Casting {spell.name} ends it.
    </p>
  {/if}

  {#if rolled && canCast}
    <label class="mt-3 flex min-h-11 cursor-pointer items-center gap-3">
      <input type="checkbox" bind:checked={alsoRoll} class="size-5 accent-accent" />
      <span class="text-ink">
        Also roll {rolled.kind}
        <span class="font-semibold tabular-nums">{damageFormula(rolled.dice, rolled.bonus)}</span>
        {#if rolled.types.length}<span class="text-sm text-ink-muted">{rolled.types.join(" or ")}</span>{/if}
      </span>
    </label>
  {/if}

  {#snippet footer()}
    <button type="button" class="btn" onclick={() => (open = false)}>Cancel</button>
    <button type="button" class="btn btn-primary" disabled={!canCast} onclick={cast}>
      {dropping ? `Cast and end ${dropping}` : "Cast"}
    </button>
  {/snippet}
</Dialog>
