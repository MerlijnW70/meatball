/**
 * Emoji-reactie balk onder een rating. Toont 6 vaste emoji's; tap plakt
 * 'n reactie (server insert), nogmaals tap verwijdert (toggle). Telt
 * per-emoji hoeveel users die reactie gaven; highlight als jij er 1 van
 * gaf.
 *
 * Multi-emoji: user mag alle 6 tegelijk plakken. Geen tekst, pure signal.
 */
import { useMemo } from "react";
import { useStore } from "../store";
import { client } from "../spacetime";

// Moet identiek blijven aan server/src/constants.rs:ALLOWED_RATING_REACTIONS.
const REACTIONS = ["🔥", "👑", "🤌", "😂", "💀", "🤢"] as const;

interface Props {
  ratingId: bigint;
  /** Disabled wanneer rating van jezelf is (je reageert niet op je eigen review). */
  disabled?: boolean;
}

export function RatingReactionBar({ ratingId, disabled }: Props) {
  const me = useStore((s) => s.session.me);
  // Indexed lookup — zelfde shallow-equality pattern als useRatingVotes
  // zodat de bar alleen re-rendert als DEZE rating's reacties wijzigen.
  const bucket = useStore((s) => s.reactionsByRating.get(ratingId.toString()));

  const { counts, mySet, total } = useMemo(() => {
    const counts = new Map<string, number>();
    const mySet = new Set<string>();
    let total = 0;
    if (bucket) {
      for (const r of bucket) {
        counts.set(r.emoji, (counts.get(r.emoji) ?? 0) + 1);
        total++;
        if (me && r.user_id === me.id) mySet.add(r.emoji);
      }
    }
    return { counts, mySet, total };
  }, [bucket, me]);

  const tap = (emoji: string) => {
    if (disabled || !me) return;
    client().toggleRatingReaction(ratingId, emoji).catch(() => {});
  };

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {REACTIONS.map((emoji) => {
        const count = counts.get(emoji) ?? 0;
        const mine = mySet.has(emoji);
        // Bij 0 reacties van iedereen: chip blijft low-key paper. Bij
        // count≥1 of eigen selectie: pops meer op.
        const bg =
          mine ? "bg-pop"
          : count > 0 ? "bg-paper"
          : "bg-paper/60";
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => tap(emoji)}
            disabled={disabled || !me}
            aria-label={`reageer met ${emoji}`}
            aria-pressed={mine}
            className={`inline-flex items-center gap-1 border-2 border-ink rounded-none
                        px-1.5 py-0.5 text-[11px] font-display
                        ${bg}
                        ${disabled
                          ? "opacity-40 cursor-not-allowed"
                          : "active:translate-x-[1px] active:translate-y-[1px] transition-transform"}
                        `}
          >
            <span className="text-sm leading-none">{emoji}</span>
            {count > 0 && (
              <span className="tabular-nums leading-none">{count}</span>
            )}
          </button>
        );
      })}
      {total === 0 && !disabled && (
        <span className="text-[10px] font-bold uppercase tracking-widest opacity-40 ml-1">
          tik om te reageren
        </span>
      )}
    </div>
  );
}
