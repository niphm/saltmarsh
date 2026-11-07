<script lang="ts">
  import {
    COINS,
    ItemCategory,
    addItem,
    changeCoins,
    changeQuantity,
    removeItem,
    restoreCharge,
    setAttuned,
    setEquipped,
    spendCharge,
    type Character,
    type Coin,
    type Derived,
  } from "@saltmarsh/schema";
  import type { Change } from "../../lib/store.svelte";
  import { acNote, formatGp, titleCase } from "../../lib/format";
  import Card from "../Card.svelte";

  // F1.7. Totals, AC and attunement limits come from the engine; this collects input.
  let { c, d, act }: { c: Character; d: Derived; act: (change: Change) => void } = $props();

  const CATEGORIES = ItemCategory.options;

  // Coins
  let coinAmount = $state<number | null>(null);
  let coin = $state<Coin>("gp");
  const amountOk = $derived(typeof coinAmount === "number" && Number.isInteger(coinAmount) && coinAmount > 0);
  const canSpend = $derived(amountOk && (coinAmount as number) <= c.inventory.coins[coin]);

  function moveCoins(sign: 1 | -1) {
    if (!amountOk) return;
    const n = (coinAmount as number) * sign;
    const which = coin;
    act(ch => changeCoins(ch, { [which]: n }));
    coinAmount = null;
  }

  // Items
  let filter = $state<string | null>(null);
  const present = $derived(CATEGORIES.filter(cat => c.inventory.items.some(i => i.category === cat)));
  const items = $derived(c.inventory.items.filter(i => filter === null || i.category === filter));
  const attunementFull = $derived(d.inventory.attuned >= d.inventory.attunementLimit);

  // New item
  let newName = $state("");
  let newCategory = $state<(typeof CATEGORIES)[number]>("gear");
  let newQty = $state<number | null>(1);

  function add(e: SubmitEvent) {
    e.preventDefault();
    const input = { name: newName, category: newCategory, qty: typeof newQty === "number" && newQty >= 0 ? newQty : 1 };
    if (!input.name.trim()) return;
    act(ch => addItem(ch, input));
    newName = "";
    newQty = 1;
  }
</script>

