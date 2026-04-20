/**
 * Club / snack lookup-hooks. Sorteert op activiteit, dedupliceert membership, etc.
 */
import { useMemo } from "react";
import { useStore } from "../store";
import type { Club, Snack, SnackStats } from "../types";

/**
 * Clubs in jouw shortcut-lijst (membership). Sorteert op gehaktbal-score
 * (hoog → laag) zodat de best beoordeelde kantine bovenaan komt.
 * Tiebreakers: aantal ratings desc, daarna meest recente activiteit.
 * Clubs zonder ratings (nog geen stats) belanden onderaan.
 */
export function useMyClubs(limit = 50) {
  const me = useStore((s) => s.session.me);
  const memberships = useStore((s) => s.memberships);
  const ratings = useStore((s) => s.ratings);
  const clubs = useStore((s) => s.clubs);
  const snacks = useStore((s) => s.snacks);
  const stats = useStore((s) => s.stats);
  return useMemo(() => {
    if (!me) return [];

    // Meest recente activiteit per club voor deze user — tiebreaker.
    const lastAt = new Map<string, number>();
    for (const r of ratings.values()) {
      if (r.user_id !== me.id) continue;
      const k = r.club_id.toString();
      const at = Number(r.created_at);
      if ((lastAt.get(k) ?? 0) < at) lastAt.set(k, at);
    }

    // Per club de gehaktbal-snack opzoeken (elke club heeft er precies één).
    const gehaktbalIdByClub = new Map<string, string>();
    for (const s of snacks.values()) {
      if (s.name_key === "gehaktbal") {
        gehaktbalIdByClub.set(s.club_id.toString(), s.id.toString());
      }
    }

    return Array.from(memberships.values())
      .filter((m) => m.user_id === me.id)
      .map((m) => {
        const c = clubs.get(m.club_id.toString());
        if (!c) return null;
        const at = lastAt.get(m.club_id.toString()) ?? Number(m.joined_at);
        const snackId = gehaktbalIdByClub.get(m.club_id.toString());
        const st: SnackStats | null = snackId ? stats.get(snackId) ?? null : null;
        return { club: c, at, stats: st };
      })
      .filter((x): x is { club: Club; at: number; stats: SnackStats | null } => !!x)
      .sort((a, b) => {
        const ax = a.stats?.avg_score_x100 ?? -1;
        const bx = b.stats?.avg_score_x100 ?? -1;
        if (ax !== bx) return bx - ax;
        const ac = Number(a.stats?.rating_count ?? 0n);
        const bc = Number(b.stats?.rating_count ?? 0n);
        if (ac !== bc) return bc - ac;
        return b.at - a.at;
      })
      .slice(0, limit);
  }, [me, memberships, ratings, clubs, snacks, stats, limit]);
}

export function useClub(clubId: bigint | null): Club | null {
  const clubs = useStore((s) => s.clubs);
  if (!clubId) return null;
  return clubs.get(clubId.toString()) ?? null;
}

export function useSnacks(clubId: bigint | null): Snack[] {
  const snacks = useStore((s) => s.snacks);
  return useMemo(() => {
    if (!clubId) return [];
    return Array.from(snacks.values())
      .filter((s) => s.club_id === clubId)
      .sort((a, b) => a.name.localeCompare(b.name, "nl"));
  }, [snacks, clubId]);
}
