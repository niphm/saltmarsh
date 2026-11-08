<script lang="ts">
  import { JournalEntry } from "@saltmarsh/schema";
  import { party, type JournalItem } from "../../lib/party.svelte";
  import { auth } from "../../lib/auth.svelte";
  import { loadMarkdown } from "../../lib/markdown";
  import { capitalize } from "../../lib/format";
  import Dialog from "../Dialog.svelte";

  // F2.5: party journal. Session entries carry structured lists; tag filter and search.
  type Kind = JournalItem["kind"];
  type Vis = JournalItem["visibility"];
  const KINDS = JournalEntry.shape.kind.options as readonly Kind[];
  const VIS_LABEL: Record<Vis, string> = { party: "Whole party", dm: "Only the DM (and you)", author: "Only you" };
  const SESSION_LISTS = [
    ["keyEvents", "Key events"],
    ["npcs", "NPCs"],
    ["locations", "Locations"],
    ["loot", "Loot"],
    ["followUps", "Follow-ups"],
  ] as const;
  type SessionKey = (typeof SESSION_LISTS)[number][0];
  const QUEST = ["active", "completed", "failed", "rumor"] as const;

  let error = $state<string | null>(null);
  let search = $state("");
  let kindFilter = $state<Kind | null>(null);
  let tagFilter = $state("");
  let openId = $state<string | null>(null);
  let html = $state<Record<string, string>>({});

  const tags = $derived([...new Set(party.journal.flatMap(j => j.tags))].sort());
  const shown = $derived(
    party.journal.filter(j => {
      if (kindFilter && j.kind !== kindFilter) return false;
      if (tagFilter && !j.tags.includes(tagFilter)) return false;
      const q = search.trim().toLowerCase();
      if (!q) return true;
      const session = j.session ? Object.values(j.session).flat().join(" ") : "";
      return [j.title, j.body, j.tags.join(" "), session].join(" ").toLowerCase().includes(q);
    }),
  );

  async function toggle(j: JournalItem) {
    openId = openId === j.id ? null : j.id;
    if (openId && j.body.trim()) {
      const render = await loadMarkdown();
      html = { ...html, [j.id]: render(j.body) };
    }
  }

  // Editor
  interface Draft {
    id?: string;
    kind: Kind;
    visibility: Vis;
    title: string;
    body: string;
    tags: string;
    sessionNumber: number | null;
    datePlayed: string;
    inGameDate: string;
    lists: Record<SessionKey, string>;
    questStatus: (typeof QUEST)[number] | "";
  }
  let editing = $state(false);
  let draft = $state<Draft>(blank());

  function blank(): Draft {
    return {
      kind: "note",
      visibility: "party",
      title: "",
      body: "",
      tags: "",
      sessionNumber: null,
      datePlayed: new Date().toISOString().slice(0, 10),
      inGameDate: "",
      lists: { keyEvents: "", npcs: "", locations: "", loot: "", followUps: "" },
      questStatus: "",
    };
  }

  function edit(j?: JournalItem) {
    error = null;
    draft = j
      ? {
          id: j.id,
          kind: j.kind,
          visibility: j.visibility,
          title: j.title,
          body: j.body,
          tags: j.tags.join(", "),
          sessionNumber: j.sessionNumber ?? null,
          datePlayed: j.datePlayed ?? "",
          inGameDate: j.inGameDate ?? "",
          lists: Object.fromEntries(SESSION_LISTS.map(([k]) => [k, (j.session?.[k] ?? []).join("\n")])) as Record<SessionKey, string>,
          questStatus: j.questStatus ?? "",
        }
      : blank();
    editing = true;
  }

  const lines = (s: string) => s.split("\n").map(x => x.trim()).filter(Boolean);

  async function save(e?: SubmitEvent) {
    e?.preventDefault();
    const d = $state.snapshot(draft);
    error = await party.saveEntry({
      id: d.id,
      kind: d.kind,
      visibility: d.visibility,
      title: d.title,
      body: d.body,
      tags: [...new Set(d.tags.split(",").map(t => t.trim().toLowerCase()).filter(Boolean))],
      ...(d.kind === "session"
        ? {
            sessionNumber: d.sessionNumber ?? undefined,
            datePlayed: d.datePlayed || undefined,
            inGameDate: d.inGameDate || undefined,
            session: Object.fromEntries(SESSION_LISTS.map(([k]) => [k, lines(d.lists[k])])) as JournalItem["session"],
          }
        : { inGameDate: d.inGameDate || undefined }),
      ...(d.kind === "quest" && d.questStatus ? { questStatus: d.questStatus } : {}),
    });
    if (!error) {
      editing = false;
      if (d.id && openId === d.id) html = { ...html, [d.id]: d.body.trim() ? (await loadMarkdown())(d.body) : "" };
    }
  }

  let confirmDelete = $state<JournalItem | null>(null);
  async function remove() {
    const j = confirmDelete;
    confirmDelete = null;
    if (j) error = await party.deleteEntry(j.id);
  }

  const canEdit = (j: JournalItem) => j.authorId === auth.account?.id;
  const canDelete = (j: JournalItem) => canEdit(j) || party.isDm;
  const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
