/**
 * Invite-code generatie + client-side cache.
 *
 * De server genereert de code niet meer zelf (dat vereiste een publieke
 * reveal-tabel die voor iedereen zichtbaar was). In plaats daarvan maakt
 * de client een willekeurige code en stuurt die mee als reducer-argument.
 * De server slaat 'm alleen in de private `invite_secret` tabel, zodat
 * andere leden nooit plaintext zien.
 *
 * De eigen code wordt 5 min in localStorage bewaard zodat de maker 'm
 * kan kopiëren / delen; daarna is 'ie weg en moet er een nieuwe worden
 * aangemaakt (UX-parity met de oude reveal-TTL).
 */

// Moet identiek zijn aan server/src/helpers.rs:INVITE_ALPHA + INVITE_CODE_LEN.
const INVITE_ALPHA = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
const INVITE_CODE_LEN = 6;
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Genereer een willekeurige 6-char code uit 30-alpha. Gebruikt
 *  `crypto.getRandomValues` zodat uitkomsten cryptografisch random zijn. */
export function generateInviteCode(): string {
  const bytes = new Uint8Array(INVITE_CODE_LEN);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < INVITE_CODE_LEN; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let out = "";
  for (const b of bytes) {
    out += INVITE_ALPHA[b % INVITE_ALPHA.length];
  }
  return out;
}

function storageKey(userId: bigint, groupId: bigint): string {
  return `meatball:invite:${userId.toString()}:${groupId.toString()}`;
}

interface CachedInvite {
  code: string;
  ts: number;
}

/** Bewaar de code lokaal zodat de maker 'm kan zien / kopiëren tot TTL. */
export function cacheInviteCode(
  userId: bigint,
  groupId: bigint,
  code: string,
): void {
  try {
    const payload: CachedInvite = { code, ts: Date.now() };
    localStorage.setItem(storageKey(userId, groupId), JSON.stringify(payload));
  } catch {
    // ignore — private mode / quota full → simply no caching
  }
}

/** Lees de eerder gecachede code terug. `null` als er niets staat of de
 *  TTL verstreken is. Ruimt stale entries op wanneer ze verlopen zijn. */
export function loadInviteCode(
  userId: bigint,
  groupId: bigint,
): string | null {
  try {
    const raw = localStorage.getItem(storageKey(userId, groupId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedInvite>;
    if (typeof parsed?.code !== "string" || typeof parsed?.ts !== "number") {
      return null;
    }
    if (Date.now() - parsed.ts > CACHE_TTL_MS) {
      localStorage.removeItem(storageKey(userId, groupId));
      return null;
    }
    return parsed.code;
  } catch {
    return null;
  }
}

/** Ruim de cache op (bv. na revoke van de invite). */
export function clearInviteCode(userId: bigint, groupId: bigint): void {
  try {
    localStorage.removeItem(storageKey(userId, groupId));
  } catch {
    // ignore
  }
}
