/**
 * Modal voor Trainer om een real-life wedstrijd te plannen.
 * Selecteert tegenstander (uit seizoen-kantines), thuis/uit en kickoff
 * datum+tijd. Server verifieert trainer-rol en kickoff-horizon.
 */
import { useMemo, useState } from "react";
import { useMyClubs } from "../hooks";
import { client } from "../spacetime";
import { friendlyError } from "../utils/errors";
import { BrutalButton } from "./BrutalButton";
import { BrutalCard } from "./BrutalCard";
import { BrutalInput } from "./BrutalInput";
import type { Club } from "../types";

interface Props {
  groupId: bigint;
  onClose: () => void;
}

type Step = "form" | "pick-opponent";

/** Default: eerstvolgende zaterdag 14:00 in lokale tijd. */
function defaultKickoff(): string {
  const d = new Date();
  const daysTillSat = ((6 - d.getDay()) + 7) % 7 || 7;
  d.setDate(d.getDate() + daysTillSat);
  d.setHours(14, 0, 0, 0);
  // `datetime-local` verwacht "YYYY-MM-DDTHH:mm" zonder timezone-offset.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    + `T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function FixtureCreateModal({ groupId, onClose }: Props) {
  const myClubs = useMyClubs(500);
  const [opponent, setOpponent] = useState<Club | null>(null);
  const [kickoffStr, setKickoffStr] = useState(defaultKickoff);
  const [weAreHome, setWeAreHome] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("form");

  const canSubmit = useMemo(() => {
    if (!opponent || busy) return false;
    const ms = new Date(kickoffStr).getTime();
    return Number.isFinite(ms) && ms > Date.now();
  }, [opponent, kickoffStr, busy]);

  const submit = async () => {
    if (!canSubmit || !opponent) return;
    setBusy(true); setErr(null);
    try {
      const kickoffMs = new Date(kickoffStr).getTime();
      const kickoffMicros = BigInt(kickoffMs) * 1000n;
      await client().createMatchFixture(groupId, opponent.id, weAreHome, kickoffMicros);
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
          <h2 className="font-display text-2xl uppercase">
            {step === "form" ? "nieuwe wedstrijd" : "kies tegenstander"}
          </h2>
          <button type="button" onClick={onClose} aria-label="sluiten"
            className="brut-btn bg-ink text-paper !py-2 !px-4 text-lg">✕</button>
        </div>

        {step === "form" && (
          <>
            <p className="text-[11px] font-bold uppercase tracking-widest opacity-70">
              Team-leden voorspellen de uitslag tot 1 min voor kickoff
            </p>

            {/* Tegenstander picker */}
            <button
              type="button"
              onClick={() => setStep("pick-opponent")}
              className="brut-card bg-paper !p-3 text-left
                         active:translate-x-[1px] active:translate-y-[1px] transition-transform"
            >
              <p className="text-[10px] font-bold uppercase tracking-widest opacity-70">
                tegenstander
              </p>
              <p className="font-display text-lg uppercase truncate">
                {opponent ? opponent.name : <span className="opacity-50">+ kies kantine</span>}
              </p>
            </button>

            {/* Thuis / uit toggle */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setWeAreHome(true)}
                aria-pressed={weAreHome}
                className={`border-4 border-ink py-3 font-display uppercase
                  active:translate-x-[2px] active:translate-y-[2px] transition-transform
                  ${weAreHome ? "bg-ink text-paper" : "bg-paper text-ink"}`}
              >
                🏠 thuis
              </button>
              <button
                type="button"
                onClick={() => setWeAreHome(false)}
                aria-pressed={!weAreHome}
                className={`border-4 border-ink py-3 font-display uppercase
                  active:translate-x-[2px] active:translate-y-[2px] transition-transform
                  ${!weAreHome ? "bg-ink text-paper" : "bg-paper text-ink"}`}
              >
                ✈️ uit
              </button>
            </div>

            {/* Kickoff datum+tijd */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest opacity-70 mb-1">
                kickoff
              </p>
              <BrutalInput
                type="datetime-local"
                value={kickoffStr}
                onChange={(e) => setKickoffStr(e.target.value)}
                min={defaultKickoff().slice(0, 16)}
              />
            </div>

            {err && (
              <p className="brut-card bg-hot text-paper p-2 font-bold text-sm">{err}</p>
            )}

            <BrutalButton
              onClick={submit}
              disabled={!canSubmit}
              variant="hot" size="lg" block
            >
              {busy ? "plannen…" : "plan wedstrijd"}
            </BrutalButton>
          </>
        )}

        {step === "pick-opponent" && (
          <div className="flex flex-col gap-2 overflow-y-auto -mx-1 px-1">
            {myClubs.length === 0 && (
              <BrutalCard className="!p-3">
                <p className="text-sm font-bold">Je seizoen is nog leeg.</p>
                <p className="text-xs opacity-70 mt-1">
                  Voeg eerst kantines aan je seizoen toe.
                </p>
              </BrutalCard>
            )}
            {myClubs.map(({ club }) => (
              <button
                key={club.id.toString()}
                type="button"
                onClick={() => { setOpponent(club); setStep("form"); }}
                className="brut-card text-left !p-3 bg-paper
                           active:translate-x-[2px] active:translate-y-[2px] transition-transform"
              >
                <p className="font-display text-lg uppercase leading-tight truncate">
                  {club.name}
                </p>
              </button>
            ))}
            <BrutalButton variant="paper" size="md" block onClick={() => setStep("form")}>
              ← terug
            </BrutalButton>
          </div>
        )}
      </div>
    </div>
  );
}
