/**
 * The party (F2.3-F2.7): membership, the party strip roster, the shared
 * inventory and the journal, all live from Supabase. Party features need a
 * connection; the character sheet never waits on them.
 */
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { CharacterState, JournalEntry, Visibility } from "@saltmarsh/schema";
import { friendlyError, remote } from "./remote";
import { parseSummary, type CharacterSummary } from "./sync/merge";

export type PartyVisibility = ReturnType<typeof Visibility.parse>;
export type HpMode = PartyVisibility["showHpToPlayers"];
export type JournalItem = ReturnType<typeof JournalEntry.parse>;
type Coins = Record<"cp" | "sp" | "ep" | "gp" | "pp", number>;

export interface PartyInfo {
  id: string;
  name: string;
  dmUserId: string;
  inviteCode: string;
  visibility: PartyVisibility;
  coins: Coins;
}

export interface Member {
  userId: string;
  role: "player" | "dm";
  displayName: string;
}

export interface RosterEntry {
  id: string;
  summary: CharacterSummary;
  state: ReturnType<typeof CharacterState.parse>;
}

export interface PartyItem {
  id: string;
  name: string;
  qty: number;
  category: string;
  heldBy: string | null;
  notes: string | null;
}

interface PartyRow {
  id: string;
  name: string;
  dm_user_id: string;
  invite_code: string;
  visibility: unknown;
  coins: Partial<Coins> | null;
}
interface ItemRow {
  id: string;
  name: string;
  qty: number;
  category: string;
  held_by: string | null;
  notes: string | null;
}
interface StateRow {
  character_id: string;
  party_id: string | null;
  state: unknown;
  summary: unknown;
}
interface JournalRow {
  id: string;
  party_id: string;
  author_id: string;
  visibility: string;
  kind: string;
  doc: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

type Result = Promise<string | null>;

const CURRENT_KEY = "saltmarsh-party";
const COIN_KEYS = ["cp", "sp", "ep", "gp", "pp"] as const;

const toParty = (r: PartyRow): PartyInfo => ({
  id: r.id,
  name: r.name,
  dmUserId: r.dm_user_id,
  inviteCode: r.invite_code,
  visibility: Visibility.parse(r.visibility ?? {}),
  coins: Object.fromEntries(COIN_KEYS.map(k => [k, Number(r.coins?.[k] ?? 0)])) as Coins,
});

const toItem = (r: ItemRow): PartyItem => ({ id: r.id, name: r.name, qty: r.qty, category: r.category, heldBy: r.held_by, notes: r.notes });

function toRoster(r: StateRow): RosterEntry | null {
  const summary = parseSummary(r.summary);
  const state = CharacterState.safeParse(r.state);
  return summary && state.success ? { id: r.character_id, summary, state: state.data } : null;
}

function toJournal(r: JournalRow): JournalItem | null {
  const parsed = JournalEntry.safeParse({
    ...r.doc,
    id: r.id,
    partyId: r.party_id,
    authorId: r.author_id,
    visibility: r.visibility,
    kind: r.kind,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  });
  return parsed.success ? parsed.data : null;
}

const byName = <T extends { summary: { name: string } }>(a: T, b: T) => a.summary.name.localeCompare(b.summary.name);
const newestFirst = (a: JournalItem, b: JournalItem) => b.createdAt.localeCompare(a.createdAt);

function readCurrent(): string | null {
  try {
    return localStorage.getItem(CURRENT_KEY);
  } catch {
    return null;
  }
}

export class PartyStore {
  userId = $state<string | null>(null);
  parties = $state.raw<PartyInfo[]>([]);
  currentId = $state<string | null>(readCurrent());
  members = $state.raw<Member[]>([]);
  roster = $state.raw<RosterEntry[]>([]);
  items = $state.raw<PartyItem[]>([]);
  journal = $state.raw<JournalItem[]>([]);
  loaded = $state(false);
  error = $state<string | null>(null);

  #channel: RealtimeChannel | null = null;
  #poll: ReturnType<typeof setInterval> | undefined;

  get current(): PartyInfo | undefined {
    return this.parties.find(p => p.id === this.currentId) ?? this.parties[0];
  }

  get isDm(): boolean {
    return !!this.current && this.current.dmUserId === this.userId;
  }

  memberName = (userId: string) => this.members.find(m => m.userId === userId)?.displayName ?? "Someone";

