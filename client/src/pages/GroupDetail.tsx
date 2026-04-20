/**
 * Team-detail: 4-3-3 opstelling. Elk slot is uniek per team — eerste speler
 * met dat positie-slot krijgt 'm, rest gaat naar de bank. Admin-acties
 * (invite, deel seizoen, opheffen) zitten in GroupManageModal via ⚙.
 */
import { useMemo, useState } from "react";
import { useGroup, useGroupMembers, useIsGroupMember, type GroupMemberRow } from "../hooks";
import { useStore } from "../store";
import { client } from "../spacetime";
import { go } from "../router";
import { TopBar } from "../components/TopBar";
import { BrutalCard } from "../components/BrutalCard";
import { Avatar } from "../components/Avatar";
import { ConfirmModal } from "../components/ConfirmModal";
import { GroupManageModal } from "../components/GroupManageModal";
import { friendlyError } from "../utils/errors";
import { POSITION_LABEL, POSITION_SHORT, type Position } from "../types";

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

    for (const r of rows) {
      if (r.position && !slotOwner.has(r.position)) {
        slotOwner.set(r.position, r);
      } else {
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
                  canKick={isOwner}
                  onKick={(id, name) => setKickTarget({ id, name })}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Wissels — onbeperkt. Overschot per slot + spelers zonder positie. */}
        {wissels.length > 0 && (
          <section>
            <h3 className="font-display text-lg uppercase mb-2 flex items-center gap-2">
              <span aria-hidden>🪑</span>
              <span>wissels · {wissels.length}</span>
            </h3>
            <div className="flex flex-col gap-1.5">
              {wissels.map((m) => (
                <BenchRow
                  key={m.membership.id.toString()}
                  row={m}
                  canKick={isOwner}
                  onKick={(id, name) => setKickTarget({ id, name })}
                />
              ))}
            </div>
          </section>
        )}

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

/** Eén slot op het veld — speler of leeg. */
function SlotTile({
  pos, row, canKick, onKick,
}: {
  pos: Position;
  row: RowWithPos | null;
  canKick: boolean;
  onKick: (id: bigint, name: string) => void;
}) {
  if (!row) {
    return (
      <div className="border-4 border-dashed border-paper/60 py-3 px-1 text-center
                      font-display uppercase text-paper text-[10px] leading-tight
                      bg-ink/10">
        <p className="opacity-70">leeg</p>
        <p className="mt-1">{POSITION_SHORT[pos]}</p>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => go(`/u/${row.userId}`)}
      aria-label={row.name}
      title={row.name}
      className="border-4 border-ink py-2 px-1 bg-paper text-ink text-center
                 shadow-brutSm flex flex-col items-center gap-1
                 active:translate-x-[2px] active:translate-y-[2px] transition-transform"
    >
      <Avatar userId={row.userId} size="sm" />
      <span className="text-[9px] font-bold uppercase tracking-widest opacity-70">
        {POSITION_SHORT[pos]}
      </span>
      {row.isOwner && (
        <span className="brut-chip bg-pop !py-0 !px-1 text-[9px] leading-none">
          Trainer
        </span>
      )}
      {canKick && !row.isOwner && (
        <span
          role="button"
          onClick={(e) => { e.stopPropagation(); onKick(row.userId, row.name); }}
          className="brut-chip bg-hot text-paper !py-0 !px-1 text-[9px] leading-none
                     active:translate-x-[1px] active:translate-y-[1px] transition-transform"
        >
          sell
        </span>
      )}
    </button>
  );
}

function BenchRow({
  row, canKick, onKick,
}: {
  row: RowWithPos;
  canKick: boolean;
  onKick: (id: bigint, name: string) => void;
}) {
  return (
    <BrutalCard className="!p-2 flex items-center gap-2">
      <Avatar userId={row.userId} size="sm" />
      <button
        type="button"
        onClick={() => go(`/u/${row.userId}`)}
        className="font-display uppercase truncate flex-1 text-left"
      >
        {row.name}
      </button>
      {row.position ? (
        <span className="brut-chip bg-sky text-paper !py-0.5 !px-1.5 text-[10px]">
          {POSITION_LABEL[row.position]}
        </span>
      ) : (
        <span className="brut-chip bg-ink text-paper !py-0.5 !px-1.5 text-[10px] opacity-70">
          geen positie
        </span>
      )}
      {row.isOwner && (
        <span className="brut-chip bg-pop !py-0.5 !px-1.5 text-[10px]">Trainer</span>
      )}
      {canKick && !row.isOwner && (
        <button
          type="button"
          onClick={() => onKick(row.userId, row.name)}
          className="brut-chip bg-hot text-paper !py-0.5 !px-1.5 text-[10px]
                     active:translate-x-[1px] active:translate-y-[1px] transition-transform"
        >
          sell
        </button>
      )}
    </BrutalCard>
  );
}
