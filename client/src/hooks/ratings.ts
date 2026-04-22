/**
 * Rating + vote + like aggregaties + leaderboard.
 */
import { useMemo } from "react";
import { useStore } from "../store";
import type { SnackStats } from "../types";
import { useSnacks } from "./clubs";

// ─── Votes ──────────────────────────────────────────────────────

export interface RatingVoteSummary {
  up: number;
  down: number;
  net: number;
  myVote: 1 | -1 | 0;
}

export function useRatingVotes(ratingId: bigint | null): RatingVoteSummary {
  const me = useStore((s) => s.session.me);
  // Lees alleen de bucket voor dit rating_id. Zustand selector vergelijkt
  // het resultaat referentieel: alleen re-render als JUIST deze bucket
  // verandert, niet bij elke vote ergens in de app.
  const bucket = useStore((s) =>
    ratingId ? s.votesByRating.get(ratingId.toString()) : undefined
  );
  return useMemo(() => {
    const out: RatingVoteSummary = { up: 0, down: 0, net: 0, myVote: 0 };
    if (!ratingId || !bucket) return out;
    for (const v of bucket) {
      if (v.value > 0) out.up++;
      else if (v.value < 0) out.down++;
      if (me && v.voter_user_id === me.id) {
        out.myVote = v.value > 0 ? 1 : -1;
      }
    }
    out.net = out.up - out.down;
    return out;
  }, [ratingId, me, bucket]);
}

// ─── Stats / likes ──────────────────────────────────────────────

export function useStatsFor(snackId: bigint | null): SnackStats | null {
  const stats = useStore((s) => s.stats);
  if (!snackId) return null;
  return stats.get(snackId.toString()) ?? null;
}

export function useLikesFor(snackId: bigint | null) {
  const likes = useStore((s) => s.likes);
  const me = useStore((s) => s.session.me);
  return useMemo(() => {
    if (!snackId) return { count: 0, liked: false };
    let count = 0;
    let liked = false;
    for (const l of likes.values()) {
      if (l.snack_id !== snackId) continue;
      count++;
      if (me && l.user_id === me.id) liked = true;
    }
    return { count, liked };
  }, [likes, me, snackId]);
}

// ─── Raters ─────────────────────────────────────────────────────

export interface RecentRater {
  userId: bigint;
  name: string;
  score: number;
  at: number;
}

/** Alle unieke raters voor een snack, nieuw eerst. */
export function useAllRatersFor(snackId: bigint | null): {
  list: RecentRater[]; total: number;
} {
  const ratings = useStore((s) => s.ratings);
  const users = useStore((s) => s.users);
  return useMemo(() => {
    if (!snackId) return { list: [], total: 0 };
    const byUser = new Map<string, RecentRater>();
    for (const r of ratings.values()) {
      if (r.snack_id !== snackId) continue;
      const k = r.user_id.toString();
      const at = Number(r.created_at);
      const existing = byUser.get(k);
      if (!existing || at > existing.at) {
        const name = users.get(k)?.screen_name ?? "iemand";
        byUser.set(k, { userId: r.user_id, name, score: r.score, at });
      }
    }
    const list = Array.from(byUser.values()).sort((a, b) => b.at - a.at);
    return { list, total: list.length };
  }, [snackId, ratings, users]);
}

/**
 * De rating die de huidige user al voor deze snack gegeven heeft — of null.
 * Wordt gebruikt om de rating-modal vooraf te vullen bij edit.
 */
export function useMyRatingFor(snackId: bigint | null) {
  const me = useStore((s) => s.session.me);
  const ratings = useStore((s) => s.ratings);
  const tags = useStore((s) => s.ratingTags);

  return useMemo(() => {
    if (!snackId || !me) return null;
    const mine = Array.from(ratings.values())
      .find((r) => r.snack_id === snackId && r.user_id === me.id);
    if (!mine) return null;
    const myTags = Array.from(tags.values())
      .filter((t) => t.rating_id === mine.id)
      .map((t) => t.tag);
    return { rating: mine, tags: myTags };
  }, [snackId, me, ratings, tags]);
}

// ─── Leaderboard ────────────────────────────────────────────────

/**
 * Gesorteerd op:
 *   1. gem. score (hoog → laag)
 *   2. aantal likes — bij gelijke score wint de meer geliefde
 *   3. aantal ratings
 */
export function useLeaderboard(clubId: bigint | null) {
  const snacks = useSnacks(clubId);
  const stats = useStore((s) => s.stats);
  const likes = useStore((s) => s.likes);
  return useMemo(() => {
    const likeCount = new Map<string, number>();
    for (const l of likes.values()) {
      const k = l.snack_id.toString();
      likeCount.set(k, (likeCount.get(k) ?? 0) + 1);
    }
    return snacks
      .map((sn) => ({
        snack: sn,
        stats: stats.get(sn.id.toString()) ?? null,
        likes: likeCount.get(sn.id.toString()) ?? 0,
      }))
      .sort((a, b) => {
        const ax = a.stats?.avg_score_x100 ?? -1;
        const bx = b.stats?.avg_score_x100 ?? -1;
        if (ax !== bx) return bx - ax;
        if (a.likes !== b.likes) return b.likes - a.likes;
        const ac = Number(a.stats?.rating_count ?? 0n);
        const bc = Number(b.stats?.rating_count ?? 0n);
        if (ac !== bc) return bc - ac;
        // Tiebreaker op snack_id — voorkomt dat rangorde van-render-tot-
        // render schommelt bij identieke (score, likes, count). bigint
        // vergelijking via Number alleen veilig voor IDs < 2^53.
        return Number(a.snack.id - b.snack.id);
      });
  }, [snacks, stats, likes]);
}
