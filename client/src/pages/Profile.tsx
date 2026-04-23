/**
 * Eén profiel-framework voor zowel eigen als andermans profiel.
 * `isSelf` schakelt self-only extras in.
 */
import { useEffect, useMemo, useState } from "react";
import {
  markReactionsRead, markFollowsRead,
  useIsFollowing, useMyGroups, useUserProfile,
} from "../hooks";
import { useStore } from "../store";
import { client } from "../spacetime";
import { TopBar } from "../components/TopBar";
import { BrutalCard } from "../components/BrutalCard";
import { BrutalButton } from "../components/BrutalButton";
import { Avatar } from "../components/Avatar";
import { AvatarPicker } from "../components/AvatarPicker";
import { ConfirmModal } from "../components/ConfirmModal";
import { SocialInbox } from "../components/SocialInbox";
import { BackupCodeCard } from "../components/profile/BackupCodeCard";
import { fmtRelative } from "../utils/format";
import { friendlyError } from "../utils/errors";
import { go } from "../router";
import {
  FIELD_POSITIONS, POSITION_LABEL, POSITION_SHORT, type Group, type Position,
} from "../types";

/**
 * Detecteer of de screen_name een server-gegenereerde default is
 * (zoals "Gehaktbal-Genieter-4829" of de fallback "Speler-a1b2c3d4").
 * Heuristisch — als een user exact dit patroon zelf kiest is dat een
 * acceptabele edge case (banner wordt nadien automatisch verborgen
 * zodra 'ie een andere naam kiest).
 */
function isDefaultScreenName(name: string): boolean {
  // Pattern 1: "Capitalized-Base-NNNN" (auto-naam uit pool)
  if (/^[A-Z][A-Za-z0-9-]*-\d{4}$/.test(name)) return true;
  // Pattern 2: "Speler-xxxxxxxx" (collision fallback)
  if (/^Speler-[0-9a-f]{8}$/.test(name)) return true;
  return false;
}

const DISMISS_KEY = "meatball.rename-banner-dismissed";

