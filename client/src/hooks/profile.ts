/**
 * Public profile-aggregatie: totalen per user voor Profile-page.
 */
import { useMemo } from "react";
import { useStore } from "../store";
import type { User } from "../types";

export interface UserProfileStats {
  user: User | null;
  ratings: number;
  avgGiven: number | null;
  likesGiven: number;
  likesReceived: number;
  followers: number;
  following: number;
  isOnline: boolean;
}

export function useUserProfile(userId: bigint | null): UserProfileStats {
  const users = useStore((s) => s.users);
  const ratings = useStore((s) => s.ratings);
  const likes = useStore((s) => s.likes);
  const snacks = useStore((s) => s.snacks);
  const follows = useStore((s) => s.follows);
  const sessions = useStore((s) => s.sessions);

  return useMemo<UserProfileStats>(() => {
    const empty: UserProfileStats = {
      user: null, ratings: 0, avgGiven: null,
      likesGiven: 0, likesReceived: 0,
      followers: 0, following: 0, isOnline: false,
    };
    if (!userId) return empty;
    const user = users.get(userId.toString()) ?? null;

    const mine = Array.from(ratings.values()).filter((r) => r.user_id === userId);
    const avgGiven = mine.length
      ? mine.reduce((s, r) => s + r.score, 0) / mine.length
      : null;
    const likesGiven = Array.from(likes.values())
      .filter((l) => l.user_id === userId).length;

    const mySnackIds = new Set(
      Array.from(snacks.values())
        .filter((s) => s.created_by === userId)
        .map((s) => s.id.toString()),
    );
    const likesReceived = Array.from(likes.values())
      .filter((l) => mySnackIds.has(l.snack_id.toString())).length;

    let followers = 0;
    let following = 0;
    for (const f of follows.values()) {
      if (f.followee_id === userId) followers++;
      if (f.follower_id === userId) following++;
    }

    const isOnline = Array.from(sessions.values())
      .some((sess) => sess.user_id === userId);

    return {
      user, ratings: mine.length, avgGiven,
      likesGiven, likesReceived, followers, following, isOnline,
    };
  }, [userId, users, ratings, likes, snacks, follows, sessions]);
}
