import { useStore } from "../store";
import {
  ACCENT_BG, parseDecor, patternStyle, TONE_BG, TONE_FG,
} from "../utils/avatar";

interface Props {
  userId: bigint | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  /** Override voor preview-doeleinden (onboard/picker). */
  override?: { color: string; icon: string; decor: string };
  className?: string;
}

const SIZES: Record<NonNullable<Props["size"]>,
  { box: string; text: string; border: string; pxScale: number; accent: string }> = {
  xs: { box: "w-5 h-5",   text: "text-[12px]", border: "border-2", pxScale: 0.5, accent: "w-1.5 h-1.5" },
  sm: { box: "w-7 h-7",   text: "text-base",   border: "border-2", pxScale: 0.6, accent: "w-2 h-2" },
  md: { box: "w-10 h-10", text: "text-xl",     border: "border-4", pxScale: 0.8, accent: "w-2.5 h-2.5" },
  lg: { box: "w-16 h-16", text: "text-3xl",    border: "border-4", pxScale: 1.0, accent: "w-3.5 h-3.5" },
  xl: { box: "w-24 h-24", text: "text-5xl",    border: "border-4", pxScale: 1.4, accent: "w-5 h-5" },
};

export function Avatar({ userId, size = "md", override, className = "" }: Props) {
  const user = useStore((s) =>
    userId ? s.users.get(userId.toString()) : null,
  );
  const color = override?.color ?? user?.avatar_color ?? "pop";
  const icon  = override?.icon  ?? user?.avatar_icon  ?? "🥩";
  const decor = override?.decor ?? user?.avatar_decor ?? "none|none|0";
  const { pattern, accent, rotation } = parseDecor(decor);

  const sz = SIZES[size];
  const bg = TONE_BG[color] ?? TONE_BG.pop;
  const fg = TONE_FG[color] ?? TONE_FG.pop;
  const rotDeg = Number(rotation) || 0;

  // Accent-corner positie
  const [accentColor, accentPos] = accent === "none" ? ["", ""] : accent.split("-");
  const accentBg = ACCENT_BG[accentColor] ?? "";
  const posCls =
    accentPos === "tl" ? "top-0 left-0" :
    accentPos === "tr" ? "top-0 right-0" :
    accentPos === "bl" ? "bottom-0 left-0" :
    accentPos === "br" ? "bottom-0 right-0" : "";

  return (
    <div
      className={`relative ${sz.box} ${bg} ${fg} ${sz.border} border-ink
                  rounded-none flex items-center justify-center select-none
                  leading-none overflow-hidden ${className}`}
      aria-hidden
    >
      {/* Pattern overlay */}
      {pattern !== "none" && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={patternStyle(pattern, sz.pxScale)}
        />
      )}
      {/* Icon, geroteerd */}
      <span
        className={`${sz.text} relative z-[1]`}
        style={rotDeg ? { transform: `rotate(${rotDeg}deg)` } : undefined}
      >
        {icon}
      </span>
      {/* Accent corner */}
      {accent !== "none" && accentBg && (
        <span
          className={`absolute ${posCls} ${accentBg} ${sz.accent} border-2 border-ink`}
        />
      )}
    </div>
  );
}
