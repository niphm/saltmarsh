-- Phase 2: accounts, character sync, parties, shared party inventory, journal.
--
-- Security (REQUIREMENTS F2.8), enforced here with row-level security:
--   * The owner writes a character's document; the owner and the party DM
--     write its table state. Players cannot edit each other's state.
--   * Party members read each other's table state (and a small summary for
--     the party strip), but not each other's documents, which hold private notes.
--   * Journal entries are visible by `visibility`: party (members), dm (the DM
--     and the author), author (the author only).
--
-- A character is two rows: `characters` (the document, changes at level-up)
-- and `character_states` (table state, changes constantly, realtime). The
-- split lets RLS treat them differently and keeps realtime traffic to state.
--
-- Sync (F2.2) is last-write-wins per row: clients send their edit time
-- (`*_edited_at`) and update only if the row's `*_version` is the one they
-- last saw. Triggers bump the version on every content change.

-- ---------------------------------------------------------------------------
-- Helpers. In a schema the API doesn't expose, so they can't be called as RPCs.
-- ---------------------------------------------------------------------------
create schema private;
grant usage on schema private to authenticated;

create function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- 8 characters from an alphabet without look-alikes (no 0/O, 1/I/L).
-- Random bytes come from a v4 UUID, skipping its version and variant bytes.
create function private.new_invite_code() returns text
language sql volatile set search_path = '' as $$
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', (get_byte(r.b, i) % 31) + 1, 1), '' order by i)
  from (select uuid_send(gen_random_uuid()) as b) r, unnest(array[0, 1, 2, 3, 4, 5, 10, 11]) as i
$$;

-- ---------------------------------------------------------------------------
-- Profiles: the display name shown everywhere instead of the email (F2.1).
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();

create function private.display_name_for(meta jsonb, email text) returns text
language sql immutable set search_path = '' as $$
  select left(coalesce(nullif(trim(meta ->> 'display_name'), ''), split_part(coalesce(email, ''), '@', 1), 'Adventurer'), 40)
$$;

