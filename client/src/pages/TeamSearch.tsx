/**
 * Zoek een bestaand team en vraag de Trainer om een uitnodiging.
 * Toegankelijk via home → 'zoek je team' knop in de CreateTeamCard.
 */
import { useMemo, useState } from "react";
import { useStore } from "../store";
import { client } from "../spacetime";
import { friendlyError } from "../utils/errors";
import { TopBar } from "../components/TopBar";
import { BrutalCard } from "../components/BrutalCard";
import { BrutalInput } from "../components/BrutalInput";
import { BrutalButton } from "../components/BrutalButton";

export function TeamSearchPage() {
  const me = useStore((s) => s.session.me);
  const groups = useStore((s) => s.groups);
  const memberships = useStore((s) => s.groupMemberships);
  const inviteRequests = useStore((s) => s.inviteRequests);
  const users = useStore((s) => s.users);

  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<bigint | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const totalTeams = groups.size;

  const results = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return Array.from(groups.values())
      .filter((g) => qq.length < 2 || g.name.toLowerCase().includes(qq))
      .map((g) => {
        const memberCount = Array.from(memberships.values())
          .filter((m) => m.group_id === g.id).length;
        const iAmMember = !!me && Array.from(memberships.values())
          .some((m) => m.group_id === g.id && m.user_id === me.id);
        const myRequest = me
          ? Array.from(inviteRequests.values())
              .find((r) => r.group_id === g.id && r.from_user_id === me.id)
          : undefined;
        const trainer = users.get(g.owner_user_id.toString());
        return { group: g, memberCount, iAmMember, myRequest, trainerName: trainer?.screen_name };
      })
      // Stabiele sort: eerst meeste spelers, dan jongste id bovenaan zodat
      // nieuwe teams zichtbaar zijn ook al hebben ze nog geen spelers.
      .sort((a, b) => {
        if (b.memberCount !== a.memberCount) return b.memberCount - a.memberCount;
        return Number(b.group.id - a.group.id);
      });
  }, [groups, memberships, inviteRequests, users, q, me]);

  const request = async (groupId: bigint) => {
    setBusy(groupId); setErr(null);
    try {
      await client().requestTeamInvite(groupId);
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(null);
    }
  };

  const cancel = async (requestId: bigint) => {
    setBusy(requestId); setErr(null);
    try {
      await client().rejectInviteRequest(requestId);
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-dvh flex flex-col">
      <TopBar title="Team zoeken" back="/home" />
      <main className="flex-1 p-4 flex flex-col gap-4">
        <h2 className="font-display text-2xl uppercase leading-tight">
          Vind jouw <span className="bg-pop px-1">team</span>
        </h2>
        <p className="text-xs font-bold uppercase tracking-widest opacity-70 -mt-2">
          Zoek bestaand team → vraag de trainer om toegang
        </p>

        <BrutalInput
          autoFocus
          placeholder="Zoek team-naam…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={40}
        />

        {err && (
          <p className="brut-card bg-hot text-paper p-2 font-bold text-sm">{err}</p>
        )}

        {/* Altijd duidelijk maken hoeveel teams we ontvangen hebben zodat
            een lege/kleine lijst niet ambigu is (laadfase vs geen matches). */}
        <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">
          {totalTeams === 0
            ? "⏳ nog geen teams ontvangen — wacht op verbinding"
            : q.trim().length < 2
              ? `${totalTeams} ${totalTeams === 1 ? "team" : "teams"} beschikbaar`
              : `${results.length} van ${totalTeams} match${results.length === 1 ? "" : "es"}`}
        </p>

        {totalTeams > 0 && results.length === 0 && (
          <BrutalCard className="!p-3 text-center">
            <p className="font-display text-lg uppercase">geen match</p>
            <p className="text-xs font-bold opacity-70 mt-1">
              Probeer een andere zoekterm.
            </p>
          </BrutalCard>
        )}

        <div className="flex flex-col gap-2">
          {results.slice(0, 50).map(({ group, memberCount, iAmMember, myRequest, trainerName }) => (
            <BrutalCard key={group.id.toString()} className="!p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-display text-lg uppercase leading-tight truncate">
                  {group.name}
                </p>
                <p className="text-[10px] font-bold uppercase tracking-widest opacity-60 mt-0.5">
                  {memberCount} {memberCount === 1 ? "speler" : "spelers"}
                  {trainerName && <> · trainer: {trainerName}</>}
                </p>
              </div>
              {iAmMember ? (
                <span className="shrink-0 brut-chip bg-mint !py-0.5 !px-2 text-[10px] font-display">
                  ✓ jouw team
                </span>
              ) : myRequest ? (
                <button
                  type="button"
                  onClick={() => cancel(myRequest.id)}
                  disabled={busy === myRequest.id}
                  className="shrink-0 brut-chip bg-ink text-paper !py-1 !px-2 text-[10px] font-display
                             active:translate-x-[1px] active:translate-y-[1px] transition-transform"
                >
                  aangevraagd · annuleer
                </button>
              ) : (
                <BrutalButton
                  onClick={() => request(group.id)}
                  disabled={busy === group.id}
                  variant="hot" size="sm"
                >
                  {busy === group.id ? "…" : "vraag invite"}
                </BrutalButton>
              )}
            </BrutalCard>
          ))}
        </div>
      </main>
    </div>
  );
}
