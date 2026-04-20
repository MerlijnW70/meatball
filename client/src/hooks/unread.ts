/**
 * Unread-tellers voor follows + reacties + mark-as-read helpers.
 */
import { useMemo } from "react";
import { useStore } from "../store";
import { LS_KEY_LAST_FOLLOW, LS_KEY_LAST_REACTION, readBigint } from "./unread-keys";

export function useUnreadFollowsCount(): number {
  const me = useStore((s) => s.session.me);
  const follows = useStore((s) => s.follows);
  return useMemo(() => {
    if (!me) return 0;
    const lastSeen = readBigint(LS_KEY_LAST_FOLLOW);
    let n = 0;
    for (const f of follows.values()) {
      if (f.followee_id === me.id && f.id > lastSeen) n++;
    }
    return n;
  }, [me, follows]);
}

export function useUnreadReactionsCount(): number {
  const me = useStore((s) => s.session.me);
  const reactions = useStore((s) => s.reactions);
  return useMemo(() => {
    if (!me) return 0;
    const lastSeen = readBigint(LS_KEY_LAST_REACTION);
    let n = 0;
    for (const r of reactions.values()) {
      if (r.to_user_id === me.id && r.id > lastSeen) n++;
    }
    return n;
  }, [me, reactions]);
}

export function markFollowsRead(): void {
  const me = useStore.getState().session.me;
  if (!me) return;
  let max = 0n;
  for (const f of useStore.getState().follows.values()) {
    if (f.followee_id === me.id && f.id > max) max = f.id;
  }
  try { localStorage.setItem(LS_KEY_LAST_FOLLOW, max.toString()); } catch {}
}

export function markReactionsRead(): void {
  const me = useStore.getState().session.me;
  if (!me) return;
  let max = 0n;
  for (const r of useStore.getState().reactions.values()) {
    if (r.to_user_id === me.id && r.id > max) max = r.id;
  }
  try { localStorage.setItem(LS_KEY_LAST_REACTION, max.toString()); } catch {}
}
