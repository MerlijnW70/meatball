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
import { MatchStartModal, type MatchEntity } from "../components/MatchStartModal";
import { RatingModal } from "../components/RatingModal";
import { GehaktbalLogo } from "../components/GehaktbalLogo";
import { BrutalInput } from "../components/BrutalInput";
import { go } from "../router";
import { friendlyError } from "../utils/errors";
import type { Club, Group, Position, Snack } from "../types";

export function FeedPage() {
  const myClubs = useMyClubs(50);
  const myGroups = useMyGroups();

  const [confirmLeave, setConfirmLeave] = useState<Club | null>(null);
  const [busy, setBusy] = useState(false);
  const [match, setMatch] = useState<{
    home: MatchEntity; away: MatchEntity | null;
  } | null>(null);
  const [ratingSnack, setRatingSnack] = useState<Snack | null>(null);
  const ratings = useStore((s) => s.ratings);
  const me = useStore((s) => s.session.me);
  const myRatingForSnack = (snackId: bigint | null | undefined) => {
    if (!me || !snackId) return null;
    return Array.from(ratings.values())
      .filter((r) => r.user_id === me.id && r.snack_id === snackId)
      .sort((a, b) => Number(b.created_at) - Number(a.created_at))[0] ?? null;
  };

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
      <TopBar title="Seizoen" hideCrews />

      <main className="flex-1 px-4 pt-5 pb-4 flex flex-col gap-6">
        {/* Trainer-notificaties: openstaande invite-requests */}
        <PendingRequestsBanner />

        {/* Team-strip */}
        <section>
          <h3 className="font-display text-lg uppercase mb-3">jouw team</h3>
          {myGroups.length === 0 ? (
            <CreateTeamCard />
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
          <h3 className="font-display text-lg uppercase mb-1">kantines</h3>
          <p className="text-[11px] font-bold uppercase tracking-widest opacity-70 mb-3">
            De clubs waar je kind dit seizoen tegen voetbalt
          </p>

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
                <p className="text-sm font-bold mt-2 opacity-80 leading-snug">
                  Voeg elke tegenstander-club van<br />
                  je kind toe aan je seizoen.<br />
                  <span className="bg-ink text-paper px-1 mt-1 inline-block">tik om te starten</span>
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
                  onRate={(snack) => setRatingSnack(snack)}
                  onPlayMatch={(c) => {
                    const home: MatchEntity = {
                      kind: "club", id: c.id, name: c.name,
                    };
                    const away: MatchEntity | null = myGroups[0]
                      ? { kind: "group", id: myGroups[0].id, name: myGroups[0].name }
                      : null;
                    setMatch({ home, away });
                  }}
                />
              ))}
              {/* Subtiel ghost-slot: "volgende kantine toevoegen", past
                  visueel in de lijst zonder aandacht te stelen. */}
              <button
                type="button"
                onClick={() => go("/clubs/new")}
                className="border-4 border-dashed border-ink/30 py-3 px-3 rounded-none
                           font-display uppercase text-sm tracking-widest opacity-60
                           hover:opacity-100 hover:border-ink/60
                           active:translate-x-[2px] active:translate-y-[2px] transition"
              >
                + nog een toevoegen
              </button>
            </div>
          )}
        </section>
      </main>

      {confirmLeave && (
        <ConfirmLeaveModal
          club={confirmLeave}
          busy={busy}
          onCancel={() => setConfirmLeave(null)}
          onConfirm={confirmLeaveNow}
        />
      )}

      {match && (
        <MatchStartModal
          preselectHome={match.home}
          preselectAway={match.away ?? undefined}
          onClose={() => setMatch(null)}
        />
      )}

      {ratingSnack && (() => {
        const mine = myRatingForSnack(ratingSnack.id);
        return (
          <RatingModal
            snack={ratingSnack}
            onClose={() => setRatingSnack(null)}
            initial={mine ? { score: mine.score } : null}
          />
        );
      })()}
    </div>
  );
}

