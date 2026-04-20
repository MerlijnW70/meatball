import { TIER_META, type Badge } from "../hooks";

export function BadgeCard({ badge }: { badge: Badge }) {
  const { emoji, title, hint, unlocked, progress, tier } = badge;
  const meta = TIER_META[tier];
  const pct = progress ? Math.round((progress.current / progress.target) * 100) : 0;
  return (
    <div
      className={`brut-card ${unlocked ? `${meta.bg} ${meta.fg}` : "bg-paper text-ink opacity-50 grayscale"}
                  !p-2 flex flex-col items-center text-center gap-0.5`}
      title={hint}
    >
      <span className="text-2xl leading-none">{emoji}</span>
      <p className="font-display uppercase text-[10px] leading-tight mt-1">
        {title}
      </p>
      {progress && !unlocked && (
        <>
          <div className="w-full h-1.5 border-2 border-ink bg-paper mt-1">
            <div className="h-full bg-ink" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-[9px] font-bold leading-none">
            {progress.current}/{progress.target}
          </p>
        </>
      )}
    </div>
  );
}
