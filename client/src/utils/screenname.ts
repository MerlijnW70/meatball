/**
 * Validatie en security-rules voor de screenname. Server herhaalt de
 * kritieke checks ter verdediging; dit geeft alleen directe UX-feedback.
 */
import type { User } from "../types";

const MIN = 2;
const MAX = 24;

/** Regex wordt strikt bewaakt: unicode-letters worden geweerd om homoglyph-
 *  aanval-achtige vervangingen (bv. cyrillisch "а" vs latin "a") te voorkomen. */
const VALID = /^[A-Za-z0-9_\-]+$/;

export const RESERVED_NAMES = new Set<string>([
  // technische/platform-namen
  "admin", "administrator", "root", "sysadmin", "system", "owner",
  "moderator", "mod", "support", "help", "staff",
  "bot", "robot", "api", "null", "undefined", "void", "nil", "none",
  // app-specifiek
  "meatball", "meatballs", "kantine", "official", "officieel",
  // placeholders
  "test", "testuser", "anoniem", "anonymous", "gast", "guest", "user",
  "me", "jij", "jezelf",
]);

/** Voorkom dat 'admin' / 'kantine' etc. in de naam zitten (substring-match op
 *  normalized lowercase). Min 3 tekens in blocklist-entry om false positives
 *  ('mod' → 'mode' etc.) te beperken. */
const BLOCKED_SUBSTRINGS = [
  "administrator", "meatball", "kantine",
];

export type ValidationState =
  | { kind: "empty" }
  | { kind: "valid" }
  | { kind: "invalid"; message: string };

export function validateScreenname(
  raw: string,
  users: Map<string, User>,
  currentIdentity: string | null,
): ValidationState {
  const t = raw.trim();
  if (t.length === 0) return { kind: "empty" };

  if (t.length < MIN)
    return { kind: "invalid", message: `Minimaal ${MIN} tekens` };
  if (t.length > MAX)
    return { kind: "invalid", message: `Maximaal ${MAX} tekens` };
  if (!VALID.test(t))
    return { kind: "invalid", message: "Alleen a–z, 0–9, _ en - toegestaan" };
  if (/^[-_]|[-_]$/.test(t))
    return { kind: "invalid", message: "Mag niet beginnen of eindigen met _ of -" };

  const key = t.toLowerCase();
  if (RESERVED_NAMES.has(key))
    return { kind: "invalid", message: "Dit woord is gereserveerd" };
  if (BLOCKED_SUBSTRINGS.some((b) => key.includes(b)))
    return { kind: "invalid", message: "Niet toegestaan" };

  // Uniqueness check in de lokale cache (server is de bron van waarheid).
  for (const u of users.values()) {
    if (currentIdentity && u.identity === currentIdentity) continue;
    if (u.screen_name_key === key)
      return { kind: "invalid", message: "Deze screenname is al bezet" };
  }

  return { kind: "valid" };
}
