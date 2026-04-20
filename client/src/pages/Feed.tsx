/**
 * Eén kantines-scherm: seizoen-feed (lid) + andere kantines (zoek/+)
 * + CTA om een nieuwe te maken. Vervangt de oude /clubs picker.
 */
import { useEffect, useMemo, useState } from "react";
import { useLikesFor, useMyClubs, useMyGroups, useStatsFor } from "../hooks";
import { useStore } from "../store";
import { client } from "../spacetime";
import { TopBar } from "../components/TopBar";
import { BrutalCard } from "../components/BrutalCard";
import { BrutalButton } from "../components/BrutalButton";
import { BrutalInput } from "../components/BrutalInput";
import { ScorePill } from "../components/ScorePill";
import { Avatar } from "../components/Avatar";
import { UserMenu } from "../components/UserMenu";
import { go } from "../router";
import { normalizeName, similarity } from "../utils/normalize";
import type { Club, Group } from "../types";

export function FeedPage() {
  const me = useStore((s) => s.session.me);
  const clubs = useStore((s) => s.clubs);
  const memberships = useStore((s) => s.memberships);
  const myClubs = useMyClubs(50);
  const myGroups = useMyGroups();

  const [q, setQ] = useState("");
  const [confirmLeave, setConfirmLeave] = useState<Club | null>(null);
  const [confirmJoin, setConfirmJoin] = useState<Club | null>(null);
  const [busy, setBusy] = useState(false);

  const myClubIds = useMemo(() => {
    const ids = new Set<string>();
    if (!me) return ids;
    for (const m of memberships.values()) {
      if (m.user_id === me.id) ids.add(m.club_id.toString());
    }
    return ids;
  }, [me, memberships]);

  const otherClubs = useMemo(() => {
    const all = Array.from(clubs.values())
      .filter((c) => !myClubIds.has(c.id.toString()));
    const key = normalizeName(q);
    if (!key) return all.sort((a, b) => a.name.localeCompare(b.name, "nl"));
    return all
      .map((c) => ({ club: c, s: similarity(c.name, q) }))
      .filter((x) => x.s > 0.25 || x.club.name_key.includes(key))
      .sort((a, b) => b.s - a.s)
      .map((x) => x.club);
  }, [clubs, myClubIds, q]);

  const openClub = (c: Club) => {
    useStore.getState().setSession({
      clubId: c.id, cityId: c.city_id, provinceId: c.province_id,
    });
    go(`/club/${c.id}`);
  };

  // Tap op een non-member kantine: vraag eerst of'ie toegevoegd moet worden
  // aan het seizoen — pas dan navigeren naar de club-page.
  const tapOther = (c: Club) => setConfirmJoin(c);

  const join = (c: Club) => {
    client().joinClub(c.id);
  };

  const confirmJoinNow = async () => {
    if (!confirmJoin) return;
    const c = confirmJoin;
    setBusy(true);
    try { await client().joinClub(c.id); }
    catch { /* idempotent */ }
    finally {
      setBusy(false);
      setConfirmJoin(null);
      openClub(c);
    }
  };

  const askLeave = (c: Club) => setConfirmLeave(c);
  const confirmLeaveNow = async () => {
    if (!confirmLeave) return;
    setBusy(true);
    try { await client().leaveClub(confirmLeave.id); }
    catch { /* idempotent */ }
    finally { setBusy(false); setConfirmLeave(null); }
  };

  const startAdd = () => {
    if (q.trim()) sessionStorage.setItem("meatball.draftClubName", q.trim());
    else sessionStorage.removeItem("meatball.draftClubName");
    go("/clubs/new");
  };

  const noOtherResults = q.trim().length >= 2 && otherClubs.length === 0;

  return (
    <div className="min-h-dvh flex flex-col pb-24">
      <TopBar title="seizoen kantines" />

      <main className="flex-1 p-4 flex flex-col gap-5">
        {/* Jouw teams — altijd bovenaan zodat ze binnen tap-bereik zijn */}
        <section>
          <h3 className="font-display text-lg uppercase mb-2">jouw teams</h3>
          {myGroups.length === 0 ? (
            <button
              type="button"
              onClick={() => go("/groups")}
              className="brut-card bg-pop w-full text-left !p-3
                         active:translate-x-[2px] active:translate-y-[2px] transition-transform"
            >
              <p className="font-display uppercase">🥩 maak je eerste team</p>
              <p className="text-[11px] font-bold mt-1 opacity-80">
                Nodig spelers uit om samen gehaktballen te raten.
              </p>
            </button>
          ) : (
            <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1">
              {myGroups.map((g) => (
                <CrewStripCard key={g.id.toString()} group={g} />
              ))}
            </div>
          )}
        </section>

        {/* Seizoen kantines */}
        <section>
          <h3 className="font-display text-lg uppercase mb-2">jouw seizoen</h3>
          {myClubs.length === 0 ? (
            <BrutalCard tone="pop" tilt className="text-center !p-5">
              <p className="font-display uppercase">Nog geen kantines</p>
              <p className="text-sm font-bold mt-2">
                Voeg je eerste kantine toe en rate de gehaktbal.
              </p>
            </BrutalCard>
          ) : (
            <div className="flex flex-col gap-3">
              {myClubs.map(({ club }) => (
                <SeasonClubCard
                  key={club.id.toString()} club={club}
                  onTap={openClub} onLeave={askLeave}
                />
              ))}
            </div>
          )}
        </section>

        {/* Andere kantines — lijst verschijnt pas nadat er gezocht wordt */}
        <section>
          <h3 className="font-display text-lg uppercase mb-2">andere kantines</h3>
          <BrutalInput
            placeholder="zoek je kantine…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {q.trim().length > 0 && (
            <div className="flex flex-col gap-2 mt-2">
              {otherClubs.slice(0, 30).map((c) => (
                <OtherClubRow
                  key={c.id.toString()} club={c}
                  onOpen={tapOther} onJoin={join}
                />
              ))}
              {otherClubs.length === 0 && (
                <p className="text-xs font-bold opacity-60 mt-2">
                  Geen kantines gevonden voor "{q.trim()}" —
                  maak 'm hieronder aan.
                </p>
              )}
            </div>
          )}
        </section>

        <div className="mt-auto pt-2">
          <BrutalButton onClick={startAdd} variant="hot" block size="lg">
            {noOtherResults
              ? `＋ nieuwe kantine "${q.trim()}"`
              : "＋ nieuwe kantine"}
          </BrutalButton>
        </div>
      </main>

      {confirmLeave && (
        <ConfirmLeaveModal
          club={confirmLeave}
          busy={busy}
          onCancel={() => setConfirmLeave(null)}
          onConfirm={confirmLeaveNow}
        />
      )}

      {confirmJoin && (
        <ConfirmJoinModal
          club={confirmJoin}
          busy={busy}
          onCancel={() => setConfirmJoin(null)}
          onConfirm={confirmJoinNow}
        />
      )}

    </div>
  );
}

