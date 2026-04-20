/**
 * 4-3-3 veld-keuze raster + losse "🪑 wissel / op de bank" knop.
 * Gebruikt op onboarding + in AvatarPicker.
 */
import { POSITION_LABEL, POSITION_SHORT, type Position } from "../types";

const ROWS: Position[][] = [
  ["lw", "st", "rw"],
  ["lm", "cm", "rm"],
  ["lb", "lcb", "rcb", "rb"],
  ["keeper"],
];

export function PitchPicker({
  value, onChange,
}: {
  value: Position | null;
  onChange: (p: Position) => void;
}) {
  const wisselOn = value === "wissel";

  return (
    <div className="flex flex-col gap-2">
      <div className="brut-card bg-mint/70 !p-3 flex flex-col gap-2">
        {ROWS.map((row, i) => (
          <div key={i}
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}
          >
            {row.map((p) => {
              const on = value === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => onChange(p)}
                  aria-pressed={on}
                  aria-label={POSITION_LABEL[p]}
                  title={POSITION_LABEL[p]}
                  className={`border-4 border-ink py-3 px-1 text-center
                    font-display uppercase leading-none shadow-brutSm
                    ${on ? "bg-ink text-paper" : "bg-paper"}
                    active:translate-x-[2px] active:translate-y-[2px] transition-transform`}
                >
                  <span className="block text-base">{POSITION_SHORT[p]}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange("wissel")}
        aria-pressed={wisselOn}
        className={`border-4 border-ink py-2 px-3 font-display uppercase text-sm
          shadow-brutSm flex items-center justify-center gap-2
          ${wisselOn ? "bg-ink text-paper" : "bg-paper"}
          active:translate-x-[2px] active:translate-y-[2px] transition-transform`}
      >
        <span aria-hidden>🪑</span> wissel / op de bank
      </button>
    </div>
  );
}