function SeasonClubCard({
  club, rank, onTap, onLeave, onRate, onPlayMatch,
}: {
  club: Club;
  rank: number;
  onTap: (c: Club) => void;
  onLeave: (c: Club) => void;
  onRate: (snack: Snack) => void;
  onPlayMatch: (c: Club) => void;
}) {
  const snacks = useStore((s) => s.snacks);
  const gehaktbal = Array.from(snacks.values())
    .find((s) => s.club_id === club.id && s.name_key === "gehaktbal");
  const stats = useStatsFor(gehaktbal?.id ?? null);
  const { count: likes } = useLikesFor(gehaktbal?.id ?? null);

  const hasRating = stats != null && stats.rating_count > 0n;
  const isTop = rank === 1 && hasRating;
  const canRate = !!gehaktbal;

  return (
    <div
      className={`brut-card !p-0 overflow-hidden
                  ${isTop ? "bg-pop" : "bg-paper"}`}
    >
      {/* Top: tap → ga naar kantine-page */}
      <div className="flex items-stretch border-b-4 border-ink">
        <button
          type="button"
          onClick={() => onTap(club)}
          aria-label={`open ${club.name}`}
          className="flex-1 min-w-0 flex items-stretch text-left
                     active:translate-x-[2px] active:translate-y-[2px] transition-transform"
        >
          <div
            className={`shrink-0 w-10 flex items-center justify-center border-r-4 border-ink
              font-display text-xl leading-none
              ${isTop ? "bg-hot text-paper" : "bg-ink text-paper"}`}
          >
            {rank}
          </div>
          <p className="flex-1 min-w-0 px-3 py-2 font-display text-base sm:text-lg uppercase
                        leading-tight self-center truncate">
            {club.name}
          </p>
        </button>
        {/* ⚽ speel-knop — pitch-groen zodat 'ie herkenbaar maar niet aggresief
            oogt. Distinct van rank (ink) en delete (hot-red). Klik vult
            deze kantine als thuis + jouw team als uit in de modal. */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onPlayMatch(club); }}
          aria-label={`speel wedstrijd tegen ${club.name}`}
          title="speel wedstrijd"
          className="shrink-0 w-10 border-l-4 border-ink bg-mint text-ink
                     flex items-center justify-center text-lg
                     active:translate-x-[2px] active:translate-y-[2px] transition-transform
                     hover:bg-mint/90"
        >
          <span aria-hidden>⚽</span>
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onLeave(club); }}
          aria-label="verwijder uit seizoen"
          className="shrink-0 w-10 border-l-4 border-ink bg-hot text-paper
                     flex items-center justify-center font-display text-xl
                     active:translate-x-[2px] active:translate-y-[2px] transition-transform"
        >
          −
        </button>
      </div>

      {/* Bottom: tap → open gehaktbal rating. CTA-visueel als nog niet
          beoordeeld, compacte stats-row als wel gescoord. */}
      {!hasRating ? (
        <button
          type="button"
          onClick={() => canRate && gehaktbal && onRate(gehaktbal)}
          disabled={!canRate}
          className="w-full bg-mint text-ink flex items-center gap-2.5 px-3 py-2.5
                     active:translate-x-[2px] active:translate-y-[2px] transition-transform
                     disabled:opacity-50"
        >
          <GehaktbalLogo size={32} className="shrink-0" />
          <span className="flex-1 text-left font-display text-sm uppercase leading-tight">
            beoordeel de gehaktbal
          </span>
          <span className="brut-chip bg-ink text-paper !py-0.5 !px-2 text-[10px] font-display">
            tik hier ⚡
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => canRate && gehaktbal && onRate(gehaktbal)}
          disabled={!canRate}
          className="w-full flex items-center gap-2 px-3 py-2 text-left
                     active:translate-x-[2px] active:translate-y-[2px] transition-transform"
        >
          <span className="flex-1 text-[10px] font-bold uppercase tracking-widest opacity-70">
            {stats.rating_count.toString()}× gescoord
            {likes > 0 && (
              <>
                {" · "}
                <span className="text-hot">♥</span> {likes}
              </>
            )}
          </span>
          <ScorePill x100={stats.avg_score_x100} size="md" />
        </button>
      )}
    </div>
  );
}

/** Banner met openstaande invite-requests voor teams waar jij Trainer van
 *  bent. Direct approve/reject — komt niet terug tot er een nieuwe request
 *  binnenkomt. */
