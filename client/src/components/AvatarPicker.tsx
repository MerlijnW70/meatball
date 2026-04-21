/**
 * Modal om je avatar te randomizen en je positie op het veld te kiezen.
 * Kleur/icoon niet handmatig — alleen 🎲-shuffle of behoud bestaand.
 * Patroon/accent/rotatie zijn weg uit de UI; decor blijft "none|none|0".
 */
import { useEffect, useState } from "react";
import { useStore } from "../store";
import { type Position } from "../types";
import { client } from "../spacetime";
import { friendlyError } from "../utils/errors";
import { randomAvatar } from "../utils/avatar";
import { BrutalButton } from "./BrutalButton";
import { Avatar } from "./Avatar";
import { PitchPicker } from "./PitchPicker";

interface Props {
  onClose: () => void;
}

export function AvatarPicker({ onClose }: Props) {
  const me = useStore((s) => s.session.me);
  const myPosition = useStore((s) =>
    me ? s.userPositions.get(me.id.toString())?.position ?? null : null,
  );

  const [color, setColor] = useState<string>(me?.avatar_color ?? "pop");
  const [icon, setIcon] = useState<string>(me?.avatar_icon ?? "🥩");
  const [position, setPosition] = useState<Position | null>(
    (myPosition as Position | null) ?? null,
  );

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    document.body.classList.add("modal-open");
    return () => document.body.classList.remove("modal-open");
  }, []);

  const shuffle = () => {
    const r = randomAvatar();
    setColor(r.color);
    setIcon(r.icon);
  };

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      // Decor blijft leeg — we laten de shape simpel.
      await client().setAvatar(color, icon, "none|none|0");
      if (position && position !== myPosition) {
        await client().setPosition(position);
      }
      onClose();
    } catch (e) {
      setErr(friendlyError(e));
    } finally { setBusy(false); }
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
                   max-h-dvh flex flex-col"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-2xl uppercase">jouw speler</h2>
          <button type="button" onClick={onClose} aria-label="sluiten"
            className="brut-btn bg-ink text-paper !py-2 !px-4 text-lg">✕</button>
        </div>

        {/* Preview — tik avatar om te shufflen */}
        <div className="flex flex-col items-center gap-2 my-3">
          <button
            type="button"
            onClick={shuffle}
            aria-label="shuffle avatar"
            className="rounded-none active:translate-x-[2px] active:translate-y-[2px]
                       transition-transform cursor-pointer"
          >
            <Avatar userId={null} size="xl"
              override={{ color, icon, decor: "none|none|0" }} />
          </button>
          <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">
            🎲 tik voor nieuwe look
          </p>
        </div>

        {/* Positie op het veld */}
        <div className="overflow-y-auto -mx-1 px-1 mt-2">
          <p className="text-xs font-bold uppercase tracking-widest mb-2">
            Kantine positie
          </p>
          <PitchPicker value={position} onChange={setPosition} />
        </div>

        {err && (
          <p className="brut-card bg-hot text-paper p-2 mt-3 mb-2 font-bold text-sm">{err}</p>
        )}
        <BrutalButton
          onClick={save}
          disabled={busy || !position}
          variant="hot" block size="lg"
          className="mt-3"
        >
          {busy ? "opslaan…" : "opslaan"}
        </BrutalButton>
      </div>
    </div>
  );
}

