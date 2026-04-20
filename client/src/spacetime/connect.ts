/**
 * SpacetimeDB 2.x verbinding opzetten. Bij mock-mode slaat dit alles over
 * en installeert een in-memory store-writer.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useStore } from "../store";
import { makeClient } from "./client-factory";
import { installMockSeed } from "./mock";
import { setClient } from "./singleton";
import { setActiveConnection, subscribeClub, subscribeGlobal, unsubscribeClub } from "./subscriptions";
import { wireTables } from "./tables";
import { TOKEN_KEY } from "./types";

export async function connect(): Promise<void> {
  const host = import.meta.env.VITE_STDB_HOST ?? "ws://localhost:3000";
  const dbName = import.meta.env.VITE_STDB_MODULE ?? "meatball";

  if (import.meta.env.VITE_MOCK === "1") {
    console.warn("[spacetime] mock-mode actief");
    useStore.getState().setSession({ connected: true, identity: "mock" });
    installMockSeed();
    return;
  }

  let bindings: typeof import("../module_bindings");
  try {
    bindings = await import("../module_bindings");
  } catch (err) {
    console.error("[spacetime] kon ./module_bindings niet laden. Draai `npm run generate`.");
    throw err;
  }

  const { DbConnection } = bindings;

  return new Promise<void>((resolve, reject) => {
    const savedToken = localStorage.getItem(TOKEN_KEY) ?? undefined;

    DbConnection.builder()
      .withUri(host)
      .withDatabaseName(dbName)
      .withToken(savedToken)
      .onConnect((conn: any, identity: any, token: string) => {
        localStorage.setItem(TOKEN_KEY, token);
        setClient(makeClient(conn));
        setActiveConnection(conn);
        wireTables(conn);
        subscribeGlobal(conn);

        // Als we al een clubId hebben uit persisted session → direct scoped subscriben.
        const initialClubId = useStore.getState().session.clubId;
        if (initialClubId) subscribeClub(conn, initialClubId);

        // Watch voor club-wissels; re-subscribe scoped, SDK levert deletes voor oud.
        let lastClubId: bigint | null = initialClubId ?? null;
        useStore.subscribe((state) => {
          const cid = state.session.clubId;
          if (cid === lastClubId) return;
          lastClubId = cid;
          if (cid) subscribeClub(conn, cid);
          else unsubscribeClub();
        });

        useStore.getState().setSession({
          connected: true,
          identity: identity.toHexString(),
        });
        resolve();
      })
      .onConnectError((_ctx: any, err: Error) => {
        console.error("[spacetime] connect error", err);
        reject(err);
      })
      .onDisconnect(() => {
        useStore.getState().setSession({ connected: false });
      })
      .build();
  });
}
