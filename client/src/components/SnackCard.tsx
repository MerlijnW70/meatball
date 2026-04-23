import { MouseEvent, useState } from "react";
import {
  useAllRatersFor, useLikesFor, useMyRatingFor, useOthersRatingNow, useStatsFor,
} from "../hooks";
import { useStore } from "../store";
import { BrutalCard } from "./BrutalCard";
import { Pulse } from "./Pulse";
import { UserMenu } from "./UserMenu";
import { Avatar } from "./Avatar";
import { RatersListModal } from "./RatersListModal";
import { client } from "../spacetime";
import { fmtScore, scoreColor } from "../utils/format";
import type { Snack } from "../types";

const MAX_CHIPS = 6;

interface Props {
  snack: Snack;
  rank?: number;
  onTap: (snack: Snack) => void;
}

export function SnackCard({ snack, rank, onTap }: Props) {
  const stats = useStatsFor(snack.id);
  const mine = useMyRatingFor(snack.id);
  const { count: likeCount, liked } = useLikesFor(snack.id);
  const me = useStore((s) => s.session.me);
  const { list: allRaters, total: ratersTotal } = useAllRatersFor(snack.id);
  // Jezelf niet in de chip-strip — je kan toch geen popup op je eigen avatar openen.
  const othersRaters = me
    ? allRaters.filter((r) => r.userId !== me.id)
    : allRaters;
  const visibleRaters = othersRaters.slice(0, MAX_CHIPS);
  const overflow = Math.max(0, othersRaters.length - visibleRaters.length);
  const othersRating = useOthersRatingNow(snack.id);
  const [showAllRaters, setShowAllRaters] = useState(false);

  const avg = stats?.avg_score_x100 ?? null;
  const ratingCount = stats ? Number(stats.rating_count) : 0;
  const isTop = rank === 1;

  const handleLike = (e: MouseEvent) => {
    e.stopPropagation();
    client().toggleLike(snack.id).catch(console.error);
  };

  return (
    <div
      onClick={() => onTap(snack)}
      role="button"
      aria-label={`rate ${snack.name}`}
      className="w-full cursor-pointer select-none
                 active:translate-x-[4px] active:translate-y-[4px] transition-transform"
    >
      <BrutalCard
        tone={isTop ? "pop" : "paper"}
        className="!p-0 overflow-hidden"
      >
        {/* Header strip: rank + name + like */}
        <div className="flex items-stretch gap-0">
          {rank !== undefined && (
            <div
              className={`shrink-0 flex items-center justify-center
                ${isTop ? "bg-hot text-paper" : "bg-ink text-paper"}
                font-display text-3xl
                w-14 sm:w-16 border-r-4 border-ink`}
            >
              {String(rank).padStart(2, "0")}
            </div>
          )}
          <div className="flex-1 min-w-0 p-3 pr-2">
            <h3 className="font-display text-2xl uppercase leading-tight truncate">
              {snack.name}
            </h3>
            <p className="text-[11px] font-bold uppercase tracking-widest opacity-70 mt-0.5">
              {ratingCount > 0
                ? `${ratingCount} rating${ratingCount === 1 ? "" : "s"}`
                : "nog niet beoordeeld"}
            </p>
          </div>
          <button
            type="button"
            onClick={handleLike}
            aria-label={liked ? "unlike" : "like"}
            aria-pressed={liked}
            className={`shrink-0 flex flex-col items-center justify-center
              w-16 border-l-4 border-ink touch-manipulation
              active:translate-x-[2px] active:translate-y-[2px] transition-transform
              ${liked ? "bg-hot text-paper" : "bg-paper"}`}
          >
            <span className="text-2xl leading-none">{liked ? "♥" : "♡"}</span>
            <Pulse value={likeCount}>
              <span className="font-display text-xs leading-none mt-1">{likeCount}</span>
            </Pulse>
          </button>
        </div>

        {/* Body: big score + meta */}
        <div className="flex items-stretch border-t-4 border-ink">
          <div
            className={`shrink-0 flex flex-col items-center justify-center
              ${scoreColor(avg)} border-r-4 border-ink
              w-24 py-2`}
          >
            <Pulse value={avg}>
              <span className="font-display text-4xl leading-none">
                {avg == null ? "—" : fmtScore(avg)}
              </span>
            </Pulse>
            <span className="text-[9px] font-bold uppercase tracking-widest mt-1 opacity-80">
              / 10
            </span>
          </div>
          <div className="flex-1 min-w-0 p-3 flex flex-col justify-center gap-1">
            {avg == null ? (
              <p className="font-bold text-sm">
                tap om de eerste rating te geven →
              </p>
            ) : (
              <>
                <p className="text-[11px] font-bold uppercase tracking-widest opacity-70">
                  gemiddelde score
                </p>
                {!mine && (
                  <p className="text-xs font-bold opacity-80">
                    jij hebt nog niet gescoord — tap om te raten
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        {/* Social strip: live "nu bezig" + tap-bare rater-chips + "+N meer" */}
        {(visibleRaters.length > 0 || othersRating > 0) && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="border-t-4 border-ink px-2 py-2 flex items-center gap-1.5
                       overflow-x-auto touch-pan-x"
          >
            {othersRating > 0 && (
              <span className="brut-chip bg-hot text-paper !py-1 !px-2 shrink-0 whitespace-nowrap">
                <span
                  className="inline-block w-1.5 h-1.5 bg-paper"
                  style={{ animation: "livepulse 1s ease-in-out infinite" }}
                />
                <span className="ml-1">{othersRating} nu bezig</span>
              </span>
            )}
            {visibleRaters.map((r) => {
              const tone = scoreColor(r.score * 100);
              return (
                <span
                  key={r.userId.toString()}
                  className={`brut-chip !p-0.5 whitespace-nowrap shrink-0 ${tone}`}
                >
                  <UserMenu
                    userId={r.userId}
                    name={r.name}
                    trigger={<Avatar userId={r.userId} size="sm" />}
                    className="block active:translate-x-[1px] active:translate-y-[1px] transition-transform"
                  />
                </span>
              );
            })}
            {overflow > 0 && (
              <button
                type="button"
                onClick={() => setShowAllRaters(true)}
                aria-label={`${overflow} meer raters`}
                className="brut-chip bg-ink text-paper !py-1 !px-2 text-xs whitespace-nowrap
                           shrink-0 cursor-pointer active:translate-x-[2px] active:translate-y-[2px]
                           transition-transform"
              >
                +{overflow} meer
              </button>
            )}
          </div>
        )}
      </BrutalCard>

      {showAllRaters && (
        <RatersListModal
          snackId={snack.id}
          snackName={snack.name}
          clubName={useStore.getState().clubs.get(snack.club_id.toString())?.name}
          onClose={() => setShowAllRaters(false)}
        />
      )}
    </div>
  );
}
