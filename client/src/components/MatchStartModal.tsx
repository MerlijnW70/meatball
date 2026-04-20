/**
 * Wedstrijd-modal: kies twee kantines uit je seizoen (thuis + uit).
 * Kantines zonder spelers worden automatisch opgevuld met bots door
 * de server.
 */
import { useMemo, useState } from "react";
import { useMyClubs } from "../hooks";
import { useStore } from "../store";
import { client } from "../spacetime";
import { friendlyError } from "../utils/errors";
import { go } from "../router";
import { BrutalButton } from "./BrutalButton";
import { BrutalCard } from "./BrutalCard";
import type { Club } from "../types";

interface Props {
  onClose: () => void;
  /** Optioneel voorkeuze voor thuis (bv. vanaf een kantine-card). */
  preselectHome?: Club;
}

type Step = "idle" | "pick-home" | "pick-away";

export function MatchStartModal({ onClose, preselectHome }: Props) {
  const me = useStore((s) => s.session.me);
  const myClubs = useMyClubs(200);

  const [home, setHome] = useState<Club | null>(preselectHome ?? null);
  const [away, setAway] = useState<Club | null>(null);
  const [step, setStep] = useState<Step>("idle");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const pickable = useMemo(
    () => myClubs.map((c) => c.club),
    [myClubs],
  );

  const waitForMatch = async (previousMaxId: bigint): Promise<bigint | null> => {
    if (!me || !home) return null;
    for (let i = 0; i < 40; i++) {
      const fresh = Array.from(useStore.getState().matches.values())
        .filter((mt) => mt.created_by === me.id
          && mt.home_club_id === home.id
          && mt.id > previousMaxId)
        .sort((a, b) => Number(b.id - a.id))[0];
      if (fresh) return fresh.id;
      await new Promise((r) => setTimeout(r, 200));
    }
    return null;
  };

  const kickOff = async () => {
    if (!home || !away || busy) return;
    setBusy(true); setErr(null);
    const prevMax = Array.from(useStore.getState().matches.values())
      .reduce((acc, m) => m.id > acc ? m.id : acc, 0n);
    try {
      await client().simulateMatch(home.id, away.id);
      const id = await waitForMatch(prevMax);
      if (id) { onClose(); go(`/match/${id}`); }
      else setErr("Kon wedstrijd niet laden — probeer het nog eens");
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
          <h2 className="font-display text-2xl uppercase">
            {step === "idle" ? "wedstrijd" : "kies kantine"}
          </h2>
          <button type="button" onClick={onClose} aria-label="sluiten"
            className="brut-btn bg-ink text-paper !py-2 !px-4 text-lg">✕</button>
        </div>

        {step === "idle" && (
          <>
            <p className="text-xs font-bold uppercase tracking-widest opacity-70">
              Kantine vs Kantine — bots vullen ontbrekende posities
            </p>

            <SlotButton
              label="thuis"
              club={home}
              onPick={() => setStep("pick-home")}
              onClear={() => setHome(null)}
            />
            <SlotButton
              label="uit"
              club={away}
              onPick={() => setStep("pick-away")}
              onClear={() => setAway(null)}
            />

            {err && (
              <p className="brut-card bg-hot text-paper p-2 font-bold text-sm">{err}</p>
            )}

            <BrutalButton
              onClick={kickOff}
              disabled={!home || !away || busy || home.id === away?.id}
              variant="hot" size="lg" block
            >
              {busy ? "simuleren…" : "⚽ aftrap"}
            </BrutalButton>
            {home && away && home.id === away.id && (
              <p className="text-xs font-bold text-hot">Kies twee verschillende kantines.</p>
            )}
          </>
        )}

        {(step === "pick-home" || step === "pick-away") && (
          <div className="flex flex-col gap-2 overflow-y-auto -mx-1 px-1">
            {pickable.length === 0 && (
              <BrutalCard className="!p-3">
                <p className="text-sm font-bold">Je seizoen is nog leeg.</p>
                <p className="text-xs opacity-70 mt-1">
                  Voeg eerst een paar kantines toe aan je seizoen.
                </p>
              </BrutalCard>
            )}
            {pickable.map((c) => (
              <button
                key={c.id.toString()}
                type="button"
                onClick={() => {
                  if (step === "pick-home") setHome(c);
                  else setAway(c);
                  setStep("idle");
                }}
                className="brut-card text-left !p-3 bg-paper
                           active:translate-x-[2px] active:translate-y-[2px] transition-transform"
              >
                <p className="font-display text-lg uppercase leading-tight truncate">{c.name}</p>
              </button>
            ))}
            <BrutalButton variant="paper" size="md" block onClick={() => setStep("idle")}>
              ← terug
            </BrutalButton>
          </div>
        )}
      </div>
    </div>
  );
}

function SlotButton({
  label, club, onPick, onClear,
}: {
  label: string;
  club: Club | null;
  onPick: () => void;
  onClear: () => void;
}) {
  if (!club) {
    return (
      <button
        type="button"
        onClick={onPick}
        className="brut-card !p-3 bg-paper text-left w-full
                   active:translate-x-[2px] active:translate-y-[2px] transition-transform"
      >
        <p className="text-[10px] font-bold uppercase tracking-widest opacity-70">{label}</p>
        <p className="font-display text-lg uppercase opacity-50">+ kies kantine</p>
      </button>
    );
  }
  return (
    <div className="brut-card !p-0 overflow-hidden flex items-stretch">
      <button
        type="button"
        onClick={onPick}
        className="flex-1 text-left px-3 py-2.5
                   active:translate-x-[1px] active:translate-y-[1px] transition-transform"
      >
        <p className="text-[10px] font-bold uppercase tracking-widest opacity-70">{label}</p>
        <p className="font-display text-lg uppercase truncate">{club.name}</p>
      </button>
      <button
        type="button"
        onClick={onClear}
        aria-label="wissen"
        className="shrink-0 w-12 border-l-4 border-ink bg-ink text-paper font-display text-xl
                   flex items-center justify-center
                   active:translate-x-[1px] active:translate-y-[1px] transition-transform"
      >
        ✕
      </button>
    </div>
  );
}
