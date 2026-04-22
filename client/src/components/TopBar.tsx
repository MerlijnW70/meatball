import { ReactNode, useEffect, useRef, useState } from "react";
import { go } from "../router";
import { useStore } from "../store";
import { useUnreadReactionsCount } from "../hooks";
import { Avatar } from "./Avatar";

interface Props {
  title: string;
  sub?: string;
  back?: string;
  right?: ReactNode;
  /** Verberg de standaard profiel-avatar-knop (bv. op de Profile-page zelf). */
  hideProfile?: boolean;
  /** Legacy prop — de teams-shortcut bestaat niet meer maar sommige callers
   *  geven 'm nog. Negeren. */
  hideCrews?: boolean;
}

/**
 * Fixed header die altijd in beeld blijft terwijl de rest van de pagina
 * eronderdoor scrollt. We renderen een onzichtbare spacer-sibling die
 * via ResizeObserver automatisch dezelfde hoogte aanneemt als de header
 * (notch + inhoud beïnvloeden de hoogte per device). `position: sticky`
 * gaf op iOS Safari last van overscroll-bounce waardoor 'ie soms even
 * "los" leek — fixed + spacer lost dat op.
 */
export function TopBar({ title, sub, back, right, hideProfile, hideCrews: _hideCrews }: Props) {
  const me = useStore((s) => s.session.me);
  const unread = useUnreadReactionsCount();
  const showAvatar = !hideProfile && me;

  const headerRef = useRef<HTMLElement>(null);
  // `null` tot eerste meting → spacer gebruikt CSS-calc-fallback zodat er
  // geen layout-shift is op de eerste paint.
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const update = () => setHeight(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    // Rotatie/inset-wijziging op iOS triggert niet altijd de ResizeObserver.
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return (
    <>
      <header
        ref={headerRef}
        className="fixed top-0 left-0 right-0 z-30 border-b-4 border-ink bg-pop
                   safe-top px-4 pb-3 flex items-center gap-3"
        style={{
          // Force GPU-compositing layer: voorkomt dat iOS Safari de header
          // per scroll-frame opnieuw rasterizeert wat scroll hakkelig voelt.
          transform: "translateZ(0)",
          willChange: "transform",
          // Isoleert layout — scroll re-layouts van content beïnvloeden
          // de header niet (en vice versa).
          contain: "layout paint",
        }}
      >
        {back !== undefined && (
          <button
            type="button"
            onClick={() => go(back)}
            className="shrink-0 w-10 h-10 border-4 border-ink bg-paper text-ink
                       shadow-brutSm flex items-center justify-center font-display
                       text-2xl leading-none rounded-none
                       active:translate-x-[2px] active:translate-y-[2px] transition-transform"
            aria-label="terug"
          >
            ←
          </button>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="font-display uppercase text-2xl leading-none truncate">
            {title}
          </h1>
          {sub && <p className="text-xs font-bold uppercase tracking-widest truncate">{sub}</p>}
        </div>
        {right}
        {showAvatar && (
          <button
            type="button"
            onClick={() => me && go(`/u/${me.id}`)}
            aria-label={unread > 0 ? `profiel (${unread} nieuwe)` : "jouw profiel"}
            className="relative shrink-0 active:translate-x-[2px] active:translate-y-[2px]
                       transition-transform"
          >
            <Avatar userId={me.id} size="md" className="shadow-brutSm" />
            {unread > 0 && (
              <span
                className="absolute -top-2 -right-2 brut-card bg-hot text-paper
                           text-[10px] font-display px-1.5 py-0 leading-tight
                           border-2 shadow-brutSm"
                aria-hidden
              >
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </button>
        )}
      </header>
      {/* Spacer — neemt dezelfde hoogte als de fixed header zodat content
          er netjes onder start. CSS-calc fallback (40px knop + top safe-area
          + bottom padding) voorkomt layout-shift vóór de eerste meting. */}
      <div
        aria-hidden
        style={{
          height: height ?? "calc(40px + max(0.75rem, env(safe-area-inset-top)) + 0.75rem)",
        }}
      />
    </>
  );
}