  async start(userId: string) {
    if (this.userId === userId && this.loaded) return;
    this.userId = userId;
    addEventListener("visibilitychange", this.#onVisible);
    addEventListener("online", this.#onVisible);
    await this.refresh();
  }

  async stop() {
    removeEventListener("visibilitychange", this.#onVisible);
    removeEventListener("online", this.#onVisible);
    await this.#unsubscribe();
    this.userId = null;
    this.parties = [];
    this.members = [];
    this.roster = [];
    this.items = [];
    this.journal = [];
    this.loaded = false;
  }

  #onVisible = () => {
    if (document.visibilityState === "visible" && this.userId) void this.refresh();
  };

  /** Reload everything for the current party. */
  async refresh() {
    if (!this.userId) return;
    try {
      const sb = await remote();
      const ps = await sb.from("parties").select("id, name, dm_user_id, invite_code, visibility, coins").order("created_at");
      if (ps.error) throw ps.error;
      this.parties = (ps.data as PartyRow[]).map(toParty);
      const current = this.current;
      if (current) {
        await this.#loadAll(sb, current.id);
      } else {
        this.members = [];
        this.roster = [];
        this.items = [];
        this.journal = [];
      }
      await this.#subscribe(sb, current?.id ?? null);
      this.error = null;
    } catch (e) {
      this.error = friendlyError(e);
    }
    this.loaded = true;
  }

  async choose(partyId: string) {
    this.currentId = partyId;
    try {
      localStorage.setItem(CURRENT_KEY, partyId);
    } catch {
      /* private mode */
    }
    await this.refresh();
  }

  #loadAll(sb: SupabaseClient, partyId: string) {
    return Promise.all([this.#loadMembers(sb, partyId), this.#loadRoster(sb, partyId), this.#loadItems(sb, partyId), this.#loadJournal(sb, partyId)]);
  }

  async #loadMembers(sb: SupabaseClient, partyId: string) {
    const ms = await sb.from("party_members").select("user_id, role").eq("party_id", partyId);
    if (ms.error) throw ms.error;
    const ids = ms.data.map(m => m.user_id as string);
    const ps = ids.length ? await sb.from("profiles").select("id, display_name").in("id", ids) : { data: [], error: null };
    if (ps.error) throw ps.error;
    const names = Object.fromEntries((ps.data as { id: string; display_name: string }[]).map(p => [p.id, p.display_name]));
    this.members = ms.data
      .map(m => ({ userId: m.user_id as string, role: m.role as Member["role"], displayName: names[m.user_id] ?? "Adventurer" }))
      .sort((a, b) => (a.role === b.role ? a.displayName.localeCompare(b.displayName) : a.role === "dm" ? -1 : 1));
  }

  async #loadRoster(sb: SupabaseClient, partyId: string) {
    const r = await sb.from("character_states").select("character_id, party_id, state, summary").eq("party_id", partyId);
    if (r.error) throw r.error;
    this.roster = (r.data as StateRow[]).flatMap(row => toRoster(row) ?? []).sort(byName);
  }

  async #loadItems(sb: SupabaseClient, partyId: string) {
    const r = await sb.from("party_items").select("id, name, qty, category, held_by, notes").eq("party_id", partyId).order("created_at");
    if (r.error) throw r.error;
    this.items = (r.data as ItemRow[]).map(toItem);
  }

  async #loadJournal(sb: SupabaseClient, partyId: string) {
    const r = await sb.from("journal").select("*").eq("party_id", partyId);
    if (r.error) throw r.error;
    this.journal = (r.data as JournalRow[]).flatMap(row => toJournal(row) ?? []).sort(newestFirst);
  }

