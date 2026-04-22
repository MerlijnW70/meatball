/**
 * Ranglijst: top kantines van NL op basis van geaggregeerde gehaktbal-ratings.
 * V1 = heel simpel — later uitgebouwd met provincie-filters, tijdsvensters, etc.
 */
import { useMemo } from "react";
import { useStore } from "../store";
import { TopBar } from "../components/TopBar";
import { BrutalCard } from "../components/BrutalCard";
import { ScorePill } from "../components/ScorePill";
import { go } from "../router";

const MIN_RATINGS = 1n; // later ophogen naar 3-5 voor robuustere ranking

export function RanglijstPage() {
  const clubs = useStore((s) => s.clubs);
  const snacks = useStore((s) => s.snacks);
  const stats = useStore((s) => s.stats);

  const ranking = useMemo(() => {
    const gehaktbalBySnackId = new Map<string, { clubId: bigint }>();
    for (const s of snacks.values()) {
      if (s.name_key === "gehaktbal") {
        gehaktbalBySnackId.set(s.id.toString(), { clubId: s.club_id });
      }
    }
    type Row = {
      clubId: bigint;
      clubName: string;
      avgX100: number;
      ratingCount: bigint;
    };
    const rows: Row[] = [];
    for (const [snackIdStr, { clubId }] of gehaktbalBySnackId) {
      const st = stats.get(snackIdStr);
      if (!st || st.rating_count < MIN_RATINGS) continue;
      const c = clubs.get(clubId.toString());
      if (!c) continue;
      rows.push({
        clubId,
        clubName: c.name,
        avgX100: st.avg_score_x100,
        ratingCount: st.rating_count,
      });
    }
    rows.sort((a, b) => {
      if (a.avgX100 !== b.avgX100) return b.avgX100 - a.avgX100;
      if (a.ratingCount !== b.ratingCount) return Number(b.ratingCount - a.ratingCount);
      return Number(a.clubId - b.clubId);
    });
    return rows.slice(0, 50);
  }, [clubs, snacks, stats]);

  return (
    <div className="min-h-dvh flex flex-col">
      <TopBar title="Ranglijst" back="/home" />
      <main className="flex-1 px-4 pt-5 pb-4 flex flex-col gap-3">
        <p className="text-[11px] font-bold uppercase tracking-widest opacity-70">
          Top 50 kantines · gesorteerd op gemiddelde gehaktbal-score
        </p>

        {ranking.length === 0 ? (
          <BrutalCard className="!p-4 text-center">
            <p className="font-display text-xl uppercase leading-tight">
              nog geen ratings
            </p>
            <p className="text-xs font-bold opacity-70 mt-2">
              Zodra de eerste gehaktbal een cijfer krijgt staat 'ie hier.
            </p>
          </BrutalCard>
        ) : (
          <div className="flex flex-col gap-2">
            {ranking.map((r, i) => {
              const rank = i + 1;
              const isTop = rank === 1;
              return (
                <button
                  key={r.clubId.toString()}
                  type="button"
                  onClick={() => go(`/club/${r.clubId}`)}
                  className={`brut-card !p-0 overflow-hidden text-left
                              active:translate-x-[2px] active:translate-y-[2px] transition-transform
                              ${isTop ? "bg-pop" : "bg-paper"}`}
                >
                  <div className="flex items-stretch">
                    <div
                      className={`shrink-0 w-12 flex items-center justify-center border-r-4 border-ink
                        font-display text-xl leading-none
                        ${rank === 1 ? "bg-hot text-paper"
                          : rank === 2 ? "bg-sky text-paper"
                          : rank === 3 ? "bg-bruise text-paper"
                          : "bg-ink text-paper"}`}
                    >
                      {rank}
                    </div>
                    <p className="flex-1 min-w-0 px-3 py-2.5 font-display text-base sm:text-lg uppercase
                                  leading-tight self-center truncate">
                      {r.clubName}
                    </p>
                    <div className="shrink-0 flex items-center px-3 gap-2 border-l-4 border-ink bg-paper/70">
                      <span className="text-[9px] font-bold uppercase tracking-widest opacity-60">
                        {r.ratingCount.toString()}×
                      </span>
                      <ScorePill x100={r.avgX100} size="md" />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
