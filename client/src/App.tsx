import { useEffect, useState } from "react";
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
import { ClubViewPage } from "./pages/ClubView";
import { ProfilePage } from "./pages/Profile";
import { GroupsPage } from "./pages/Groups";
import { GroupDetailPage } from "./pages/GroupDetail";
import { JoinInvitePage } from "./pages/JoinInvite";

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

  // Vind jezelf in de user tabel zodra je identity bekend is.
  useEffect(() => {
    if (!identity || session.me) return;
    const me = Array.from(users.values())
      .find((u) => u.identity === identity);
    if (me) setMe(me);
  }, [users, identity, session.me, setMe]);

  // Toasts voor realtime events die relevant zijn voor jouw club.
  useEffect(() => {
    if (!connected) return;
    let lastSeen = 0n;
    const unsub = useStore.subscribe((state, prev) => {
      if (state.activity === prev.activity) return;
      for (const e of state.activity.values()) {
        if (e.id <= lastSeen) continue;
        lastSeen = e.id;
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
        <div className="brut-card bg-hot text-paper p-5 max-w-md">
          <h2 className="font-display text-2xl uppercase">Connectie mislukt</h2>
          <p className="mt-2 text-sm">{err}</p>
          <p className="mt-3 text-xs opacity-80">
            Start de server met <code>spacetime publish meatball</code> en
            draai <code>npm run generate</code>.
          </p>
        </div>
      </div>
    );
  }

  if (!connected) return <Loader label="Verbinden met de kantine…" />;

  return (
    <>
      <RouteSwitch path={route.path} />
      <ReactionOverlay />
      <ConnectionBanner />
      <ToastHost />
    </>
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
  if (path === "/groups") return <GroupsPage />;
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
