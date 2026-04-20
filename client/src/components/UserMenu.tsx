/**
 * Klik op een screenname → popup met reactie-emojis. Eén tap op een
 * emoji stuurt'm direct via `sendReaction`. Rate-limit zit server-side.
 *
 * De popover zelf wordt via React-portal op <body> gerenderd zodat geen
 * enkele `overflow:hidden`-ancestor 'm af kan knippen, en we'm met
 * viewport-coords kunnen positioneren.
 */
import { MouseEvent, useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { ALLOWED_REACTIONS } from "../types";
import { client } from "../spacetime";
import { useStore } from "../store";
import { useIsFollowing, useIsUserOnline } from "../hooks";
import { friendlyError } from "../utils/errors";
import { go } from "../router";

// Module-level registry: alle UserMenu-closers. Slechts één popup kan tegelijk
// open staan. Dit fixt het "tweede avatar opent niet" probleem waar de close-
// outside handler racet met de nieuwe click.
const activeClosers = new Set<() => void>();
function closeAllExcept(keep: () => void) {
  for (const c of activeClosers) {
    if (c !== keep) c();
  }
}

interface Props {
  userId: bigint;
  name: string;
  className?: string;
  /** Als true → geen default underline/bold styling (voor chips). */
  bare?: boolean;
  /** Vervang de standaard naam-button door custom content (bv. een Avatar). */
  trigger?: React.ReactNode;
}

export function UserMenu({ userId, name, className = "", bare = false, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const me = useStore((s) => s.session.me);
  const isSelf = me?.id === userId;
  const following = useIsFollowing(userId);
  const online = useIsUserOnline(userId);

  // Positioneer popover; flip naar boven als 'ie onder niet past (kleine
  // viewports, iPhone SE). Twee-fase: eerst onder, dan meet echte hoogte
  // en flip indien nodig.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const POPW = 260;
    // Start-estimate (echte hoogte meten we na eerste render via popRef).
    const POPH_ESTIMATE = 150;
    const left = Math.min(
      window.innerWidth - POPW - 8,
      Math.max(8, rect.left),
    );
    const spaceBelow = window.innerHeight - rect.bottom;
    const fitsBelow = spaceBelow >= POPH_ESTIMATE + 12;
    const top = fitsBelow
      ? rect.bottom + 6
      : Math.max(8, rect.top - POPH_ESTIMATE - 6);
    setCoords({ top, left });
  }, [open]);

  // Correctie na mount: als popRef bekend is kunnen we exact refitten.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !popRef.current || !coords) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const popH = popRef.current.offsetHeight;
    const spaceBelow = window.innerHeight - rect.bottom;
    const fitsBelow = spaceBelow >= popH + 12;
    const desiredTop = fitsBelow
      ? rect.bottom + 6
      : Math.max(8, rect.top - popH - 6);
    // Alleen updaten als significant off — voorkomt render-loop.
    if (Math.abs(desiredTop - coords.top) > 2) {
      setCoords((c) => (c ? { ...c, top: desiredTop } : c));
    }
  }, [open, coords]);

  // Klik-buiten sluit de popover (zowel trigger als popover).
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: Event) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (popRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc);
    window.addEventListener("scroll", () => setOpen(false), { once: true });
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
    };
  }, [open]);

  const closeSelf = useCallback(() => setOpen(false), []);

  const toggle = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (isSelf) return; // geen popup voor jezelf (je kan toch niks doen)
    // Sluit álle andere popups eerst zodat alleen de nieuwe open staat.
    closeAllExcept(closeSelf);
    setOpen((v) => !v);
    setErr(null);
  };

  // Registreer/deregistreer deze instance als actieve closer zodat andere
  // UserMenu's ons kunnen sluiten wanneer zij openen.
  useEffect(() => {
    if (!open) return;
    activeClosers.add(closeSelf);
    return () => { activeClosers.delete(closeSelf); };
  }, [open, closeSelf]);

  const send = async (emoji: string, e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await client().sendReaction(userId, emoji);
      setOpen(false);
    } catch (x) {
      setErr(friendlyError(x));
    } finally {
      setBusy(false);
    }
  };

  const toggleFollow = async (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await client().toggleFollow(userId);
    } catch (x) {
      setErr(friendlyError(x));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        className={
          trigger
            // Trigger-mode (avatar-button): garanteer 44×44 tap-zone met
            // inline-flex centering, zelfs als de avatar zelf kleiner is.
            ? `inline-flex items-center justify-center min-w-[44px] min-h-[44px]
               touch-manipulation
               ${isSelf ? "cursor-default opacity-80" : "cursor-pointer"} ${className}`
            : bare
              ? `touch-manipulation
                 ${isSelf ? "cursor-default opacity-80" : "cursor-pointer"} ${className}`
              : `font-bold underline decoration-2 underline-offset-2 touch-manipulation
                 ${isSelf ? "cursor-default opacity-80" : "cursor-pointer"} ${className}`
        }
        aria-haspopup={!isSelf}
        aria-expanded={open}
        aria-label={online ? `${name} (online)` : name}
      >
        {trigger ?? (
          <>
            <span
              className={`inline-block w-1.5 h-1.5 mr-1.5 align-middle border border-ink
                ${online ? "bg-mint" : "bg-ink/30"}`}
            />
            {name}{isSelf && !bare ? " (jij)" : ""}
          </>
        )}
      </button>

      {open && !isSelf && coords && createPortal(
        <div
          ref={popRef}
          onClick={(e) => e.stopPropagation()}
          style={{ position: "fixed", top: coords.top, left: coords.left, zIndex: 60 }}
          className="brut-card bg-paper p-2 shadow-brut flex flex-col gap-1"
        >
          <div className="flex gap-1 items-center">
            {ALLOWED_REACTIONS.map((emo) => (
              <button
                key={emo}
                type="button"
                disabled={busy}
                onClick={(e) => send(emo, e)}
                aria-label={`stuur ${emo}`}
                className="w-11 h-11 border-2 border-ink bg-paper text-xl
                           hover:bg-pop active:translate-x-[2px] active:translate-y-[2px]
                           transition-transform"
              >
                {emo}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              disabled={busy}
              onClick={toggleFollow}
              aria-pressed={following}
              className={`flex-1 border-2 border-ink py-1.5 text-xs font-display uppercase
                active:translate-x-[2px] active:translate-y-[2px] transition-transform
                ${following ? "bg-mint text-ink" : "bg-paper"}`}
            >
              {following ? "✓ volgt" : "+ volg"}
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setOpen(false); go(`/u/${userId}`); }}
              className="flex-1 border-2 border-ink py-1.5 text-xs font-display uppercase
                         bg-paper active:translate-x-[2px] active:translate-y-[2px] transition-transform"
            >
              profiel →
            </button>
          </div>
          {err && (
            <p className="bg-hot text-paper text-[10px] font-bold uppercase tracking-widest px-2 py-1 border-2 border-ink">
              {err}
            </p>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
