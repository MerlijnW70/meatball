/**
 * Presence-afgeleiden: wie is online, wie is nu aan het raten.
 */
import { useMemo } from "react";
import { useStore } from "../store";

export function useIsUserOnline(userId: bigint | null): boolean {
  const sessions = useStore((s) => s.sessions);
  return useMemo(() => {
    if (!userId) return false;
    for (const s of sessions.values()) {
      if (s.user_id === userId) return true;
    }
    return false;
  }, [sessions, userId]);
}

/**
 * Zijn anderen nu de rating-modal open hebben voor deze snack?
 * Excludet jezelf + intents ouder dan 5 min.
 */
export function useOthersRatingNow(snackId: bigint | null): number {
  const intents = useStore((s) => s.intents);
  const meIdentity = useStore((s) => s.session.identity);
  return useMemo(() => {
    if (!snackId) return 0;
    const now = Date.now() * 1000;
    const MAX_AGE = 5 * 60 * 1000 * 1000;
    let count = 0;
    for (const i of intents.values()) {
      if (i.snack_id !== snackId) continue;
      if (i.identity === meIdentity) continue;
      if (now - Number(i.started_at) > MAX_AGE) continue;
      count++;
    }
    return count;
  }, [intents, snackId, meIdentity]);
}
