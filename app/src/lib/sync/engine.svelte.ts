/**
 * Character sync (F2.2, F2.9). Local-first: every change lands in IndexedDB
 * at once (the store), and this engine uploads it when signed in and online.
 *
 * Each linked character is two server rows, the document and the table
 * state. An upload is a compare-and-set against the row version this device
 * last saw. If someone else wrote in between, the newer edit wins for that
 * row (last-write-wins per field) and the state log keeps both sides.
 * Realtime brings other devices' and the DM's changes in.
 */
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { Character, CharacterState } from "@saltmarsh/schema";
import { loadCharacter } from "../characters";
import { db, type SyncMeta } from "../db";
import { friendlyError, remote } from "../remote";
import { nowIso } from "../seed";
import { characters } from "../store.svelte";
import { docChanged, joinCharacter, localWins, resolveState, sameInstant, splitCharacter, summarize } from "./merge";

export interface DocRow {
  id: string;
  owner_id: string;
  party_id: string | null;
  doc: unknown;
  doc_edited_at: string;
  doc_version: number;
}

export interface StateRow {
  character_id: string;
  party_id: string | null;
  state: unknown;
  summary: unknown;
  state_edited_at: string;
  state_version: number;
}

const DOC_COLS = "id, owner_id, party_id, doc, doc_edited_at, doc_version";
const STATE_COLS = "character_id, party_id, state, summary, state_edited_at, state_version";
const MAX_ATTEMPTS = 4;

export type SyncStatus = "off" | "synced" | "syncing" | "offline" | "error";

const rawMessage = (e: unknown) => (e instanceof Error ? e.message : String((e as { message?: unknown } | null)?.message ?? e));
const isNetwork = (e: unknown) => !navigator.onLine || /failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(rawMessage(e));

export class SyncEngine {
  status = $state<SyncStatus>("off");
  error = $state<string | null>(null);
  metas = $state.raw<Record<string, SyncMeta>>({});
  /** Characters whose id is already on another account: they stay on this device only. */
  claimed = $state.raw<string[]>([]);
  userId = $state<string | null>(null);

  #timer: ReturnType<typeof setTimeout> | undefined;
  #running = false;
  #again = false;
  #channel: RealtimeChannel | null = null;

  /** Load sync bookkeeping and start listening for local changes. Call once at startup. */
  async init() {
    try {
      const rows = await db.sync.toArray();
      this.metas = Object.fromEntries(rows.map(r => [r.id, r]));
    } catch {
      /* storage unavailable: nothing is linked */
    }
    characters.listener = this.onLocalChange;
  }

  /** Linked to the signed-in account. */
  isLinked = (id: string) => this.metas[id]?.ownerId === this.userId && this.userId !== null;

  /** Characters on this device that aren't linked to any account. */
  get unlinked(): Character[] {
    return characters.characters.filter(c => !this.metas[c.id] && !this.claimed.includes(c.id));
  }

  get pending(): number {
    return Object.values(this.metas).filter(m => m.ownerId === this.userId && (m.docDirty || m.stateDirty)).length;
  }

  async start(userId: string) {
    if (this.userId === userId) return;
    await this.stop();
    this.userId = userId;
    this.error = null;
    this.claimed = [];
    this.status = "syncing";
    addEventListener("online", this.#onOnline);
    await this.#subscribe();
    await this.pull();
    this.schedule(0);
  }

  async stop() {
    clearTimeout(this.#timer);
    removeEventListener("online", this.#onOnline);
    if (this.#channel) {
      const sb = await remote();
      await sb.removeChannel(this.#channel);
      this.#channel = null;
    }
    this.userId = null;
    this.status = "off";
  }

  /** After "reset local data": the store cleared the links, so reload and fetch the server copies again. */
  async afterReset() {
    this.metas = {};
    this.claimed = [];
    if (this.userId) await this.pull();
  }

  #onOnline = () => {
    void this.pull();
    this.schedule(0);
  };

  /** Store hook: a change made on this device. Linked characters are queued for upload, even while signed out. */
  onLocalChange = (id: string, prev: Character | undefined, next: Character) => {
    const m = this.metas[id];
    if (!m) return;
    const at = nowIso();
    const doc = !prev || docChanged(prev, next);
    // The party strip summary lives with the state row, so a document change (max HP, AC) re-sends state too.
    void this.#saveMeta({ ...m, stateDirty: true, stateEditedAt: at, ...(doc ? { docDirty: true, docEditedAt: at } : {}) });
    this.schedule();
  };

  /** Upload characters to the signed-in account (F2.9). */
  async link(ids: string[]) {
    const userId = this.userId;
    if (!userId) return;
    for (const id of ids) {
      const entry = characters.find(id);
      if (!entry?.ok || this.metas[id]) continue;
      const c = entry.character;
      if (c.ownerId !== userId || c.partyId) await characters.receive({ ...c, ownerId: userId, partyId: undefined }, { keepUndo: true });
      await this.#saveMeta({
        id,
        ownerId: userId,
        docVersion: null,
        stateVersion: null,
        docEditedAt: c.updatedAt,
        stateEditedAt: c.updatedAt,
        docDirty: true,
        stateDirty: true,
        partyId: null,
      });
    }
    this.schedule(0);
  }

  schedule(ms = 300) {
    if (!this.userId) return;
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => void this.flush(), ms);
  }

