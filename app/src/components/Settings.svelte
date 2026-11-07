<script lang="ts">
  import { THEMES } from "../themes";
  import { theme } from "../lib/theme.svelte";
</script>

<h1 class="font-display text-3xl font-semibold text-ink">Settings</h1>

<section aria-labelledby="theme-heading" class="mt-4 rounded-xl border border-line bg-card p-4">
  <h2 id="theme-heading" class="font-display text-sm font-semibold tracking-widest text-accent uppercase">Theme</h2>
  <p class="mt-1 text-sm text-ink-muted">Saved on this device.</p>

  <fieldset class="mt-3">
    <legend class="sr-only">Color theme</legend>
    <div class="grid gap-2 sm:grid-cols-2">
      {#each THEMES as t (t.id)}
        <label
          class="flex min-h-16 items-center gap-3 rounded-lg border-2 p-3 {theme.current === t.id
            ? 'border-accent bg-well'
            : 'border-line'} {t.ready ? 'cursor-pointer hover:bg-well' : 'cursor-not-allowed'}"
        >
          <input
            type="radio"
            name="theme"
            value={t.id}
            checked={theme.current === t.id}
            disabled={!t.ready}
            onchange={() => theme.set(t.id)}
            class="size-5 shrink-0 accent-accent"
          />
          {#if t.ready}
            <!-- Swatch renders in the theme's own colors via data-theme scoping. -->
            <span data-theme={t.id} class="flex h-10 w-14 shrink-0 overflow-hidden rounded-md border border-line bg-page" aria-hidden="true">
              <span class="m-1 flex flex-1 items-end rounded-sm bg-card p-0.5">
                <span class="h-1.5 w-full rounded-full bg-accent"></span>
              </span>
            </span>
          {:else}
            <span class="h-10 w-14 shrink-0 rounded-md border-2 border-dashed border-line" aria-hidden="true"></span>
          {/if}
          <span class="flex flex-col">
            <span class="font-semibold text-ink">{t.label}</span>
            <span class="text-sm text-ink-muted">{t.ready ? t.description : `${t.description} (coming soon)`}</span>
          </span>
        </label>
      {/each}
    </div>
  </fieldset>
</section>
