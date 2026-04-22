/**
 * Client-side cache voor de eigen voorspelling van de gebruiker.
 *
 * De server houdt `MatchPrediction.home_score/away_score` op 0 totdat de
 * Trainer de echte uitslag invoert, zodat team-leden elkaars tips niet
 * kunnen zien vóór kickoff. De gebruiker ziet zijn eigen tip alleen
 * lokaal — hier opgeslagen per (user, fixture) in localStorage.
 *
 * Na reveal (`prediction.scored === true`) staan de scores alsnog in de
 * public tabel; lees die dan direct van de server en negeer de cache.
 */

const KEY_PREFIX = "meatball:pred";

interface CachedPrediction {
  home: number;
  away: number;
  ts: number;
}

function storageKey(userId: bigint, fixtureId: bigint): string {
  return `${KEY_PREFIX}:${userId.toString()}:${fixtureId.toString()}`;
}

/** Sla op dat deze user voor deze fixture {home, away} heeft voorspeld. */
export function savePredictionCache(
  userId: bigint,
  fixtureId: bigint,
  home: number,
  away: number,
): void {
  try {
    const payload: CachedPrediction = { home, away, ts: Date.now() };
    localStorage.setItem(storageKey(userId, fixtureId), JSON.stringify(payload));
  } catch {
    // localStorage niet beschikbaar (private mode / quota full) → no-op.
  }
}

/** Lees de eerder gecachede voorspelling. `null` als er niks staat of
 *  de waarden corrupt zijn. */
export function loadPredictionCache(
  userId: bigint,
  fixtureId: bigint,
): { home: number; away: number } | null {
  try {
    const raw = localStorage.getItem(storageKey(userId, fixtureId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedPrediction>;
    if (
      typeof parsed?.home !== "number" ||
      typeof parsed?.away !== "number" ||
      !Number.isFinite(parsed.home) ||
      !Number.isFinite(parsed.away)
    ) {
      return null;
    }
    return { home: parsed.home, away: parsed.away };
  } catch {
    return null;
  }
}

/** Ruim de cache op zodra de uitslag is ingevoerd (server heeft nu de
 *  scores in de public tabel). Houdt localStorage klein. */
export function clearPredictionCache(userId: bigint, fixtureId: bigint): void {
  try {
    localStorage.removeItem(storageKey(userId, fixtureId));
  } catch {
    // ignore
  }
}