  async flush() {
    if (!this.userId) return;
    if (this.#running) {
      this.#again = true;
      return;
    }
    this.#running = true;
    try {
      do {
        this.#again = false;
        const dirty = Object.values(this.metas).filter(m => m.ownerId === this.userId && (m.docDirty || m.stateDirty));
        if (!dirty.length) break;
        this.status = "syncing";
        for (const m of dirty) {
          await this.#syncDoc(m.id);
          await this.#syncState(m.id);
        }
      } while (this.#again);
      this.status = "synced";
      this.error = null;
    } catch (e) {
      this.#fail(e);
    } finally {
      this.#running = false;
    }
  }

  /** Fetch this account's characters and bring the device up to date. */
  async pull() {
    const userId = this.userId;
    if (!userId) return;
    try {
      const sb = await remote();
      const docs = await sb.from("characters").select(DOC_COLS).eq("owner_id", userId);
      if (docs.error) throw docs.error;
      const rows = docs.data as DocRow[];
      const states = rows.length
        ? await sb.from("character_states").select(STATE_COLS).in("character_id", rows.map(r => r.id))
        : { data: [] as StateRow[], error: null };
      if (states.error) throw states.error;
      const stateById: Record<string, StateRow> = Object.fromEntries((states.data as StateRow[]).map(s => [s.character_id, s]));
      for (const row of rows) await this.#reconcile(row, stateById[row.id] ?? null);
      if (this.status !== "error") this.status = this.pending ? "syncing" : "synced";
      this.schedule(0);
    } catch (e) {
      this.#fail(e);
    }
  }

  #fail(e: unknown) {
    this.status = isNetwork(e) ? "offline" : "error";
    this.error = friendlyError(e);
    console.warn("Sync", e);
    // The "online" event and realtime reconnects also retry; this covers a server that is down while the device is online.
    this.schedule(this.status === "offline" ? 15_000 : 30_000);
  }

