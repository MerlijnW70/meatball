/**
 * HomePage — tile-grid layout.
 *
 * Niet meer een lineaire feed van alle features, maar "wat ga je doen?":
 * krijtbord-header met dagthema, sticky banners voor live/trainer-acties,
 * en een grid van activity-tegels die routen naar dedicated pages.
 *
 * Kantines-list → /seizoen · Fixtures → /wedstrijden · Team → /group/:id.
 */
import { useMemo, useState } from "react";
import { useMyGroups } from "../hooks";
import { useStore } from "../store";
import { client } from "../spacetime";
import { TopBar } from "../components/TopBar";
import { BrutalCard } from "../components/BrutalCard";
import { BrutalButton } from "../components/BrutalButton";
import { BrutalInput } from "../components/BrutalInput";
import { Avatar } from "../components/Avatar";
import { GehaktbalLogo } from "../components/GehaktbalLogo";
import { LiveMatchBanner } from "../components/feed/LiveMatchBanner";
import { DailyHeader } from "../components/home/DailyHeader";
import { ActivityGrid } from "../components/home/ActivityGrid";
import { OnlineStrip } from "../components/home/OnlineStrip";
import { go } from "../router";
import { friendlyError } from "../utils/errors";
import { cacheInviteCode, generateInviteCode } from "../utils/inviteCode";

export function FeedPage() {
  const myGroups = useMyGroups();

  return (
    <div className="min-h-dvh flex flex-col">
      <TopBar title="Meatball" hideCrews />
      <main className="flex-1 px-4 pt-5 pb-4 flex flex-col gap-5">
        <DailyHeader />
        <LiveMatchBanner />
        <PendingRequestsBanner />
        <OnlineStrip />
        <ActivityGrid />
        {myGroups.length === 0 && <CreateTeamCard />}
      </main>
    </div>
  );
}

/** Banner met openstaande invite-requests voor teams waar jij Trainer van
 *  bent. Direct approve/reject — komt niet terug tot er een nieuwe request
 *  binnenkomt. */
function PendingRequestsBanner() {
  const me = useStore((s) => s.session.me);
  const groupsMap = useStore((s) => s.groups);
  const requests = useStore((s) => s.inviteRequests);
  const users = useStore((s) => s.users);
  const [busy, setBusy] = useState<bigint | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const pending = useMemo(() => {
    if (!me) return [];
    return Array.from(requests.values())
      .filter((r) => {
        const g = groupsMap.get(r.group_id.toString());
        return !!g && g.owner_user_id === me.id;
      })
      .sort((a, b) => Number(a.requested_at) - Number(b.requested_at));
  }, [requests, groupsMap, me]);

  if (pending.length === 0) return null;

  const approve = async (id: bigint) => {
    setBusy(id); setErr(null);
    try { await client().approveInviteRequest(id); }
    catch (e) { setErr(friendlyError(e)); }
    finally { setBusy(null); }
  };
  const reject = async (id: bigint) => {
    setBusy(id); setErr(null);
    try { await client().rejectInviteRequest(id); }
    catch (e) { setErr(friendlyError(e)); }
    finally { setBusy(null); }
  };

  return (
    <BrutalCard tone="pop" className="!p-3 flex flex-col gap-2">
      <p className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5">
        <span
          className="inline-block w-2 h-2 bg-hot border border-ink"
          style={{ animation: "livepulse 1.2s ease-in-out infinite" }}
        />
        invite-verzoek · {pending.length}
      </p>
      <div className="flex flex-col gap-1.5">
        {pending.map((r) => {
          const u = users.get(r.from_user_id.toString());
          const g = groupsMap.get(r.group_id.toString());
          const isBusy = busy === r.id;
          return (
            <div
              key={r.id.toString()}
              className="brut-card bg-paper !p-2 flex items-center gap-2"
            >
              <Avatar userId={r.from_user_id} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="font-display uppercase leading-tight truncate">
                  {u?.screen_name ?? "iemand"}
                </p>
                <p className="text-[10px] font-bold uppercase tracking-widest opacity-60 leading-tight">
                  wil bij {g?.name ?? "jouw team"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => reject(r.id)}
                disabled={isBusy}
                aria-label="afwijzen"
                className="shrink-0 w-9 h-9 border-4 border-ink bg-ink text-paper
                           flex items-center justify-center font-display text-sm
                           active:translate-x-[1px] active:translate-y-[1px] transition-transform"
              >
                ✕
              </button>
              <button
                type="button"
                onClick={() => approve(r.id)}
                disabled={isBusy}
                aria-label="goedkeuren"
                className="shrink-0 w-9 h-9 border-4 border-ink bg-mint text-ink
                           flex items-center justify-center font-display text-base
                           active:translate-x-[1px] active:translate-y-[1px] transition-transform"
              >
                ✓
              </button>
            </div>
          );
        })}
      </div>
      {err && (
        <p className="brut-card bg-hot text-paper p-2 font-bold text-xs">{err}</p>
      )}
    </BrutalCard>
  );
}

/** Inline team-create CTA — verschijnt onder de tile-grid wanneer user nog
 *  geen team heeft. Na aanmaken navigeert naar /group/:id. */
function CreateTeamCard() {
  const me = useStore((s) => s.session.me);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canCreate = !busy && name.trim().length >= 3;

  const create = async () => {
    if (!me || !canCreate) return;
    setBusy(true); setErr(null);
    const prevMax = Array.from(useStore.getState().groups.values())
      .reduce((acc, g) => g.id > acc ? g.id : acc, 0n);
    try {
      let code = generateInviteCode();
      try { await client().createGroup(name.trim(), code); }
      catch (e) {
        const msg = friendlyError(e);
        if (msg.toLowerCase().includes("bestaat al")) {
          code = generateInviteCode();
          await client().createGroup(name.trim(), code);
        } else {
          throw e;
        }
      }
      setName("");
      for (let i = 0; i < 30; i++) {
        const fresh = Array.from(useStore.getState().groups.values())
          .filter((g) => g.owner_user_id === me.id && g.id > prevMax)
          .sort((a, b) => Number(b.id - a.id))[0];
        if (fresh) {
          cacheInviteCode(me.id, fresh.id, code);
          go(`/group/${fresh.id}`);
          return;
        }
        await new Promise((r) => setTimeout(r, 100));
      }
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="brut-card bg-pop !p-4 flex flex-col gap-2">
      <p className="font-display text-xl uppercase leading-tight flex items-center gap-2">
        <GehaktbalLogo size={28} className="shrink-0" />
        richt jouw team op
      </p>
      <p className="text-xs font-bold opacity-80 leading-snug">
        Nodig mede-ouders uit om samen gehaktballen te raten.
      </p>
      <BrutalInput
        placeholder="bv. VV Gehaktbal"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && canCreate && create()}
        maxLength={40}
        className="mt-1"
      />
      {err && (
        <p className="brut-card bg-hot text-paper p-2 font-bold text-xs">{err}</p>
      )}
      <BrutalButton
        variant="ink" size="md" block
        disabled={!canCreate}
        onClick={create}
      >
        {busy ? "aanmaken…" : "+ maak team"}
      </BrutalButton>
      <button
        type="button"
        onClick={() => go("/teams/zoek")}
        className="text-xs font-bold uppercase tracking-widest opacity-70
                   hover:opacity-100 underline decoration-2 underline-offset-2 mt-1"
      >
        of zoek een bestaand team →
      </button>
    </div>
  );
}
