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

export function ToastHost() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    if (!TOASTS_ENABLED) return;
    const add: Listener = (t) => {
      setItems((prev) => [...prev, t]);
      setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== t.id));
      }, 5000);
    };
    listeners.add(add);
    return () => { listeners.delete(add); };
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
