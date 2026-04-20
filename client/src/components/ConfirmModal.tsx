/**
 * Brutalism-style confirm modal. Vervangt window.confirm().
 *
 * Gebruikt als controlled component via de `open` prop. Body krijgt
 * `modal-open` class zolang hij open staat zodat achtergrond niet scrollt.
 */
import { useEffect } from "react";
import { BrutalButton } from "./BrutalButton";

interface Props {
  open: boolean;
  title: string;
  /** Korte uitleg — ondersteunt string of JSX voor highlights. */
  body: React.ReactNode;
  /** Tekst op de bevestig-knop. Default "ok". */
  confirmLabel?: string;
  /** Tekst op de annuleer-knop. Default "annuleer". */
  cancelLabel?: string;
  /** "hot" = destructief (rood), "ink" = neutraal, default "hot". */
  variant?: "hot" | "ink" | "mint";
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmModal({
  open, title, body,
  confirmLabel = "ok", cancelLabel = "annuleer",
  variant = "hot", busy = false,
  onCancel, onConfirm,
}: Props) {
  useEffect(() => {
    if (!open) return;
    document.body.classList.add("modal-open");
    // Esc om te sluiten.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("modal-open");
      window.removeEventListener("keydown", onKey);
    };
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      onClick={() => !busy && onCancel()}
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-ink/70 flex items-end sm:items-center
                 justify-center p-0 sm:p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md brut-card bg-paper shadow-brutLg p-5 rounded-none"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      >
        <h2 className="font-display text-2xl uppercase leading-tight">
          {title}
        </h2>
        <div className="text-sm font-bold mt-2">{body}</div>
        <div className="flex gap-2 mt-5">
          <BrutalButton onClick={onCancel} variant="paper" block disabled={busy}>
            {cancelLabel}
          </BrutalButton>
          <BrutalButton onClick={onConfirm} variant={variant} block disabled={busy}>
            {busy ? "…" : confirmLabel}
          </BrutalButton>
        </div>
      </div>
    </div>
  );
}
