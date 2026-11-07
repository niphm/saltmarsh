<script lang="ts">
  import type { Derived } from "@saltmarsh/schema";
  import { signed, titleCase } from "../../lib/format";
  import Card from "../Card.svelte";

  // Effects derive() folded in from `state` resources that are ON.
  let { d }: { d: Derived } = $props();

  const names = $derived(d.resources.filter(r => r.active).map(r => r.name));
</script>

<Card title="Active Now" class="border-2 border-accent">
  <dl class="space-y-2 text-sm">
    <div>
      <dt class="text-ink-muted">Modes</dt>
      <dd class="font-semibold text-ink">{names.join(", ")}</dd>
    </div>
    {#if d.active.damageBonus}
      <div>
        <dt class="text-ink-muted">Damage bonus</dt>
        <dd class="text-ink">{signed(d.active.damageBonus)}</dd>
      </div>
    {/if}
    {#if d.active.advantageOn.length}
      <div>
        <dt class="text-ink-muted">Advantage on</dt>
        <dd class="text-ink">{d.active.advantageOn.map(titleCase).join(", ")}</dd>
      </div>
    {/if}
    {#if d.active.blocks.length}
      <div>
        <dt class="text-ink-muted">Can't use</dt>
        <dd class="text-ink">{d.active.blocks.map(titleCase).join(", ")}</dd>
      </div>
    {/if}
  </dl>
</Card>