  async #saveMeta(meta: SyncMeta) {
    this.metas = { ...this.metas, [meta.id]: meta };
    try {
      await db.sync.put(meta);
    } catch (e) {
      console.error("Couldn't save sync state", e);
    }
  }

  async #unlink(id: string) {
    const { [id]: _gone, ...rest } = this.metas;
    this.metas = rest;
    await db.sync.delete(id).catch(() => {});
  }

  // --- reconcile server rows with this device -------------------------------

  async #reconcile(row: DocRow, stateRow: StateRow | null) {
    const id = row.id;
    const meta = this.metas[id];
    const entry = characters.find(id);
    const userId = this.userId!;

    if (!entry?.ok) {
      // On the account but not on this device (or the local copy is broken): take the server copy.
      if (!stateRow) return; // half uploaded; the uploading device finishes it
      const loaded = loadCharacter(joinCharacter(row.doc, stateRow.state), id);
      if (!loaded.ok) return console.warn(`Server copy of ${id} doesn't validate`, loaded.issues);
      await characters.receive({ ...loaded.character, partyId: row.party_id ?? undefined });
      await this.#saveMeta({
        id,
        ownerId: userId,
        docVersion: row.doc_version,
        stateVersion: stateRow.state_version,
        docEditedAt: row.doc_edited_at,
        stateEditedAt: stateRow.state_edited_at,
        docDirty: false,
        stateDirty: false,
        partyId: row.party_id,
      });
      return;
    }

    if (meta?.ownerId !== userId) {
      // A local copy that isn't linked, e.g. a bundled example on a new device. Link it with no known
      // versions, so the upload collides with the server copy and the newer edit wins.
      const at = entry.character.updatedAt;
      await this.#saveMeta({
        id,
        ownerId: userId,
        docVersion: null,
        stateVersion: null,
        docEditedAt: at,
        stateEditedAt: at,
        docDirty: true,
        stateDirty: true,
        partyId: row.party_id,
      });
      return;
    }

    if (meta.partyId !== row.party_id) await this.#setParty(id, row.party_id);
    if (row.doc_version !== meta.docVersion && !meta.docDirty) await this.#adoptDoc(row);
    if (stateRow && stateRow.state_version !== this.metas[id]?.stateVersion && !this.metas[id]?.stateDirty) {
      await this.#adoptState(stateRow);
    }
  }

  async #setParty(id: string, partyId: string | null) {
    const entry = characters.find(id);
    if (entry?.ok && (entry.character.partyId ?? null) !== partyId) {
      await characters.receive({ ...entry.character, partyId: partyId ?? undefined }, { keepUndo: true });
    }
    const m = this.metas[id];
    if (m) await this.#saveMeta({ ...m, partyId });
  }

  /** Take the server's document, keeping this device's table state. */
  async #adoptDoc(row: DocRow) {
    const entry = characters.find(row.id);
    const meta = this.metas[row.id];
    if (!entry?.ok || !meta) return;
    const loaded = loadCharacter(joinCharacter(row.doc, entry.character.state), row.id);
    if (!loaded.ok) throw new Error(`The server copy of ${entry.name} doesn't validate.`);
    await characters.receive({ ...loaded.character, partyId: row.party_id ?? undefined });
    await this.#saveMeta({ ...meta, docVersion: row.doc_version, docEditedAt: row.doc_edited_at, docDirty: false, partyId: row.party_id });
  }

  /** Take the server's table state (another device or the DM changed it). */
  async #adoptState(row: StateRow) {
    const entry = characters.find(row.character_id);
    const meta = this.metas[row.character_id];
    if (!entry?.ok || !meta) return;
    const state = this.#parseState(entry.character, row.state);
    if (!state) throw new Error(`The server copy of ${entry.name}'s table state doesn't validate.`);
    await characters.receive({ ...entry.character, state });
    await this.#saveMeta({ ...meta, stateVersion: row.state_version, stateEditedAt: row.state_edited_at, stateDirty: false });
  }

  #parseState(c: Character, raw: unknown): CharacterState | null {
    const loaded = loadCharacter(joinCharacter(splitCharacter(c).doc, raw), c.id);
    return loaded.ok ? loaded.character.state : null;
  }

  // --- uploads ----------------------------------------------------------------

  async #syncDoc(id: string) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const meta = this.metas[id];
      const entry = characters.find(id);
      if (!meta?.docDirty || meta.ownerId !== this.userId || !entry?.ok) return;
      const sent = meta.docEditedAt;
      const sb = await remote();
      const row = await this.#writeDoc(sb, meta, entry.character, sent);
      if (row) {
        const now = this.metas[id];
        if (now) await this.#saveMeta({ ...now, docVersion: row.doc_version, partyId: row.party_id, docDirty: !sameInstant(now.docEditedAt, sent) });
        continue;
      }
      // Version moved on, or the id already exists on the server.
      const cur = await this.#fetchDoc(sb, id);
      if (!cur || cur.owner_id !== this.userId) {
        if (meta.docVersion === null) this.claimed = [...this.claimed, id];
        await this.#unlink(id);
        return;
      }
      const now = this.metas[id]!;
      if (localWins({ value: null, editedAt: now.docEditedAt }, { value: null, editedAt: cur.doc_edited_at })) {
        await this.#saveMeta({ ...now, docVersion: cur.doc_version });
      } else {
        await this.#adoptDoc(cur);
      }
    }
    throw new Error("Sync kept colliding with another device. It'll try again.");
  }

  async #writeDoc(sb: SupabaseClient, meta: SyncMeta, c: Character, sent: string): Promise<DocRow | null> {
    const body = { doc: splitCharacter(c).doc, doc_edited_at: sent };
    if (meta.docVersion === null) {
      const r = await sb.from("characters").insert({ id: c.id, ...body }).select(DOC_COLS).single();
      if (r.error?.code === "23505") return null;
      if (r.error) throw r.error;
      return r.data as DocRow;
    }
    const r = await sb.from("characters").update(body).eq("id", c.id).eq("doc_version", meta.docVersion).select(DOC_COLS);
    if (r.error) throw r.error;
    return (r.data[0] as DocRow | undefined) ?? null;
  }

  async #fetchDoc(sb: SupabaseClient, id: string): Promise<DocRow | null> {
    const r = await sb.from("characters").select(DOC_COLS).eq("id", id).maybeSingle();
    if (r.error) throw r.error;
    return r.data as DocRow | null;
  }

  async #syncState(id: string) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const meta = this.metas[id];
      const entry = characters.find(id);
      if (!meta?.stateDirty || meta.ownerId !== this.userId || !entry?.ok) return;
      if (meta.docVersion === null) return; // the document row has to exist first
      const sent = meta.stateEditedAt;
      const sb = await remote();
      const row = await this.#writeState(sb, meta, entry.character, sent);
      if (row) {
        const now = this.metas[id];
        if (now) await this.#saveMeta({ ...now, stateVersion: row.state_version, stateDirty: !sameInstant(now.stateEditedAt, sent) });
        continue;
      }
      const cur = await this.#fetchState(sb, id);
      if (!cur) {
        // No row we can see: create it (first upload) on the next try.
        await this.#saveMeta({ ...this.metas[id]!, stateVersion: null });
        continue;
      }
      const latest = characters.find(id);
      const now = this.metas[id];
      if (!latest?.ok || !now) return;
      const remoteState = this.#parseState(latest.character, cur.state);
      if (!remoteState) throw new Error(`The server copy of ${latest.name}'s table state doesn't validate.`);
      const r = resolveState({ value: latest.character.state, editedAt: now.stateEditedAt }, { value: remoteState, editedAt: cur.state_edited_at });
      if (r.localChanged) await characters.receive({ ...latest.character, state: r.state }, { keepUndo: r.localWon });
      await this.#saveMeta({ ...now, stateVersion: cur.state_version, stateEditedAt: r.editedAt, stateDirty: r.push });
    }
    throw new Error("Sync kept colliding with another device. It'll try again.");
  }

  async #writeState(sb: SupabaseClient, meta: SyncMeta, c: Character, sent: string): Promise<StateRow | null> {
    const body = { state: c.state, summary: summarize(c), state_edited_at: sent };
    if (meta.stateVersion === null) {
      const r = await sb.from("character_states").insert({ character_id: c.id, ...body }).select(STATE_COLS).single();
      if (r.error?.code === "23505") return null;
      if (r.error) throw r.error;
      return r.data as StateRow;
    }
    const r = await sb.from("character_states").update(body).eq("character_id", c.id).eq("state_version", meta.stateVersion).select(STATE_COLS);
    if (r.error) throw r.error;
    return (r.data[0] as StateRow | undefined) ?? null;
  }

  async #fetchState(sb: SupabaseClient, id: string): Promise<StateRow | null> {
    const r = await sb.from("character_states").select(STATE_COLS).eq("character_id", id).maybeSingle();
    if (r.error) throw r.error;
    return r.data as StateRow | null;
  }

  // --- realtime -----------------------------------------------------------------

  async #subscribe() {
    const userId = this.userId!;
    const sb = await remote();
    this.#channel = sb
      .channel(`sync-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "characters", filter: `owner_id=eq.${userId}` }, p => {
        if (p.eventType !== "DELETE") void this.#onRemoteDoc(p.new as DocRow);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "character_states" }, p => {
        if (p.eventType !== "DELETE") void this.#onRemoteState(p.new as StateRow);
      })
      // (Re)connected: catch up on anything missed while away.
      .subscribe(status => {
        if (status === "SUBSCRIBED") void this.pull();
      });
  }

  async #onRemoteDoc(row: DocRow) {
    if (row.owner_id !== this.userId) return;
    const meta = this.metas[row.id];
    try {
      if (!meta) {
        // Uploaded from another device: fetch its state and add it here.
        const sb = await remote();
        await this.#reconcile(row, await this.#fetchState(sb, row.id));
        return;
      }
      if (meta.partyId !== row.party_id) await this.#setParty(row.id, row.party_id);
      if (meta.docVersion !== null && row.doc_version > meta.docVersion) {
        if (this.metas[row.id]?.docDirty) this.schedule(0);
        else await this.#adoptDoc(row);
      }
    } catch (e) {
      this.#fail(e);
    }
  }

  async #onRemoteState(row: StateRow) {
    const meta = this.metas[row.character_id];
    if (!meta || meta.ownerId !== this.userId) return;
    try {
      if (meta.stateVersion !== null && row.state_version > meta.stateVersion) {
        if (meta.stateDirty) this.schedule(0);
        else await this.#adoptState(row);
      }
    } catch (e) {
      this.#fail(e);
    }
  }
}

export const sync = new SyncEngine();