{#snippet stepper(label: string, value: string, onminus: () => void, onplus: () => void, minusDisabled: boolean, plusDisabled = false)}
  <span class="inline-flex items-center" role="group" aria-label={label}>
    <button type="button" class="btn px-0 text-lg" aria-label="Less {label}" disabled={minusDisabled} onclick={onminus}>−</button>
    <output class="min-w-10 text-center font-semibold text-ink tabular-nums">{value}</output>
    <button type="button" class="btn px-0 text-lg" aria-label="More {label}" disabled={plusDisabled} onclick={onplus}>+</button>
  </span>
{/snippet}

<Card title="Inventory">
  <dl class="grid grid-cols-5 gap-1.5 text-center">
    {#each COINS as k (k)}
      <div class="rounded-lg bg-well py-2">
        <dt class="text-xs font-semibold text-ink-muted uppercase">{k}</dt>
        <dd class="text-lg font-semibold text-ink tabular-nums">{c.inventory.coins[k]}</dd>
      </div>
    {/each}
  </dl>
  <p class="mt-1.5 text-sm text-ink-muted">
    Worth <span class="font-semibold text-ink">{formatGp(d.inventory.gp)} gp</span> · {d.inventory.weight} lb carried · {d.inventory.attuned}/{d.inventory.attunementLimit} attuned
  </p>

  <form class="mt-2 grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_auto_auto_auto]" onsubmit={e => e.preventDefault()}>
    <label for="coin-amount" class="sr-only">Coin amount</label>
    <input id="coin-amount" type="number" inputmode="numeric" min="1" step="1" placeholder="Amount" bind:value={coinAmount} class="field" />
    <label for="coin-kind" class="sr-only">Coin</label>
    <select id="coin-kind" bind:value={coin} class="field pr-8 uppercase">
      {#each COINS as k (k)}<option value={k}>{k}</option>{/each}
    </select>
    <div class="col-span-2 grid grid-cols-2 gap-2 sm:col-span-2">
      <button type="button" class="btn btn-ok" disabled={!amountOk} onclick={() => moveCoins(1)}>Add</button>
      <button type="button" class="btn btn-danger" disabled={!canSpend} onclick={() => moveCoins(-1)}>Spend</button>
    </div>
  </form>

  {#if present.length > 1}
    <div class="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filter items">
      {#each [null, ...present] as cat (cat ?? "all")}
        <button
          type="button"
          aria-pressed={filter === cat}
          onclick={() => (filter = cat)}
          class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border-2 px-3 text-sm font-semibold {filter === cat
            ? 'border-accent bg-accent text-on-accent'
            : 'border-line text-ink hover:bg-well'}">{cat ? titleCase(cat) : "All"}</button
        >
      {/each}
    </div>
  {/if}

  <ul class="mt-2">
    {#each items as item (item.id)}
      {@const charges = d.inventory.charges[item.id]}
      {@const ac = acNote(item.equipEffect)}
      <li class="border-b border-line py-2 last:border-b-0">
        <div class="flex items-start gap-2">
          <div class="min-w-0 flex-1">
            <p class="font-semibold text-ink">{item.name}</p>
            <p class="text-xs text-ink-muted">
              {titleCase(item.category)}{item.weight ? ` · ${item.weight} lb` : ""}{ac ? ` · ${ac}` : ""}{item.requiresAttunement ? " · Requires attunement" : ""}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={item.equipped}
            aria-label="{item.name} equipped"
            onclick={() => act(ch => setEquipped(ch, item.id, !item.equipped))}
            class="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border-2 px-3 text-sm font-semibold {item.equipped
              ? 'border-accent bg-accent text-on-accent'
              : 'border-line text-ink-muted hover:text-ink'}"
          >
            {#if item.equipped}
              <svg viewBox="0 0 16 16" class="size-3.5" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
                <path d="M3 8.5 6.5 12 13 4.5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            {/if}
            <span aria-hidden="true">{item.equipped ? "Equipped" : "Equip"}</span>
          </button>
        </div>

        <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          {@render stepper(`${item.name} quantity`, `×${item.qty}`, () => act(ch => changeQuantity(ch, item.id, -1)), () => act(ch => changeQuantity(ch, item.id, 1)), item.qty <= 0)}
          {#if charges}
            {@render stepper(
              `${item.name} charges`,
              `${charges.current}/${charges.max}`,
              () => act(ch => spendCharge(ch, item.id)),
              () => act(ch => restoreCharge(ch, item.id)),
              charges.current <= 0,
              charges.current >= charges.max,
            )}
          {/if}
          {#if item.requiresAttunement}
            <button
              type="button"
              role="switch"
              aria-checked={item.attuned}
              aria-label="{item.name} attuned"
              disabled={!item.attuned && attunementFull}
              onclick={() => act(ch => setAttuned(ch, item.id, !item.attuned))}
              class="btn text-sm {item.attuned ? 'border-accent text-accent' : ''}"
            >
              {item.attuned ? "Attuned" : attunementFull ? "Attunement full" : "Attune"}
            </button>
          {/if}
          <button type="button" class="btn ml-auto border-transparent text-sm text-ink-muted" aria-label="Remove {item.name}" onclick={() => act(ch => removeItem(ch, item.id))}>
            Remove
          </button>
        </div>
        {#if item.notes}<p class="mt-1 text-sm text-ink-muted">{item.notes}</p>{/if}
      </li>
    {:else}
      <li class="py-2 text-ink-muted">Nothing here.</li>
    {/each}
  </ul>

  <form class="mt-3 grid grid-cols-[1fr_5rem] gap-2 border-t border-line pt-3" onsubmit={add}>
    <h3 class="col-span-2 text-xs font-semibold tracking-wider text-ink-muted uppercase">Add an item</h3>
    <label for="new-item" class="sr-only">Item name</label>
    <input id="new-item" class="field" placeholder="e.g. Silver locket" bind:value={newName} />
    <label for="new-qty" class="sr-only">Quantity</label>
    <input id="new-qty" type="number" inputmode="numeric" min="0" step="1" class="field" bind:value={newQty} />
    <label for="new-cat" class="sr-only">Category</label>
    <select id="new-cat" class="field" bind:value={newCategory}>
      {#each CATEGORIES as cat (cat)}<option value={cat}>{titleCase(cat)}</option>{/each}
    </select>
    <button type="submit" class="btn" disabled={!newName.trim()}>Add</button>
  </form>
</Card>
