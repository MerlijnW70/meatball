/**
 * Volledige raters-lijst van een snack — zoekbaar, met tap-om-te-reageren
 * via UserMenu. Bedoeld om het overflow "+N meer" chip op de snack-card
 * bruikbaar te houden bij honderden raters.
 */
import { useEffect, useMemo, useState, MouseEvent } from "react";
import { useAllRatersFor, useRatingVotes } from "../hooks";
import { useStore } from "../store";
import { BrutalCard } from "./BrutalCard";
import { BrutalInput } from "./BrutalInput";
import { UserMenu } from "./UserMenu";
import { Avatar } from "./Avatar";
import { client } from "../spacetime";
import { fmtRelative, scoreColor } from "../utils/format";
import { normalizeName } from "../utils/normalize";

interface Props {
  snackId: bigint;
  snackName: string;
  onClose: () => void;
}

export function RatersListModal({ snackId, snackName, onClose }: Props) {
  const { list, total } = useAllRatersFor(snackId);
  const [q, setQ] = useState("");

  // Body scroll lock zolang de modal open staat
  useEffect(() => {
    document.body.classList.add("modal-open");
    return () => document.body.classList.remove("modal-open");
  }, []);

  const filtered = useMemo(() => {
    const key = normalizeName(q);
    if (!key) return list;
    return list.filter((r) => normalizeName(r.name).includes(key));
  }, [list, q]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-ink/70 flex items-end sm:items-center
                 justify-center p-0 sm:p-6 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md brut-card bg-paper shadow-brutLg p-4 rounded-none
                   max-h-dvh flex flex-col"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center justify-between mb-3 gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-70">
              raters · {total}
            </p>
            <h2 className="font-display text-xl uppercase truncate">
              {snackName}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="sluiten"
            className="brut-btn bg-ink text-paper !py-2 !px-4 text-lg shrink-0"
          >
            ✕
          </button>
        </div>

        <BrutalInput
          placeholder="zoek op naam"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="text-base mb-3"
        />

        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {filtered.length === 0 ? (
            <BrutalCard className="text-center">
              <p className="font-bold">Geen raters gevonden.</p>
            </BrutalCard>
          ) : (
            <div className="flex flex-col gap-2">
              {filtered.map((r) => (
                <RaterRow
                  key={r.userId.toString()}
                  ratingId={findRatingIdForUser(r.userId, snackId)}
                  userId={r.userId} name={r.name} score={r.score} at={r.at}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function findRatingIdForUser(userId: bigint, snackId: bigint): bigint | null {
  const ratings = useStore.getState().ratings;
  for (const r of ratings.values()) {
    if (r.user_id === userId && r.snack_id === snackId) return r.id;
  }
  return null;
}

function RaterRow({
  ratingId, userId, name, score, at,
}: {
  ratingId: bigint | null;
  userId: bigint;
  name: string;
  score: number;
  at: number;
}) {
  const votes = useRatingVotes(ratingId);
  const me = useStore((s) => s.session.me);
  const isSelf = me?.id === userId;

  const vote = (v: 1 | -1, e: MouseEvent) => {
    e.stopPropagation();
    if (!ratingId || isSelf) return;
    client().voteRating(ratingId, v).catch(console.error);
  };

  const trollish = votes.net <= -2;

  return (
    <BrutalCard
      className={`!p-0 flex items-stretch overflow-hidden ${trollish ? "opacity-50" : ""}`}
    >
      <div
        className={`shrink-0 w-14 flex items-center justify-center
                    font-display text-2xl border-r-4 border-ink
                    ${scoreColor(score * 100)}`}
      >
        {score}
      </div>
      <div className="flex-1 min-w-0 p-2 flex items-center gap-2">
        <Avatar userId={userId} size="sm" />
        <div className="flex-1 min-w-0">
          <p className="font-display uppercase text-base leading-tight truncate">
            <UserMenu userId={userId} name={name} />
          </p>
          <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">
            {fmtRelative(at)}{trollish ? " · gemarkeerd" : ""}
          </p>
        </div>
      </div>
      {/* Vote buttons */}
      {!isSelf && ratingId !== null && (
        <div className="shrink-0 flex flex-col border-l-4 border-ink">
          <button
            type="button"
            onClick={(e) => vote(1, e)}
            aria-label="upvote"
            aria-pressed={votes.myVote === 1}
            className={`h-1/2 w-10 text-sm font-display border-b-2 border-ink
              ${votes.myVote === 1 ? "bg-mint text-ink" : "bg-paper"}
              active:translate-x-[1px] active:translate-y-[1px]`}
          >
            ▲<br/><span className="text-[10px]">{votes.up}</span>
          </button>
          <button
            type="button"
            onClick={(e) => vote(-1, e)}
            aria-label="downvote"
            aria-pressed={votes.myVote === -1}
            className={`h-1/2 w-10 text-sm font-display
              ${votes.myVote === -1 ? "bg-hot text-paper" : "bg-paper"}
              active:translate-x-[1px] active:translate-y-[1px]`}
          >
            ▼<br/><span className="text-[10px]">{votes.down}</span>
          </button>
        </div>
      )}
    </BrutalCard>
  );
}
