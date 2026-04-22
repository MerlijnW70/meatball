/**
 * Team-groep hooks. Filtert store-maps op membership van de huidige user.
 */
import { useMemo } from "react";
import { useStore } from "../store";
import { loadInviteCode } from "../utils/inviteCode";
import type { Group, GroupInvite, GroupMembership } from "../types";

export function useMyGroups() {
  const me = useStore((s) => s.session.me);
  const groups = useStore((s) => s.groups);
  const mships = useStore((s) => s.groupMemberships);
  return useMemo(() => {
    if (!me) return [];
    return Array.from(mships.values())
      .filter((m) => m.user_id === me.id)
      .map((m) => groups.get(m.group_id.toString()))
      .filter((g): g is Group => !!g)
      .sort((a, b) => a.name.localeCompare(b.name, "nl"));
  }, [me, groups, mships]);
}

export function useGroup(groupId: bigint | null): Group | null {
  const groups = useStore((s) => s.groups);
  if (!groupId) return null;
  return groups.get(groupId.toString()) ?? null;
}

export interface GroupMemberRow {
  membership: GroupMembership;
  userId: bigint;
  name: string;
  isOwner: boolean;
}

export function useGroupMembers(groupId: bigint | null): GroupMemberRow[] {
  const mships = useStore((s) => s.groupMemberships);
  const users = useStore((s) => s.users);
  const groups = useStore((s) => s.groups);
  return useMemo(() => {
    if (!groupId) return [];
    const group = groups.get(groupId.toString());
    const ownerId = group?.owner_user_id;
    return Array.from(mships.values())
      .filter((m) => m.group_id === groupId)
      .sort((a, b) => Number(a.joined_at) - Number(b.joined_at))
      .map<GroupMemberRow>((m) => ({
        membership: m,
        userId: m.user_id,
        name: users.get(m.user_id.toString())?.screen_name ?? "iemand",
        isOwner: m.user_id === ownerId,
      }));
  }, [groupId, mships, users, groups]);
}

/** Ben jij lid van deze groep? */
export function useIsGroupMember(groupId: bigint | null): boolean {
  const me = useStore((s) => s.session.me);
  const mships = useStore((s) => s.groupMemberships);
  return useMemo(() => {
    if (!me || !groupId) return false;
    for (const m of mships.values()) {
      if (m.group_id === groupId && m.user_id === me.id) return true;
    }
    return false;
  }, [me, mships, groupId]);
}

export function useGroupInvites(groupId: bigint | null): GroupInvite[] {
  const invites = useStore((s) => s.groupInvites);
  return useMemo(() => {
    if (!groupId) return [];
    const now = Date.now() * 1000;
    return Array.from(invites.values())
      .filter((i) => i.group_id === groupId)
      // drop clearly expired invites from the visible list
      .filter((i) => i.expires_at === 0 || i.expires_at > now)
      .filter((i) => i.max_uses === 0 || i.uses < i.max_uses)
      .sort((a, b) => Number(b.created_at) - Number(a.created_at));
  }, [invites, groupId]);
}

/**
 * Mijn eigen meest recente invite voor dit team (invited_by == me).
 * Per-user model: elk lid heeft zijn eigen code die los staat van anderen.
 */
export function useMyInviteFor(groupId: bigint | null): GroupInvite | null {
  const me = useStore((s) => s.session.me);
  const invites = useStore((s) => s.groupInvites);
  return useMemo(() => {
    if (!groupId || !me) return null;
    const now = Date.now() * 1000;
    return Array.from(invites.values())
      .filter((i) => i.group_id === groupId && i.invited_by === me.id)
      .filter((i) => i.expires_at === 0 || i.expires_at > now)
      .filter((i) => i.max_uses === 0 || i.uses < i.max_uses)
      .sort((a, b) => Number(b.created_at) - Number(a.created_at))[0] ?? null;
  }, [groupId, me, invites]);
}

/**
 * Korte-levensduur plaintext code die de creator zichzelf laat zien.
 * Gelezen uit localStorage (server bewaart de code alleen in de private
 * `invite_secret` tabel, dus andere clients zien 'm niet). `null` als de
 * TTL (5 min) verstreken is of als je nooit een code hebt aangemaakt op
 * dit device.
 *
 * `groupInvites` wordt meegetriggerd als dep zodat de hook herevalueerd
 * wordt zodra er een nieuwe invite binnenkomt via de subscription.
 */
export function useMyInviteReveal(groupId: bigint | null): string | null {
  const me = useStore((s) => s.session.me);
  const invites = useStore((s) => s.groupInvites);
  return useMemo(() => {
    if (!groupId || !me) return null;
    return loadInviteCode(me.id, groupId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, me, invites]);
}

