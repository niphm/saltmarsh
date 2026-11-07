/**
 * Party, membership, encounters, and journal.
 *
 * These are the shared records. A character belongs to at most one party.
 * The DM dashboard is a view over party.members' characters' `state`.
 */
import { z } from "zod";
import { Ref } from "./character";

const Id = z.string().min(1);

export const Role = z.enum(["player", "dm"]);

export const PartyMember = z.object({
  userId: Id,
  role: Role,
  characterIds: z.array(Id).default([]),   // a player can run more than one PC
  joinedAt: z.string(),
});

/** What the DM lets players see about each other, and what the party board shows. */
export const Visibility = z.object({
  showHpToPlayers: z.enum(["exact", "bar", "status", "hidden"]).default("status"),
  showConditionsToPlayers: z.boolean().default(true),
  showConcentrationToPlayers: z.boolean().default(true),
});

export const Party = z.object({
  schemaVersion: z.literal(1),
  id: Id,
  name: z.string(),                        // "Ghosts of Saltmarsh"
  dmUserId: Id,
  members: z.array(PartyMember).default([]),
  inviteCode: z.string().optional(),       // short code players use to join
  visibility: Visibility.default({}),
  /** Rules packs enabled for this party, in override order (later wins). */
  rulesPacks: z.array(z.string()).default(["srd"]),   // ["srd", "saltmarsh-homebrew"]
  /** Shared inventory - the thing the vault couldn't actually share. */
  inventory: z.object({
    coins: z.object({ cp: z.number().default(0), sp: z.number().default(0), ep: z.number().default(0), gp: z.number().default(0), pp: z.number().default(0) }).default({}),
    items: z.array(z.object({
      id: Id, name: z.string(), qty: z.number().default(1), category: z.string().default("gear"),
      heldBy: Id.optional(),               // characterId carrying it, if anyone
      notes: z.string().optional(),
    })).default([]),
  }).default({}),
  /** In-game calendar, so the journal can reference it. */
  calendar: z.object({ currentDate: z.string().optional(), notes: z.string().optional() }).default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Party = z.infer<typeof Party>;

// ---------------------------------------------------------------------------
// Journal - party-scoped, with per-entry visibility
// ---------------------------------------------------------------------------
export const JournalVisibility = z.enum(["party", "dm", "author"]);

export const JournalEntry = z.object({
  id: Id,
  partyId: Id,
  authorId: Id,
  visibility: JournalVisibility.default("party"),
  kind: z.enum(["session", "npc", "location", "quest", "lore", "note"]),
  sessionNumber: z.number().int().optional(),
  datePlayed: z.string().optional(),
  inGameDate: z.string().optional(),
  title: z.string(),
  body: z.string(),                        // markdown
  tags: z.array(z.string()).default([]),
  /** Structured bits for session entries so the DM board can roll them up. */
  session: z.object({
    keyEvents: z.array(z.string()).default([]),
    npcs: z.array(z.string()).default([]),
    locations: z.array(z.string()).default([]),
    loot: z.array(z.string()).default([]),
    followUps: z.array(z.string()).default([]),
  }).optional(),
  /** For npc/location/quest kinds: link related entries. */
  links: z.array(Id).default([]),
  /** Quest-specific status. */
  questStatus: z.enum(["active", "completed", "failed", "rumor"]).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type JournalEntry = z.infer<typeof JournalEntry>;

// ---------------------------------------------------------------------------
// Encounter - the DM's initiative tracker
// ---------------------------------------------------------------------------
export const Combatant = z.object({
  id: Id,
  kind: z.enum(["pc", "npc", "monster"]),
  characterId: Id.optional(),              // for PCs: live-linked to their state
  name: z.string(),
  initiative: z.number(),
  /** Monster-only; PCs read from their character. */
  hp: z.object({ current: z.number(), max: z.number(), temp: z.number().default(0) }).optional(),
  ac: z.number().optional(),
  statblockRef: Ref.optional(),
  conditions: z.array(z.string()).default([]),
  hiddenFromPlayers: z.boolean().default(false),   // unseen ambusher
  notes: z.string().optional(),
});

export const Encounter = z.object({
  id: Id,
  partyId: Id,
  name: z.string(),
  status: z.enum(["planned", "active", "finished"]).default("planned"),
  round: z.number().int().min(0).default(0),
  turnIndex: z.number().int().min(0).default(0),
  combatants: z.array(Combatant).default([]),
  log: z.array(z.object({ at: z.string(), round: z.number(), text: z.string() })).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Encounter = z.infer<typeof Encounter>;
