/**
 * Security tests for the Phase 2 schema (REQUIREMENTS F2.8), run through the
 * real API (PostgREST + RLS + grants) of a local Supabase stack:
 *
 *   npm run db:start && npm run db:reset && npm run test:db
 *
 * Each run signs up fresh users, so it can be repeated without a reset.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
// The local stack's well-known publishable key (not a secret; same on every machine).
const KEY = process.env.SUPABASE_ANON_KEY ?? "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";

interface User { name: string; id: string; db: SupabaseClient }

const run = Math.random().toString(36).slice(2, 8);

async function signUp(name: string): Promise<User> {
  const db = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.auth.signUp({
    email: `${name.toLowerCase()}-${run}@example.test`,
    password: "correct horse battery staple",
    options: { data: { display_name: name } },
  });
  if (error) throw error;
  return { name, id: data.user!.id, db };
}

const doc = (id: string, name: string) => ({ id, identity: { name } });
const state = (hp: number) => ({ hp: { current: hp, temp: 0 }, log: [] });
const now = () => new Date().toISOString();

async function upload(u: User, id: string, hp: number) {
  const c = await u.db.from("characters").insert({ id, doc: doc(id, u.name), doc_edited_at: now() }).select().single();
  if (c.error) throw c.error;
  const s = await u.db.from("character_states")
    .insert({ character_id: id, state: state(hp), summary: { name: u.name, hpMax: hp }, state_edited_at: now() })
    .select().single();
  if (s.error) throw s.error;
  return { doc: c.data, state: s.data };
}

let dm: User, alice: User, bob: User, eve: User;
let party: { id: string; invite_code: string };
const A = `c_alice_${run}`;
const B = `c_bob_${run}`;
const E = `c_eve_${run}`;

beforeAll(async () => {
  [dm, alice, bob, eve] = await Promise.all(["Dee", "Alice", "Bob", "Eve"].map(signUp));
  const p = await dm.db.from("parties").insert({ name: "Ghosts of Saltmarsh" }).select().single();
  if (p.error) throw p.error;
  party = p.data;
  for (const u of [alice, bob]) {
    const j = await u.db.rpc("join_party", { code: party.invite_code.toLowerCase() });
    if (j.error) throw j.error;
  }
  await upload(alice, A, 30);
  await upload(bob, B, 20);
  await upload(eve, E, 10);
  for (const [u, id] of [[alice, A], [bob, B]] as const) {
    const r = await u.db.from("characters").update({ party_id: party.id }).eq("id", id);
    if (r.error) throw r.error;
  }
});

afterAll(async () => {
  await Promise.all([dm, alice, bob, eve].map(u => u?.db.removeAllChannels()));
});

describe("profiles (F2.1)", () => {
  it("are created from the sign-up display name", async () => {
    const { data } = await alice.db.from("profiles").select("display_name").eq("id", alice.id).single();
    expect(data?.display_name).toBe("Alice");
  });

  it("are visible to party members, not to outsiders", async () => {
    const seen = await alice.db.from("profiles").select("display_name").in("id", [dm.id, bob.id, eve.id]);
    expect(seen.data?.map(p => p.display_name).sort()).toEqual(["Bob", "Dee"]);
  });

  it("can only be renamed by their owner", async () => {
    await bob.db.from("profiles").update({ display_name: "Hacked" }).eq("id", alice.id);
    const { data } = await alice.db.from("profiles").select("display_name").eq("id", alice.id).single();
    expect(data?.display_name).toBe("Alice");
  });
});

describe("parties (F2.3)", () => {
  it("the creator is the DM and a member", async () => {
    const { data } = await dm.db.from("party_members").select("user_id, role").eq("party_id", party.id);
    expect(data).toContainEqual({ user_id: dm.id, role: "dm" });
    expect(data).toContainEqual({ user_id: alice.id, role: "player" });
  });

  it("outsiders can't see the party or its members", async () => {
    expect((await eve.db.from("parties").select().eq("id", party.id)).data).toEqual([]);
    expect((await eve.db.from("party_members").select().eq("party_id", party.id)).data).toEqual([]);
  });

  it("a wrong invite code is refused", async () => {
    const r = await eve.db.rpc("join_party", { code: "NOPE1234" });
    expect(r.error?.message).toBe("No party has that invite code");
  });

  it("players can't edit the party or add members directly", async () => {
    await alice.db.from("parties").update({ name: "Mine now" }).eq("id", party.id);
    expect((await dm.db.from("parties").select("name").eq("id", party.id).single()).data?.name).toBe("Ghosts of Saltmarsh");
    const add = await alice.db.from("party_members").insert({ party_id: party.id, user_id: eve.id, role: "player" });
    expect(add.error).not.toBeNull();
  });

  it("only the DM can change the invite code, and the old one stops working", async () => {
    expect((await alice.db.rpc("new_party_invite_code", { p: party.id })).error).not.toBeNull();
    const fresh = await dm.db.rpc("new_party_invite_code", { p: party.id });
    expect(fresh.data).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect((await eve.db.rpc("join_party", { code: party.invite_code })).error).not.toBeNull();
    party = { ...party, invite_code: fresh.data };
  });

  it("you can't attach a character to a party you're not in", async () => {
    const r = await eve.db.from("characters").update({ party_id: party.id }).eq("id", E);
    expect(r.error).not.toBeNull();
  });
});

describe("character documents: owner writes, party DM reads (F2.8)", () => {
  it("other players can't read your document (it has your private notes)", async () => {
    expect((await bob.db.from("characters").select().eq("id", A)).data).toEqual([]);
    expect((await eve.db.from("characters").select().eq("id", A)).data).toEqual([]);
  });

  it("the party DM can read it but not change it", async () => {
    expect((await dm.db.from("characters").select("doc").eq("id", A).single()).data?.doc).toEqual(doc(A, "Alice"));
    const r = await dm.db.from("characters").update({ doc: doc(A, "Renamed") }).eq("id", A).select();
    expect(r.data).toEqual([]);
    expect((await alice.db.from("characters").select("doc").eq("id", A).single()).data?.doc).toEqual(doc(A, "Alice"));
  });

  it("an id already on another account can't be taken over", async () => {
    const r = await eve.db.from("characters").insert({ id: A, doc: doc(A, "Mine"), doc_edited_at: now() });
    expect(r.error).not.toBeNull();
  });

  it("owner, version and party columns can't be written directly", async () => {
    expect((await alice.db.from("characters").update({ owner_id: eve.id }).eq("id", A)).error).not.toBeNull();
    expect((await alice.db.from("characters").update({ doc_version: 99 }).eq("id", A)).error).not.toBeNull();
    expect((await alice.db.from("character_states").update({ party_id: null }).eq("character_id", A)).error).not.toBeNull();
  });

  it("each content change bumps the version; a stale version updates nothing (sync, F2.2)", async () => {
    const before = (await alice.db.from("characters").select("doc_version").eq("id", A).single()).data!.doc_version;
    const ok = await alice.db.from("characters").update({ doc: doc(A, "Alice"), doc_edited_at: now() })
      .eq("id", A).eq("doc_version", before).select("doc_version");
    expect(ok.data).toEqual([{ doc_version: before + 1 }]);
    const stale = await alice.db.from("characters").update({ doc_edited_at: now() }).eq("id", A).eq("doc_version", before).select();
    expect(stale.data).toEqual([]);
  });
});

describe("table state: party reads, owner and DM write (F2.8)", () => {
  it("party members read each other's state and summary; outsiders don't", async () => {
    const seen = await bob.db.from("character_states").select("character_id, summary").eq("party_id", party.id);
    expect(seen.data?.map(r => r.character_id).sort()).toEqual([A, B].sort());
    expect((await eve.db.from("character_states").select().eq("character_id", A)).data).toEqual([]);
  });

  it("players can't change each other's state", async () => {
    const r = await bob.db.from("character_states").update({ state: state(1) }).eq("character_id", A).select();
    expect(r.data).toEqual([]);
  });

  it("the party DM can change a player's state", async () => {
    const r = await dm.db.from("character_states").update({ state: state(12), state_edited_at: now() }).eq("character_id", A)
      .select("state");
    expect(r.data?.[0].state.hp.current).toBe(12);
  });

  it("the owner can change their own", async () => {
    const r = await alice.db.from("character_states").update({ state: state(30), state_edited_at: now() }).eq("character_id", A)
      .select("state, state_version");
    expect(r.data?.[0].state.hp.current).toBe(30);
    expect(r.data?.[0].state_version).toBeGreaterThan(1);
  });
});

describe("shared party inventory (F2.4)", () => {
  it("any member adds, edits and removes items; outsiders can't see them", async () => {
    const add = await alice.db.from("party_items").insert({ party_id: party.id, name: "Rope", qty: 2, held_by: B }).select().single();
    expect(add.error).toBeNull();
    const edit = await bob.db.from("party_items").update({ qty: 1 }).eq("id", add.data!.id).select("qty");
    expect(edit.data).toEqual([{ qty: 1 }]);
    expect((await eve.db.from("party_items").select().eq("party_id", party.id)).data).toEqual([]);
    expect((await dm.db.from("party_items").delete().eq("id", add.data!.id).select()).data).toHaveLength(1);
  });

  it("'held by' must be a character in the party", async () => {
    const r = await alice.db.from("party_items").insert({ party_id: party.id, name: "Stolen", held_by: E });
    expect(r.error).not.toBeNull();
  });

  it("coins change all or nothing, through adjust_party_coins only", async () => {
    expect((await alice.db.rpc("adjust_party_coins", { p: party.id, delta: { gp: 50, sp: 3 } })).data)
      .toEqual({ cp: 0, sp: 3, ep: 0, gp: 50, pp: 0 });
    const over = await bob.db.rpc("adjust_party_coins", { p: party.id, delta: { gp: -10, sp: -5 } });
    expect(over.error?.message).toBe("Not enough sp in the party purse");
    expect((await bob.db.rpc("adjust_party_coins", { p: party.id, delta: { gp: -10 } })).data?.gp).toBe(40);
    expect((await eve.db.rpc("adjust_party_coins", { p: party.id, delta: { gp: 1 } })).error).not.toBeNull();
    expect((await alice.db.from("parties").update({ coins: { gp: 9999 } }).eq("id", party.id)).error).not.toBeNull();
  });
});

describe("journal visibility (F2.5, F2.8)", () => {
  const entry = (visibility: string, title: string) =>
    ({ party_id: party.id, visibility, kind: "note", doc: { title, body: "", tags: [] } });

  it("party entries for members, dm entries for the DM and author, author entries for the author", async () => {
    const r = await alice.db.from("journal").insert([entry("party", "P"), entry("dm", "D"), entry("author", "A")]).select("id");
    expect(r.error).toBeNull();
    const titles = async (u: User) =>
      ((await u.db.from("journal").select("doc").eq("party_id", party.id)).data ?? []).map(j => j.doc.title).sort();
    expect(await titles(alice)).toEqual(["A", "D", "P"]);
    expect(await titles(bob)).toEqual(["P"]);
    expect(await titles(dm)).toEqual(["D", "P"]);
    expect(await titles(eve)).toEqual([]);
  });

  it("only the author edits; the DM can delete", async () => {
    const mine = await alice.db.from("journal").insert(entry("party", "Edit me")).select("id").single();
    const id = mine.data!.id;
    expect((await bob.db.from("journal").update({ doc: { title: "Vandal", body: "", tags: [] } }).eq("id", id).select()).data).toEqual([]);
    expect((await dm.db.from("journal").update({ doc: { title: "DM edit", body: "", tags: [] } }).eq("id", id).select()).data).toEqual([]);
    expect((await dm.db.from("journal").delete().eq("id", id).select()).data).toHaveLength(1);
  });

  it("you can't post as someone else", async () => {
    const r = await bob.db.from("journal").insert({ ...entry("party", "Forged"), author_id: alice.id });
    expect(r.error).not.toBeNull();
  });
});

describe("realtime (F2.6)", () => {
  it("a state change reaches party members within 2 s, and not outsiders", async () => {
    type Row = { character_id: string; state: { hp: { current: number } } };
    const listen = async (u: User) => {
      const got: Row[] = [];
      await new Promise<void>(ready => {
        u.db.channel(`t-${u.name}-${run}`)
          .on("postgres_changes", { event: "UPDATE", schema: "public", table: "character_states" }, p => got.push(p.new as Row))
          .subscribe(status => status === "SUBSCRIBED" && ready());
      });
      return got;
    };
    const [bobGot, eveGot] = await Promise.all([listen(bob), listen(eve)]);
    const sees = (hp: number) => (r: Row) => r.character_id === A && r.state.hp.current === hp;
    const update = (hp: number) => alice.db.from("character_states").update({ state: state(hp), state_edited_at: now() }).eq("character_id", A);
    const heard = async (hp: number, ms: number) => {
      const t0 = Date.now();
      while (!bobGot.some(sees(hp)) && Date.now() - t0 < ms) await new Promise(r => setTimeout(r, 20));
      return bobGot.some(sees(hp));
    };

    // A freshly started stack takes a few seconds before realtime streams; wait until it does.
    let flowing = false;
    for (let hp = 100; hp < 130 && !flowing; hp++) {
      await update(hp);
      flowing = await heard(hp, 1000);
    }
    expect(flowing).toBe(true);

    const t0 = Date.now();
    await update(7);
    expect(await heard(7, 5000)).toBe(true);
    expect(Date.now() - t0).toBeLessThan(2000);
    await new Promise(r => setTimeout(r, 500));
    expect(eveGot).toEqual([]);
  }, 60_000);
});

describe("leaving a party", () => {
  it("detaches your characters, so the party stops seeing their state", async () => {
    expect((await bob.db.from("party_members").delete().eq("party_id", party.id).eq("user_id", bob.id).select()).data).toHaveLength(1);
    expect((await bob.db.from("characters").select("party_id").eq("id", B).single()).data?.party_id).toBeNull();
    expect((await alice.db.from("character_states").select().eq("character_id", B)).data).toEqual([]);
  });

  it("the DM can't leave their own party (delete it instead)", async () => {
    const r = await dm.db.from("party_members").delete().eq("party_id", party.id).eq("user_id", dm.id).select();
    expect(r.data).toEqual([]);
  });
});