function PendingRequestsBanner() {
  const me = useStore((s) => s.session.me);
  const groupsMap = useStore((s) => s.groups);
  const requests = useStore((s) => s.inviteRequests);
  const users = useStore((s) => s.users);
  const [busy, setBusy] = useState<bigint | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const pending = useMemo(() => {
    if (!me) return [];
    return Array.from(requests.values())
      .filter((r) => {
        const g = groupsMap.get(r.group_id.toString());
        return !!g && g.owner_user_id === me.id;
      })
      .sort((a, b) => Number(a.requested_at) - Number(b.requested_at));
  }, [requests, groupsMap, me]);

  if (pending.length === 0) return null;

  const approve = async (id: bigint) => {
    setBusy(id); setErr(null);
    try { await client().approveInviteRequest(id); }
    catch (e) { setErr(friendlyError(e)); }
    finally { setBusy(null); }
  };
  const reject = async (id: bigint) => {
    setBusy(id); setErr(null);
    try { await client().rejectInviteRequest(id); }
    catch (e) { setErr(friendlyError(e)); }
    finally { setBusy(null); }
  };

  return (
    <BrutalCard tone="pop" className="!p-3 flex flex-col gap-2">
      <p className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5">
        <span
          className="inline-block w-2 h-2 bg-hot border border-ink"
          style={{ animation: "livepulse 1.2s ease-in-out infinite" }}
        />
        invite-verzoek · {pending.length}
      </p>
      <div className="flex flex-col gap-1.5">
        {pending.map((r) => {
          const u = users.get(r.from_user_id.toString());
          const g = groupsMap.get(r.group_id.toString());
          const isBusy = busy === r.id;
          return (
            <div
              key={r.id.toString()}
              className="brut-card bg-paper !p-2 flex items-center gap-2"
            >
              <Avatar userId={r.from_user_id} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="font-display uppercase leading-tight truncate">
                  {u?.screen_name ?? "iemand"}
                </p>
                <p className="text-[10px] font-bold uppercase tracking-widest opacity-60 leading-tight">
                  wil bij {g?.name ?? "jouw team"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => reject(r.id)}
                disabled={isBusy}
                aria-label="afwijzen"
                className="shrink-0 w-9 h-9 border-4 border-ink bg-ink text-paper
                           flex items-center justify-center font-display text-sm
                           active:translate-x-[1px] active:translate-y-[1px] transition-transform"
              >
                ✕
              </button>
              <button
                type="button"
                onClick={() => approve(r.id)}
                disabled={isBusy}
                aria-label="goedkeuren"
                className="shrink-0 w-9 h-9 border-4 border-ink bg-mint text-ink
                           flex items-center justify-center font-display text-base
                           active:translate-x-[1px] active:translate-y-[1px] transition-transform"
              >
                ✓
              </button>
            </div>
          );
        })}
      </div>
      {err && (
        <p className="brut-card bg-hot text-paper p-2 font-bold text-xs">{err}</p>
      )}
    </BrutalCard>
  );
}

/** Inline team-create card — verschijnt op Feed wanneer user nog geen
 *  team heeft. Na aanmaken navigeert naar /group/:id voor de opstelling. */
function CreateTeamCard() {
  const me = useStore((s) => s.session.me);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canCreate = !busy && name.trim().length >= 3;

  const create = async () => {
    if (!me || !canCreate) return;
    setBusy(true); setErr(null);
    const prevMax = Array.from(useStore.getState().groups.values())
      .reduce((acc, g) => g.id > acc ? g.id : acc, 0n);
    try {
      await client().createGroup(name.trim());
      setName("");
      for (let i = 0; i < 30; i++) {
        const fresh = Array.from(useStore.getState().groups.values())
          .filter((g) => g.owner_user_id === me.id && g.id > prevMax)
          .sort((a, b) => Number(b.id - a.id))[0];
        if (fresh) { go(`/group/${fresh.id}`); return; }
        await new Promise((r) => setTimeout(r, 100));
      }
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="brut-card bg-pop !p-4 flex flex-col gap-2">
      <p className="font-display text-xl uppercase leading-tight flex items-center gap-2">
        <GehaktbalLogo size={28} className="shrink-0" />
        richt jouw team op
      </p>
      <p className="text-xs font-bold opacity-80 leading-snug">
        Nodig mede-ouders uit om samen gehaktballen te raten.
      </p>
      <BrutalInput
        placeholder="bv. VV Gehaktbal"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && canCreate && create()}
        maxLength={40}
        className="mt-1"
      />
      {err && (
        <p className="brut-card bg-hot text-paper p-2 font-bold text-xs">{err}</p>
      )}
      <BrutalButton
        variant="ink" size="md" block
        disabled={!canCreate}
        onClick={create}
      >
        {busy ? "aanmaken…" : "+ maak team"}
      </BrutalButton>
      <button
        type="button"
        onClick={() => go("/teams/zoek")}
        className="text-xs font-bold uppercase tracking-widest opacity-70
                   hover:opacity-100 underline decoration-2 underline-offset-2 mt-1"
      >
        of zoek een bestaand team →
      </button>
    </div>
  );
}

// 4-3-3 mini-pitch layout (voorlijn bovenaan, keeper onderaan — hetzelfde
// perspectief als op de Team-pagina).
const FORMATION_ROWS: Position[][] = [
  ["lw", "st", "rw"],
  ["lm", "cm", "rm"],
  ["lb", "lcb", "rcb", "rb"],
  ["keeper"],
];

function CrewStripCard({ group }: { group: Group }) {
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
