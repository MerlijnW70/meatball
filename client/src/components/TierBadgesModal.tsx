import { useEffect } from "react";
import { TIER_META, type Badge, type Tier } from "../hooks";
import { BrutalCard } from "./BrutalCard";
import { BadgeCard } from "./BadgeCard";

export function TierBadgesModal({
  tier, badges, showLocked, onClose,
}: {
  tier: Tier; badges: Badge[]; showLocked: boolean; onClose: () => void;
}) {
  useEffect(() => {
    document.body.classList.add("modal-open");
    return () => document.body.classList.remove("modal-open");
  }, []);

  const meta = TIER_META[tier];
  const visible = showLocked ? badges : badges.filter((b) => b.unlocked);
  const got = badges.filter((b) => b.unlocked).length;

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
          <div className="min-w-0 flex items-baseline gap-2">
            <span className={`brut-chip ${meta.bg} ${meta.fg} !py-1 !px-2 font-display text-lg`}>
              {meta.label}
            </span>
            <span className="text-xs font-bold uppercase tracking-widest opacity-70">
              {got}/{badges.length}
            </span>
          </div>
          <button
            type="button" onClick={onClose} aria-label="sluiten"
            className="brut-btn bg-ink text-paper !py-2 !px-4 text-lg shrink-0"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {visible.length === 0 ? (
            <BrutalCard className="text-center">
              <p className="font-bold">Nog niks verdiend in dit tier.</p>
            </BrutalCard>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {visible.map((b) => <BadgeCard key={b.id} badge={b} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