-- Every new account gets a profile, named from the sign-up form's display name.
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, private.display_name_for(new.raw_user_meta_data, new.email))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- Accounts created before this migration.
insert into public.profiles (id, display_name)
select u.id, private.display_name_for(u.raw_user_meta_data, u.email) from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Parties and membership (F2.3)
-- ---------------------------------------------------------------------------
create table public.parties (
  id uuid primary key default gen_random_uuid(),
  dm_user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  invite_code text not null unique default private.new_invite_code(),
  visibility jsonb not null default '{}'::jsonb,           -- Party.visibility: showHpToPlayers, ...
  rules_packs text[] not null default array['srd', 'saltmarsh'],
  calendar jsonb not null default '{}'::jsonb,
  coins jsonb not null default '{"cp": 0, "sp": 0, "ep": 0, "gp": 0, "pp": 0}'::jsonb,  -- shared purse (F2.4)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger parties_touch before update on public.parties
  for each row execute function private.touch_updated_at();

create table public.party_members (
  party_id uuid not null references public.parties (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('player', 'dm')),
  joined_at timestamptz not null default now(),
  primary key (party_id, user_id)
);
create index party_members_user_idx on public.party_members (user_id);

-- RLS helpers. SECURITY DEFINER so policies can look at membership without
-- recursing into party_members' own policies.
create function private.is_party_member(p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.party_members m where m.party_id = p and m.user_id = (select auth.uid()))
$$;

create function private.is_party_dm(p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.parties x where x.id = p and x.dm_user_id = (select auth.uid()))
$$;

create function private.shares_party(u uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.party_members a join public.party_members b on a.party_id = b.party_id
    where a.user_id = (select auth.uid()) and b.user_id = u
  )
$$;

-- The creator of a party is its DM and first member.
create function private.add_dm_membership() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.party_members (party_id, user_id, role) values (new.id, new.dm_user_id, 'dm')
  on conflict (party_id, user_id) do update set role = 'dm';
  return new;
end $$;

create trigger parties_add_dm after insert on public.parties
  for each row execute function private.add_dm_membership();

-- ---------------------------------------------------------------------------
-- Characters: document and table state
-- ---------------------------------------------------------------------------
create table public.characters (
  id text primary key check (char_length(id) between 1 and 100),   -- Character.id
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  party_id uuid references public.parties (id) on delete set null,
  doc jsonb not null,                       -- the Character without `state`
  doc_edited_at timestamptz not null,       -- when the doc was last edited, by the client's clock
  doc_version bigint not null default 1,    -- bumped by every content change (trigger)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index characters_owner_idx on public.characters (owner_id);
create index characters_party_idx on public.characters (party_id);

create table public.character_states (
  character_id text primary key references public.characters (id) on delete cascade,
  party_id uuid,                            -- copied from characters by trigger (RLS, realtime filters)
  state jsonb not null,                     -- Character.state
  summary jsonb not null default '{}'::jsonb,  -- from derive(): name, hpMax, hpBand, ... for the party strip
  state_edited_at timestamptz not null,
  state_version bigint not null default 1,
  updated_at timestamptz not null default now()
);
create index character_states_party_idx on public.character_states (party_id);

create function private.owns_character(c text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.characters x where x.id = c and x.owner_id = (select auth.uid()))
$$;

create function private.character_in_party(c text, p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.characters x where x.id = c and x.party_id = p)
$$;

create function private.characters_before_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.doc_version := 1;
  else
    new.doc_version := old.doc_version
      + case when new.doc is distinct from old.doc or new.doc_edited_at is distinct from old.doc_edited_at then 1 else 0 end;
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger characters_before_write before insert or update on public.characters
  for each row execute function private.characters_before_write();

-- character_states.party_id always mirrors characters.party_id.
create function private.character_states_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.party_id := (select c.party_id from public.characters c where c.id = new.character_id);
  if tg_op = 'INSERT' then
    new.state_version := 1;
  else
    new.state_version := old.state_version
      + case when new.state is distinct from old.state or new.state_edited_at is distinct from old.state_edited_at then 1 else 0 end;
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger character_states_before_write before insert or update on public.character_states
  for each row execute function private.character_states_before_write();

create function private.characters_party_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.character_states set party_id = new.party_id where character_id = new.id;
  update public.party_items set held_by = null where held_by = new.id and party_id is distinct from new.party_id;
  return new;
end $$;

-- (created after party_items, below)

-- Leaving a party detaches your characters from it.
create function private.member_left() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.characters set party_id = null where owner_id = old.user_id and party_id = old.party_id;
  return old;
end $$;

create trigger party_members_left after delete on public.party_members
  for each row execute function private.member_left();

-- ---------------------------------------------------------------------------
-- Shared party inventory (F2.4): items as rows so edits don't collide;
-- coins on the party, changed only through adjust_party_coins().
-- ---------------------------------------------------------------------------
create table public.party_items (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.parties (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  qty integer not null default 1 check (qty >= 0),
  category text not null default 'gear' check (char_length(category) between 1 and 40),
  held_by text references public.characters (id) on delete set null,   -- character carrying it
  notes text check (char_length(notes) <= 2000),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index party_items_party_idx on public.party_items (party_id);

create trigger party_items_touch before update on public.party_items
  for each row execute function private.touch_updated_at();

create trigger characters_party_changed after update of party_id on public.characters
  for each row execute function private.characters_party_changed();

-- ---------------------------------------------------------------------------
-- Journal (F2.5). `doc` holds the rest of a JournalEntry (title, body, tags,
-- session details, links, quest status).
-- ---------------------------------------------------------------------------
create table public.journal (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.parties (id) on delete cascade,
  author_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  visibility text not null default 'party' check (visibility in ('party', 'dm', 'author')),
  kind text not null check (kind in ('session', 'npc', 'location', 'quest', 'lore', 'note')),
  doc jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index journal_party_idx on public.journal (party_id);

create trigger journal_touch before update on public.journal
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Functions the app calls (RPC)
-- ---------------------------------------------------------------------------

-- Join a party with its invite code (F2.3). Returns the party id.
create function public.join_party(code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  p uuid;
begin
  if uid is null then
    raise exception 'Sign in to join a party' using errcode = '28000';
  end if;
  select x.id into p from public.parties x where x.invite_code = upper(regexp_replace(code, '[^A-Za-z0-9]', '', 'g'));
  if p is null then
    raise exception 'No party has that invite code' using errcode = 'P0002';
  end if;
  insert into public.party_members (party_id, user_id, role) values (p, uid, 'player')
  on conflict (party_id, user_id) do nothing;
  return p;
end $$;

-- DM only: replace the invite code (the old one stops working).
create function public.new_party_invite_code(p uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  code text;
begin
  if not private.is_party_dm(p) then
    raise exception 'Only the DM can change the invite code' using errcode = '42501';
  end if;
  update public.parties set invite_code = private.new_invite_code() where id = p returning invite_code into code;
  return code;
end $$;

-- Add (positive) or spend (negative) shared coins, all or nothing. Any member.
create function public.adjust_party_coins(p uuid, delta jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  old_coins jsonb;
  new_coins jsonb := '{}'::jsonb;
  k text;
  v bigint;
begin
  if not private.is_party_member(p) then
    raise exception 'Not a member of this party' using errcode = '42501';
  end if;
  select x.coins into old_coins from public.parties x where x.id = p for update;
  foreach k in array array['cp', 'sp', 'ep', 'gp', 'pp'] loop
    v := coalesce((old_coins ->> k)::bigint, 0) + coalesce(trunc((delta ->> k)::numeric)::bigint, 0);
    if v < 0 then
      raise exception 'Not enough % in the party purse', k using errcode = '23514';
    end if;
    new_coins := new_coins || jsonb_build_object(k, v);
  end loop;
  update public.parties set coins = new_coins where id = p;
  return new_coins;
end $$;

-- ---------------------------------------------------------------------------
-- Privileges. Start from nothing, grant what the app needs. Column lists keep
-- owner, party and version columns out of clients' direct reach.
-- ---------------------------------------------------------------------------
revoke all on public.profiles, public.parties, public.party_members, public.characters,
  public.character_states, public.party_items, public.journal from anon, authenticated;

grant select on public.profiles to authenticated;
grant insert (id, display_name) on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

grant select, delete on public.parties to authenticated;
grant insert (name, visibility, rules_packs, calendar) on public.parties to authenticated;
grant update (name, visibility, rules_packs, calendar) on public.parties to authenticated;

grant select, delete on public.party_members to authenticated;

grant select, delete on public.characters to authenticated;
grant insert (id, party_id, doc, doc_edited_at) on public.characters to authenticated;
grant update (party_id, doc, doc_edited_at) on public.characters to authenticated;

grant select on public.character_states to authenticated;
grant insert (character_id, state, summary, state_edited_at) on public.character_states to authenticated;
grant update (state, summary, state_edited_at) on public.character_states to authenticated;

grant select, delete on public.party_items to authenticated;
grant insert (party_id, name, qty, category, held_by, notes) on public.party_items to authenticated;
grant update (name, qty, category, held_by, notes) on public.party_items to authenticated;

grant select, delete on public.journal to authenticated;
grant insert (party_id, visibility, kind, doc) on public.journal to authenticated;
grant update (visibility, kind, doc) on public.journal to authenticated;

revoke execute on function public.join_party(text), public.new_party_invite_code(uuid),
  public.adjust_party_coins(uuid, jsonb) from public, anon;
grant execute on function public.join_party(text), public.new_party_invite_code(uuid),
  public.adjust_party_coins(uuid, jsonb) to authenticated;

revoke execute on all functions in schema private from public, anon;
grant execute on function private.is_party_member(uuid), private.is_party_dm(uuid), private.shares_party(uuid),
  private.owns_character(text), private.character_in_party(text, uuid), private.new_invite_code() to authenticated;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.parties enable row level security;
alter table public.party_members enable row level security;
alter table public.characters enable row level security;
alter table public.character_states enable row level security;
alter table public.party_items enable row level security;
alter table public.journal enable row level security;

-- Profiles: yours, and those of people in a party with you.
create policy "profiles: read own and party members'" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.shares_party(id));
create policy "profiles: create own" on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy "profiles: edit own" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Parties: members read; the DM creates, edits and deletes. Joining is join_party().
create policy "parties: members read" on public.parties for select to authenticated
  using (dm_user_id = (select auth.uid()) or private.is_party_member(id));
create policy "parties: create as DM" on public.parties for insert to authenticated
  with check (dm_user_id = (select auth.uid()));
create policy "parties: DM edits" on public.parties for update to authenticated
  using (dm_user_id = (select auth.uid())) with check (dm_user_id = (select auth.uid()));
create policy "parties: DM deletes" on public.parties for delete to authenticated
  using (dm_user_id = (select auth.uid()));

-- Membership: members see who's in; players can leave; the DM can remove players.
create policy "party_members: members read" on public.party_members for select to authenticated
  using (private.is_party_member(party_id));
create policy "party_members: leave or remove" on public.party_members for delete to authenticated
  using (
    (user_id = (select auth.uid()) and role = 'player')
    or (private.is_party_dm(party_id) and user_id <> (select auth.uid()))
  );

-- Character documents: the owner reads and writes; the party DM reads (DM board, Phase 3).
create policy "characters: owner and party DM read" on public.characters for select to authenticated
  using (owner_id = (select auth.uid()) or private.is_party_dm(party_id));
create policy "characters: owner creates" on public.characters for insert to authenticated
  with check (owner_id = (select auth.uid()) and (party_id is null or private.is_party_member(party_id)));
create policy "characters: owner edits" on public.characters for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and (party_id is null or private.is_party_member(party_id)));
create policy "characters: owner deletes" on public.characters for delete to authenticated
  using (owner_id = (select auth.uid()));

-- Table state: the owner and party members read; the owner and the party DM write.
create policy "character_states: owner and party read" on public.character_states for select to authenticated
  using (private.owns_character(character_id) or private.is_party_member(party_id));
create policy "character_states: owner creates" on public.character_states for insert to authenticated
  with check (private.owns_character(character_id));
create policy "character_states: owner and party DM write" on public.character_states for update to authenticated
  using (private.owns_character(character_id) or private.is_party_dm(party_id))
  with check (private.owns_character(character_id) or private.is_party_dm(party_id));

-- Party inventory: any member, for items in their party; "held by" a character in the party.
create policy "party_items: members read" on public.party_items for select to authenticated
  using (private.is_party_member(party_id));
create policy "party_items: members add" on public.party_items for insert to authenticated
  with check (private.is_party_member(party_id) and (held_by is null or private.character_in_party(held_by, party_id)));
create policy "party_items: members edit" on public.party_items for update to authenticated
  using (private.is_party_member(party_id))
  with check (private.is_party_member(party_id) and (held_by is null or private.character_in_party(held_by, party_id)));
create policy "party_items: members remove" on public.party_items for delete to authenticated
  using (private.is_party_member(party_id));

-- Journal: party entries for members, dm entries for the DM (and their author), author entries for the author.
create policy "journal: read by visibility" on public.journal for select to authenticated
  using (
    private.is_party_member(party_id) and (
      author_id = (select auth.uid())
      or visibility = 'party'
      or (visibility = 'dm' and private.is_party_dm(party_id))
    )
  );
create policy "journal: members write own" on public.journal for insert to authenticated
  with check (author_id = (select auth.uid()) and private.is_party_member(party_id));
create policy "journal: author edits" on public.journal for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()) and private.is_party_member(party_id));
create policy "journal: author or DM deletes" on public.journal for delete to authenticated
  using (author_id = (select auth.uid()) or private.is_party_dm(party_id));

-- ---------------------------------------------------------------------------
-- Realtime (F2.6): changes are delivered only to clients whose RLS allows them to read the row.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table
  public.characters, public.character_states, public.parties, public.party_members, public.party_items, public.journal;