export function ProfilePage({ userId }: { userId: bigint }) {
  const me = useStore((s) => s.session.me);
  const profile = useUserProfile(userId);
  const following = useIsFollowing(userId);
  const myGroups = useMyGroups();
  const userPositions = useStore((s) => s.userPositions);
  const ratings = useStore((s) => s.ratings);
  const follows = useStore((s) => s.follows);
  const memberships = useStore((s) => s.memberships);
  const isSelf = me?.id === userId;

  const position = userPositions.get(userId.toString())?.position as Position | undefined;
  const onField = position && (FIELD_POSITIONS as Position[]).includes(position);

  // Lightweight stats afgeleid uit al gesubscribede tabellen.
  const stats = useMemo(() => {
    let ratingsGiven = 0;
    for (const r of ratings.values()) if (r.user_id === userId) ratingsGiven++;
    let followersCount = 0;
    let followingCount = 0;
    for (const f of follows.values()) {
      if (f.followee_id === userId) followersCount++;
      if (f.follower_id === userId) followingCount++;
    }
    let seasonCount = 0;
    for (const m of memberships.values()) if (m.user_id === userId) seasonCount++;
    return { ratingsGiven, followersCount, followingCount, seasonCount };
  }, [ratings, follows, memberships, userId]);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [leaveTarget, setLeaveTarget] = useState<Group | null>(null);

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

  const confirmLeaveTeam = async () => {
    if (!leaveTarget) return;
    setBusy(true); setErr(null);
    try {
      await client().leaveGroup(leaveTarget.id);
      setLeaveTarget(null);
    } catch (x) {
      setErr(friendlyError(x));
    } finally {
      setBusy(false);
    }
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

        {isSelf && <RenameBanner screenName={profile.user.screen_name} />}

        {/* Hero — player-card stijl: avatar centraal, naam eronder met
            balanced wrapping, positie-chip + lid-sinds als sub-info. */}
        <BrutalCard
          tone={isSelf ? "pop" : "hot"}
          className={`relative !p-5 flex flex-col items-center gap-3 text-center
                      ${isSelf ? "" : "text-paper"}`}
        >
          {/* Online badge top-right */}
          {profile.isOnline && !isSelf && (
            <span
              className="absolute top-3 right-3 brut-chip bg-mint text-ink !py-0 !px-2
                         text-[9px] flex items-center gap-1 font-display uppercase"
            >
              <span
                className="inline-block w-1.5 h-1.5 bg-ink"
                style={{ animation: "livepulse 1.4s ease-in-out infinite" }}
              />
              online
            </span>
          )}

          {/* Avatar — tap self opent picker */}
          <button
            type="button"
            onClick={() => isSelf && setAvatarOpen(true)}
            aria-label={isSelf ? "wijzig avatar" : "avatar"}
            className={isSelf
              ? "cursor-pointer active:translate-x-[2px] active:translate-y-[2px] transition-transform"
              : "cursor-default"}
          >
            <Avatar userId={userId} size="xl" className="shadow-brutSm" />
          </button>

          {/* Naam — text-wrap balance + break-words zodat lange namen netjes
              over 2 regels kunnen. Responsive text-size voor mobiel.
              Voor self: ook tap-baar als rename-entrypoint (los van de
              banner — die kan gedismist zijn). */}
          {isSelf ? (
            <button
              type="button"
              onClick={() => go("/onboard/name")}
              aria-label="wijzig naam"
              className="font-display text-3xl sm:text-4xl uppercase leading-tight
                         break-words w-full bg-transparent border-0
                         active:translate-x-[1px] active:translate-y-[1px] transition-transform
                         flex items-center justify-center gap-2"
              style={{ textWrap: "balance", overflowWrap: "anywhere" }}
            >
              <span>{profile.user.screen_name}</span>
              <span className="text-sm opacity-60" aria-hidden>✏️</span>
            </button>
          ) : (
            <h2
              className="font-display text-3xl sm:text-4xl uppercase leading-tight
                         break-words w-full"
              style={{ textWrap: "balance", overflowWrap: "anywhere" }}
            >
              {profile.user.screen_name}
            </h2>
          )}

          {/* Positie-chip als speler op het veld staat */}
          {onField && position && (
            <span
              className={`brut-chip !py-1 !px-3 text-xs font-display uppercase
                flex items-center gap-2
                ${isSelf ? "bg-ink text-paper" : "bg-paper text-ink"}`}
            >
              <span className="font-display text-sm">{POSITION_SHORT[position]}</span>
              <span className="opacity-70">·</span>
              <span>{POSITION_LABEL[position]}</span>
            </span>
          )}

          {/* Lid-sinds als voetnoot */}
          <p className="text-[10px] font-bold uppercase tracking-widest opacity-70">
            lid sinds {fmtRelative(profile.user.created_at)}
          </p>
        </BrutalCard>

        {/* Stats-strip: compact overzicht van activiteit */}
        <div className="grid grid-cols-4 gap-2">
          <StatBlock label="kantines" value={stats.seasonCount} />
          <StatBlock label="ratings" value={stats.ratingsGiven} />
          <StatBlock label="volgt" value={stats.followingCount} />
          <StatBlock label="volgers" value={stats.followersCount} />
        </div>

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

        {/* Backup-code voor device-onafhankelijke account-persistence */}
        {isSelf && <BackupCodeCard />}

        {/* Self-only: teams met verlaat-knop per team */}
        {isSelf && myGroups.length > 0 && (
          <section>
            <h3 className="font-display text-lg uppercase mb-2">jouw teams</h3>
            <div className="flex flex-col gap-2">
              {myGroups.map((g) => {
                const isTrainer = me?.id === g.owner_user_id;
                return (
                  <BrutalCard key={g.id.toString()} className="!p-0 flex items-stretch">
                    <div className="flex-1 min-w-0 px-3 py-2.5 flex items-center gap-2">
                      <p className="flex-1 min-w-0 font-display uppercase truncate">
                        {g.name}
                      </p>
                      {isTrainer && (
                        <span className="shrink-0 text-sm leading-none" aria-label="trainer">👑</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setLeaveTarget(g)}
                      aria-label={`verlaat ${g.name}`}
                      className="shrink-0 border-l-4 border-ink bg-ink text-paper px-3
                                 font-display text-xs uppercase
                                 active:translate-x-[1px] active:translate-y-[1px] transition-transform"
                    >
                      {isTrainer ? "opheffen" : "verlaat"}
                    </button>
                  </BrutalCard>
                );
              })}
            </div>
            {err && (
              <p className="brut-card bg-hot text-paper p-2 mt-2 font-bold text-sm">{err}</p>
            )}
          </section>
        )}
      </main>

      {avatarOpen && <AvatarPicker onClose={() => setAvatarOpen(false)} />}

      <ConfirmModal
        open={!!leaveTarget}
        title={
          leaveTarget && me?.id === leaveTarget.owner_user_id
            ? "team opheffen?"
            : "team verlaten?"
        }
        body={leaveTarget && (
          me?.id === leaveTarget.owner_user_id ? (
            <>
              Je bent de <span className="bg-pop px-1">Trainer</span> van{" "}
              <span className="bg-pop px-1">{leaveTarget.name}</span>. Als je vertrekt en er
              zijn geen andere spelers meer, wordt het team én alle uitnodigingen
              definitief opgeheven.
            </>
          ) : (
            <>
              Je verdwijnt uit <span className="bg-pop px-1">{leaveTarget.name}</span>. Je
              kan later weer mee via een nieuwe uitnodiging.
            </>
          )
        )}
        confirmLabel={
          leaveTarget && me?.id === leaveTarget.owner_user_id ? "opheffen" : "verlaat"
        }
        cancelLabel="blijf"
        variant="hot"
        busy={busy}
        onCancel={() => setLeaveTarget(null)}
        onConfirm={confirmLeaveTeam}
      />
    </div>
  );
}

/**
 * Prompt voor users met een server-gegenereerde default-naam.
 * Verdwijnt zodra de naam niet meer default is (server-side rename) of
 * de user 'm handmatig dismisst (localStorage).
 */
function RenameBanner({ screenName }: { screenName: string }) {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === "1"; }
    catch { return false; }
  });
  if (!isDefaultScreenName(screenName)) return null;
  if (dismissed) return null;
  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch {}
    setDismissed(true);
  };
  return (
    <div className="brut-card bg-sky text-paper !p-3 flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <p className="font-display text-sm uppercase leading-tight">
          Je heet nu <span className="bg-paper text-ink px-1">{screenName}</span>
        </p>
        <p className="text-[10px] font-bold uppercase tracking-widest opacity-80 mt-1 leading-tight">
          Kies je eigen naam om op te vallen
        </p>
      </div>
      <BrutalButton
        onClick={() => go("/onboard/name")}
        variant="hot" size="sm"
      >
        kies →
      </BrutalButton>
      <button
        type="button"
        onClick={dismiss}
        aria-label="verberg"
        className="shrink-0 w-8 h-8 border-2 border-paper bg-transparent text-paper
                   font-display text-sm leading-none rounded-none
                   active:translate-x-[1px] active:translate-y-[1px] transition-transform"
      >
        ✕
      </button>
    </div>
  );
}

/** Compact stat-block voor de hero-strip. */
function StatBlock({ label, value }: { label: string; value: number }) {
  return (
    <div className="brut-card bg-paper !p-2 text-center flex flex-col items-center gap-0">
      <span className="font-display text-xl sm:text-2xl leading-none tabular-nums">
        {value}
      </span>
      <span className="text-[9px] font-bold uppercase tracking-widest opacity-60 mt-0.5 leading-tight">
        {label}
      </span>
    </div>
  );
}
