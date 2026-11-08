<script lang="ts">
  import { COINS, ItemCategory, coinsInGp, type Coin } from "@saltmarsh/schema";
  import { party } from "../../lib/party.svelte";
  import { formatGp, titleCase } from "../../lib/format";

  // F2.4: shared coins and items, "held by" a party character. Any member can edit.
  const CATEGORIES = ItemCategory.options;
  let error = $state<string | null>(null);

  const p = $derived(party.current!);
  const gp = $derived(coinsInGp(p.coins));

  let amount = $state<number | null>(null);
  let coin = $state<Coin>("gp");
  const amountOk = $derived(typeof amount === "number" && Number.isInteger(amount) && amount > 0);

  async function coins(sign: 1 | -1) {
    if (!amountOk) return;
    error = await party.adjustCoins({ [coin]: (amount as number) * sign });
    if (!error) amount = null;
  }

  let newName = $state("");
  let newQty = $state<number | null>(1);
  let newCategory = $state<string>("gear");
  let newHeldBy = $state<string>("");

  async function add(e: SubmitEvent) {
    e.preventDefault();
    error = await party.addItem({
      name: newName,
      qty: typeof newQty === "number" && newQty >= 0 ? newQty : 1,
      category: newCategory,
      heldBy: newHeldBy || null,
    });
    if (!error) {
      newName = "";
      newQty = 1;
    }
  }

  const holderName = (id: string | null) => party.roster.find(r => r.id === id)?.summary.name;
</script>

<section aria-labelledby="purse-heading" class="rounded-xl border border-line bg-card p-4">
  <h2 id="purse-heading" class="font-display text-sm font-semibold tracking-widest text-accent uppercase">Party purse</h2>
  <dl class="mt-2 grid grid-cols-5 gap-1.5 text-center">
    {#each COINS as k (k)}
      <div class="rounded-lg bg-well py-2">
        <dt class="text-xs font-semibold text-ink-muted uppercase">{k}</dt>
        <dd class="text-lg font-semibold text-ink tabular-nums">{p.coins[k]}</dd>
      </div>
    {/each}
  </dl>
  <p class="mt-1.5 text-sm text-ink-muted">Worth <span class="font-semibold text-ink">{formatGp(gp)} gp</span></p>
  <form class="mt-2 grid grid-cols-[1fr_auto] gap-2" onsubmit={e => e.preventDefault()}>
    <label for="party-coin-amount" class="sr-only">Coin amount</label>
    <input id="party-coin-amount" type="number" inputmode="numeric" min="1" step="1" placeholder="Amount" bind:value={amount} class="field" />
    <label for="party-coin-kind" class="sr-only">Coin</label>
    <select id="party-coin-kind" bind:value={coin} class="field pr-8 uppercase">
      {#each COINS as k (k)}<option value={k}>{k}</option>{/each}
    </select>
    <div class="col-span-2 grid grid-cols-2 gap-2">
      <button type="button" class="btn btn-ok" disabled={!amountOk} onclick={() => coins(1)}>Add</button>
      <button type="button" class="btn btn-danger" disabled={!amountOk} onclick={() => coins(-1)}>Spend</button>
    </div>
  </form>
</section>

<section aria-labelledby="items-heading" class="mt-4 rounded-xl border border-line bg-card p-4">
  <h2 id="items-heading" class="font-display text-sm font-semibold tracking-widest text-accent uppercase">Shared items</h2>
  <ul class="mt-2">
    {#each party.items as item (item.id)}
      <li class="border-b border-line py-2 last:border-b-0">
        <p class="font-semibold text-ink">{item.name}</p>
        <p class="text-xs text-ink-muted">{titleCase(item.category)}{item.heldBy ? ` · held by ${holderName(item.heldBy) ?? "someone"}` : ""}</p>
        <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span class="inline-flex items-center" role="group" aria-label="{item.name} quantity">
            <button type="button" class="btn px-0 text-lg" aria-label="Less {item.name}" disabled={item.qty <= 0} onclick={async () => (error = await party.updateItem(item.id, { qty: item.qty - 1 }))}>−</button>
            <output class="min-w-10 text-center font-semibold text-ink tabular-nums">×{item.qty}</output>
            <button type="button" class="btn px-0 text-lg" aria-label="More {item.name}" onclick={async () => (error = await party.updateItem(item.id, { qty: item.qty + 1 }))}>+</button>
          </span>
          <label class="flex items-center gap-2 text-sm text-ink-muted">
            <span class="sr-only">{item.name} held by</span>
            <select
              class="field text-sm"
              value={item.heldBy ?? ""}
              onchange={async e => (error = await party.updateItem(item.id, { heldBy: e.currentTarget.value || null }))}
            >
              <option value="">Nobody</option>
              {#each party.roster as r (r.id)}<option value={r.id}>{r.summary.name}</option>{/each}
            </select>
          </label>
          <button type="button" class="btn ml-auto border-transparent text-sm text-ink-muted" aria-label="Remove {item.name}" onclick={async () => (error = await party.removeItem(item.id))}>
            Remove
          </button>
        </div>
        {#if item.notes}<p class="mt-1 text-sm text-ink-muted">{item.notes}</p>{/if}
      </li>
    {:else}
      <li class="py-2 text-ink-muted">Nothing shared yet.</li>
    {/each}
  </ul>

  <form class="mt-3 grid grid-cols-[1fr_5rem] gap-2 border-t border-line pt-3" onsubmit={add}>
    <h3 class="col-span-2 text-xs font-semibold tracking-wider text-ink-muted uppercase">Add a shared item</h3>
    <label for="party-new-item" class="sr-only">Item name</label>
    <input id="party-new-item" class="field" placeholder="e.g. Rowboat" bind:value={newName} maxlength="120" />
    <label for="party-new-qty" class="sr-only">Quantity</label>
    <input id="party-new-qty" type="number" inputmode="numeric" min="0" step="1" class="field" bind:value={newQty} />
    <label for="party-new-cat" class="sr-only">Category</label>
    <select id="party-new-cat" class="field" bind:value={newCategory}>
      {#each CATEGORIES as cat (cat)}<option value={cat}>{titleCase(cat)}</option>{/each}
    </select>
    <label for="party-new-held" class="sr-only">Held by</label>
    <select id="party-new-held" class="field col-span-2 sm:col-span-1" bind:value={newHeldBy}>
      <option value="">Held by nobody</option>
      {#each party.roster as r (r.id)}<option value={r.id}>Held by {r.summary.name}</option>{/each}
    </select>
    <button type="submit" class="btn col-span-2" disabled={!newName.trim()}>Add</button>
  </form>
</section>

{#if error}
  <p role="alert" class="mt-3 rounded-lg border-2 border-danger p-3 text-sm text-ink">{error}</p>
{/if}
