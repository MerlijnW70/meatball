/**
 * Toont inkomende user-reacties als een grote, opvallende brutalism-popper
 * in het midden van het scherm. Geen opt-in nodig: als je een reactie krijgt,
 * zie je'm meteen.
 *
 * - Negeert reacties die al bestonden toen jij de app opende (geen replay-spam).
 * - Stapelt meerdere reacties; elk verdwijnt na ~3.5s met brutalism bounce.
 */
import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";

type ShownItem = { id: bigint; emoji: string; fromName: string };

const TTL_MS = 3500;

export function ReactionOverlay() {
  const me = useStore((s) => s.session.me);
  const reactions = useStore((s) => s.reactions);
  const users = useStore((s) => s.users);
  const [queue, setQueue] = useState<ShownItem[]>([]);
  const highReaction = useRef<bigint | null>(null);

  useEffect(() => {
    if (!me) return;
    if (highReaction.current === null) {
      let max = 0n;
      for (const r of reactions.values()) if (r.id > max) max = r.id;
      highReaction.current = max;
      return;
    }

    let newMax = highReaction.current;
    const fresh: ShownItem[] = [];
    for (const r of reactions.values()) {
      if (r.id <= highReaction.current) continue;
      if (r.to_user_id !== me.id) {
        if (r.id > newMax) newMax = r.id;
        continue;
      }
      const fromName = users.get(r.from_user_id.toString())?.screen_name ?? "iemand";
      fresh.push({ id: r.id, emoji: r.emoji, fromName });
      if (r.id > newMax) newMax = r.id;
    }
    if (fresh.length > 0) {
      highReaction.current = newMax;
      enqueue(fresh);
    } else if (newMax > highReaction.current) {
      highReaction.current = newMax;
    }
  }, [me, reactions, users]);

  function enqueue(items: ShownItem[]) {
    setQueue((prev) => [...prev, ...items]);
    items.forEach((it) => {
      setTimeout(() => {
        setQueue((prev) => prev.filter((x) => x.id !== it.id));
      }, TTL_MS);
    });
  }

  if (queue.length === 0) return null;

  return (
    <div
      className="fixed inset-x-0 z-[70] flex flex-col items-center gap-3 pointer-events-none px-4"
      style={{ top: "max(4rem, calc(env(safe-area-inset-top) + 2rem))" }}
    >
      {queue.map((it, i) => (
        <div
          key={it.id.toString()}
          className="pointer-events-auto brut-card bg-paper shadow-brutLg
                     flex items-center gap-3 pl-3 pr-5 py-3 w-full max-w-sm"
          style={{
            animation: "reactionpop 0.45s cubic-bezier(.2,1.4,.4,1)",
            transform: `rotate(${(i % 2 === 0 ? -1 : 1) * 2}deg)`,
          }}
        >
          <div
            className="brut-card w-16 h-16 flex items-center justify-center
                       shadow-brutSm text-4xl shrink-0 bg-pop"
            style={{ animation: "reactionwiggle 0.9s ease-in-out 2" }}
          >
            {it.emoji}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-widest opacity-70">
              je kreeg een reactie
            </p>
            <p className="font-display text-2xl uppercase leading-tight truncate">
              {it.fromName}
            </p>
            <p className="text-xs font-bold uppercase tracking-wider mt-0.5">
              stuurde jou {it.emoji}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
