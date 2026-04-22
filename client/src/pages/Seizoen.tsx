/**
 * Seizoens-page: jouw kantines gesorteerd op rating. Tikken op een rij
 * opent de kantine, tikken op de gehaktbal-strip opent het rating-modal.
 * Trainer met >1 lid ziet de "deel met team"-chip.
 */
import { useEffect, useMemo, useState } from "react";
import { useLikesFor, useMyClubs, useMyGroups, useStatsFor } from "../hooks";
import { useStore } from "../store";
import { client } from "../spacetime";
import { TopBar } from "../components/TopBar";
import { BrutalCard } from "../components/BrutalCard";
import { BrutalButton } from "../components/BrutalButton";
import { ScorePill } from "../components/ScorePill";
import { GehaktbalLogo } from "../components/GehaktbalLogo";
import { MatchStartModal, type MatchEntity } from "../components/MatchStartModal";
import { RatingModal } from "../components/RatingModal";
import { go } from "../router";
import { friendlyError } from "../utils/errors";
import type { Club, Snack } from "../types";

export function SeizoenPage() {
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
      <TopBar title="Kantines" back="/home" right={<ShareSeasonChip />} />
      <main className="flex-1 px-4 pt-5 pb-4 flex flex-col gap-4">
        <p className="text-[11px] font-bold uppercase tracking-widest opacity-70">
          Elke club waar je dit seizoen tegen speelt — gesorteerd op gehaktbal-rating
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

/** Chip die Trainers laat zien dat ze hun seizoen naar hun team-leden
 *  kunnen pushen. Alleen zichtbaar als: user is Trainer van een team
 *  met >1 lid en heeft minstens 1 kantine. */
function ShareSeasonChip() {
  const me = useStore((s) => s.session.me);
  const groupsMap = useStore((s) => s.groups);
  const groupMemberships = useStore((s) => s.groupMemberships);
  const myClubs = useMyClubs(500);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<"ok" | "err" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const trainerOf = useMemo(() => {
    if (!me) return null;
    return Array.from(groupsMap.values()).find((g) => g.owner_user_id === me.id) ?? null;
  }, [groupsMap, me]);

  const memberCount = useMemo(() => {
    if (!trainerOf) return 0;
    return Array.from(groupMemberships.values())
      .filter((m) => m.group_id === trainerOf.id).length;
  }, [groupMemberships, trainerOf]);

  if (!trainerOf || memberCount <= 1 || myClubs.length === 0) return null;

  const share = async () => {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      await client().shareSeasonWithCrew(trainerOf.id);
      setFlash("ok");
      setTimeout(() => setFlash(null), 1500);
    } catch (e) {
      setErr(friendlyError(e));
      setFlash("err");
      setTimeout(() => setFlash(null), 2500);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={share}
        disabled={busy}
        aria-label="deel seizoen met team"
        className={`!py-1 !px-2.5 text-[10px] flex items-center gap-1.5
          uppercase font-display tracking-widest
          border-2 border-ink rounded-none
          active:translate-x-[1px] active:translate-y-[1px] transition-all
          ${flash === "ok" ? "bg-mint text-ink"
            : flash === "err" ? "bg-hot text-paper"
            : "bg-sky/30 text-ink hover:bg-sky/50"}`}
      >
        {flash === "ok" ? "✓ gedeeld" : busy ? "…" : "📋 deel met team"}
      </button>
      {err && <span className="text-[9px] font-bold text-hot">{err}</span>}
    </div>
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
