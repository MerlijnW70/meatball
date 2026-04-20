/**
 * Modal om je eigen avatar te kiezen — kleur, icon, patroon, accent, rotatie.
 * Genoeg combinaties voor honderdduizenden unieke avatars.
 */
import { useEffect, useState } from "react";
import { useStore } from "../store";
import {
  ALLOWED_AVATAR_COLORS, ALLOWED_AVATAR_ICONS, ALLOWED_AVATAR_PATTERNS,
  ALLOWED_AVATAR_ROTATIONS,
} from "../types";
import { client } from "../spacetime";
import { friendlyError } from "../utils/errors";
import {
  formatDecor, parseDecor, randomAvatar, TONE_BG,
} from "../utils/avatar";
import { BrutalButton } from "./BrutalButton";
import { Avatar } from "./Avatar";

interface Props {
  onClose: () => void;
}

export function AvatarPicker({ onClose }: Props) {
  const me = useStore((s) => s.session.me);
  const initialDecor = parseDecor(me?.avatar_decor ?? "none|none|0");

  const [color, setColor] = useState<string>(me?.avatar_color ?? "pop");
  const [icon, setIcon] = useState<string>(me?.avatar_icon ?? "🥩");
  const [pattern, setPattern] = useState<string>(initialDecor.pattern);
  const [rotation, setRotation] = useState<string>(initialDecor.rotation);
  // Accent uitgeschakeld als optie — altijd "none".
  const accent = "none";

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    document.body.classList.add("modal-open");
    return () => document.body.classList.remove("modal-open");
  }, []);

  const decor = formatDecor({ pattern, accent, rotation });

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await client().setAvatar(color, icon, decor);
      onClose();
    } catch (e) {
      setErr(friendlyError(e));
    } finally { setBusy(false); }
  };

  const shuffle = () => {
    const r = randomAvatar();
    setColor(r.color); setIcon(r.icon);
    setPattern(r.pattern); setRotation(r.rotation);
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
          <h2 className="font-display text-2xl uppercase">avatar</h2>
          <div className="flex gap-2">
            <button type="button" onClick={shuffle}
              className="brut-btn bg-pop text-ink !py-2 !px-3 text-base"
              aria-label="random">🎲</button>
            <button type="button" onClick={onClose} aria-label="sluiten"
              className="brut-btn bg-ink text-paper !py-2 !px-4 text-lg">✕</button>
          </div>
        </div>

        {/* Preview */}
        <div className="flex justify-center my-3">
          <Avatar userId={null} size="xl" override={{ color, icon, decor }} />
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

          {/* Patroon */}
          <Section label="patroon">
            <div className="grid grid-cols-6 gap-1.5">
              {ALLOWED_AVATAR_PATTERNS.map((p) => (
                <button key={p} type="button" onClick={() => setPattern(p)}
                  aria-pressed={pattern === p}
                  className={`text-[9px] font-bold uppercase tracking-widest
                    border-2 border-ink py-1.5
                    ${pattern === p ? "bg-ink text-paper" : "bg-paper"}
                    active:translate-x-[2px] active:translate-y-[2px] transition-transform`}
                >{p === "none" ? "geen" : p}</button>
              ))}
            </div>
          </Section>

          {/* Rotatie */}
          <Section label="rotatie">
            <div className="grid grid-cols-4 gap-1.5">
              {ALLOWED_AVATAR_ROTATIONS.map((r) => (
                <button key={r} type="button" onClick={() => setRotation(r)}
                  aria-pressed={rotation === r}
                  className={`text-sm font-bold border-2 border-ink py-2
                    ${rotation === r ? "bg-ink text-paper" : "bg-paper"}
                    active:translate-x-[2px] active:translate-y-[2px] transition-transform`}
                >{r}°</button>
              ))}
            </div>
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
