/**
 * Team-detail: spelerslijst gegroepeerd per linie (keeper / verdedigers /
 * middenvelders / aanvallers) + Bank voor overschot per linie. Admin-acties
 * (invite delen, seizoen pushen, opheffen/verlaten) zitten in GroupManageModal
 * achter het ⚙-icoon in de TopBar.
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
import type { Position } from "../types";

// Standaard 4-3-3 formatie: hoeveel per linie "in het veld" staan.
// De rest gaat naar de bank, per-linie-overflow.
const LINE_CAPS: Record<Position, number> = {
  keeper: 1,
  verdediger: 4,
  middenvelder: 3,
  aanvaller: 3,
};

const LINE_ORDER: Position[] = ["keeper", "verdediger", "middenvelder", "aanvaller"];

const LINE_LABEL: Record<Position, string> = {
  keeper: "keeper",
  verdediger: "verdedigers",
  middenvelder: "middenvelders",
  aanvaller: "aanvallers",
};

const LINE_ICON: Record<Position, string> = {
  keeper: "🧤",
  verdediger: "🛡",
  middenvelder: "🎯",
  aanvaller: "⚽",
};

type RowWithPos = GroupMemberRow & { position: Position | null };

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

  // Verrijk members met hun positie en verdeel over linies + bank.
  const { byLine, bench, noPosition } = useMemo(() => {
    const rows: RowWithPos[] = members.map((m) => ({
      ...m,
      position: (userPositions.get(m.userId.toString())?.position as Position | undefined) ?? null,
    }));
    // Trainer (owner) eerst binnen elke linie, dan joined_at volgorde (al gesorteerd).
    const sorted = [...rows].sort((a, b) => {
      if (a.isOwner && !b.isOwner) return -1;
      if (!a.isOwner && b.isOwner) return 1;
      return 0;
    });

    const byLine: Record<Position, RowWithPos[]> = {
      keeper: [], verdediger: [], middenvelder: [], aanvaller: [],
    };
    const bench: RowWithPos[] = [];
    const noPosition: RowWithPos[] = [];

    for (const r of sorted) {
      if (!r.position) {
        noPosition.push(r);
        continue;
      }
      const cap = LINE_CAPS[r.position];
      if (byLine[r.position].length < cap) byLine[r.position].push(r);
      else bench.push(r);
    }
    return { byLine, bench, noPosition };
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
        <TopBar title="team" back="/groups" hideCrews />
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

  const renderRow = (m: RowWithPos, { showKick }: { showKick: boolean }) => (
    <BrutalCard
      key={m.membership.id.toString()}
      className="!p-2 flex items-center gap-2"
    >
      <Avatar userId={m.userId} size="sm" />
      <button
        type="button"
        onClick={() => go(`/u/${m.userId}`)}
        className="font-display uppercase truncate flex-1 text-left"
      >
        {m.name}
      </button>
      {showKick && isOwner && !m.isOwner && (
        <button
          type="button"
          onClick={() => setKickTarget({ id: m.userId, name: m.name })}
          className="brut-chip bg-hot text-paper !py-0.5 !px-1.5 text-[10px]
                     active:translate-x-[1px] active:translate-y-[1px] transition-transform"
        >
          sell
        </button>
      )}
      {m.isOwner && (
        <span className="brut-chip bg-pop !py-0.5 !px-1.5 text-[10px]">
          Trainer
        </span>
      )}
    </BrutalCard>
  );

  return (
    <div className="min-h-dvh flex flex-col">
      <TopBar title="team" sub={group.name} back="/groups" hideCrews right={manageButton} />
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

        {/* Linies */}
        {LINE_ORDER.map((pos) => {
          const rows = byLine[pos];
          if (rows.length === 0) return (
            <Line key={pos} pos={pos} empty />
          );
          return (
            <Line key={pos} pos={pos}>
              <div className="flex flex-col gap-1.5">
                {rows.map((m) => renderRow(m, { showKick: true }))}
              </div>
            </Line>
          );
        })}

        {/* Bank */}
        {bench.length > 0 && (
          <section>
            <h3 className="font-display text-lg uppercase mb-2 flex items-center gap-2">
              <span aria-hidden>🪑</span>
              <span>bank · {bench.length}</span>
            </h3>
            <div className="flex flex-col gap-1.5">
              {bench.map((m) => renderRow(m, { showKick: true }))}
            </div>
          </section>
        )}

        {/* Geen positie gekozen */}
        {noPosition.length > 0 && (
          <section>
            <h3 className="font-display text-lg uppercase mb-2 flex items-center gap-2">
              <span aria-hidden>❓</span>
              <span>geen positie</span>
            </h3>
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-60 mb-1">
              deze spelers moeten nog een positie kiezen in hun profiel
            </p>
            <div className="flex flex-col gap-1.5">
              {noPosition.map((m) => renderRow(m, { showKick: true }))}
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

function Line({ pos, empty, children }: {
  pos: Position;
  empty?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="font-display text-lg uppercase mb-2 flex items-center gap-2">
        <span aria-hidden>{LINE_ICON[pos]}</span>
        <span>{LINE_LABEL[pos]}</span>
      </h3>
      {empty ? (
        <p className="text-[11px] font-bold uppercase tracking-widest opacity-50">
          nog niemand in deze linie
        </p>
      ) : children}
    </section>
  );
}
