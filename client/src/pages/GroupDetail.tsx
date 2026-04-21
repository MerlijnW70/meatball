/**
 * Team-detail: 4-3-3 opstelling. Elk slot is uniek per team — eerste speler
 * met dat positie-slot krijgt 'm, rest gaat naar de bank. Admin-acties
 * (invite, deel seizoen, opheffen) zitten in GroupManageModal via ⚙.
 */
import { useMemo, useState } from "react";
import { useGroup, useGroupMembers, useIsGroupMember, type GroupMemberRow } from "../hooks";
import { useStore } from "../store";
import { client } from "../spacetime";
import { TopBar } from "../components/TopBar";
import { BrutalCard } from "../components/BrutalCard";
import { Avatar } from "../components/Avatar";
import { UserMenu } from "../components/UserMenu";
import { ConfirmModal } from "../components/ConfirmModal";
import { GroupManageModal } from "../components/GroupManageModal";
import { friendlyError } from "../utils/errors";
import { FIELD_POSITIONS, POSITION_LABEL, POSITION_SHORT, type Position } from "../types";

type RowWithPos = GroupMemberRow & { position: Position | null };

// 4-3-3 opstelling van voorlijn → keeper (zoals je op een tactiek-bord kijkt).
const FORMATION: Position[][] = [
  ["lw", "st", "rw"],
  ["lm", "cm", "rm"],
  ["lb", "lcb", "rcb", "rb"],
  ["keeper"],
];

