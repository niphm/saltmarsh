<script lang="ts">
  import { applyDamage, applyHealing, setDeathSaves, setTempHp, type Character, type Derived } from "@saltmarsh/schema";
  import type { Change } from "../../lib/store.svelte";
  import { HP_BAND_LABEL, HP_BAND_TEXT, LIFE_LABEL } from "../../lib/format";

  // F1.3. All HP math is in the engine; this only collects a number and picks the function.
  let { c, d, act }: { c: Character; d: Derived; act: (change: Change) => void } = $props();

  let amount = $state<number | null>(null);
  const entered = $derived(typeof amount === "number" && Number.isFinite(amount) && amount >= 0);
  const positive = $derived(entered && (amount as number) > 0);

  function run(fn: (ch: Character, n: number) => Character, ok: boolean) {
    if (!ok) return;
    const n = amount as number;
    act(ch => fn(ch, n));
    amount = null;
  }

  type SaveKind = "success" | "failure";
  function tapSave(kind: SaveKind, i: number) {
    act(ch => {
      const { success, failure } = ch.state.deathSaves;
      const cur = kind === "success" ? success : failure;
      const next = i < cur ? i : i + 1;
      return kind === "success" ? setDeathSaves(ch, next, failure) : setDeathSaves(ch, success, next);
    });
  }
</script>

{#snippet saveRow(kind: SaveKind, label: string, count: number)}
  <div class="flex items-center justify-between gap-2">
    <span class="font-semibold text-ink">{label}</span>
    <div role="group" aria-label="{label}: {count} of 3" class="-mr-2.5 flex">
      {#each [0, 1, 2] as i (i)}
        {@const on = i < count}
        <button
          type="button"
          onclick={() => tapSave(kind, i)}
          aria-label="{kind === 'success' ? 'Success' : 'Failure'} {i + 1}"
          aria-pressed={on}
          class="flex size-11 items-center justify-center rounded-full"
        >
          <span
            class="flex size-7 items-center justify-center rounded-full border-2 text-sm font-bold {on
              ? kind === 'success'
                ? 'border-ok bg-ok text-page'
                : 'border-danger bg-danger text-page'
              : 'border-ink-muted'}"
            aria-hidden="true">{on ? (kind === "success" ? "✓" : "✕") : ""}</span
          >
        </button>
      {/each}
    </div>
  </div>
{/snippet}

<section id="hp-panel" aria-labelledby="hp-heading" class="scroll-mt-32 rounded-xl border border-line bg-card p-4">
  <div class="flex items-center justify-between">
    <h2 id="hp-heading" class="font-display text-sm font-semibold tracking-widest text-accent uppercase">Hit Points</h2>
    <span class="text-sm font-semibold {HP_BAND_TEXT[d.hpBand]}">{HP_BAND_LABEL[d.hpBand]}</span>
  </div>

  <div class="mt-2 flex items-center justify-between gap-3">
    <button type="button" class="btn btn-danger size-14 text-xl" aria-label="Lose 1 HP" onclick={() => act(ch => applyDamage(ch, 1))}>
      −1
    </button>
    <p class="text-center">
      <span class="text-5xl font-semibold text-ink tabular-nums">{c.state.hp.current}</span>
      <span class="text-2xl text-ink-muted tabular-nums">/ {d.hpMax}</span>
      {#if c.state.hp.temp > 0}
        <span class="block text-sm font-semibold text-info">+{c.state.hp.temp} temp HP</span>
      {/if}
    </p>
    <button type="button" class="btn btn-ok size-14 text-xl" aria-label="Heal 1 HP" onclick={() => act(ch => applyHealing(ch, 1))}>
      +1
    </button>
  </div>

  <form class="mt-4 grid grid-cols-3 gap-2" onsubmit={e => e.preventDefault()}>
    <label for="hp-amount" class="sr-only">Amount</label>
    <input
      id="hp-amount"
      type="number"
      inputmode="numeric"
      min="0"
      step="1"
      placeholder="Amount"
      bind:value={amount}
      class="field col-span-3 text-lg"
    />
    <button type="button" class="btn btn-danger" disabled={!positive} onclick={() => run(applyDamage, positive)}>Damage</button>
    <button type="button" class="btn btn-ok" disabled={!positive} onclick={() => run(applyHealing, positive)}>Heal</button>
    <!-- 0 is allowed here: it clears temp HP. -->
    <button type="button" class="btn btn-info" disabled={!entered} onclick={() => run(setTempHp, entered)}>Set temp</button>
  </form>

  {#if c.state.hp.current === 0}
    <div role="group" aria-labelledby="ds-heading" class="mt-4 rounded-lg border-2 border-danger p-3">
      <h3 id="ds-heading" class="font-semibold text-ink">
        Death Saves <span class="text-danger">· {LIFE_LABEL[d.life]}</span>
      </h3>
      <div class="mt-1 space-y-1">
        {@render saveRow("success", "Successes", c.state.deathSaves.success)}
        {@render saveRow("failure", "Failures", c.state.deathSaves.failure)}
      </div>
    </div>
  {/if}
</section>
