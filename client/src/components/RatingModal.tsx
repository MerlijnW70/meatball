/**
 * Rating-modal voor een snack. Visueel uitgebreid met giant-logo,
 * emoji-reactie, score-label en emoji-bucket quick picks.
 */
import { useEffect, useState } from "react";
import type { Snack } from "../types";
import { BrutalButton } from "./BrutalButton";
import { GehaktbalLogo } from "./GehaktbalLogo";
import { client } from "../spacetime";
import { useStore } from "../store";
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

interface Reaction {
  emoji: string;
  tone: string;         // classes voor de label-chip
  bg: string;           // subtiele hero-background
  accent: string;       // accent-color voor de slider track
}

function reactionFor(score: number): Reaction {
  if (score <= 2) return { emoji: "🤢", tone: "bg-hot text-paper", bg: "bg-hot/15", accent: "#FF3838" };
  if (score <= 4) return { emoji: "😕", tone: "bg-sky text-paper", bg: "bg-sky/15", accent: "#4B8FE3" };
  if (score <= 6) return { emoji: "😐", tone: "bg-paper border-4 border-ink", bg: "bg-paper", accent: "#AEAEAE" };
  if (score <= 8) return { emoji: "😋", tone: "bg-mint text-ink", bg: "bg-mint/20", accent: "#1FAE6B" };
  if (score === 9) return { emoji: "🤩", tone: "bg-pop text-ink", bg: "bg-pop/25", accent: "#FFD23F" };
  return { emoji: "🏆", tone: "bg-pop text-ink", bg: "bg-pop/40", accent: "#FFD23F" };
}

// Emoji-bucket picks: elke bucket heeft een representatieve score.
const BUCKETS: Array<{ range: string; emoji: string; score: number; label: string }> = [
  { range: "1-2",  emoji: "🤢", score: 2,  label: "niet eten" },
  { range: "3-4",  emoji: "😕", score: 4,  label: "matig" },
  { range: "5-6",  emoji: "😐", score: 6,  label: "prima" },
  { range: "7-8",  emoji: "😋", score: 8,  label: "lekker" },
  { range: "9-10", emoji: "🏆", score: 10, label: "top" },
];

export function RatingModal({ snack, onClose, initial }: Props) {
  const isEdit = !!initial;
  const [score, setScore] = useState(initial?.score ?? 7);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const clubs = useStore((s) => s.clubs);
  const club = clubs.get(snack.club_id.toString());

  useEffect(() => {
    document.body.classList.add("modal-open");
    return () => document.body.classList.remove("modal-open");
  }, []);

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

  const reaction = reactionFor(score);
  const label = SCORE_LABELS[score] ?? "—";

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-ink/70 flex items-end sm:items-center
                 justify-center p-0 sm:p-6 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md brut-card bg-paper shadow-brutLg rounded-none !p-0
                   overflow-hidden max-h-dvh flex flex-col"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        {/* ── Header: club-context ────────────────────────────── */}
        <div className="bg-ink text-paper px-4 py-3 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-70">
              {isEdit ? "Jouw rating aanpassen" : "Beoordeel gehaktbal van"}
            </p>
            <p className="font-display text-xl uppercase leading-tight truncate">
              {club?.name ?? snack.name}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="sluiten"
            className="shrink-0 w-9 h-9 border-4 border-paper bg-paper text-ink font-display
                       text-lg flex items-center justify-center
                       active:translate-x-[1px] active:translate-y-[1px] transition-transform"
          >
            ✕
          </button>
        </div>

        {/* ── Hero: giant logo + score + label ────────────────── */}
        <div className={`flex flex-col items-center gap-3 px-4 py-5 transition-colors
                         ${reaction.bg}`}>
          <div className="relative">
            <GehaktbalLogo size={110}
              className="drop-shadow-[5px_5px_0_#111] transition-transform" />
            {/* Emoji-reactie als badge rechtsboven */}
            <div
              className="absolute -top-4 -right-4 brut-card bg-paper !p-1.5 text-4xl
                         leading-none shadow-brutSm select-none"
              aria-hidden
            >
              {reaction.emoji}
            </div>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="font-display text-7xl leading-none tabular-nums">{score}</span>
            <span className="font-display text-2xl opacity-40">/10</span>
          </div>

          <div
            className={`brut-chip !py-1 !px-3 text-base font-display uppercase ${reaction.tone}`}
          >
            {label}
          </div>
        </div>

        {/* ── Picker: slider met gehaktbal als knop ───────────── */}
        <div className="px-8 pt-6 pb-1">
          <div className="relative h-12 select-none">
            {/* Track achtergrond */}
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-4 border-4 border-ink bg-paper overflow-hidden">
              <div
                className="h-full transition-[width,background-color] duration-150"
                style={{
                  width: `${(score - 1) * 11.111}%`,
                  backgroundColor: reaction.accent,
                }}
              />
            </div>
            {/* Gehaktbal als draai-knop — puur visueel, events gaan naar input */}
            <div
              className="absolute top-1/2 pointer-events-none transition-[left] duration-150"
              style={{
                left: `${(score - 1) * 11.111}%`,
                transform: "translate(-50%, -50%)",
              }}
              aria-hidden
            >
              <GehaktbalLogo
                size={48}
                className="drop-shadow-[3px_3px_0_#111]"
              />
            </div>
            {/* Native input — onzichtbaar, vangt drag/tap over hele breedte */}
            <input
              type="range" min={1} max={10} value={score}
              onChange={(e) => setScore(Number(e.target.value))}
              aria-label="score"
              className="absolute inset-0 w-full h-full opacity-0 cursor-grab active:cursor-grabbing"
            />
          </div>
          <div className="flex justify-between text-[10px] font-bold mt-1 uppercase tracking-widest opacity-60">
            <span>1</span>
            <span>10</span>
          </div>
        </div>

        {/* ── Emoji-bucket quick picks ────────────────────────── */}
        <div className="px-4 pt-3">
          <p className="text-[10px] font-bold uppercase tracking-widest opacity-60 mb-2">
            Of tik snel:
          </p>
          <div className="grid grid-cols-5 gap-1.5">
            {BUCKETS.map((b) => {
              const on = (score >= Number(b.range.split("-")[0]))
                && (score <= Number(b.range.split("-")[1]));
              return (
                <button
                  key={b.range}
                  type="button"
                  onClick={() => setScore(b.score)}
                  aria-label={`${b.range}: ${b.label}`}
                  className={`border-4 border-ink py-2 px-1 flex flex-col items-center gap-0.5
                    leading-none font-display uppercase
                    active:translate-x-[1px] active:translate-y-[1px] transition-transform
                    ${on ? "bg-ink text-paper shadow-brutSm" : "bg-paper text-ink"}`}
                >
                  <span className="text-xl leading-none select-none" aria-hidden>{b.emoji}</span>
                  <span className="text-[9px] tracking-widest opacity-80">{b.range}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Error + CTA ──────────────────────────────────────── */}
        <div className="px-4 pt-4 pb-2">
          {err && (
            <p className="brut-card bg-hot text-paper p-2 mb-3 font-bold text-sm">{err}</p>
          )}
          <BrutalButton
            onClick={submit} disabled={busy}
            variant="hot" block size="lg"
          >
            {busy
              ? (isEdit ? "opslaan…" : "posten…")
              : (isEdit ? "rating bijwerken" : "post je rating")}
          </BrutalButton>
        </div>
      </div>
    </div>
  );
}
