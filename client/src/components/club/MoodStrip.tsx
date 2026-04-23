/**
 * Ambient mood-strip voor een ClubView: toont alle recent-gestemde
 * moods als een horizontale crowd van emoji's + count. Vibe-check
 * zonder te moeten praten.
 *
 * Eigen vote zichtbaar als chip-highlight; tap om te wijzigen of te
 * ontkoppelen. Server: club_mood tabel (scoped-subscribed op ClubView).
 */
import { useMemo, useState } from "react";
import { useStore } from "../../store";
import { client } from "../../spacetime";
import { friendlyError } from "../../utils/errors";

// Moet identiek blijven aan server/src/constants.rs:ALLOWED_MOODS.
const MOODS = ["🔥", "🍺", "🎉", "😴", "😡", "🫠"] as const;

interface Props {
  clubId: bigint;
  /** Of de user lid is — niet-leden kunnen niet stemmen (server enforced,
   *  UI maakt 't visueel duidelijk). */
  isMember: boolean;
}

export function MoodStrip({ clubId, isMember }: Props) {
  const me = useStore((s) => s.session.me);
  const moodsMap = useStore((s) => s.moods);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const { counts, myVote, totalVotes } = useMemo(() => {
    const counts = new Map<string, number>();
    let myVote: string | null = null;
    let total = 0;
    for (const m of moodsMap.values()) {
      if (m.club_id !== clubId) continue;
      counts.set(m.emoji, (counts.get(m.emoji) ?? 0) + 1);
      total++;
      if (me && m.user_id === me.id) myVote = m.emoji;
    }
    return { counts, myVote, totalVotes: total };
  }, [moodsMap, clubId, me]);

  const vote = async (emoji: string) => {
    if (!isMember || busy) return;
    setBusy(emoji); setErr(null);
    try {
      if (myVote === emoji) {
        // Zelfde emoji → toggle af.
        await client().clearClubMood(clubId);
      } else {
        await client().voteClubMood(clubId, emoji);
      }
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(null);
    }
  };

  // Als niemand gestemd heeft EN user is geen lid: niks tonen — zuinig met
  // screen-real-estate. Zodra er 1 stem is wordt 't zichtbaar.
  if (!isMember && totalVotes === 0) return null;

  return (
    <section className="brut-card bg-paper !p-3">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <p className="text-[10px] font-bold uppercase tracking-widest opacity-70">
          vibe vandaag
        </p>
        {totalVotes > 0 && (
          <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">
            {totalVotes} {totalVotes === 1 ? "stem" : "stemmen"}
          </p>
        )}
      </div>

      <div className="grid grid-cols-6 gap-1.5">
        {MOODS.map((emoji) => {
          const count = counts.get(emoji) ?? 0;
          const selected = myVote === emoji;
          const isBusy = busy === emoji;
          return (
            <button
              key={emoji}
              type="button"
              onClick={() => vote(emoji)}
              disabled={!isMember || isBusy}
              aria-label={`stem ${emoji}`}
              className={`relative flex flex-col items-center py-1.5 rounded-none
                          border-2 border-ink
                          ${selected ? "bg-pop" : "bg-paper"}
                          ${isMember ? "active:translate-x-[1px] active:translate-y-[1px]"
                                     : "opacity-60 cursor-not-allowed"}
                          transition-transform`}
            >
              <span className="text-xl leading-none">{emoji}</span>
              <span className="font-display text-[10px] leading-none mt-0.5 tabular-nums">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {!isMember && (
        <p className="text-[10px] font-bold uppercase tracking-widest opacity-60 mt-2 text-center">
          Voeg toe aan je seizoen om mee te stemmen
        </p>
      )}

      {err && (
        <p className="brut-card bg-hot text-paper p-1.5 font-bold text-[10px] mt-2">{err}</p>
      )}
    </section>
  );
}
