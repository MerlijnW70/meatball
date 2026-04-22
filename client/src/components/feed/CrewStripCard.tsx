/**
 * Mini-card voor één team in de horizontale team-strip op Feed.
 * Toont teamnaam, trainer-kroon, mini 4-3-3 pitch met avatar per
 * geclaimde slot, en live-indicatoren.
 */
import { useMemo } from "react";
import { useStore } from "../../store";
import { go } from "../../router";
import { Avatar } from "../Avatar";
import type { Group, Position } from "../../types";

// 4-3-3 mini-pitch layout (voorlijn bovenaan, keeper onderaan — hetzelfde
// perspectief als op de Team-pagina).
const FORMATION_ROWS: Position[][] = [
  ["lw", "st", "rw"],
  ["lm", "cm", "rm"],
  ["lb", "lcb", "rcb", "rb"],
  ["keeper"],
];

export function CrewStripCard({ group }: { group: Group }) {
  const me = useStore((s) => s.session.me);
  const groupMemberships = useStore((s) => s.groupMemberships);
  const sessions = useStore((s) => s.sessions);
  const userPositions = useStore((s) => s.userPositions);

  const {
    slotOwner, onlineCount, total, bezetCount, isTrainer, onlineSet,
  } = useMemo(() => {
    const onlineUserIds = new Set<string>();
    for (const s of sessions.values()) {
      if (s.user_id !== 0n) onlineUserIds.add(s.user_id.toString());
    }
    const mine = Array.from(groupMemberships.values())
      .filter((m) => m.group_id === group.id);
    const total = mine.length;
    const isTrainer = !!me && group.owner_user_id === me.id;

    // Per-slot claim: eerste member met deze positie krijgt 'm (Trainer eerst,
    // dan join-volgorde).
    const sorted = mine.slice().sort((a, b) => {
      const aIsTr = a.user_id === group.owner_user_id ? 0 : 1;
      const bIsTr = b.user_id === group.owner_user_id ? 0 : 1;
      if (aIsTr !== bIsTr) return aIsTr - bIsTr;
      return Number(a.joined_at) - Number(b.joined_at);
    });

    const slotOwner = new Map<Position, bigint>();
    for (const m of sorted) {
      const pos = userPositions.get(m.user_id.toString())?.position as Position | undefined;
      if (!pos) continue;
      if (!FORMATION_ROWS.flat().includes(pos)) continue;
      if (!slotOwner.has(pos)) slotOwner.set(pos, m.user_id);
    }

    let online = 0;
    for (const m of mine) {
      if (onlineUserIds.has(m.user_id.toString())) online++;
    }
    return {
      slotOwner, onlineCount: online, total,
      bezetCount: slotOwner.size, isTrainer,
      onlineSet: onlineUserIds,
    };
  }, [group.id, group.owner_user_id, groupMemberships, sessions, me, userPositions]);

  return (
    <button
      type="button"
      onClick={() => go(`/group/${group.id}`)}
      className="shrink-0 brut-card !p-0 overflow-hidden w-[18rem] max-w-full
                 bg-paper text-left flex flex-col
                 active:translate-x-[2px] active:translate-y-[2px] transition-transform"
    >
      {/* Header: team-naam + trainer-kroon */}
      <div
        className={`px-3 py-2 border-b-4 border-ink flex items-center gap-2
          ${isTrainer ? "bg-pop text-ink" : "bg-ink text-paper"}`}
      >
        <p className="flex-1 min-w-0 font-display text-lg uppercase leading-tight truncate">
          {group.name}
        </p>
        {isTrainer && (
          <span
            className="shrink-0 text-base leading-none"
            aria-label="trainer"
            title="jij bent de trainer"
          >
            👑
          </span>
        )}
      </div>

      {/* Mini-pitch: 4 rijen van de 4-3-3 met avatars of lege dots */}
      <div
        className="relative px-2 py-3 flex flex-col gap-2 border-b-4 border-ink"
        style={{
          background: "#1FAE6B",
          backgroundImage: `repeating-linear-gradient(
            180deg, rgba(255,255,255,0.08) 0 16px, transparent 16px 32px)`,
        }}
      >
        {/* Middencirkel-hint */}
        <div
          className="absolute pointer-events-none"
          style={{
            left: "50%", top: "50%", transform: "translate(-50%, -50%)",
            width: "40px", height: "40px", borderRadius: "50%",
            border: "1px solid rgba(255,255,255,0.25)",
          }}
          aria-hidden
        />
        {FORMATION_ROWS.map((row, i) => (
          <div
            key={i}
            className="grid gap-2 relative"
            style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}
          >
            {row.map((pos) => {
              const userId = slotOwner.get(pos);
              if (!userId) {
                return (
                  <div key={pos} className="flex items-center justify-center h-6">
                    <div
                      className="w-3 h-3 rounded-full border-2 border-paper/60"
                      aria-hidden
                    />
                  </div>
                );
              }
              const online = onlineSet.has(userId.toString());
              return (
                <div key={pos} className="relative flex items-center justify-center">
                  <Avatar userId={userId} size="xs" />
                  {online && (
                    <span
                      className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 bg-mint
                                 border border-ink rounded-full"
                      style={{ animation: "livepulse 1.4s ease-in-out infinite" }}
                      aria-hidden
                    />
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Stats-strip */}
      <div className="px-3 py-2 flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-widest opacity-70">
          <span className={`font-display ${bezetCount === 11 ? "text-mint" : ""}`}>
            {bezetCount}/11
          </span>
          {" · "}
          {total} {total === 1 ? "speler" : "spelers"}
        </span>
        {onlineCount > 0 && (
          <span className="flex items-center gap-1 brut-chip bg-mint !py-0.5 !px-1.5
                           text-[10px] font-display uppercase">
            <span
              className="inline-block w-1.5 h-1.5 bg-ink rounded-full"
              style={{ animation: "livepulse 1.2s ease-in-out infinite" }}
            />
            {onlineCount} live
          </span>
        )}
      </div>
    </button>
  );
}