</script>

<div class="flex flex-wrap items-center gap-2">
  <label for="journal-search" class="sr-only">Search the journal</label>
  <input id="journal-search" type="search" class="field min-w-0 flex-1" placeholder="Search" bind:value={search} />
  {#if tags.length}
    <label for="journal-tag" class="sr-only">Tag</label>
    <select id="journal-tag" class="field" bind:value={tagFilter}>
      <option value="">All tags</option>
      {#each tags as t (t)}<option value={t}>#{t}</option>{/each}
    </select>
  {/if}
  <button type="button" class="btn btn-primary" onclick={() => edit()}>New entry</button>
</div>

<div class="mt-2 flex flex-wrap gap-2" role="group" aria-label="Filter by kind">
  {#each [null, ...KINDS] as k (k ?? "all")}
    <button
      type="button"
      aria-pressed={kindFilter === k}
      onclick={() => (kindFilter = k)}
      class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border-2 px-3 text-sm font-semibold {kindFilter === k
        ? 'border-accent bg-accent text-on-accent'
        : 'border-line text-ink hover:bg-well'}">{k ? capitalize(k) : "All"}</button
    >
  {/each}
</div>

{#if error && !editing}
  <p role="alert" class="mt-3 rounded-lg border-2 border-danger p-3 text-sm text-ink">{error}</p>
{/if}

<ul class="mt-3 space-y-2">
  {#each shown as j (j.id)}
    {@const open = openId === j.id}
    <li class="rounded-xl border border-line bg-card">
      <button type="button" class="flex min-h-12 w-full items-start gap-3 p-3 text-left" aria-expanded={open} onclick={() => toggle(j)}>
        <span class="mt-0.5 shrink-0 rounded-full border border-line px-2 text-xs font-semibold text-ink-muted uppercase">{j.kind}</span>
        <span class="min-w-0 flex-1">
          <span class="block font-semibold text-ink">{j.kind === "session" && j.sessionNumber ? `Session ${j.sessionNumber}: ` : ""}{j.title}</span>
          <span class="block text-xs text-ink-muted">
            {party.memberName(j.authorId)} · {day(j.createdAt)}{j.visibility !== "party" ? ` · ${j.visibility === "dm" ? "DM only" : "Only the author"}` : ""}{j.questStatus ? ` · ${capitalize(j.questStatus)}` : ""}
          </span>
          {#if j.tags.length}<span class="mt-1 block text-xs text-info">{j.tags.map(t => `#${t}`).join(" ")}</span>{/if}
        </span>
      </button>
      {#if open}
        <div class="border-t border-line p-3">
          {#if j.datePlayed || j.inGameDate}
            <p class="text-sm text-ink-muted">
              {#if j.datePlayed}Played {j.datePlayed}{/if}{#if j.datePlayed && j.inGameDate} · {/if}{#if j.inGameDate}In game: {j.inGameDate}{/if}
            </p>
          {/if}
          {#if j.body.trim()}
            <!-- Sanitized by DOMPurify in lib/markdown.ts (other players write these). -->
            <!-- eslint-disable-next-line svelte/no-at-html-tags -->
            <div class="prose-notes mt-2">{@html html[j.id] ?? ""}</div>
          {/if}
          {#if j.session}
            {#each SESSION_LISTS as [k, label] (k)}
              {#if j.session[k].length}
                <h2 class="mt-3 text-xs font-semibold tracking-wider text-ink-muted uppercase">{label}</h2>
                <ul class="mt-1 list-disc pl-5 text-ink">
                  {#each j.session[k] as line, i (i)}<li>{line}</li>{/each}
                </ul>
              {/if}
            {/each}
          {/if}
          {#if canEdit(j) || canDelete(j)}
            <div class="mt-3 flex gap-2">
              {#if canEdit(j)}<button type="button" class="btn" onclick={() => edit(j)}>Edit</button>{/if}
              {#if canDelete(j)}<button type="button" class="btn btn-danger" onclick={() => (confirmDelete = j)}>Delete</button>{/if}
            </div>
          {/if}
        </div>
      {/if}
    </li>
  {:else}
    <li class="text-ink-muted">{party.journal.length ? "Nothing matches." : "No entries yet."}</li>
  {/each}
</ul>

<Dialog bind:open={editing} title={draft.id ? "Edit entry" : "New journal entry"}>
  <form id="journal-form" class="grid gap-3" onsubmit={save}>
    <div class="grid grid-cols-2 gap-2">
      <label class="flex flex-col gap-1 text-sm text-ink-muted">
        Kind
        <select class="field" bind:value={draft.kind}>
          {#each KINDS as k (k)}<option value={k}>{capitalize(k)}</option>{/each}
        </select>
      </label>
      <label class="flex flex-col gap-1 text-sm text-ink-muted">
        Who can see it
        <select class="field" bind:value={draft.visibility}>
          {#each Object.entries(VIS_LABEL) as [v, label] (v)}<option value={v}>{label}</option>{/each}
        </select>
      </label>
    </div>
    <label class="flex flex-col gap-1 text-sm text-ink-muted">
      Title
      <input class="field" bind:value={draft.title} required maxlength="200" />
    </label>
    {#if draft.kind === "session"}
      <div class="grid grid-cols-3 gap-2">
        <label class="flex flex-col gap-1 text-sm text-ink-muted">
          Session
          <input class="field" type="number" min="1" step="1" inputmode="numeric" bind:value={draft.sessionNumber} />
        </label>
        <label class="col-span-2 flex flex-col gap-1 text-sm text-ink-muted">
          Played on
          <input class="field" type="date" bind:value={draft.datePlayed} />
        </label>
      </div>
    {/if}
    {#if draft.kind === "quest"}
      <label class="flex flex-col gap-1 text-sm text-ink-muted">
        Quest status
        <select class="field" bind:value={draft.questStatus}>
          <option value="">Not set</option>
          {#each QUEST as q (q)}<option value={q}>{capitalize(q)}</option>{/each}
        </select>
      </label>
    {/if}
    <label class="flex flex-col gap-1 text-sm text-ink-muted">
      In-game date
      <input class="field" bind:value={draft.inGameDate} placeholder="e.g. 3rd of Harvest" maxlength="80" />
    </label>
    <label class="flex flex-col gap-1 text-sm text-ink-muted">
      Notes (markdown)
      <textarea class="field h-40 py-2" bind:value={draft.body}></textarea>
    </label>
    {#if draft.kind === "session"}
      {#each SESSION_LISTS as [k, label] (k)}
        <label class="flex flex-col gap-1 text-sm text-ink-muted">
          {label} (one per line)
          <textarea class="field h-20 py-2" bind:value={draft.lists[k]}></textarea>
        </label>
      {/each}
    {/if}
    <label class="flex flex-col gap-1 text-sm text-ink-muted">
      Tags (comma separated)
      <input class="field" bind:value={draft.tags} placeholder="e.g. haunted house, smugglers" />
    </label>
    {#if error}<p role="alert" class="text-sm text-danger">{error}</p>{/if}
  </form>
  {#snippet footer()}
    <button type="button" class="btn" onclick={() => (editing = false)}>Cancel</button>
    <button type="submit" form="journal-form" class="btn btn-primary">Save</button>
  {/snippet}
</Dialog>

<Dialog bind:open={() => confirmDelete !== null, v => !v && (confirmDelete = null)} title="Delete this entry?">
  <p class="text-ink">"{confirmDelete?.title}" will be gone for everyone. This can't be undone.</p>
  {#snippet footer()}
    <button type="button" class="btn" onclick={() => (confirmDelete = null)}>Cancel</button>
    <button type="button" class="btn btn-danger" onclick={remove}>Delete</button>
  {/snippet}
</Dialog>
