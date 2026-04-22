import { useEffect, useRef, useState } from "react";
import { connect } from "./spacetime";
import { useStore } from "./store";
import { match, useRoute } from "./router";
import { Loader } from "./components/Loader";
import { ToastHost, toast } from "./components/Toast";
import { ConnectionBanner } from "./components/ConnectionBanner";
import { ReactionOverlay } from "./components/ReactionOverlay";

import { SplashPage } from "./pages/Splash";
import { OnboardScreennamePage } from "./pages/OnboardScreenname";
import { AddClubPage } from "./pages/AddClub";
import { FeedPage } from "./pages/Feed";
import { SeizoenPage } from "./pages/Seizoen";
import { WedstrijdenPage } from "./pages/Wedstrijden";
import { RanglijstPage } from "./pages/Ranglijst";
import { ClubViewPage } from "./pages/ClubView";
import { ProfilePage } from "./pages/Profile";
import { GroupDetailPage } from "./pages/GroupDetail";
import { JoinInvitePage } from "./pages/JoinInvite";
import { MatchPage } from "./pages/Match";
import { TeamSearchPage } from "./pages/TeamSearch";

export default function App() {
  const [route] = useRoute();
  const [err, setErr] = useState<string | null>(null);
  const connected = useStore((s) => s.session.connected);
  const identity = useStore((s) => s.session.identity);
  const users = useStore((s) => s.users);
  const session = useStore((s) => s.session);
  const setMe = useStore((s) => s.setMe);

  // Eerste connect
  useEffect(() => {
    connect().catch((e) => setErr(String(e)));
  }, []);

  // Houd session.me gesynchroniseerd met de user-row uit de store. Raakt
  // anders stale na rename / avatar-change (server update komt binnen via
  // subscription, users-map wordt ge-upsert met nieuwe reference, maar
  // session.me bleef hangen op de oude snapshot).
  useEffect(() => {
    if (!identity) return;
    const fresh = Array.from(users.values()).find((u) => u.identity === identity);
    if (!fresh) return;
    if (session.me === fresh) return; // reference-equal na eerder setMe
    setMe(fresh);
  }, [users, identity, session.me, setMe]);

  // Toasts voor realtime events die relevant zijn voor jouw club.
  // `lastSeen` via ref zodat 'ie persist across re-subscriptions (clubId/me
  // change). Zonder ref resette 'ie bij elke effect-re-run naar 0n, waardoor
  // bestaande events opnieuw toast'ten na een club-switch.
  const lastSeenActivityRef = useRef<bigint>(0n);
  useEffect(() => {
    if (!connected) return;
    // Bij eerste run: initialiseer op huidige max-id zodat pre-existing
    // activity (events van voor deze sessie) niet alsnog als "nieuw" toasten.
    if (lastSeenActivityRef.current === 0n) {
      let maxId = 0n;
      for (const e of useStore.getState().activity.values()) {
        if (e.id > maxId) maxId = e.id;
      }
      lastSeenActivityRef.current = maxId;
    }
    const unsub = useStore.subscribe((state, prev) => {
      if (state.activity === prev.activity) return;
      for (const e of state.activity.values()) {
        if (e.id <= lastSeenActivityRef.current) continue;
        lastSeenActivityRef.current = e.id;
        // Alleen toasts voor jouw club (of globaal relevant)
        const ownClub = session.clubId && e.club_id === session.clubId;
        if (e.kind.tag === "SnackClimbed" && ownClub) toast.hot(e.text);
        else if (e.kind.tag === "RatingSubmitted" && ownClub
          && e.user_id !== (session.me?.id ?? 0n)) toast.mint(e.text);
      }
    });
    return unsub;
  }, [connected, session.clubId, session.me]);

  if (err) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-6">
        <div className="brut-card bg-hot text-paper p-5 max-w-md flex flex-col gap-3">
          <h2 className="font-display text-2xl uppercase">Connectie mislukt</h2>
          <p className="text-sm">{err}</p>
          <button
            type="button"
            onClick={() => location.reload()}
            className="brut-btn bg-paper text-ink !py-2 !px-4 self-start"
          >
            opnieuw proberen
          </button>
          <p className="text-[11px] opacity-80">
            Lukt 't niet? Check je internet, of meld 't bij de Trainer.
          </p>
        </div>
      </div>
    );
  }

  if (!connected) return <ConnectingScreen />;

  return (
    <>
      <RouteSwitch path={route.path} />
      <ReactionOverlay />
      <ConnectionBanner />
      <ToastHost />
    </>
  );
}

