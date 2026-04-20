/**
 * Social graph hooks: follows + peer-reacties.
 */
import { useMemo } from "react";
import { useStore } from "../store";
import { LS_KEY_LAST_FOLLOW, LS_KEY_LAST_REACTION, readBigint } from "./unread-keys";

export function useIsFollowing(userId: bigint | null): boolean {
  const me = useStore((s) => s.session.me);
  const follows = useStore((s) => s.follows);
  return useMemo(() => {
    if (!me || !userId) return false;
    for (const f of follows.values()) {
      if (f.follower_id === me.id && f.followee_id === userId) return true;
    }
    return false;
  }, [me, follows, userId]);
}

/** Alle followers van mij (newest first) — naam + tijd + isNew. */
export function useFollowersList() {
  const me = useStore((s) => s.session.me);
  const follows = useStore((s) => s.follows);
  const users = useStore((s) => s.users);
  return useMemo(() => {
    if (!me) return [];
    const lastSeen = readBigint(LS_KEY_LAST_FOLLOW);
    return Array.from(follows.values())
      .filter((f) => f.followee_id === me.id)
      .sort((a, b) => Number(b.created_at - a.created_at))
      .map((f) => ({
        id: f.id,
        userId: f.follower_id,
        name: users.get(f.follower_id.toString())?.screen_name ?? "iemand",
        at: Number(f.created_at),
        isNew: f.id > lastSeen,
      }));
  }, [me, follows, users]);
}

/** Alle reacties ontvangen, newest first, met isNew flag. */
export function useReactionsReceivedList() {
  const me = useStore((s) => s.session.me);
  const reactions = useStore((s) => s.reactions);
  const users = useStore((s) => s.users);
  return useMemo(() => {
    if (!me) return [];
    const lastSeen = readBigint(LS_KEY_LAST_REACTION);
    return Array.from(reactions.values())
      .filter((r) => r.to_user_id === me.id)
      .sort((a, b) => Number(b.created_at - a.created_at))
      .map((r) => ({
        id: r.id,
        userId: r.from_user_id,
        name: users.get(r.from_user_id.toString())?.screen_name ?? "iemand",
        emoji: r.emoji,
        at: Number(r.created_at),
        isNew: r.id > lastSeen,
      }));
  }, [me, reactions, users]);
}
