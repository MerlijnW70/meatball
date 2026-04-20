import { useStore } from "../store";

/**
 * Wacht tot `predicate(state)` iets anders dan `undefined` teruggeeft,
 * of tot de timeout verstrijkt. Gebruikt zustand.subscribe zodat we
 * direct reageren op de server-echo van een reducer.
 */
export function waitFor<T>(
  predicate: (state: ReturnType<typeof useStore.getState>) => T | undefined,
  timeoutMs = 3000,
): Promise<T | null> {
  return new Promise((resolve) => {
    const hit = predicate(useStore.getState());
    if (hit !== undefined) return resolve(hit);

    const unsub = useStore.subscribe((state) => {
      const v = predicate(state);
      if (v !== undefined) {
        unsub();
        clearTimeout(t);
        resolve(v);
      }
    });
    const t = setTimeout(() => { unsub(); resolve(null); }, timeoutMs);
  });
}
