import { ReactNode } from "react";
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

export function TopBar({ title, sub, back, right, hideProfile, hideCrews: _hideCrews }: Props) {
  const me = useStore((s) => s.session.me);
  const unread = useUnreadReactionsCount();
  const showAvatar = !hideProfile && me;

  return (
    <header
      className="sticky top-0 z-30 border-b-4 border-ink bg-pop
                 safe-top px-4 pb-3 flex items-center gap-3"
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
  );
}