export function GroupDetailPage({ groupId }: { groupId: bigint }) {
  const me = useStore((s) => s.session.me);
  const group = useGroup(groupId);
  const members = useGroupMembers(groupId);
  const isMember = useIsGroupMember(groupId);
  const userPositions = useStore((s) => s.userPositions);
  const sessions = useStore((s) => s.sessions);

  // Set van online user-ids voor snelle lookup in de speler-cards.
  const onlineSet = useMemo(() => {
    const s = new Set<string>();
    for (const sess of sessions.values()) {
      if (sess.user_id !== 0n) s.add(sess.user_id.toString());
    }
    return s;
  }, [sessions]);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [kickTarget, setKickTarget] = useState<{ id: bigint; name: string } | null>(null);
  const [manageOpen, setManageOpen] = useState(false);

  const isOwner = useMemo(
    () => !!me && !!group && group.owner_user_id === me.id,
    [me, group],
  );

  // Verrijk + verdeel: eerste speler per slot op veld, rest → wissels
  // (onbeperkt). Spelers zonder positie gaan ook naar wissels.
  const { slotOwner, wissels } = useMemo(() => {
    const rows: RowWithPos[] = members
      .map((m) => ({
        ...m,
        position:
          (userPositions.get(m.userId.toString())?.position as Position | undefined) ?? null,
      }))
      // Trainer eerst, dan joined_at volgorde.
      .sort((a, b) => {
        if (a.isOwner && !b.isOwner) return -1;
        if (!a.isOwner && b.isOwner) return 1;
        return 0;
      });

    const slotOwner = new Map<Position, RowWithPos>();
    const wissels: RowWithPos[] = [];

    const isField = (p: Position | null): p is Position =>
      !!p && (FIELD_POSITIONS as Position[]).includes(p);
    for (const r of rows) {
      if (isField(r.position) && !slotOwner.has(r.position)) {
        slotOwner.set(r.position, r);
      } else {
        // Inclusief `wissel` (expliciet gekozen bank) + no-position + overflow.
        wissels.push(r);
      }
    }
    return { slotOwner, wissels };
  }, [members, userPositions]);

  const confirmKick = async () => {
    if (!kickTarget) return;
    const target = kickTarget;
    setBusy(true); setErr(null);
    try { await client().kickGroupMember(groupId, target.id); }
    catch (e) { setErr(friendlyError(e)); }
    finally {
      setBusy(false);
      setKickTarget(null);
    }
  };

  const claimSlot = async (pos: Position) => {
    setBusy(true); setErr(null);
    try { await client().setPosition(pos); }
    catch (e) { setErr(friendlyError(e)); }
    finally { setBusy(false); }
  };

  if (!group) {
    return (
      <div className="min-h-dvh flex flex-col">
        <TopBar title="team" back="/home" hideCrews />
        <main className="flex-1 p-6">
          <BrutalCard>
            <p className="font-bold">Team niet gevonden.</p>
          </BrutalCard>
        </main>
      </div>
    );
  }

  const manageButton = isMember ? (
    <button
      type="button"
      onClick={() => setManageOpen(true)}
      aria-label="beheer"
      className="shrink-0 w-10 h-10 border-4 border-ink bg-mint text-ink shadow-brutSm
                 flex items-center justify-center rounded-none
                 active:translate-x-[2px] active:translate-y-[2px] transition-transform"
    >
      <span className="text-xl leading-none" aria-hidden>⚙</span>
    </button>
  ) : undefined;

  return (
    <div className="min-h-dvh flex flex-col">
      <TopBar title="team" sub={group.name} back="/home" hideCrews right={manageButton} />
      <main className="flex-1 px-4 py-5 flex flex-col gap-5">

        {!isMember && (
          <BrutalCard tone="hot" className="!p-3 text-paper">
            <p className="font-display uppercase">je zit niet in dit team</p>
            <p className="text-[11px] font-bold mt-1 opacity-90">
              Vraag een speler om een uitnodigingscode.
            </p>
          </BrutalCard>
        )}

        <p className="text-xs font-bold uppercase tracking-widest opacity-70">
          opstelling · 4-3-3 · {members.length} {members.length === 1 ? "speler" : "spelers"}
        </p>

        {/* Pitch */}
        <div
          className="brut-card !p-3 flex flex-col gap-2"
          style={{
            background: "#00D2A0",
            backgroundImage: `repeating-linear-gradient(
              180deg,
              rgba(255,255,255,0.08) 0 24px,
              transparent 24px 48px
            )`,
          }}
        >
          {FORMATION.map((row, rIdx) => (
            <div
              key={rIdx}
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}
            >
              {row.map((pos) => (
                <SlotTile
                  key={pos}
                  pos={pos}
                  row={slotOwner.get(pos) ?? null}
                  canClaim={isMember}
                  onClaim={() => claimSlot(pos)}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Ga-zelf-op-de-bank — leden kunnen altijd naar de bank */}
        {isMember && (
          <button
            type="button"
            onClick={() => claimSlot("wissel")}
            disabled={busy}
            className="border-4 border-ink py-2 px-3 bg-paper font-display uppercase text-sm
                       shadow-brutSm flex items-center justify-center gap-2
                       active:translate-x-[2px] active:translate-y-[2px] transition-transform
                       disabled:opacity-50"
          >
            <span aria-hidden>🪑</span> zet mezelf op de bank
          </button>
        )}

        {/* Spelers — interactieve cards. Tap op kaart opent reactie/volg/profiel
            popup via UserMenu; alles frictionless, één tap.  */}
        {(() => {
          const fieldPlayers: RowWithPos[] = FIELD_POSITIONS
            .map((pos) => slotOwner.get(pos))
            .filter((r): r is RowWithPos => !!r);
          if (fieldPlayers.length === 0 && wissels.length === 0) return null;
          return (
            <section>
              <h3 className="font-display text-lg uppercase mb-2">
                spelers · {members.length}
              </h3>

              {fieldPlayers.length > 0 && (
                <>
                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-60 mb-1.5 flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 bg-mint border border-ink" />
                    in het veld · {fieldPlayers.length}
                  </p>
                  <div className="flex flex-col gap-1.5 mb-3">
                    {fieldPlayers.map((m) => (
                      <PlayerCard
                        key={m.membership.id.toString()}
                        row={m}
                        isOnline={onlineSet.has(m.userId.toString())}
                        canKick={isOwner}
                        onKick={(id, name) => setKickTarget({ id, name })}
                      />
                    ))}
                  </div>
                </>
              )}

              {wissels.length > 0 && (
                <>
                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-60 mb-1.5 flex items-center gap-1.5">
                    <span aria-hidden>🪑</span>
                    op de bank · {wissels.length}
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {wissels.map((m) => (
                      <PlayerCard
                        key={m.membership.id.toString()}
                        row={m}
                        isOnline={onlineSet.has(m.userId.toString())}
                        canKick={isOwner}
                        onKick={(id, name) => setKickTarget({ id, name })}
                      />
                    ))}
                  </div>
                </>
              )}
            </section>
          );
        })()}

        {err && (
          <p className="brut-card bg-hot text-paper p-2 font-bold">{err}</p>
        )}
      </main>

      {manageOpen && (
        <GroupManageModal
          group={group}
          onClose={() => setManageOpen(false)}
        />
      )}

      <ConfirmModal
        open={!!kickTarget}
        title="speler verkopen?"
        body={kickTarget && (
          <><span className="bg-pop px-1">{kickTarget.name}</span> wordt uit het team verkocht. Ze kunnen alleen terug met een nieuwe code.</>
        )}
        confirmLabel="sell"
        cancelLabel="annuleer"
        variant="hot"
        busy={busy}
        onCancel={() => setKickTarget(null)}
        onConfirm={confirmKick}
      />
    </div>
  );
}

/** Eén slot op het veld — speler (tap → UserMenu popup) of leeg slot. */
function SlotTile({
  pos, row, canClaim, onClaim,
}: {
  pos: Position;
  row: RowWithPos | null;
  canClaim: boolean;
  onClaim: () => void;
}) {
  if (!row) {
    const empty = (
      <>
        <span className="opacity-70 text-[10px]">leeg</span>
        <span className="mt-1 text-[11px]">{POSITION_SHORT[pos]}</span>
      </>
    );
    return canClaim ? (
      <button
        type="button"
        onClick={onClaim}
        aria-label={`kies ${POSITION_SHORT[pos]}`}
        title={`kies ${POSITION_SHORT[pos]}`}
        className="border-4 border-dashed border-paper/70 py-3 px-1 text-center
                   font-display uppercase text-paper leading-tight bg-ink/10
                   hover:bg-ink/20 active:translate-x-[2px] active:translate-y-[2px]
                   transition-transform flex flex-col items-center justify-center"
      >
        {empty}
      </button>
    ) : (
      <div className="border-4 border-dashed border-paper/60 py-3 px-1 text-center
                      font-display uppercase text-paper leading-tight bg-ink/10
                      flex flex-col items-center justify-center">
        {empty}
      </div>
    );
  }
  return (
    <UserMenu
      userId={row.userId}
      name={row.name}
      bare
      trigger={
        <div className="border-4 border-ink py-2 px-1 bg-paper text-ink text-center
                        shadow-brutSm flex flex-col items-center gap-1 w-full
                        active:translate-x-[2px] active:translate-y-[2px] transition-transform">
          <Avatar userId={row.userId} size="sm" />
          <span className="text-[9px] font-bold uppercase tracking-widest opacity-70">
            {POSITION_SHORT[pos]}
          </span>
        </div>
      }
    />
  );
}

/** Kaart per speler — hele kaart is tappable → UserMenu popup met
 *  reacties/volg/profiel. Kick-knop blijft apart voor de trainer. */
function PlayerCard({
  row, isOnline, canKick, onKick,
}: {
  row: RowWithPos;
  isOnline: boolean;
  canKick: boolean;
  onKick: (id: bigint, name: string) => void;
}) {
  return (
    <BrutalCard className="!p-0 flex items-stretch">
      <UserMenu
        userId={row.userId}
        name={row.name}
        bare
        className="flex-1 min-w-0"
        trigger={
          <div className="w-full flex items-center gap-2 p-2 text-left
                          active:translate-x-[1px] active:translate-y-[1px] transition-transform">
            <div className="relative shrink-0">
              <Avatar userId={row.userId} size="sm" />
              {isOnline && (
                <span
                  className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-mint
                             border-2 border-ink rounded-full"
                  style={{ animation: "livepulse 1.4s ease-in-out infinite" }}
                  aria-label="online"
                />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-display uppercase truncate leading-tight">
                {row.name}
                {row.isOwner && (
                  <span className="ml-1.5 text-sm leading-none" aria-label="trainer">👑</span>
                )}
              </p>
              <p className="text-[10px] font-bold uppercase tracking-widest opacity-60 leading-tight mt-0.5">
                {row.position
                  ? POSITION_LABEL[row.position]
                  : "geen positie"}
                {isOnline && <span className="text-mint ml-1.5">● live</span>}
              </p>
            </div>
          </div>
        }
      />
      {canKick && !row.isOwner && (
        <button
          type="button"
          onClick={() => onKick(row.userId, row.name)}
          aria-label="verkoop speler"
          className="shrink-0 w-10 border-l-4 border-ink bg-hot text-paper
                     font-display text-xs uppercase flex items-center justify-center
                     active:translate-x-[1px] active:translate-y-[1px] transition-transform"
        >
          sell
        </button>
      )}
    </BrutalCard>
  );
}
