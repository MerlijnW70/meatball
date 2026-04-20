/**
 * Eén profiel-framework voor zowel eigen als andermans profiel.
 * `isSelf` schakelt self-only extras in.
 */
import { useEffect, useState } from "react";
import {
  markReactionsRead, markFollowsRead,
  useIsFollowing, useUserProfile,
} from "../hooks";
import { useStore } from "../store";
import { client } from "../spacetime";
import { TopBar } from "../components/TopBar";
import { BrutalCard } from "../components/BrutalCard";
import { BrutalButton } from "../components/BrutalButton";
import { Avatar } from "../components/Avatar";
import { AvatarPicker } from "../components/AvatarPicker";
import { SocialInbox } from "../components/SocialInbox";
import { fmtRelative } from "../utils/format";
import { friendlyError } from "../utils/errors";

export function ProfilePage({ userId }: { userId: bigint }) {
  const me = useStore((s) => s.session.me);
  const profile = useUserProfile(userId);
  const following = useIsFollowing(userId);
  const isSelf = me?.id === userId;

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [avatarOpen, setAvatarOpen] = useState(false);

  // Self-only: markeer alle social-inbox-items als gelezen bij binnenkomst.
  useEffect(() => {
    if (!isSelf) return;
    markReactionsRead();
    markFollowsRead();
  }, [isSelf]);

  const toggleFollow = async () => {
    setBusy(true); setErr(null);
    try { await client().toggleFollow(userId); }
    catch (x) { setErr(friendlyError(x)); }
    finally { setBusy(false); }
  };

  if (!profile.user) {
    return (
      <div className="min-h-dvh flex flex-col">
        <TopBar title="profiel" back="/home" />
        <main className="flex-1 p-6">
          <BrutalCard><p className="font-bold">User niet gevonden.</p></BrutalCard>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col pb-20">
      <TopBar
        title={isSelf ? "jouw profiel" : "profiel"}
        back="/home"
        hideProfile
      />
      <main className="flex-1 p-4 flex flex-col gap-4">

        {/* Hero */}
        <BrutalCard tone={isSelf ? "pop" : "hot"} tilt className={`!p-5 ${isSelf ? "" : "text-paper"}`}>
          {profile.isOnline && !isSelf && (
            <span className="brut-chip bg-mint text-ink !py-0 !px-1.5 text-[9px] mb-2 w-fit">
              <span
                className="inline-block w-1.5 h-1.5 bg-ink"
                style={{ animation: "livepulse 1.4s ease-in-out infinite" }}
              />
              online
            </span>
          )}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => isSelf && setAvatarOpen(true)}
              aria-label={isSelf ? "wijzig avatar" : "avatar"}
              className={isSelf ? "cursor-pointer" : "cursor-default"}
            >
              <Avatar userId={userId} size="xl" />
            </button>
            <h2 className="font-display text-4xl uppercase leading-none break-words flex-1 min-w-0">
              {profile.user.screen_name}
            </h2>
          </div>
          <p className="text-[10px] font-bold uppercase tracking-widest opacity-80 mt-3">
            lid sinds {fmtRelative(profile.user.created_at)}
          </p>
        </BrutalCard>

        {/* Volg-actie alleen op andermans profiel */}
        {!isSelf && (
          <>
            <BrutalButton
              onClick={toggleFollow}
              disabled={busy}
              variant={following ? "mint" : "ink"}
              block size="lg"
            >
              {following ? "✓ je volgt" : "+ volg"}
            </BrutalButton>
            {err && (
              <p className="brut-card bg-hot text-paper text-xs p-2 font-bold">{err}</p>
            )}
          </>
        )}

        {/* Social inbox — alleen op eigen profiel */}
        {isSelf && <SocialInbox />}
      </main>

      {avatarOpen && <AvatarPicker onClose={() => setAvatarOpen(false)} />}
    </div>
  );
}
