/**
 * Gespiegelde TypeScript types van de SpacetimeDB module.
 * Komen overeen met de structs in `server/src/lib.rs`.
 *
 * In een echte build worden deze normaliter gegenereerd via:
 *   `spacetime generate --lang typescript -o src/module_bindings`
 * maar voor UI-development gebruiken we deze hand-geschreven versies zodat
 * componenten sterk getypeerd blijven.
 */

export type Identity = string;
export type Timestamp = number; // microseconds since epoch

export interface User {
  id: bigint;
  identity: Identity;
  screen_name: string;
  screen_name_key: string;
  created_at: Timestamp;
  avatar_color: string;
  avatar_icon: string;
  avatar_decor: string; // "{pattern}|{accent}|{rotation}"
}

export const ALLOWED_AVATAR_COLORS = [
  "pop", "hot", "mint", "sky", "bruise", "ink", "paper", "lime",
] as const;
export type AvatarColor = typeof ALLOWED_AVATAR_COLORS[number];

export const ALLOWED_AVATAR_ICONS = [
  "🥩","🍔","🌭","🍟","🥖","🧀","🍕","🌮","🍩","🥨",
  "🍿","🍦","🍫","🥓","🍗","🥚","🥗","🍣","🌯","🍤",
  "⚽","🏟","🥇","🏆","👕","🧤","🎯","🪃",
  "🔥","⚡","💀","🤘","🎸","👑","💣","🦴","👁","🛞",
  "🎮","🪖",
] as const;

export const ALLOWED_AVATAR_PATTERNS = [
  "none", "stripes-h", "stripes-v", "dots", "grid", "checker",
] as const;
export type AvatarPattern = typeof ALLOWED_AVATAR_PATTERNS[number];

export const ALLOWED_AVATAR_ACCENT_COLORS = [
  "pop","hot","mint","sky","bruise","ink",
] as const;
export const ALLOWED_AVATAR_ACCENT_POSITIONS = ["tl","tr","bl","br"] as const;
export const ALLOWED_AVATAR_ROTATIONS = ["0","90","180","270"] as const;

export interface Province { id: bigint; name: string; }
export interface City     { id: bigint; province_id: bigint; name: string; name_key: string; }

export interface Club {
  id: bigint;
  name: string;
  name_key: string;
  province_id: bigint;
  city_id: bigint;
  created_by: bigint;
  created_at: Timestamp;
}

export interface Snack {
  id: bigint;
  club_id: bigint;
  name: string;
  name_key: string;
  created_by: bigint;
  created_at: Timestamp;
}

export interface Rating {
  id: bigint;
  user_id: bigint;
  club_id: bigint;
  snack_id: bigint;
  score: number; // 1..10
  review_text: string;
  created_at: Timestamp;
}

export interface Follow {
  id: bigint;
  follower_id: bigint;
  followee_id: bigint;
  created_at: Timestamp;
}

export interface ClubMood {
  id: bigint;
  club_id: bigint;
  user_id: bigint;
  emoji: string;
  created_at: Timestamp;
}

export interface ClubMembership {
  id: bigint;
  user_id: bigint;
  club_id: bigint;
  joined_at: Timestamp;
}

export interface RatingVote {
  id: bigint;
  rating_id: bigint;
  voter_user_id: bigint;
  value: number; // +1 of -1
  created_at: Timestamp;
}

export interface Group {
  id: bigint;
  name: string;
  name_key: string;
  owner_user_id: bigint;
  created_at: Timestamp;
}

export interface GroupMembership {
  id: bigint;
  group_id: bigint;
  user_id: bigint;
  joined_at: Timestamp;
}

/** Publieke metadata — géén plaintext-code (die staat in een private tabel). */
export interface GroupInvite {
  id: bigint;
  group_id: bigint;
  invited_by: bigint;
  /** 0 = nooit verloopt */
  expires_at: Timestamp;
  /** 0 = onbeperkt */
  max_uses: number;
  uses: number;
  created_at: Timestamp;
}

/**
 * Korte-levensduur reveal met plaintext code. Alleen door de creator
 * bruikbaar, tot `expires_at` (standaard 5 min). Daarna ruimt de server
 * de rij op bij de volgende invite-actie van dezelfde user.
 */
export interface GroupInviteReveal {
  invite_id: bigint;
  code: string;
  invited_by: bigint;
  expires_at: Timestamp;
}

/**
 * 4-3-3 slot-codes. Zelfde volgorde als op het veld van achter naar voren:
 *   keeper
 *   lb  lcb  rcb  rb   (linie van verdedigers)
 *   lm  cm   rm        (middenveld)
 *   lw  st   rw        (voorlijn)
 * Per team wordt uniqueness visueel afgedwongen — 1e speler met dat slot
 * staat in het veld, rest gaat naar de bank.
 */
export const ALLOWED_POSITIONS = [
  "keeper",
  "lb", "lcb", "rcb", "rb",
  "lm", "cm", "rm",
  "lw", "st", "rw",
] as const;
export type Position = typeof ALLOWED_POSITIONS[number];

export const POSITION_LABEL: Record<Position, string> = {
  keeper: "keeper",
  lb: "linksback",
  lcb: "centr. verdediger L",
  rcb: "centr. verdediger R",
  rb: "rechtsback",
  lm: "linksmid",
  cm: "spelmaker",
  rm: "rechtsmid",
  lw: "linksbuiten",
  st: "spits",
  rw: "rechtsbuiten",
};

export const POSITION_SHORT: Record<Position, string> = {
  keeper: "KPR",
  lb: "LB", lcb: "LCV", rcb: "RCV", rb: "RB",
  lm: "LM", cm: "CM", rm: "RM",
  lw: "LV", st: "SP", rw: "RV",
};

export interface UserPosition {
  user_id: bigint;
  position: Position;
  updated_at: Timestamp;
}

export interface UserReaction {
  id: bigint;
  from_user_id: bigint;
  to_user_id: bigint;
  emoji: string;
  created_at: Timestamp;
}

export const ALLOWED_REACTIONS = ["👍", "❤️", "😡", "😄", "🔥"] as const;

export interface Session {
  identity: Identity;
  user_id: bigint;
  connected_at: Timestamp;
}

export interface RatingIntent {
  identity: Identity;
  user_id: bigint;
  snack_id: bigint;
  started_at: Timestamp;
}

export interface SnackLike {
  id: bigint;
  user_id: bigint;
  snack_id: bigint;
  club_id: bigint;
  created_at: Timestamp;
}

export interface RatingTag {
  id: bigint;
  rating_id: bigint;
  snack_id: bigint;
  club_id: bigint;
  tag: string;
}

export interface SnackStats {
  snack_id: bigint;
  club_id: bigint;
  sum_score: bigint;
  rating_count: bigint;
  avg_score_x100: number;
  last_rated_at: Timestamp;
}

export type ActivityKind =
  | { tag: "UserRegistered" }
  | { tag: "ClubAdded" }
  | { tag: "SnackAdded" }
  | { tag: "RatingSubmitted" }
  | { tag: "SnackClimbed" };

export interface ActivityEvent {
  id: bigint;
  kind: ActivityKind;
  club_id: bigint;
  user_id: bigint;
  snack_id: bigint;
  text: string;
  created_at: Timestamp;
}

