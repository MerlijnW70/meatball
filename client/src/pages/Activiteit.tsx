/**
 * Publieke activity feed: wat er in heel NL gebeurt rond gehaktballen.
 * Server push't per register/rating/climb/etc een ActivityEvent; hier
 * tonen we ze nieuw-eerst met context (wie, welke kantine, welke snack).
 */
import { useMemo } from "react";
import { useStore } from "../store";
import { TopBar } from "../components/TopBar";
import { BrutalCard } from "../components/BrutalCard";
import { Avatar } from "../components/Avatar";
import { fmtRelative } from "../utils/format";
import { go } from "../router";
import type { ActivityEvent, ActivityKind } from "../types";

const KIND_ICON: Record<string, string> = {
  UserRegistered: "🥩",
  ClubAdded: "🏟️",
  SnackAdded: "🍽️",
  RatingSubmitted: "⭐",
  SnackClimbed: "🚀",
};

const KIND_TONE: Record<string, string> = {
  UserRegistered: "bg-pop",
  ClubAdded: "bg-mint",
  SnackAdded: "bg-sky text-paper",
  RatingSubmitted: "bg-paper",
  SnackClimbed: "bg-hot text-paper",
};

function kindKey(k: ActivityKind): string {
  return k.tag;
}

export function ActiviteitPage() {
  const activity = useStore((s) => s.activity);
  const users = useStore((s) => s.users);
  const clubs = useStore((s) => s.clubs);

  const events = useMemo<ActivityEvent[]>(() => {
    return Array.from(activity.values())
      .sort((a, b) => Number(b.created_at - a.created_at))
      .slice(0, 100);
  }, [activity]);

  return (
    <div className="min-h-dvh flex flex-col">
      <TopBar title="Activiteit" back="/home" />
      <main className="flex-1 px-4 pt-5 pb-4 flex flex-col gap-3">
        <p className="text-[11px] font-bold uppercase tracking-widest opacity-70">
          Wat er vandaag in Nederland rond gehaktballen gebeurt — recente 100 events
        </p>

        {events.length === 0 ? (
          <BrutalCard className="!p-4 text-center">
            <p className="font-display text-xl uppercase leading-tight">
              nog niks gebeurd
            </p>
            <p className="text-xs font-bold opacity-70 mt-2">
              Zodra iemand een gehaktbal raat of een kantine toevoegt zie je 't hier.
            </p>
          </BrutalCard>
        ) : (
          <div className="flex flex-col gap-2">
            {events.map((e) => {
              const k = kindKey(e.kind);
              const icon = KIND_ICON[k] ?? "•";
              const tone = KIND_TONE[k] ?? "bg-paper";
              const user = e.user_id !== 0n
                ? users.get(e.user_id.toString())
                : undefined;
              const club = e.club_id !== 0n
                ? clubs.get(e.club_id.toString())
                : undefined;
              return (
                <BrutalCard
                  key={e.id.toString()}
                  className={`!p-0 overflow-hidden`}
                >
                  <div className="flex items-stretch">
                    <div
                      className={`shrink-0 w-12 flex items-center justify-center
                                  font-display text-2xl border-r-4 border-ink ${tone}`}
                    >
                      {icon}
                    </div>
                    <div className="flex-1 min-w-0 p-2.5 flex items-center gap-2">
                      {user && (
                        <button
                          type="button"
                          onClick={() => go(`/u/${user.id}`)}
                          aria-label="open profiel"
                          className="shrink-0 active:translate-x-[1px] active:translate-y-[1px]
                                     transition-transform"
                        >
                          <Avatar userId={user.id} size="sm" />
                        </button>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-bold leading-tight truncate">{e.text}</p>
                        <p className="text-[10px] font-bold uppercase tracking-widest opacity-60 mt-0.5">
                          {fmtRelative(e.created_at)}
                          {club && (
                            <>
                              {" · "}
                              <button
                                type="button"
                                onClick={() => go(`/club/${club.id}`)}
                                className="underline decoration-2 underline-offset-2
                                           hover:opacity-100"
                              >
                                {club.name}
                              </button>
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                </BrutalCard>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
