/**
 * Badge-berekening — re-exporteert de config uit utils/badges.
 */
import { useMemo } from "react";
import { useStore } from "../store";
import {
  computeBadges, TOTAL_BADGES, TIER_ORDER, TIER_META,
  type Badge, type Tier,
} from "../utils/badges";

export { TOTAL_BADGES, TIER_ORDER, TIER_META };
export type { Badge, Tier };

export function useBadgesFor(userId: bigint | null): Badge[] {
  const users = useStore((s) => s.users);
  const ratings = useStore((s) => s.ratings);
  const likes = useStore((s) => s.likes);
  const snacks = useStore((s) => s.snacks);
  const clubs = useStore((s) => s.clubs);
  const memberships = useStore((s) => s.memberships);
  const follows = useStore((s) => s.follows);
  const reactions = useStore((s) => s.reactions);

  return useMemo(() => {
    if (!userId) return [];
    const me = users.get(userId.toString());
    if (!me) return [];
    return computeBadges({
      me, ratings, likes, snacks, clubs, memberships, follows, reactions,
    });
  }, [userId, users, ratings, likes, snacks, clubs, memberships, follows, reactions]);
}
