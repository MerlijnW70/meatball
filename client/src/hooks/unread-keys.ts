/**
 * Gedeelde localStorage-keys + util voor unread-tellers.
 * Intern gebruikt door hooks/unread.ts en hooks/social.ts.
 */
export const LS_KEY_LAST_REACTION = "meatball.lastSeenReactionId.v1";
export const LS_KEY_LAST_FOLLOW = "meatball.lastSeenFollowId.v1";

export function readBigint(key: string): bigint {
  try {
    const raw = localStorage.getItem(key);
    return raw ? BigInt(raw) : 0n;
  } catch { return 0n; }
}
