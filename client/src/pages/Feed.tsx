/**
 * Wedstrijd — hoofdscherm: team-strip + jouw seizoens-kantines gesorteerd op
 * gehaktbal-score. Sticky "+ Kantine toevoegen" onderaan; zoeken gebeurt op
 * /clubs/new (dedup-suggesties daar).
 */
import { useEffect, useMemo, useState } from "react";
import { useLikesFor, useMyClubs, useMyGroups, useStatsFor } from "../hooks";
import { useStore } from "../store";
import { client } from "../spacetime";
import { TopBar } from "../components/TopBar";
import { BrutalCard } from "../components/BrutalCard";
import { BrutalButton } from "../components/BrutalButton";
import { ScorePill } from "../components/ScorePill";
import { Avatar } from "../components/Avatar";
import { UserMenu } from "../components/UserMenu";
import { MatchStartModal } from "../components/MatchStartModal";
import { go } from "../router";
import type { Club, Group } from "../types";

export function FeedPage() {
  const myClubs = useMyClubs(50);
  const myGroups = useMyGroups();

  const [confirmLeave, setConfirmLeave] = useState<Club | null>(null);
  const [busy, setBusy] = useState(false);
  const [matchFor, setMatchFor] = useState<Club | null>(null);
  const [matchOpen, setMatchOpen] = useState(false);

  const openClub = (c: Club) => {
    useStore.getState().setSession({
      clubId: c.id, cityId: c.city_id, provinceId: c.province_id,
    });
    go(`/club/${c.id}`);
  };

  const askLeave = (c: Club) => setConfirmLeave(c);
  const confirmLeaveNow = async () => {
    if (!confirmLeave) return;
    setBusy(true);
    try { await client().leaveClub(confirmLeave.id); }
    catch { /* idempotent */ }
    finally { setBusy(false); setConfirmLeave(null); }
  };

  return (
    <div className="min-h-dvh flex flex-col">
      <TopBar title="Wedstrijd" />

      <main className="flex-1 px-4 pt-5 pb-4 flex flex-col gap-6">
        {/* Team-strip */}
        <section>
          <h3 className="font-display text-lg uppercase mb-3">jouw team</h3>
          {myGroups.length === 0 ? (
            <button
              type="button"
              onClick={() => go("/groups")}
              className="brut-card bg-pop w-full text-left !p-4
                         active:translate-x-[2px] active:translate-y-[2px] transition-transform"
            >
              <p className="font-display text-xl uppercase">🥩 maak je eerste team</p>
              <p className="text-xs font-bold mt-1 opacity-80">
                Nodig spelers uit om samen gehaktballen te raten.
              </p>
            </button>
          ) : (
            <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1">
              {myGroups.map((g) => (
                <CrewStripCard key={g.id.toString()} group={g} />
              ))}
            </div>
          )}
        </section>

        {/* Seizoen */}
        <section>
          <div className="flex items-center justify-between mb-3 gap-2">
            <h3 className="font-display text-lg uppercase">jouw seizoen</h3>
            {myClubs.length >= 1 && (
              <button
                type="button"
                onClick={() => { setMatchFor(null); setMatchOpen(true); }}
                className="brut-btn bg-ink text-paper !py-1.5 !px-3 text-xs uppercase
                           flex items-center gap-1.5
                           active:translate-x-[2px] active:translate-y-[2px] transition-transform"
              >
                <span aria-hidden>⚽</span> speel wedstrijd
              </button>
            )}
          </div>

          {myClubs.length === 0 ? (
            <button
              type="button"
              onClick={() => go("/clubs/new")}
              className="block w-full text-left
                         active:translate-x-[2px] active:translate-y-[2px] transition-transform"
            >
              <BrutalCard tone="pop" tilt className="text-center !p-5 cursor-pointer">
                <p className="font-display text-2xl uppercase leading-tight">
                  nog geen kantines
                </p>
                <p className="text-sm font-bold mt-2 opacity-80">
                  Tik om je eerste kantine toe te voegen
                </p>
              </BrutalCard>
            </button>
          ) : (
            <div className="flex flex-col gap-2.5">
              {myClubs.map(({ club }, idx) => (
                <SeasonClubCard
                  key={club.id.toString()}
                  club={club}
                  rank={idx + 1}
                  onTap={openClub}
                  onLeave={askLeave}
                  onPlayMatch={(c) => { setMatchFor(c); setMatchOpen(true); }}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Sticky bottom CTA — altijd binnen tap-bereik */}
      <div
        className="sticky bottom-0 px-4 pt-3 border-t-4 border-ink bg-paper/95
                   backdrop-blur-sm z-10"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <BrutalButton
          onClick={() => go("/clubs/new")}
          variant="hot" block size="lg"
        >
          ＋ Kantine toevoegen
        </BrutalButton>
      </div>

      {confirmLeave && (
        <ConfirmLeaveModal
          club={confirmLeave}
          busy={busy}
          onCancel={() => setConfirmLeave(null)}
          onConfirm={confirmLeaveNow}
        />
      )}

      {matchOpen && (
        <MatchStartModal
          preselectHome={matchFor ?? undefined}
          onClose={() => { setMatchOpen(false); setMatchFor(null); }}
        />
      )}
    </div>
  );
}

function SeasonClubCard({
  club, rank, onTap, onLeave, onPlayMatch,
}: {
  club: Club;
  rank: number;
  onTap: (c: Club) => void;
  onLeave: (c: Club) => void;
  onPlayMatch: (c: Club) => void;
}) {
  const snacks = useStore((s) => s.snacks);
  const gehaktbal = Array.from(snacks.values())
    .find((s) => s.club_id === club.id && s.name_key === "gehaktbal");
  const stats = useStatsFor(gehaktbal?.id ?? null);
  const { count: likes } = useLikesFor(gehaktbal?.id ?? null);

  const hasRating = stats != null && stats.rating_count > 0n;
  const isTop = rank === 1 && hasRating;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onTap(club)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onTap(club); }}
      aria-label={`open ${club.name}`}
      className={`brut-card !p-0 overflow-hidden cursor-pointer
                  active:translate-x-[3px] active:translate-y-[3px] transition-transform
                  ${isTop ? "bg-pop" : "bg-paper"}`}
    >
      <div className="flex items-stretch">
        {/* Rank */}
        <div
          className={`shrink-0 w-12 flex items-center justify-center border-r-4 border-ink
            font-display text-3xl leading-none
            ${isTop ? "bg-hot text-paper" : "bg-ink text-paper"}`}
        >
          {rank}
        </div>

        {/* Name + stats */}
        <div className="flex-1 min-w-0 py-3 px-3">
          <p className="font-display text-lg sm:text-xl uppercase leading-tight truncate">
            {club.name}
          </p>
          <p className="text-[10px] font-bold uppercase tracking-widest opacity-70 mt-1">
            {hasRating ? (
              <>
                {stats.rating_count.toString()}× gescoord
                {likes > 0 && (
                  <>
                    {" · "}
                    <span className="text-hot">♥</span> {likes}
                  </>
                )}
              </>
            ) : (
              "nog niet beoordeeld"
            )}
          </p>
        </div>

        {/* Score */}
        {hasRating ? (
          <div className="shrink-0 flex items-center justify-center pr-3 pl-1">
            <ScorePill x100={stats.avg_score_x100} size="md" />
          </div>
        ) : (
          <div className="shrink-0 w-14 flex items-center justify-center
                          border-l-4 border-ink/20 bg-ink/5">
            <span className="font-display text-3xl opacity-40">?</span>
          </div>
        )}

        {/* Speel wedstrijd — full-height strip */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onPlayMatch(club); }}
          aria-label="speel wedstrijd"
          className="shrink-0 w-12 border-l-4 border-ink bg-ink text-paper
                     flex items-center justify-center text-xl
                     active:translate-x-[2px] active:translate-y-[2px] transition-transform"
        >
          ⚽
        </button>

        {/* Verwijderen — full-height strip rechts */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onLeave(club); }}
          aria-label="verwijder uit seizoen"
          className="shrink-0 w-12 border-l-4 border-ink bg-hot text-paper
                     flex items-center justify-center font-display text-2xl
                     active:translate-x-[2px] active:translate-y-[2px] transition-transform"
        >
          −
        </button>
      </div>
    </div>
  );
}

