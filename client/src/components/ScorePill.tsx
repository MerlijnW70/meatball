import { fmtScore, scoreColor } from "../utils/format";

interface Props {
  x100: number | null | undefined;
  count?: number | bigint;
  size?: "sm" | "md" | "lg";
}

export function ScorePill({ x100, count, size = "md" }: Props) {
  const txt = x100 == null ? "—" : fmtScore(x100);
  const sz =
    size === "lg" ? "text-4xl px-4 py-2"
    : size === "sm" ? "text-sm px-2 py-1"
    : "text-2xl px-3 py-1";
  return (
    <div className="inline-flex items-center gap-2">
      <div className={`brut-card ${scoreColor(x100)} ${sz} font-display leading-none`}>
        {txt}
      </div>
      {count !== undefined && (
        <span className="text-xs font-bold uppercase tracking-widest">
          {String(count)}× rated
        </span>
      )}
    </div>
  );
}
