/**
 * Eén activiteit-tegel. Trading-card-ish: portret aspect, grote emoji,
 * display-font label, optioneel live-stat-chip rechtsboven, zachte
 * alternerende rotatie zodat de grid niet te strak staat.
 *
 * Tap-feedback = brut-btn translate-pattern (consistent met rest v/d app).
 */
import { ReactNode } from "react";
import { go } from "../../router";

type Tone = "pop" | "hot" | "mint" | "sky" | "bruise" | "paper";

interface Props {
  /** Emoji bovenaan — een of twee emoji's, grote weergave. */
  emoji: string;
  /** Korte label, display-uppercase. */
  label: string;
  /** Optionele 2e regel subtitle. */
  sub?: string;
  /** Achtergrondkleur (brutalist palette key). */
  tone?: Tone;
  /** Optioneel ribbon/chip rechtsboven — "LIVE", "NEW", aantal etc. */
  badge?: string | null;
  /** Kleine pulse op de badge — werkt fijn voor "🔴 3 live". */
  badgePulse?: boolean;
  /** Tilt in graden (default 0). Oneven-indexed tiles krijgen + of -,
   *  gecontroleerd door de parent Grid-component voor variatie. */
  tilt?: number;
  /** Route voor de tap — één van de routes of externe navigatie. */
  to?: string;
  /** Custom click (override van to). */
  onClick?: () => void;
  /** Disable — bv. "binnenkort" state. */
  disabled?: boolean;
  /** Optioneel: extra content onderaan de tegel (bv. klein staafje). */
  footer?: ReactNode;
}

const TONE_CLS: Record<Tone, string> = {
  pop:    "bg-pop text-ink",
  hot:    "bg-hot text-paper",
  mint:   "bg-mint text-ink",
  sky:    "bg-sky text-paper",
  bruise: "bg-bruise text-paper",
  paper:  "bg-paper text-ink",
};

export function ActivityTile({
  emoji, label, sub, tone = "pop",
  badge, badgePulse, tilt = 0, to, onClick, disabled, footer,
}: Props) {
  const handle = () => {
    if (disabled) return;
    if (onClick) onClick();
    else if (to) go(to);
  };

  return (
    <button
      type="button"
      onClick={handle}
      disabled={disabled}
      className={`relative group w-full aspect-[3/4] brut-card !p-0 overflow-hidden
                  ${TONE_CLS[tone]}
                  ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
                  active:translate-x-[3px] active:translate-y-[3px]
                  active:shadow-none transition-[transform,box-shadow]
                  flex flex-col items-stretch text-left`}
      style={{ transform: tilt ? `rotate(${tilt}deg)` : undefined }}
    >
      {/* Top-right badge — aantal / status */}
      {badge && (
        <span
          className={`absolute top-2 right-2 border-2 border-ink rounded-none
                      bg-paper text-ink px-1.5 py-0.5
                      text-[9px] font-display uppercase tracking-widest
                      ${badgePulse ? "animate-pulse" : ""}`}
        >
          {badge}
        </span>
      )}

      {/* Emoji hero — neemt de bulk ruimte */}
      <div className="flex-1 flex items-center justify-center">
        <span
          className="text-5xl sm:text-6xl leading-none drop-shadow-[3px_3px_0_rgba(0,0,0,0.15)]
                     group-active:scale-95 transition-transform"
          aria-hidden
        >
          {emoji}
        </span>
      </div>

      {/* Label onderaan — inverted strip voor contrast */}
      <div className="border-t-4 border-ink px-3 py-2 bg-ink text-paper">
        <p className="font-display text-base sm:text-lg uppercase leading-tight truncate">
          {label}
        </p>
        {sub && (
          <p className="text-[10px] font-bold uppercase tracking-widest opacity-70 mt-0.5 truncate">
            {sub}
          </p>
        )}
        {footer}
      </div>
    </button>
  );
}
