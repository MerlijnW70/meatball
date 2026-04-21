/**
 * Wedstrijd-modal: kies twee entiteiten (kantines uit seizoen + je eigen team
 * indien aanwezig). Kant zonder app-spelers wordt automatisch aangevuld
 * met bots door de server.
 */
import { useMemo, useState } from "react";
import { useMyClubs, useMyGroups } from "../hooks";
import { useStore } from "../store";
import { client } from "../spacetime";
import { friendlyError } from "../utils/errors";
import { go } from "../router";
import { BrutalButton } from "./BrutalButton";
import { BrutalCard } from "./BrutalCard";
export type MatchEntityKind = "club" | "group";
export interface MatchEntity {
  kind: MatchEntityKind;
  id: bigint;
  name: string;
}

interface Props {
  onClose: () => void;
  /** Optioneel: thuis-zijde voorkiezen (bv. vanaf een kantine-kaart). */
  preselectHome?: MatchEntity;
  /** Optioneel: uit-zijde voorkiezen (bv. automatisch je eigen team). */
  preselectAway?: MatchEntity;
}

type Step = "idle" | "pick-home" | "pick-away";

export function MatchStartModal({ onClose, preselectHome, preselectAway }: Props) {
  const me = useStore((s) => s.session.me);
  const myClubs = useMyClubs(200);
  const myGroups = useMyGroups();

  const pickable = useMemo<MatchEntity[]>(() => {
    const clubs: MatchEntity[] = myClubs.map(({ club }) => ({
      kind: "club", id: club.id, name: club.name,
    }));
    const groups: MatchEntity[] = myGroups.map((g) => ({
      kind: "group", id: g.id, name: g.name,
    }));
    return [...groups, ...clubs];
  }, [myClubs, myGroups]);

  const [home, setHome] = useState<MatchEntity | null>(preselectHome ?? null);
  const [away, setAway] = useState<MatchEntity | null>(preselectAway ?? null);
  const [step, setStep] = useState<Step>("idle");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const sameEntity = (a: MatchEntity | null, b: MatchEntity | null) =>
    !!(a && b && a.kind === b.kind && a.id === b.id);

  const waitForMatch = async (previousMaxId: bigint): Promise<bigint | null> => {
    if (!me || !home) return null;
    // Exponential backoff: 100, 150, 225, 340, 510, ... tot 1500ms max.
    // Totaal ~12s wachttijd verdeeld over 20 checks.
    let delay = 100;
    for (let i = 0; i < 20; i++) {
      const fresh = Array.from(useStore.getState().matches.values())
        .filter((mt) => mt.created_by === me.id
          && mt.home_club_id === home.id
          && mt.home_is_group === (home.kind === "group")
          && mt.id > previousMaxId)
        .sort((a, b) => Number(b.id - a.id))[0];
      if (fresh) return fresh.id;
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(Math.round(delay * 1.5), 1500);
    }
    return null;
  };

  const kickOff = async () => {
    if (!home || !away || busy) return;
    setBusy(true); setErr(null);
    const prevMax = Array.from(useStore.getState().matches.values())
      .reduce((acc, m) => m.id > acc ? m.id : acc, 0n);
    try {
      await client().simulateMatch(
        home.id, home.kind === "group",
        away.id, away.kind === "group",
      );
      const id = await waitForMatch(prevMax);
      if (id) { onClose(); go(`/match/${id}`); }
      else setErr("Kon wedstrijd niet laden — probeer het nog eens");
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const pickFor = (e: MatchEntity) => {
    if (step === "pick-home") setHome(e);
    else if (step === "pick-away") setAway(e);
    setStep("idle");
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
            {step === "idle" ? "wedstrijd" : "kies tegenstander"}
          </h2>
          <button type="button" onClick={onClose} aria-label="sluiten"
            className="brut-btn bg-ink text-paper !py-2 !px-4 text-lg">✕</button>
        </div>

        {step === "idle" && (
          <>
            <p className="text-xs font-bold uppercase tracking-widest opacity-70">
              Bots vullen ontbrekende posities aan
            </p>

            <SlotButton
              label="thuis"
              entity={home}
              onPick={() => setStep("pick-home")}
              onClear={() => setHome(null)}
            />
            <SlotButton
              label="uit"
              entity={away}
              onPick={() => setStep("pick-away")}
              onClear={() => setAway(null)}
            />

            {err && (
              <p className="brut-card bg-hot text-paper p-2 font-bold text-sm">{err}</p>
            )}

            <BrutalButton
              onClick={kickOff}
              disabled={!home || !away || busy || sameEntity(home, away)}
              variant="hot" size="lg" block
            >
              {busy ? "simuleren…" : "⚽ aftrap"}
            </BrutalButton>
            {sameEntity(home, away) && (
              <p className="text-xs font-bold text-hot">
                Kies twee verschillende entiteiten.
              </p>
            )}
          </>
        )}

        {(step === "pick-home" || step === "pick-away") && (
          <div className="flex flex-col gap-2 overflow-y-auto -mx-1 px-1">
            {pickable.length === 0 && (
              <BrutalCard className="!p-3">
                <p className="text-sm font-bold">Nog niks om te kiezen.</p>
                <p className="text-xs opacity-70 mt-1">
                  Voeg kantines aan je seizoen toe of richt een team op.
                </p>
              </BrutalCard>
            )}
            {pickable.map((e) => (
              <button
                key={`${e.kind}:${e.id.toString()}`}
                type="button"
                onClick={() => pickFor(e)}
                className="brut-card text-left !p-3 bg-paper flex items-center gap-3
                           active:translate-x-[2px] active:translate-y-[2px] transition-transform"
              >
                <span
                  className={`shrink-0 brut-chip !py-0.5 !px-1.5 text-[10px] font-display
                    ${e.kind === "group" ? "bg-pop text-ink" : "bg-sky text-paper"}`}
                >
                  {e.kind === "group" ? "team" : "kantine"}
                </span>
                <p className="font-display text-lg uppercase leading-tight truncate flex-1">
                  {e.name}
                </p>
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
  label, entity, onPick, onClear,
}: {
  label: string;
  entity: MatchEntity | null;
  onPick: () => void;
  onClear: () => void;
}) {
  if (!entity) {
    return (
      <button
        type="button"
        onClick={onPick}
        className="brut-card !p-3 bg-paper text-left w-full
                   active:translate-x-[2px] active:translate-y-[2px] transition-transform"
      >
        <p className="text-[10px] font-bold uppercase tracking-widest opacity-70">{label}</p>
        <p className="font-display text-lg uppercase opacity-50">+ kies team of kantine</p>
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
        <p className="text-[10px] font-bold uppercase tracking-widest opacity-70 flex items-center gap-1.5">
          {label}
          <span
            className={`brut-chip !py-0 !px-1 text-[9px]
              ${entity.kind === "group" ? "bg-pop text-ink" : "bg-sky text-paper"}`}
          >
            {entity.kind === "group" ? "team" : "kantine"}
          </span>
        </p>
        <p className="font-display text-lg uppercase truncate">{entity.name}</p>
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