function SeasonClubCard({
  club, onTap, onLeave,
}: { club: Club; onTap: (c: Club) => void; onLeave: (c: Club) => void }) {
  const snacks = useStore((s) => s.snacks);
  const gehaktbal = Array.from(snacks.values())
    .find((s) => s.club_id === club.id && s.name_key === "gehaktbal");
  const stats = useStatsFor(gehaktbal?.id ?? null);
  const { count: likes } = useLikesFor(gehaktbal?.id ?? null);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onTap(club)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onTap(club); }}
      aria-label={`open ${club.name}`}
      className="brut-card bg-paper p-3 flex items-center gap-3 cursor-pointer
                 active:translate-x-[2px] active:translate-y-[2px] transition-transform
                 relative"
    >
      <div className="flex-1 min-w-0">
        <p className="font-display text-xl uppercase leading-tight truncate">
          {club.name}
        </p>
        <p className="text-[10px] font-bold uppercase tracking-widest opacity-70 mt-0.5">
          {stats ? (
            <>
              gehaktbal · {stats.rating_count.toString()}× gescoord
              {likes > 0 && (
                <span aria-label={`${likes} likes`}>
                  {" · "}
                  <span className="text-hot">♥</span> {likes}
                </span>
              )}
            </>
          ) : (
            "gehaktbal · nog niet beoordeeld"
          )}
        </p>
      </div>
      {stats?.avg_score_x100 != null && (
        <ScorePill x100={stats.avg_score_x100} size="md" />
      )}
      {/* Verwijder-knop: aparte click target */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onLeave(club); }}
        aria-label="verwijder uit seizoen"
        className="shrink-0 w-10 h-10 flex items-center justify-center
          font-display text-2xl border-4 border-ink bg-hot text-paper shadow-brutSm
          active:translate-x-[2px] active:translate-y-[2px] transition-transform"
      >
        −
      </button>
    </div>
  );
}

