/**
 * Modal voor Trainer om de echte uitslag van een fixture in te voeren.
 * Server kent na submit automatisch punten toe aan alle voorspellingen.
 */
import { useEffect, useState } from "react";
import { client } from "../spacetime";
import { friendlyError } from "../utils/errors";
import { BrutalButton } from "./BrutalButton";

interface Props {
  fixtureId: bigint;
  homeName: string;
  awayName: string;
  onClose: () => void;
}

const MAX_SCORE = 15;

export function ResultEntryModal({
  fixtureId, homeName, awayName, onClose,
}: Props) {
  const [home, setHome] = useState(0);
  const [away, setAway] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    document.body.classList.add("modal-open");
    return () => document.body.classList.remove("modal-open");
  }, []);

  const submit = async () => {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      await client().enterMatchResult(fixtureId, home, away);
      onClose();
    } catch (e) {
      setErr(friendlyError(e));
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-ink/70 flex items-end sm:items-center
                 justify-center p-0 sm:p-6 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md brut-card bg-paper shadow-brutLg p-5 rounded-none
                   max-h-dvh flex flex-col gap-3"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl uppercase">echte uitslag</h2>
          <button type="button" onClick={onClose} aria-label="sluiten"
            className="brut-btn bg-ink text-paper !py-2 !px-4 text-lg">✕</button>
        </div>

        <p className="text-[11px] font-bold uppercase tracking-widest opacity-70">
          Voer de eindstand in — server rekent punten toe aan alle voorspellingen
        </p>

        {/* Score steppers */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <ScoreStepper label={homeName} value={home} onChange={setHome} tone="pop" />
          <ScoreStepper label={awayName} value={away} onChange={setAway} tone="sky" />
        </div>

        {/* Preview */}
        <div className="flex items-center justify-center gap-3 py-2 font-display text-5xl tabular-nums">
          <span>{home}</span>
          <span className="opacity-40 text-3xl">–</span>
          <span>{away}</span>
        </div>

        {err && (
          <p className="brut-card bg-hot text-paper p-2 font-bold text-sm">{err}</p>
        )}

        {confirming ? (
          <div className="flex flex-col gap-2">
            <p className="brut-card bg-pop p-2 text-xs font-bold uppercase tracking-widest text-center">
              Weet je zeker dat {home}–{away} de eindstand is? Kan niet meer terug.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <BrutalButton
                onClick={() => setConfirming(false)}
                disabled={busy} variant="paper" size="md"
              >
                annuleer
              </BrutalButton>
              <BrutalButton
                onClick={submit} disabled={busy}
                variant="hot" size="md"
              >
                {busy ? "opslaan…" : "ja, klopt"}
              </BrutalButton>
            </div>
          </div>
        ) : (
          <BrutalButton
            onClick={() => setConfirming(true)}
            disabled={busy}
            variant="hot" size="lg" block
          >
            uitslag vastleggen
          </BrutalButton>
        )}
      </div>
    </div>
  );
}

function ScoreStepper({
  label, value, onChange, tone,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  tone: "pop" | "sky";
}) {
  const toneCls = tone === "pop" ? "bg-pop text-ink" : "bg-sky text-paper";
  return (
    <div className="brut-card !p-0 overflow-hidden flex flex-col">
      <div className={`px-2 py-1.5 ${toneCls}`}>
        <p className="font-display uppercase text-[11px] tracking-widest leading-tight truncate text-center">
          {label}
        </p>
      </div>
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, value - 1))}
          aria-label="minder"
          className="flex-1 border-r-4 border-ink bg-paper font-display text-2xl py-2
                     active:translate-x-[1px] active:translate-y-[1px] transition-transform"
        >
          −
        </button>
        <div className="flex-1 flex items-center justify-center font-display text-3xl tabular-nums bg-paper">
          {value}
        </div>
        <button
          type="button"
          onClick={() => onChange(Math.min(MAX_SCORE, value + 1))}
          aria-label="meer"
          className="flex-1 border-l-4 border-ink bg-paper font-display text-2xl py-2
                     active:translate-x-[1px] active:translate-y-[1px] transition-transform"
        >
          +
        </button>
      </div>
    </div>
  );
}
