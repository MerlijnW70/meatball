import { useEffect, useState } from "react";
import { Snack } from "../types";
import { BrutalButton } from "./BrutalButton";
import { client } from "../spacetime";
import { friendlyError } from "../utils/errors";

interface Props {
  snack: Snack;
  onClose: () => void;
  /** Als gezet → editen i.p.v. een nieuwe rating posten. */
  initial?: { score: number } | null;
}

const SCORE_LABELS: Record<number, string> = {
  1: "niet eten",
  2: "echt niet",
  3: "slecht",
  4: "matig",
  5: "oké",
  6: "prima",
  7: "lekker",
  8: "erg lekker",
  9: "top",
  10: "perfect",
};

function scoreLabel(s: number) {
  return SCORE_LABELS[s] ?? "—";
}

export function RatingModal({ snack, onClose, initial }: Props) {
  const isEdit = !!initial;
  const [score, setScore] = useState(initial?.score ?? 7);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Body scroll-lock zolang de modal open staat.
  useEffect(() => {
    document.body.classList.add("modal-open");
    return () => document.body.classList.remove("modal-open");
  }, []);

  // Broadcast rating-intent zodat andere users 'm zien op de card.
  useEffect(() => {
    client().beginRating(snack.id).catch(() => {});
    return () => { client().endRating().catch(() => {}); };
  }, [snack.id]);

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      await client().submitRating(snack.id, score, "", []);
      onClose();
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-ink/70 flex items-end sm:items-center justify-center p-0 sm:p-6 overflow-y-auto">
      <div
        className="w-full max-w-md brut-card bg-paper shadow-brutLg p-5 rounded-none max-h-dvh overflow-y-auto"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-2xl uppercase">
            {snack.name}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="sluiten"
            className="brut-btn bg-ink text-paper !py-2 !px-4 text-lg"
          >
            ✕
          </button>
        </div>

        {/* Score slider */}
        <div className="mb-4">
          <div className="flex items-baseline justify-between mb-1">
            <label className="text-xs font-bold uppercase tracking-widest">Score</label>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-4xl leading-none">{score}</span>
              <span className="brut-chip bg-pop !py-0.5 !px-1.5">
                {scoreLabel(score)}
              </span>
            </div>
          </div>
          <input
            type="range" min={1} max={10} value={score}
            onChange={(e) => setScore(Number(e.target.value))}
            className="w-full h-4 appearance-none bg-ink border-4 border-ink rounded-none cursor-pointer"
            style={{
              background:
                `linear-gradient(to right, #FFE14D 0%, #FFE14D ${(score - 1) * 11.1}%, #FFFCF2 ${(score - 1) * 11.1}%, #FFFCF2 100%)`,
            }}
          />
          <div className="flex justify-between text-[10px] font-bold mt-1 uppercase tracking-widest opacity-60">
            <span>1 = niet eten</span>
            <span>10 = perfect</span>
          </div>
        </div>

        {err && (
          <p className="brut-card bg-hot text-paper p-2 mb-3 font-bold">{err}</p>
        )}

        <BrutalButton
          onClick={submit} disabled={busy}
          variant="hot" block size="lg"
        >
          {busy
            ? (isEdit ? "opslaan…" : "posten…")
            : (isEdit ? "update rating" : "post rating")}
        </BrutalButton>
      </div>
    </div>
  );
}