  async #unsubscribe() {
    clearInterval(this.#poll);
    if (this.#channel) {
      const sb = await remote();
      await sb.removeChannel(this.#channel);
      this.#channel = null;
    }
  }

  /** Live updates for the current party (F2.6). */
  async #subscribe(sb: SupabaseClient, partyId: string | null) {
    await this.#unsubscribe();
    if (!partyId) return;
    const f = `party_id=eq.${partyId}`;
    let first = true;
    this.#channel = sb
      .channel(`party-${partyId}-${Math.random().toString(36).slice(2, 6)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "character_states", filter: f }, p => {
        if (p.eventType === "DELETE") return;
        const entry = toRoster(p.new as StateRow);
        if (!entry) return;
        this.roster = [...this.roster.filter(r => r.id !== entry.id), entry].sort(byName);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "parties", filter: `id=eq.${partyId}` }, p => {
        if (p.eventType === "DELETE") return void this.refresh();
        const next = toParty(p.new as PartyRow);
        this.parties = this.parties.map(x => (x.id === next.id ? next : x));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "party_members", filter: f }, () => void this.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "party_items", filter: f }, p => {
        if (p.eventType === "DELETE") return;
        const item = toItem(p.new as ItemRow);
        this.items = this.items.some(i => i.id === item.id) ? this.items.map(i => (i.id === item.id ? item : i)) : [...this.items, item];
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "party_items" }, p => {
        const id = (p.old as { id?: string }).id;
        if (id) this.items = this.items.filter(i => i.id !== id);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "journal", filter: f }, p => {
        if (p.eventType === "DELETE") return;
        const entry = toJournal(p.new as JournalRow);
        if (!entry) return;
        this.journal = [...this.journal.filter(j => j.id !== entry.id), entry].sort(newestFirst);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "journal" }, p => {
        const id = (p.old as { id?: string }).id;
        if (id) this.journal = this.journal.filter(j => j.id !== id);
      })
      // Reconnected after a drop: re-read whatever changed meanwhile (the first subscribe follows a fresh load).
      .subscribe(status => {
        if (status !== "SUBSCRIBED") return;
        if (first) first = false;
        else void this.#loadAll(sb, partyId).catch(() => {});
      });
    // Detaching a character hides its row from the party, which realtime can't announce: re-read now and then.
    this.#poll = setInterval(() => {
      if (document.visibilityState === "visible") void remote().then(s => this.#loadRoster(s, partyId)).catch(() => {});
    }, 60_000);
  }

  async #run(fn: (sb: SupabaseClient) => Promise<void>, reload = false): Result {
    try {
      const sb = await remote();
      await fn(sb);
      if (reload) await this.refresh();
      return null;
    } catch (e) {
      return friendlyError(e);
    }
  }

  // --- membership (F2.3) --------------------------------------------------------

  async create(name: string): Result {
    const n = name.trim();
    if (!n) return "Name the party.";
    let id = "";
    const err = await this.#run(async sb => {
      const r = await sb.from("parties").insert({ name: n.slice(0, 80) }).select("id").single();
      if (r.error) throw r.error;
      id = r.data.id;
    });
    if (!err) await this.choose(id);
    return err;
  }

  async join(code: string): Result {
    if (!code.trim()) return "Enter the invite code from your DM.";
    let id = "";
    const err = await this.#run(async sb => {
      const r = await sb.rpc("join_party", { code });
      if (r.error) throw r.error;
      id = r.data as string;
    });
    if (!err) await this.choose(id);
    return err;
  }

  /** Leave the current party (players), or remove a player (DM). */
  async removeMember(userId: string): Result {
    const party = this.current;
    if (!party) return null;
    return this.#run(async sb => {
      const r = await sb.from("party_members").delete().eq("party_id", party.id).eq("user_id", userId).select("user_id");
      if (r.error) throw r.error;
      if (!r.data.length) throw new Error("That didn't work. Only the DM can remove other players.");
    }, true);
  }

  async deleteParty(): Result {
    const party = this.current;
    if (!party) return null;
    return this.#run(async sb => {
      const r = await sb.from("parties").delete().eq("id", party.id);
      if (r.error) throw r.error;
    }, true);
  }

  async newInviteCode(): Result {
    const party = this.current;
    if (!party) return null;
    return this.#run(async sb => {
      const r = await sb.rpc("new_party_invite_code", { p: party.id });
      if (r.error) throw r.error;
      this.parties = this.parties.map(p => (p.id === party.id ? { ...p, inviteCode: r.data as string } : p));
    });
  }

  async setVisibility(patch: Partial<PartyVisibility>): Result {
    const party = this.current;
    if (!party) return null;
    const visibility = { ...party.visibility, ...patch };
    return this.#run(async sb => {
      const r = await sb.from("parties").update({ visibility }).eq("id", party.id);
      if (r.error) throw r.error;
      this.parties = this.parties.map(p => (p.id === party.id ? { ...p, visibility } : p));
    });
  }

  /** Put one of your (uploaded) characters in the current party, or take it out. */
  async attach(characterId: string, on: boolean): Result {
    const party = this.current;
    if (!party) return null;
    return this.#run(async sb => {
      const r = await sb.from("characters").update({ party_id: on ? party.id : null }).eq("id", characterId).select("id");
      if (r.error) throw r.error;
      if (!r.data.length) throw new Error("Only a character on your account can join a party.");
      await this.#loadRoster(sb, party.id);
    });
  }

  // --- shared inventory (F2.4) ----------------------------------------------------

  async adjustCoins(delta: Partial<Coins>): Result {
    const party = this.current;
    if (!party) return null;
    return this.#run(async sb => {
      const r = await sb.rpc("adjust_party_coins", { p: party.id, delta });
      if (r.error) throw r.error;
      const coins = r.data as Coins;
      this.parties = this.parties.map(p => (p.id === party.id ? { ...p, coins } : p));
    });
  }

  async addItem(input: { name: string; qty: number; category: string; heldBy: string | null; notes?: string }): Result {
    const party = this.current;
    const name = input.name.trim();
    if (!party || !name) return name ? null : "Name the item.";
    return this.#run(async sb => {
      const r = await sb
        .from("party_items")
        .insert({ party_id: party.id, name, qty: Math.max(0, Math.trunc(input.qty)), category: input.category, held_by: input.heldBy, notes: input.notes?.trim() || null })
        .select("id, name, qty, category, held_by, notes")
        .single();
      if (r.error) throw r.error;
      const item = toItem(r.data as ItemRow);
      if (!this.items.some(i => i.id === item.id)) this.items = [...this.items, item];
    });
  }

  async updateItem(id: string, patch: Partial<Pick<PartyItem, "name" | "qty" | "category" | "heldBy" | "notes">>): Result {
    const row: Record<string, unknown> = {};
    if (patch.name !== undefined) row.name = patch.name.trim();
    if (patch.qty !== undefined) row.qty = Math.max(0, Math.trunc(patch.qty));
    if (patch.category !== undefined) row.category = patch.category;
    if (patch.heldBy !== undefined) row.held_by = patch.heldBy;
    if (patch.notes !== undefined) row.notes = patch.notes?.trim() || null;
    const before = this.items;
    this.items = this.items.map(i => (i.id === id ? { ...i, ...patch } : i)); // optimistic
    const err = await this.#run(async sb => {
      const r = await sb.from("party_items").update(row).eq("id", id).select("id, name, qty, category, held_by, notes");
      if (r.error) throw r.error;
      const item = r.data[0] ? toItem(r.data[0] as ItemRow) : null;
      if (item) this.items = this.items.map(i => (i.id === id ? item : i));
    });
    if (err) this.items = before;
    return err;
  }

  async removeItem(id: string): Result {
    return this.#run(async sb => {
      const r = await sb.from("party_items").delete().eq("id", id);
      if (r.error) throw r.error;
      this.items = this.items.filter(i => i.id !== id);
    });
  }

  // --- journal (F2.5) ---------------------------------------------------------------

  /** Create (no id) or update (id) an entry. Returns an error, or null. */
  async saveEntry(entry: Pick<JournalItem, "visibility" | "kind" | "title" | "body" | "tags"> & Partial<JournalItem>): Result {
    const party = this.current;
    if (!party) return null;
    if (!entry.title.trim()) return "Give the entry a title.";
    const { id, partyId: _p, authorId: _a, visibility, kind, createdAt: _c, updatedAt: _u, ...rest } = entry;
    const doc = { ...rest, title: entry.title.trim() };
    return this.#run(async sb => {
      const q = id
        ? sb.from("journal").update({ visibility, kind, doc }).eq("id", id).select("*")
        : sb.from("journal").insert({ party_id: party.id, visibility, kind, doc }).select("*");
      const r = await q;
      if (r.error) throw r.error;
      if (!r.data.length) throw new Error("Only the author can edit an entry.");
      const saved = toJournal(r.data[0] as JournalRow);
      if (saved) this.journal = [...this.journal.filter(j => j.id !== saved.id), saved].sort(newestFirst);
    });
  }

  async deleteEntry(id: string): Result {
    return this.#run(async sb => {
      const r = await sb.from("journal").delete().eq("id", id).select("id");
      if (r.error) throw r.error;
      if (!r.data.length) throw new Error("Only the author or the DM can delete an entry.");
      this.journal = this.journal.filter(j => j.id !== id);
    });
  }
}

export const party = new PartyStore();
