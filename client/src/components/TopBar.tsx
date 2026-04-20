import { ReactNode } from "react";
import { go } from "../router";
import { useStore } from "../store";
import { useMyGroups, useUnreadReactionsCount } from "../hooks";
import { Avatar } from "./Avatar";

interface Props {
  title: string;
  sub?: string;
  back?: string;
  right?: ReactNode;
  /** Verberg de standaard profiel-avatar-knop (bv. op de Profile-page zelf). */
  hideProfile?: boolean;
  /** Verberg de teams-shortcut (bv. op /groups zelf of op team-detail). */
  hideCrews?: boolean;
}

export function TopBar({ title, sub, back, right, hideProfile, hideCrews }: Props) {
  const me = useStore((s) => s.session.me);
  const unread = useUnreadReactionsCount();
  const myGroups = useMyGroups();
  const showAvatar = !hideProfile && me;
  const showCrews = !hideCrews && me;
  const crewCount = myGroups.length;

  return (
    <header
      className="sticky top-0 z-10 border-b-4 border-ink bg-pop
                 safe-top px-4 pb-3 flex items-center gap-3"
    >
      {back !== undefined && (
        <button
          type="button"
          onClick={() => go(back)}
          className="brut-btn bg-ink text-paper !py-2 !px-3 text-sm shadow-brutSm"
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
      {showCrews && (
        <button
          type="button"
          onClick={() => go("/groups")}
          aria-label={crewCount > 0 ? `teams (${crewCount})` : "teams"}
          className="relative shrink-0 w-10 h-10 border-4 border-ink bg-mint text-ink
                     shadow-brutSm flex items-center justify-center rounded-none
                     active:translate-x-[2px] active:translate-y-[2px] transition-transform"
          style={{ transform: "rotate(-3deg)" }}
        >
          <span className="text-xl leading-none" aria-hidden>👥</span>
          {crewCount > 0 && (
            <span
              className="absolute -top-2 -right-2 brut-card bg-ink text-paper
                         text-[10px] font-display px-1.5 py-0 leading-tight
                         border-2 shadow-brutSm"
              style={{ transform: "rotate(3deg)" }}
              aria-hidden
            >
              {crewCount > 99 ? "99+" : crewCount}
            </span>
          )}
        </button>
      )}
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
