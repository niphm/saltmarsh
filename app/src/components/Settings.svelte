<script lang="ts">
  import { THEMES } from "../themes";
  import { theme } from "../lib/theme.svelte";
  import type { Character } from "@saltmarsh/schema";
  import { characters } from "../lib/store.svelte";
  import { PACKS } from "../lib/packs";
  import { backupJson, characterJson, exportFileName, parseImport, type ImportPlan } from "../lib/backup";
  import { downloadText } from "../lib/download";
  import { nowIso } from "../lib/seed";
  import Dialog from "./Dialog.svelte";

  let confirmReset = $state(false);

  // Export / import (F1.1, F1.13)
  let importError = $state<string | null>(null);
  // raw, not deep $state: these objects go to IndexedDB, which can't clone Svelte proxies.
  let importPlan = $state.raw<ImportPlan | null>(null);
  let confirmImport = $state(false);

  function exportOne(c: Character) {
    downloadText(exportFileName(c.identity.name, nowIso()), characterJson(c));
  }

  function exportAll() {
    downloadText(exportFileName("saltmarsh-backup", nowIso()), backupJson(characters.characters, nowIso()));
  }

  async function chooseFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ""; // let the same file be picked again
    importError = null;
    if (!file) return;
    const result = parseImport(await file.text());
    if (!result.ok) {
      importError = result.error;
      return;
    }
    importPlan = result.plan;
    confirmImport = true;
  }

  async function doImport() {
    confirmImport = false;
    if (importPlan) await characters.importCharacters(importPlan.characters);
    importPlan = null;
  }

  const isReplacing = (id: string) => characters.entries.some(e => e.id === id);

  async function reset() {
    confirmReset = false;
    await characters.reset();
  }
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

<section aria-labelledby="backup-heading" class="mt-4 rounded-xl border border-line bg-card p-4">
  <h2 id="backup-heading" class="font-display text-sm font-semibold tracking-widest text-accent uppercase">Characters & backups</h2>
  <p class="mt-1 text-sm text-ink-muted">
    Export a character as a JSON file, or download a backup of every character on this device. Import either kind of file here.
  </p>
  <ul class="mt-3">
    {#each characters.characters as c (c.id)}
      <li class="flex min-h-12 items-center gap-3 border-b border-line last:border-b-0">
        <span class="flex-1 text-ink">{c.identity.name}</span>
        <button type="button" class="btn text-sm" onclick={() => exportOne(c)} aria-label="Export {c.identity.name} as JSON">Export</button>
      </li>
    {/each}
  </ul>
  <div class="mt-3 flex flex-wrap gap-2">
    <button type="button" class="btn" onclick={exportAll} disabled={!characters.characters.length}>Download backup</button>
    <label class="btn cursor-pointer has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-focus">
      Import file…
      <input type="file" accept=".json,application/json" class="sr-only" onchange={chooseFile} />
    </label>
  </div>
  {#if importError}
    <p role="alert" class="mt-3 rounded-lg border-2 border-danger p-3 text-sm text-ink">
      <span class="font-semibold text-danger">Couldn't import:</span> {importError}
    </p>
  {/if}
</section>

<Dialog bind:open={confirmImport} title="Import characters?">
  {#if importPlan}
    {#if importPlan.characters.length}
      <ul class="space-y-1">
        {#each importPlan.characters as c (c.id)}
          <li class="flex items-center justify-between gap-3 rounded-lg bg-well px-3 py-2">
            <span class="font-semibold text-ink">{c.identity.name}</span>
            <span class="text-sm {isReplacing(c.id) ? 'text-warn' : 'text-ok'}">{isReplacing(c.id) ? "Replaces the copy on this device" : "New"}</span>
          </li>
        {/each}
      </ul>
    {/if}
    {#if importPlan.problems.length}
      <div class="mt-3 rounded-lg border-2 border-danger p-3">
        <p class="font-semibold text-ink">
          {importPlan.problems.length === 1 ? "1 character" : `${importPlan.problems.length} characters`} can't be imported:
        </p>
        {#each importPlan.problems as p, i (i)}
          <p class="mt-2 text-sm font-semibold text-ink">{p.name}</p>
          <ul class="font-mono text-xs text-ink">
            {#each p.issues.slice(0, 8) as issue, j (j)}<li>{issue}</li>{/each}
            {#if p.issues.length > 8}<li>…and {p.issues.length - 8} more</li>{/if}
          </ul>
        {/each}
      </div>
    {/if}
    {#if importPlan.characters.some(c => isReplacing(c.id))}
      <p class="mt-3 text-sm text-ink-muted">Replaced characters lose their undo history.</p>
    {/if}
  {/if}
  {#snippet footer()}
    <button type="button" class="btn" onclick={() => (confirmImport = false)}>Cancel</button>
    <button type="button" class="btn btn-primary" disabled={!importPlan?.characters.length} onclick={doImport}>
      Import {importPlan?.characters.length ?? 0}
    </button>
  {/snippet}
</Dialog>

<section aria-labelledby="data-heading" class="mt-4 rounded-xl border border-line bg-card p-4">
  <h2 id="data-heading" class="font-display text-sm font-semibold tracking-widest text-accent uppercase">Local data</h2>
  <p class="mt-1 text-sm text-ink-muted">
    Characters and table state (HP, resources, conditions, undo history) are saved in this browser and work offline.
  </p>
  <button type="button" class="btn btn-danger mt-3" onclick={() => (confirmReset = true)}>Reset to bundled characters</button>
</section>

<section aria-labelledby="about-heading" class="mt-4 rounded-xl border border-line bg-card p-4">
  <h2 id="about-heading" class="font-display text-sm font-semibold tracking-widest text-accent uppercase">About</h2>
  <p class="mt-1 text-sm text-ink">
    Saltmarsh is a character and party tracker for the Ghosts of Saltmarsh campaign. Rules content comes from these packs:
  </p>
  <ul class="mt-3 space-y-3">
    {#each PACKS as { meta } (meta.id)}
      <li class="rounded-lg bg-well p-3 text-sm">
        <p class="font-semibold text-ink">
          {meta.name}
          <span class="font-normal text-ink-muted">· {meta.homebrew ? "table pack" : meta.license}</span>
        </p>
        <p class="mt-1 text-ink">{meta.attribution}</p>
        {#if meta.source}
          <a href={meta.source} target="_blank" rel="noopener noreferrer" class="mt-1 inline-flex min-h-11 items-center text-accent underline">
            {meta.source}
          </a>
        {/if}
      </li>
    {/each}
  </ul>
</section>

<Dialog bind:open={confirmReset} title="Reset local data?">
  <p class="text-ink">
    This puts every bundled character back to its starting state and clears undo history on this device. It can't be undone.
  </p>
  {#snippet footer()}
    <button type="button" class="btn" onclick={() => (confirmReset = false)}>Cancel</button>
    <button type="button" class="btn btn-danger" onclick={reset}>Reset</button>
  {/snippet}
</Dialog>
