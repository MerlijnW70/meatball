/**
 * Eenvoudige toast-host. Elke toast leeft 5s en stapelt onderaan.
 * Toasts worden ge-emit via `toast.info(msg)` / `toast.hot(msg)`.
 *
 * Set `TOASTS_ENABLED = true` om weer zichtbaar te maken; aanroepen van
 * `toast.*` blijft altijd veilig (wordt stil geslikt + console.log).
 */
import { useEffect, useState } from "react";

const TOASTS_ENABLED = false;

type ToastKind = "info" | "hot" | "mint";
type Toast = { id: number; text: string; kind: ToastKind };

type Listener = (t: Toast) => void;
const listeners = new Set<Listener>();
let seq = 1;

export const toast = {
  info: (text: string) => emit(text, "info"),
  hot: (text: string) => emit(text, "hot"),
  mint: (text: string) => emit(text, "mint"),
};

function emit(text: string, kind: ToastKind) {
  if (!TOASTS_ENABLED) {
    console.log(`[toast:${kind}]`, text);
    return;
  }
  const t: Toast = { id: seq++, text, kind };
  listeners.forEach((l) => l(t));
}

// Max aantal toasts dat tegelijk in beeld staat. Voorkomt dat bij een
// crash-loop of subscription-error-storm de UI ondergesneeuwd raakt.
const MAX_VISIBLE = 3;

export function ToastHost() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    if (!TOASTS_ENABLED) return;
    const timers = new Map<number, ReturnType<typeof setTimeout>>();
    const drop = (id: number) => {
      const t = timers.get(id);
      if (t) { clearTimeout(t); timers.delete(id); }
      setItems((prev) => prev.filter((x) => x.id !== id));
    };
    const add: Listener = (t) => {
      setItems((prev) => {
        // Oudste eraf-drukken wanneer we over de cap zouden gaan.
        const overflow = prev.slice(0, Math.max(0, prev.length + 1 - MAX_VISIBLE));
        overflow.forEach((o) => {
          const tm = timers.get(o.id);
          if (tm) { clearTimeout(tm); timers.delete(o.id); }
        });
        const kept = prev.filter((x) => !overflow.includes(x));
        return [...kept, t];
      });
      timers.set(t.id, setTimeout(() => drop(t.id), 5000));
    };
    listeners.add(add);
    return () => {
      listeners.delete(add);
      timers.forEach((tm) => clearTimeout(tm));
      timers.clear();
    };
  }, []);

  if (!TOASTS_ENABLED) return null;
  if (items.length === 0) return null;
  return (
    <div
      className="fixed left-0 right-0 z-50 flex flex-col items-center gap-2 px-4 pointer-events-none"
      style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
    >
      {items.map((t) => (
        <div
          key={t.id}
          className={`brut-card pointer-events-auto px-4 py-3 max-w-md w-full
            animate-[slideup_0.25s_ease-out] ${toneOf(t.kind)}`}
        >
          <p className="font-display uppercase leading-tight">{t.text}</p>
        </div>
      ))}
    </div>
  );
}

const toneOf = (k: ToastKind) =>
  k === "hot"  ? "bg-hot text-paper" :
  k === "mint" ? "bg-mint text-ink"  :
                 "bg-pop text-ink";
