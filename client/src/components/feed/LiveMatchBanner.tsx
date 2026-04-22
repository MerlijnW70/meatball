/**
 * Banner die teamleden direct alerteert als er een live wedstrijd is
 * met hun team op een van beide zijdes. Realtime via SpacetimeDB —
 * zodra trainer simulate_match aanroept verschijnt de banner op alle
 * team-members hun home. Tap → kijk mee. Verdwijnt automatisch als
 * match eindigt (is_live flipt naar false).
 */
import { useMemo } from "react";
import { useStore } from "../../store";
import { go } from "../../router";

export function LiveMatchBanner() {
  const me = useStore((s) => s.session.me);
  const matchesMap = useStore((s) => s.matches);
  const groupMemberships = useStore((s) => s.groupMemberships);
  const groupsMap = useStore((s) => s.groups);
  const clubsMap = useStore((s) => s.clubs);

  // Set van group-ids waar ik in zit (als lid of Trainer).
  const myGroupIds = useMemo(() => {
    if (!me) return new Set<string>();
    const s = new Set<string>();
    for (const m of groupMemberships.values()) {
      if (m.user_id === me.id) s.add(m.group_id.toString());
    }
    return s;
  }, [groupMemberships, me]);

  const liveMatches = useMemo(() => {
    if (myGroupIds.size === 0) return [];
    return Array.from(matchesMap.values())
      .filter((mt) => {
        if (!mt.is_live) return false;
        const homeInvolved = mt.home_is_group
          && myGroupIds.has(mt.home_club_id.toString());
        const awayInvolved = mt.away_is_group
          && myGroupIds.has(mt.away_club_id.toString());
        return homeInvolved || awayInvolved;
      })
      .sort((a, b) => Number(b.created_at) - Number(a.created_at));
  }, [matchesMap, myGroupIds]);

  if (liveMatches.length === 0) return null;

  const resolveName = (id: bigint, isGroup: boolean) => {
    const key = id.toString();
    if (isGroup) return groupsMap.get(key)?.name ?? "team";
    return clubsMap.get(key)?.name ?? "kantine";
  };

  return (
    <div className="flex flex-col gap-2">
      {liveMatches.map((mt) => {
        const homeName = resolveName(mt.home_club_id, mt.home_is_group);
        const awayName = resolveName(mt.away_club_id, mt.away_is_group);
        return (
          <button
            key={mt.id.toString()}
            type="button"
            onClick={() => go(`/match/${mt.id}`)}
            className="brut-card bg-mint text-ink !p-0 overflow-hidden text-left
                       active:translate-x-[2px] active:translate-y-[2px] transition-transform"
          >
            <div className="bg-ink text-paper px-3 py-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest">
                <span
                  className="inline-block w-2 h-2 bg-hot border border-paper"
                  style={{ animation: "livepulse 1s ease-in-out infinite" }}
                />
                live wedstrijd
              </span>
              <span className="font-display text-xs uppercase tracking-widest">
                ⚽ kijk mee →
              </span>
            </div>
            <div className="px-3 py-2.5 flex items-center gap-2">
              <span className="font-display text-lg uppercase leading-tight flex-1 min-w-0 truncate">
                {homeName}
              </span>
              <span className="font-display text-2xl leading-none">
                {mt.home_score}–{mt.away_score}
              </span>
              <span className="font-display text-lg uppercase leading-tight flex-1 min-w-0 truncate text-right">
                {awayName}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
