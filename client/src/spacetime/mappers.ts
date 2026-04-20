/**
 * Row adapters: camelCase wire-formaat van SpacetimeDB → snake_case UI-types.
 * Houdt UI-code stabiel als het wire-formaat verandert.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  ActivityEvent, ActivityKind, City, Club, ClubMembership, ClubMood, Follow,
  Group, GroupInvite, GroupInviteReveal, GroupMembership,
  Province, Rating, RatingIntent, RatingTag, RatingVote,
  Session as LiveSession, Snack, SnackLike, SnackStats, User, UserReaction,
} from "../types";

export function tsToMicros(ts: any): number {
  // SpacetimeDB Timestamp: { __timestamp_micros_since_unix_epoch__: bigint } óf Date
  if (ts == null) return 0;
  if (typeof ts === "number") return ts;
  if (typeof ts === "bigint") return Number(ts);
  if (ts.__timestamp_micros_since_unix_epoch__ != null) {
    return Number(ts.__timestamp_micros_since_unix_epoch__);
  }
  if (ts instanceof Date) return ts.getTime() * 1000;
  if (typeof ts.microsSinceUnixEpoch === "function") {
    return Number(ts.microsSinceUnixEpoch());
  }
  return 0;
}

export const identToHex = (i: any): string => {
  if (i == null) return "";
  if (typeof i === "string") return i;
  try { return i.toHexString?.() ?? ""; } catch { return ""; }
};

export const toUser = (r: any): User => ({
  id: r.id,
  identity: typeof r.identity === "string" ? r.identity : r.identity.toHexString(),
  screen_name: r.screenName,
  screen_name_key: r.screenNameKey,
  created_at: tsToMicros(r.createdAt),
  avatar_color: r.avatarColor ?? "pop",
  avatar_icon: r.avatarIcon ?? "🥩",
  avatar_decor: r.avatarDecor ?? "none|none|0",
});

export const toProvince = (r: any): Province => ({ id: r.id, name: r.name });

export const toCity = (r: any): City => ({
  id: r.id, province_id: r.provinceId, name: r.name, name_key: r.nameKey,
});

export const toClub = (r: any): Club => ({
  id: r.id, name: r.name, name_key: r.nameKey,
  province_id: r.provinceId, city_id: r.cityId,
  created_by: r.createdBy, created_at: tsToMicros(r.createdAt),
});

export const toSnack = (r: any): Snack => ({
  id: r.id, club_id: r.clubId, name: r.name, name_key: r.nameKey,
  created_by: r.createdBy, created_at: tsToMicros(r.createdAt),
});

export const toRating = (r: any): Rating => ({
  id: r.id, user_id: r.userId, club_id: r.clubId, snack_id: r.snackId,
  score: r.score, review_text: r.reviewText, created_at: tsToMicros(r.createdAt),
});

export const toRatingTag = (r: any): RatingTag => ({
  id: r.id, rating_id: r.ratingId, snack_id: r.snackId,
  club_id: r.clubId, tag: r.tag,
});

export const toSnackLike = (r: any): SnackLike => ({
  id: r.id, user_id: r.userId, snack_id: r.snackId,
  club_id: r.clubId, created_at: tsToMicros(r.createdAt),
});

export const toSession = (r: any): LiveSession => ({
  identity: identToHex(r.identity),
  user_id: r.userId,
  connected_at: tsToMicros(r.connectedAt),
});

export const toRatingIntent = (r: any): RatingIntent => ({
  identity: identToHex(r.identity),
  user_id: r.userId,
  snack_id: r.snackId,
  started_at: tsToMicros(r.startedAt),
});

export const toUserReaction = (r: any): UserReaction => ({
  id: r.id,
  from_user_id: r.fromUserId,
  to_user_id: r.toUserId,
  emoji: r.emoji,
  created_at: tsToMicros(r.createdAt),
});

export const toFollow = (r: any): Follow => ({
  id: r.id, follower_id: r.followerId, followee_id: r.followeeId,
  created_at: tsToMicros(r.createdAt),
});

export const toClubMood = (r: any): ClubMood => ({
  id: r.id, club_id: r.clubId, user_id: r.userId, emoji: r.emoji,
  created_at: tsToMicros(r.createdAt),
});

export const toRatingVote = (r: any): RatingVote => ({
  id: r.id, rating_id: r.ratingId, voter_user_id: r.voterUserId,
  value: r.value, created_at: tsToMicros(r.createdAt),
});

export const toClubMembership = (r: any): ClubMembership => ({
  id: r.id, user_id: r.userId, club_id: r.clubId,
  joined_at: tsToMicros(r.joinedAt),
});

export const toSnackStats = (r: any): SnackStats => ({
  snack_id: r.snackId, club_id: r.clubId,
  sum_score: r.sumScore, rating_count: r.ratingCount,
  avg_score_x100: r.avgScoreX100, last_rated_at: tsToMicros(r.lastRatedAt),
});

export const toGroup = (r: any): Group => ({
  id: r.id, name: r.name, name_key: r.nameKey,
  owner_user_id: r.ownerUserId, created_at: tsToMicros(r.createdAt),
});

export const toGroupMembership = (r: any): GroupMembership => ({
  id: r.id, group_id: r.groupId, user_id: r.userId,
  joined_at: tsToMicros(r.joinedAt),
});

export const toGroupInvite = (r: any): GroupInvite => ({
  id: r.id, group_id: r.groupId, invited_by: r.invitedBy,
  expires_at: tsToMicros(r.expiresAt),
  max_uses: r.maxUses, uses: r.uses,
  created_at: tsToMicros(r.createdAt),
});

export const toGroupInviteReveal = (r: any): GroupInviteReveal => ({
  invite_id: r.inviteId, code: r.code, invited_by: r.invitedBy,
  expires_at: tsToMicros(r.expiresAt),
});

export const toActivity = (r: any): ActivityEvent => ({
  id: r.id,
  kind: { tag: r.kind?.tag ?? String(r.kind) } as ActivityKind,
  club_id: r.clubId, user_id: r.userId, snack_id: r.snackId,
  text: r.text, created_at: tsToMicros(r.createdAt),
});
