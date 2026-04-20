/**
 * Focused club-view: alleen de gehaktbal. TopBar heeft een back-pijl naar
 * de feed. Geen extra cards / strips — puur de snack waar het om draait.
 */
import { useEffect, useMemo, useState } from "react";
import { useClub, useLeaderboard, useMyRatingFor, useStatsFor } from "../hooks";
import { useStore } from "../store";
import { client } from "../spacetime";
import { TopBar } from "../components/TopBar";
import { BrutalCard } from "../components/BrutalCard";
import { BrutalButton } from "../components/BrutalButton";
import { SnackCard } from "../components/SnackCard";
import { RatingModal } from "../components/RatingModal";
import { fmtScore, scoreColor } from "../utils/format";
import type { Club, Snack } from "../types";

export function ClubViewPage({ clubId }: { clubId: bigint }) {
  const club = useClub(clubId);
  const setSession = useStore((s) => s.setSession);
  const me = useStore((s) => s.session.me);
  const memberships = useStore((s) => s.memberships);
  const leaderboard = useLeaderboard(clubId);
  const [ratingSnack, setRatingSnack] = useState<Snack | null>(null);
  const mineForRating = useMyRatingFor(ratingSnack?.id ?? null);
  const [joining, setJoining] = useState(false);

  const isMember = useMemo(() => {
    if (!me) return false;
    for (const m of memberships.values()) {
      if (m.club_id === clubId && m.user_id === me.id) return true;
    }
    return false;
  }, [me, memberships, clubId]);

  const joinAndRate = (s: Snack) => {
    setJoining(true);
    client().joinClub(clubId)
      .then(() => setRatingSnack(s))
      .finally(() => setJoining(false));
  };

  const tapSnack = (s: Snack) => {
    if (isMember) setRatingSnack(s);
    else joinAndRate(s);
  };

  // Zorg dat de club-scoped subscription naar deze club staat.
  useEffect(() => {
    if (club && useStore.getState().session.clubId !== clubId) {
      setSession({
        clubId: club.id, cityId: club.city_id, provinceId: club.province_id,
      });
    }
  }, [club, clubId, setSession]);

  if (!club) {
    return (
      <div className="min-h-dvh flex flex-col">
        <TopBar title="club" back="/home" hideCrews />
        <main className="flex-1 p-6">
          <BrutalCard tone="pop" className="text-center">
            <p className="font-display uppercase">club laden…</p>
            <p className="text-xs mt-1 opacity-70">subscription wordt opgehaald</p>
          </BrutalCard>
        </main>
      </div>
    );
  }

  // Wachten op de club-scoped snack-snapshot als die nog niet binnen is
  // (gebeurt direct na een setSession naar deze club).
  const subscriptionReady = useStore.getState().session.clubId === clubId;
  const snacksLoading = subscriptionReady && leaderboard.length === 0;

  return (
    <div className="min-h-dvh flex flex-col">
      <TopBar title={club.name} back="/home" hideCrews />

      <main className="flex-1 px-4 py-5 flex flex-col gap-4">
        <ClubHero club={club} />

        {!isMember && (
          <BrutalCard tone="sky" className="!p-3 text-paper">
            <p className="font-display uppercase text-sm">
              nog niet in jouw seizoen
            </p>
            <p className="text-[11px] font-bold mt-1 opacity-90">
              Voeg deze kantine toe om de gehaktbal te raten.
            </p>
            <BrutalButton
              onClick={() => client().joinClub(clubId)}
              disabled={joining}
              variant="hot" block size="md"
              className="mt-2"
            >
              {joining ? "toevoegen…" : "＋ voeg toe aan seizoen"}
            </BrutalButton>
          </BrutalCard>
        )}

        {snacksLoading ? (
          <BrutalCard tone="pop" className="text-center">
            <p className="font-display uppercase">gehaktbal laden…</p>
          </BrutalCard>
        ) : leaderboard.length === 0 ? (
          <BrutalCard><p className="font-bold">Nog geen snacks beschikbaar.</p></BrutalCard>
        ) : (
          leaderboard.map(({ snack }) => (
            <SnackCard
              key={snack.id.toString()}
              snack={snack}
              onTap={tapSnack}
            />
          ))
        )}
      </main>

      {ratingSnack && (
        <RatingModal
          snack={ratingSnack}
          onClose={() => setRatingSnack(null)}
          initial={mineForRating ? {
            score: mineForRating.rating.score,
          } : null}
        />
      )}
    </div>
  );
}

/**
 * Brutalism-hero boven de gehaktbal — gestapeld met geel pop-card achterop,
 * rode hot-card vooraan, gestreepte stamp in de hoek en optionele score.
 */
function ClubHero({ club }: { club: Club }) {
  const snacks = useStore((s) => s.snacks);
  const ratings = useStore((s) => s.ratings);
  const memberships = useStore((s) => s.memberships);
  const me = useStore((s) => s.session.me);

  const gehaktbal = Array.from(snacks.values())
    .find((s) => s.club_id === club.id && s.name_key === "gehaktbal");
  const stats = useStatsFor(gehaktbal?.id ?? null);
  const ratingCount = stats ? Number(stats.rating_count) : 0;
  const memberCount = Array.from(memberships.values())
    .filter((m) => m.club_id === club.id).length;
  const isMember = me
    ? Array.from(memberships.values())
        .some((m) => m.club_id === club.id && m.user_id === me.id)
    : false;

  return (
    <div className="relative pt-2 pb-4">
      {/* Achterste laag — geel pop, lichte rotatie de andere kant op */}
      <div
        aria-hidden
        className="absolute inset-x-1 top-3 bottom-1 bg-pop border-4 border-ink
                   shadow-brutSm rotate-2"
      />
      {/* Hoofdkaart */}
      <div className="relative bg-hot text-paper border-4 border-ink shadow-brutLg
                      -rotate-1 p-4 overflow-hidden">
        {/* Diagonale streep-stamp in de hoek */}
        <div
          aria-hidden
          className="brut-stripe absolute -top-4 -right-6 w-28 h-10 rotate-12 opacity-60"
        />

        {/* Bovenregel */}
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-[10px] font-bold uppercase tracking-widest opacity-90">
            kantine van
          </span>
          {isMember && (
            <span className="brut-chip bg-paper text-ink !py-0 !px-1.5 text-[9px]">
              ✓ in jouw seizoen
            </span>
          )}
        </div>

        {/* Clubnaam */}
        <h2 className="font-display text-3xl sm:text-4xl uppercase leading-[0.95]
                       break-words">
          {club.name}
        </h2>

        {/* Onderbalk met stats */}
        <div className="mt-3 flex items-end gap-3">
          {/* Score */}
          {stats?.avg_score_x100 != null ? (
            <div className={`brut-card ${scoreColor(stats.avg_score_x100)}
                             !py-1 !px-3 -rotate-2 shadow-brutSm`}>
              <span className="font-display text-3xl leading-none">
                {fmtScore(stats.avg_score_x100)}
              </span>
            </div>
          ) : (
            <div className="brut-card bg-paper text-ink !py-1 !px-3 -rotate-2 shadow-brutSm">
              <span className="font-display text-2xl leading-none">—</span>
            </div>
          )}

          {/* Meta-tekst */}
          <div className="flex-1 min-w-0 pb-0.5">
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-90 leading-tight">
              {ratingCount === 0
                ? "nog geen ratings"
                : `${ratingCount} rating${ratingCount === 1 ? "" : "s"}`}
            </p>
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-90 leading-tight">
              {memberCount} {memberCount === 1 ? "lid" : "leden"} in 't seizoen
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