const CREW_VISIBLE = 4;

function CrewStripCard({ group }: { group: Group }) {
  const me = useStore((s) => s.session.me);
  const users = useStore((s) => s.users);
  const groupMemberships = useStore((s) => s.groupMemberships);
  const sessions = useStore((s) => s.sessions);

  // Alles voor dit team in één pass: members + prioritering + online-tellen.
  // Jezelf laten we weg uit de avatar-stack — je kan toch geen popup openen op
  // jezelf (geen reactie naar jezelf, geen volg-actie).
  const { ordered, onlineCount, total } = useMemo(() => {
    const onlineUserIds = new Set<string>();
    for (const s of sessions.values()) {
      if (s.user_id !== 0n) onlineUserIds.add(s.user_id.toString());
    }
    const mine = Array.from(groupMemberships.values())
      .filter((m) => m.group_id === group.id);
    const total = mine.length;
    const others = me ? mine.filter((m) => m.user_id !== me.id) : mine;

    const ownerId = group.owner_user_id;
    const rank = (uid: bigint) => {
      // Lager = eerder zichtbaar. Online > owner > rest.
      if (onlineUserIds.has(uid.toString())) return 0;
      if (uid === ownerId) return 1;
      return 2;
    };
    const ordered = others.slice().sort((a, b) => {
      const ra = rank(a.user_id), rb = rank(b.user_id);
      if (ra !== rb) return ra - rb;
      return Number(a.joined_at) - Number(b.joined_at);
    });
    let online = 0;
    for (const m of mine) {
      if (onlineUserIds.has(m.user_id.toString())) online++;
    }
    return { ordered, onlineCount: online, total };
  }, [group.id, group.owner_user_id, groupMemberships, sessions, me]);

  const overflow = Math.max(0, ordered.length - CREW_VISIBLE);

  return (
    <div
      className="shrink-0 brut-card bg-paper !p-3 min-w-[13rem] max-w-[16rem]
                 flex flex-col gap-2"
    >
      <button
        type="button"
        onClick={() => go(`/group/${group.id}`)}
        className="text-left active:translate-x-[1px] active:translate-y-[1px] transition-transform"
      >
        <p className="font-display text-lg uppercase leading-tight truncate">
          {group.name}
        </p>
        <p className="text-[10px] font-bold uppercase tracking-widest opacity-60 mt-0.5 flex items-center gap-1.5">
          <span>{total} {total === 1 ? "speler" : "spelers"}</span>
          {onlineCount > 0 && (
            <span className="flex items-center gap-1 text-ink">
              <span
                className="inline-block w-1.5 h-1.5 bg-mint border border-ink"
                style={{ animation: "livepulse 1.4s ease-in-out infinite" }}
              />
              {onlineCount} online
            </span>
          )}
        </p>
      </button>
      <div className="flex items-center gap-0.5 flex-wrap">
        {ordered.slice(0, CREW_VISIBLE).map((m) => {
          const u = users.get(m.user_id.toString());
          return (
            <UserMenu
              key={m.id.toString()}
              userId={m.user_id}
              name={u?.screen_name ?? "speler"}
              trigger={<Avatar userId={m.user_id} size="sm" />}
              className="active:translate-x-[1px] active:translate-y-[1px] transition-transform"
            />
          );
        })}
        {overflow > 0 && (
          <button
            type="button"
            onClick={() => go(`/group/${group.id}`)}
            className="ml-1 brut-chip bg-ink text-paper !py-0.5 !px-1.5 text-[10px]
                       active:translate-x-[1px] active:translate-y-[1px] transition-transform"
          >
            +{overflow}
          </button>
        )}
      </div>
    </div>
  );
}