/**
 * Loader-vervanger tijdens de eerste connect. Na 6s tonen we een "trager
 * dan normaal" hint met een handmatige reload-knop, zodat een dood
 * WebSocket-handshake (iOS tab-switch / netwerk-handoff) niet meer
 * resulteert in een eindeloze splash.
 */
function ConnectingScreen() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 6_000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center p-6 gap-4">
      <Loader label="Verbinden met de kantine…" />
      {slow && (
        <div className="brut-card bg-paper p-3 max-w-xs text-center flex flex-col gap-2">
          <p className="text-xs font-bold uppercase tracking-widest opacity-70">
            duurt langer dan normaal
          </p>
          <button
            type="button"
            onClick={() => location.reload()}
            className="brut-btn bg-hot text-paper !py-2 !px-4 text-sm"
          >
            opnieuw proberen
          </button>
        </div>
      )}
    </div>
  );
}

function RouteSwitch({ path }: { path: string }) {
  if (path === "/") return <SplashPage />;
  if (path === "/onboard/name") return <OnboardScreennamePage />;
  if (path === "/onboard/province" || path === "/onboard/city") {
    queueMicrotask(() => { location.hash = "/clubs"; });
    return null;
  }
  if (path === "/clubs") {
    queueMicrotask(() => { location.hash = "/home"; });
    return null;
  }
  if (path === "/clubs/new") return <AddClubPage />;
  if (path === "/home") return <FeedPage />;
  if (path === "/seizoen") return <SeizoenPage />;
  if (path === "/wedstrijden") return <WedstrijdenPage />;
  if (path === "/ranglijst") return <RanglijstPage />;
  if (path === "/teams/zoek") return <TeamSearchPage />;
  if (path === "/groups") {
    // Legacy redirect — team-beheer gaat nu via home + /group/:id.
    queueMicrotask(() => { location.hash = "/home"; });
    return null;
  }
  if (path === "/me") {
    const me = useStore.getState().session.me;
    if (me) { queueMicrotask(() => { location.hash = `/u/${me.id}`; }); return null; }
    queueMicrotask(() => { location.hash = "/onboard/name"; });
    return null;
  }

  let p: Record<string, string> | null;

  p = match("/u/:id", path);
  if (p) return <ProfilePage userId={BigInt(p.id)} />;

  p = match("/group/:id", path);
  if (p) return <GroupDetailPage groupId={BigInt(p.id)} />;

  p = match("/match/:id", path);
  if (p) return <MatchPage matchId={BigInt(p.id)} />;

  p = match("/join/:code", path);
  if (p) return <JoinInvitePage code={p.code} />;

  p = match("/club/:id/top", path);
  if (p) { queueMicrotask(() => { location.hash = "/home"; }); return null; }

  // /club/:id, /club/:id/snack/* bestaan niet meer — redirect naar home.
  p = match("/club/:id/snack/new", path);
  if (p) { queueMicrotask(() => { location.hash = "/home"; }); return null; }
  p = match("/club/:id/snack/:sid", path);
  if (p) { queueMicrotask(() => { location.hash = "/home"; }); return null; }

  p = match("/club/:id", path);
  if (p) return <ClubViewPage clubId={BigInt(p.id)} />;

  return <SplashPage />;
}