const CREW_VISIBLE = 4;

function CrewStripCard({ group }: { group: Group }) {
  const me = useStore((s) => s.session.me);
  const users = useStore((s) => s.users);
  const groupMemberships = useStore((s) => s.groupMemberships);
  const sessions = useStore((s) => s.sessions);
  const userPositions = useStore((s) => s.userPositions);

  const {
    ordered, onlineCount, total, bezetCount, isTrainer,
  } = useMemo(() => {
    const onlineUserIds = new Set<string>();
    for (const s of sessions.values()) {
      if (s.user_id !== 0n) onlineUserIds.add(s.user_id.toString());
    }
    const mine = Array.from(groupMemberships.values())
      .filter((m) => m.group_id === group.id);
    const total = mine.length;
    const others = me ? mine.filter((m) => m.user_id !== me.id) : mine;
    const isTrainer = !!me && group.owner_user_id === me.id;

    const ownerId = group.owner_user_id;
    const rankFn = (uid: bigint) => {
      if (onlineUserIds.has(uid.toString())) return 0;
      if (uid === ownerId) return 1;
      return 2;
    };
    const ordered = others.slice().sort((a, b) => {
      const ra = rankFn(a.user_id), rb = rankFn(b.user_id);
      if (ra !== rb) return ra - rb;
      return Number(a.joined_at) - Number(b.joined_at);
    });

    // Hoeveel unieke veld-slots bezet (max 11 in 4-3-3).
    const slots = new Set<string>();
    for (const m of mine) {
      const pos = userPositions.get(m.user_id.toString())?.position;
      if (pos) slots.add(pos);
    }

    let online = 0;
    for (const m of mine) {
      if (onlineUserIds.has(m.user_id.toString())) online++;
    }
    return {
      ordered, onlineCount: online, total,
      bezetCount: slots.size, isTrainer,
    };
  }, [group.id, group.owner_user_id, groupMemberships, sessions, me, userPositions]);

  const overflow = Math.max(0, ordered.length - CREW_VISIBLE);
  const filledPct = Math.round((bezetCount / 11) * 100);

  return (
    <button
      type="button"
      onClick={() => go(`/group/${group.id}`)}
      className="shrink-0 brut-card !p-0 overflow-hidden min-w-[15rem] max-w-[18rem]
                 bg-paper text-left flex flex-col
                 active:translate-x-[2px] active:translate-y-[2px] transition-transform"
    >
      {/* Header strip: alleen team-naam */}
      <div
        className={`px-3 py-2 border-b-4 border-ink
          ${isTrainer ? "bg-pop text-ink" : "bg-ink text-paper"}`}
      >
        <p className="font-display text-lg uppercase leading-tight truncate">
          {group.name}
        </p>
      </div>

      {/* Voortgangs-balk: bezetting van de 11 veld-slots */}
      <div className="relative h-2 bg-ink/10">
        <div
          className="absolute inset-y-0 left-0 bg-mint border-r-2 border-ink"
          style={{ width: `${filledPct}%` }}
        />
      </div>

      {/* Body: spelers row + meta */}
      <div className="px-3 py-2.5 flex flex-col gap-2">
        <div className="flex items-center gap-0.5 flex-wrap">
          {ordered.slice(0, CREW_VISIBLE).map((m) => {
            const u = users.get(m.user_id.toString());
            return (
              <UserMenu
                key={m.id.toString()}
                userId={m.user_id}
                name={u?.screen_name ?? "speler"}
                trigger={<Avatar userId={m.user_id} size="sm" />}
                className="active:translate-x-[1px] active:translate-y-[1px] transition-transform"
              />
            );
          })}
          {overflow > 0 && (
            <span
              className="ml-1 brut-chip bg-ink text-paper !py-0.5 !px-1.5 text-[10px]"
            >
              +{overflow}
            </span>
          )}
          {ordered.length === 0 && (
            <span className="text-[10px] font-bold uppercase opacity-60">
              alleen jij
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest opacity-70">
            {bezetCount}/11 opstelling · {total} {total === 1 ? "speler" : "spelers"}
          </span>
          {onlineCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest">
              <span
                className="inline-block w-1.5 h-1.5 bg-mint border border-ink"
                style={{ animation: "livepulse 1.4s ease-in-out infinite" }}
              />
              {onlineCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function ConfirmLeaveModal({
  club, busy, onCancel, onConfirm,
}: {
  club: Club; busy: boolean;
  onCancel: () => void; onConfirm: () => void;
}) {
  useEffect(() => {
    document.body.classList.add("modal-open");
    return () => document.body.classList.remove("modal-open");
  }, []);
  return (
    <div
      onClick={onCancel}
      className="fixed inset-0 z-50 bg-ink/70 flex items-end sm:items-center
                 justify-center p-0 sm:p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md brut-card bg-paper shadow-brutLg p-5 rounded-none"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      >
        <h2 className="font-display text-2xl uppercase leading-tight">
          uit jouw seizoen?
        </h2>
        <p className="text-sm font-bold mt-2">
          <span className="bg-pop px-1">{club.name}</span> verdwijnt uit je
          seizoens-feed. De kantine en alle ratings blijven bestaan — je kan'm
          later weer toevoegen.
        </p>
        <div className="flex gap-2 mt-5">
          <BrutalButton onClick={onCancel} variant="paper" block disabled={busy}>
            annuleer
          </BrutalButton>
          <BrutalButton onClick={onConfirm} variant="hot" block disabled={busy}>
            {busy ? "verwijderen…" : "− verwijder"}
          </BrutalButton>
        </div>
      </div>
    </div>
  );
}