function OtherClubRow({
  club, onOpen, onJoin,
}: { club: Club; onOpen: (c: Club) => void; onJoin: (c: Club) => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(club)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onOpen(club); }}
      aria-label={`open ${club.name}`}
      className="brut-card bg-paper p-3 flex items-center gap-2 cursor-pointer
                 active:translate-x-[2px] active:translate-y-[2px] transition-transform"
    >
      <span className="font-display uppercase text-base leading-tight truncate flex-1 min-w-0">
        {club.name}
      </span>
      <span className="font-display text-xl shrink-0 opacity-50" aria-hidden>→</span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onJoin(club); }}
        aria-label="voeg toe aan seizoen"
        className="shrink-0 w-10 h-10 flex items-center justify-center
          font-display text-2xl border-4 border-ink bg-mint text-ink shadow-brutSm
          active:translate-x-[2px] active:translate-y-[2px] transition-transform"
      >
        ＋
      </button>
    </div>
  );
}

function ConfirmJoinModal({
  club, busy, onCancel, onConfirm,
}: {
  club: Club; busy: boolean;
  onCancel: () => void; onConfirm: () => void;
}) {
  useEffect(() => {
    document.body.classList.add("modal-open");
    return () => document.body.classList.remove("modal-open");
  }, []);
  return (
    <div
      onClick={onCancel}
      className="fixed inset-0 z-50 bg-ink/70 flex items-end sm:items-center
                 justify-center p-0 sm:p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md brut-card bg-paper shadow-brutLg p-5 rounded-none"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      >
        <h2 className="font-display text-2xl uppercase leading-tight">
          nog niet in jouw seizoen
        </h2>
        <p className="text-sm font-bold mt-2">
          <span className="bg-pop px-1">{club.name}</span> staat nog niet in je
          seizoens-feed. Voeg'm toe om de gehaktbal te kunnen raten.
        </p>
        <div className="flex gap-2 mt-5">
          <BrutalButton onClick={onCancel} variant="paper" block disabled={busy}>
            annuleer
          </BrutalButton>
          <BrutalButton onClick={onConfirm} variant="hot" block disabled={busy}>
            {busy ? "toevoegen…" : "＋ voeg toe"}
          </BrutalButton>
        </div>
      </div>
    </div>
  );
}

function ConfirmLeaveModal({
  club, busy, onCancel, onConfirm,
}: {
  club: Club; busy: boolean;
  onCancel: () => void; onConfirm: () => void;
}) {
  useEffect(() => {
    document.body.classList.add("modal-open");
    return () => document.body.classList.remove("modal-open");
  }, []);
  return (
    <div
      onClick={onCancel}
      className="fixed inset-0 z-50 bg-ink/70 flex items-end sm:items-center
                 justify-center p-0 sm:p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md brut-card bg-paper shadow-brutLg p-5 rounded-none"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      >
        <h2 className="font-display text-2xl uppercase leading-tight">
          uit jouw seizoen?
        </h2>
        <p className="text-sm font-bold mt-2">
          <span className="bg-pop px-1">{club.name}</span> verdwijnt uit je
          seizoens-feed. De kantine en alle ratings blijven bestaan — je kan'm
          later weer toevoegen.
        </p>
        <div className="flex gap-2 mt-5">
          <BrutalButton onClick={onCancel} variant="paper" block disabled={busy}>
            annuleer
          </BrutalButton>
          <BrutalButton onClick={onConfirm} variant="hot" block disabled={busy}>
            {busy ? "verwijderen…" : "− verwijder"}
          </BrutalButton>
        </div>
      </div>
    </div>
  );
}
