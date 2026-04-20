/**
 * Modal om je avatar en positie te kiezen — kleur, icon, veldpositie.
 * Patroon/accent/rotatie zijn weg; het ingevulde decor blijft intact op
 * bestaande users maar wordt niet meer getoond of bewerkt.
 */
import { useEffect, useState } from "react";
import { useStore } from "../store";
import {
  ALLOWED_AVATAR_COLORS, ALLOWED_AVATAR_ICONS, ALLOWED_POSITIONS,
  type Position,
} from "../types";
import { client } from "../spacetime";
import { friendlyError } from "../utils/errors";
import { TONE_BG } from "../utils/avatar";
import { BrutalButton } from "./BrutalButton";
import { Avatar } from "./Avatar";

interface Props {
  onClose: () => void;
}

const POSITION_LABELS: Record<Position, string> = {
  keeper: "keeper",
  verdediger: "verdediger",
  middenvelder: "middenvelder",
  aanvaller: "aanvaller",
};

const POSITION_ICON: Record<Position, string> = {
  keeper: "🧤",
  verdediger: "🛡",
  middenvelder: "🎯",
  aanvaller: "⚽",
};

export function AvatarPicker({ onClose }: Props) {
  const me = useStore((s) => s.session.me);
  const myPosition = useStore((s) =>
    me ? s.userPositions.get(me.id.toString())?.position ?? null : null,
  );

  const [color, setColor] = useState<string>(me?.avatar_color ?? "pop");
  const [icon, setIcon] = useState<string>(me?.avatar_icon ?? "🥩");
  const [position, setPosition] = useState<Position | null>(myPosition ?? null);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    document.body.classList.add("modal-open");
    return () => document.body.classList.remove("modal-open");
  }, []);

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      // Behoud bestaande decor-waarde (server accepteert dezelfde format).
      const decor = me?.avatar_decor ?? "none|none|0";
      await client().setAvatar(color, icon, decor);
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
        className="w-full max-w-md brut-card bg-paper shadow-brutLg p-4 rounded-none
                   max-h-dvh flex flex-col"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-2xl uppercase">jouw avatar</h2>
          <button type="button" onClick={onClose} aria-label="sluiten"
            className="brut-btn bg-ink text-paper !py-2 !px-4 text-lg">✕</button>
        </div>

        {/* Preview */}
        <div className="flex justify-center my-3">
          <Avatar userId={null} size="xl"
            override={{ color, icon, decor: me?.avatar_decor ?? "none|none|0" }} />
        </div>

        <div className="overflow-y-auto -mx-1 px-1">
          {/* Kleur */}
          <Section label="kleur">
            <div className="grid grid-cols-8 gap-1.5">
              {ALLOWED_AVATAR_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  aria-pressed={color === c}
                  className={`${TONE_BG[c]} aspect-square border-4 border-ink shadow-brutSm
                    ${color === c ? "ring-4 ring-ink" : ""}
                    active:translate-x-[2px] active:translate-y-[2px] transition-transform`}
                />
              ))}
            </div>
          </Section>

          {/* Icon */}
          <Section label="icoon">
            <div className="grid grid-cols-8 gap-1">
              {ALLOWED_AVATAR_ICONS.map((i) => (
                <button key={i} type="button" onClick={() => setIcon(i)}
                  aria-pressed={icon === i}
                  className={`aspect-square border-2 border-ink text-xl
                    ${icon === i ? "bg-ink text-paper" : "bg-paper"}
                    active:translate-x-[2px] active:translate-y-[2px] transition-transform`}
                >{i}</button>
              ))}
            </div>
          </Section>

          {/* Positie op het veld */}
          <Section label="jouw positie">
            <div className="grid grid-cols-2 gap-2">
              {ALLOWED_POSITIONS.map((p) => {
                const active = position === p;
                return (
                  <button key={p} type="button" onClick={() => setPosition(p)}
                    aria-pressed={active}
                    className={`flex items-center gap-2 border-4 border-ink py-2 px-3
                      font-display uppercase text-sm shadow-brutSm
                      ${active ? "bg-ink text-paper" : "bg-paper"}
                      active:translate-x-[2px] active:translate-y-[2px] transition-transform`}
                  >
                    <span className="text-xl leading-none" aria-hidden>
                      {POSITION_ICON[p]}
                    </span>
                    <span className="truncate">{POSITION_LABELS[p]}</span>
                  </button>
                );
              })}
            </div>
            {!position && (
              <p className="text-[10px] font-bold uppercase tracking-widest opacity-60 mt-2">
                kies een positie zodat je in de juiste linie komt te staan
              </p>
            )}
          </Section>
        </div>

        {err && (
          <p className="brut-card bg-hot text-paper p-2 mt-3 mb-2 font-bold text-sm">{err}</p>
        )}
        <BrutalButton onClick={save} disabled={busy} variant="hot" block size="lg">
          {busy ? "opslaan…" : "opslaan"}
        </BrutalButton>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <p className="text-xs font-bold uppercase tracking-widest mb-2">{label}</p>
      {children}
    </div>
  );
}
