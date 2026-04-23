/**
 * Horizontale rij van "nu online"-avatars op de home.
 * Transformeert de app van een passieve feed naar een plek die
 * merkbaar lééft. Alle data is al gesubscribed (session-tabel).
 *
 * Compact: max 20 avatars in de rij, meer → "+N anderen" chip.
 * Tap een avatar → profile → daar kan je volgen / reactie sturen.
 */
import { useMemo } from "react";
import { useStore } from "../../store";
import { Avatar } from "../Avatar";
import { go } from "../../router";

const MAX_VISIBLE = 20;

export function OnlineStrip() {
  const sessions = useStore((s) => s.sessions);
  const users = useStore((s) => s.users);
  const me = useStore((s) => s.session.me);

  const online = useMemo(() => {
    const arr: { userId: bigint; connectedAt: number }[] = [];
    for (const s of sessions.values()) {
      if (s.user_id === 0n) continue; // niet-geregistreerd
      if (me && s.user_id === me.id) continue; // zelf niet tonen
      if (!users.has(s.user_id.toString())) continue; // user-row nog niet gesynct
      arr.push({ userId: s.user_id, connectedAt: s.connected_at });
    }
    // Meest recent verbonden bovenaan.
    arr.sort((a, b) => b.connectedAt - a.connectedAt);
    return arr;
  }, [sessions, users, me]);

  if (online.length === 0) return null;

  const visible = online.slice(0, MAX_VISIBLE);
  const overflow = online.length - visible.length;

  return (
    <section aria-label="nu online">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <h3 className="font-display text-sm uppercase tracking-widest flex items-center gap-2">
          <span
            className="inline-block w-1.5 h-1.5 bg-mint rounded-full"
            style={{ animation: "livepulse 1.2s ease-in-out infinite" }}
          />
          nu online
        </h3>
        <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">
          {online.length} {online.length === 1 ? "speler" : "spelers"}
        </span>
      </div>
      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1
                      [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {visible.map(({ userId }) => (
          <button
            key={userId.toString()}
            type="button"
            onClick={() => go(`/u/${userId}`)}
            aria-label="open profiel"
            className="relative shrink-0
                       active:translate-x-[1px] active:translate-y-[1px] transition-transform"
          >
            <Avatar userId={userId} size="md" className="shadow-brutSm" />
            <span
              className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-mint
                         border-2 border-ink rounded-full"
              style={{ animation: "livepulse 1.4s ease-in-out infinite" }}
              aria-hidden
            />
          </button>
        ))}
        {overflow > 0 && (
          <div className="shrink-0 flex items-center justify-center w-11 h-11
                          brut-card bg-paper !p-0 text-[10px] font-display uppercase">
            +{overflow}
          </div>
        )}
      </div>
    </section>
  );
}
