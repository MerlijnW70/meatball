/**
 * Modal voor team-leden om een score-voorspelling te submitten.
 * Twee number-steppers (0-9) voor thuis/uit, submit knop. Bestaande
 * voorspelling vult de steppers voor en wordt op de server overschreven.
 */
import { useEffect, useState } from "react";
import { client } from "../spacetime";
import { friendlyError } from "../utils/errors";
import { BrutalButton } from "./BrutalButton";

interface Props {
  fixtureId: bigint;
  homeName: string;
  awayName: string;
  kickoffMicros: number;
  initialHome: number | null;
  initialAway: number | null;
  onClose: () => void;
}

const MAX_SCORE = 9;

export function PredictionModal({
  fixtureId, homeName, awayName, kickoffMicros,
  initialHome, initialAway, onClose,
}: Props) {
  const [home, setHome] = useState(initialHome ?? 1);
  const [away, setAway] = useState(initialAway ?? 1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    document.body.classList.add("modal-open");
    return () => document.body.classList.remove("modal-open");
  }, []);

  // Lockout: 60s vóór kickoff wordt server ook sluiten.
  const now = Date.now();
  const kickoffMs = kickoffMicros / 1000;
  const msUntilLockout = kickoffMs - now - 60_000;
  const locked = msUntilLockout <= 0;

  const submit = async () => {
    if (busy || locked) return;
    setBusy(true); setErr(null);
    try {
      await client().submitPrediction(fixtureId, home, away);
      onClose();
    } catch (e) {
      setErr(friendlyError(e));
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
          <h2 className="font-display text-2xl uppercase">jouw voorspelling</h2>
          <button type="button" onClick={onClose} aria-label="sluiten"
            className="brut-btn bg-ink text-paper !py-2 !px-4 text-lg">✕</button>
        </div>

        <p className="text-[11px] font-bold uppercase tracking-widest opacity-70">
          exact: 10 pt · winnaar + goaldiff: 5 pt · winnaar: 3 pt
        </p>

        {/* Score picker */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <ScoreStepper label={homeName} value={home} onChange={setHome} tone="pop" />
          <ScoreStepper label={awayName} value={away} onChange={setAway} tone="sky" />
        </div>

        {/* Grote leesbare preview */}
        <div className="flex items-center justify-center gap-3 py-2 font-display text-5xl tabular-nums">
          <span>{home}</span>
          <span className="opacity-40 text-3xl">–</span>
          <span>{away}</span>
        </div>

        {err && (
          <p className="brut-card bg-hot text-paper p-2 font-bold text-sm">{err}</p>
        )}

        <BrutalButton
          onClick={submit} disabled={busy || locked}
          variant="hot" size="lg" block
        >
          {locked ? "voorspellingen gesloten"
            : busy ? "versturen…"
            : (initialHome !== null ? "update voorspelling" : "voorspel!")}
        </BrutalButton>

        {!locked && msUntilLockout < 10 * 60_000 && (
          <p className="text-[10px] font-bold uppercase tracking-widest text-hot text-center">
            ⏰ sluit over {Math.max(0, Math.ceil(msUntilLockout / 60_000))} min
          </p>
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
