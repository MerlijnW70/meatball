/**
 * Vaste banner onderaan als de SpacetimeDB-verbinding wegvalt.
 * Verdwijnt automatisch zodra we weer verbonden zijn.
 */
import { useEffect, useState } from "react";
import { useStore } from "../store";

export function ConnectionBanner() {
  const connected = useStore((s) => s.session.connected);
  const [wasConnected, setWasConnected] = useState(false);

  useEffect(() => { if (connected) setWasConnected(true); }, [connected]);

  // Alleen zichtbaar nadat we ooit verbinding hebben gehad en die nu weg is.
  if (connected || !wasConnected) return null;

  return (
    <div
      className="fixed left-0 right-0 z-50 px-4 pointer-events-none"
      style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
    >
      <div className="brut-card bg-hot text-paper pointer-events-auto
                      max-w-md mx-auto px-4 py-3 flex items-center gap-3">
        <span className="text-xl">⚠️</span>
        <div className="flex-1 min-w-0">
          <p className="font-display uppercase leading-tight">verbinding kwijt</p>
          <p className="text-[11px] font-bold uppercase tracking-widest opacity-90">
            proberen te herverbinden…
          </p>
        </div>
        <button
          type="button"
          onClick={() => location.reload()}
          className="brut-btn bg-paper text-ink !py-2 !px-3 text-xs"
        >
          reload
        </button>
      </div>
    </div>
  );
}
