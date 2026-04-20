/**
 * Globale error-plumbing. Alle unhandled rejections + window errors
 * komen hier binnen; we loggen én laten een niet-invasieve toast zien
 * zodat de user weet dat er iets hikt i.p.v. stille stilte.
 */
import { toast } from "../components/Toast";

export function installGlobalErrorHandlers() {
  // Ongevangen Promise rejections
  window.addEventListener("unhandledrejection", (ev) => {
    const msg = extractMessage(ev.reason);
    console.error("[unhandledrejection]", ev.reason);
    toast.hot(`fout: ${truncate(msg, 80)}`);
  });

  // Uncaught exceptions
  window.addEventListener("error", (ev) => {
    // Sla script-load errors van andere origins over (cross-origin, geen info)
    if (!ev.message || ev.message === "Script error.") return;
    console.error("[window.onerror]", ev.error ?? ev.message);
    toast.hot(`fout: ${truncate(ev.message, 80)}`);
  });
}

export function friendlyError(err: unknown): string {
  const raw = extractMessage(err);
  // SpacetimeDB server-errors komen als bijv. "Geen user geregistreerd…" —
  // prima. Strip eventueel de Rust-prefix als die er ooit bij gaat zitten.
  return raw.replace(/^Error:\s*/i, "");
}

function extractMessage(e: unknown): string {
  if (!e) return "onbekende fout";
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null && "message" in e) {
    return String((e as { message: unknown }).message);
  }
  try { return JSON.stringify(e); } catch { return String(e); }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
