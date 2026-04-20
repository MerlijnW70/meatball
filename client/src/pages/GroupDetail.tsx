/**
 * Team-detail: minimale spelerslijst + sell-acties voor de Trainer.
 * Alle admin-acties (invite delen, seizoen pushen, opheffen/verlaten) zitten
 * in de GroupManageModal, bereikbaar via het ⚙-icoon in de TopBar.
 */
import { useMemo, useState } from "react";
import { useGroup, useGroupMembers, useIsGroupMember } from "../hooks";
import { useStore } from "../store";
import { client } from "../spacetime";
import { go } from "../router";
import { TopBar } from "../components/TopBar";
import { BrutalCard } from "../components/BrutalCard";
import { Avatar } from "../components/Avatar";
import { ConfirmModal } from "../components/ConfirmModal";
import { GroupManageModal } from "../components/GroupManageModal";
import { friendlyError } from "../utils/errors";

export function GroupDetailPage({ groupId }: { groupId: bigint }) {
  const me = useStore((s) => s.session.me);
  const group = useGroup(groupId);
  const members = useGroupMembers(groupId);
  const isMember = useIsGroupMember(groupId);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [kickTarget, setKickTarget] = useState<{ id: bigint; name: string } | null>(null);
  const [manageOpen, setManageOpen] = useState(false);

  const isOwner = useMemo(
    () => !!me && !!group && group.owner_user_id === me.id,
    [me, group],
  );

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

  return (
    <div className="min-h-dvh flex flex-col">
      <TopBar title="team" sub={group.name} back="/groups" hideCrews right={manageButton} />
      <main className="flex-1 px-4 py-5 flex flex-col gap-4">

        {!isMember && (
          <BrutalCard tone="hot" className="!p-3 text-paper">
            <p className="font-display uppercase">je zit niet in dit team</p>
            <p className="text-[11px] font-bold mt-1 opacity-90">
              Vraag een speler om een uitnodigingscode.
            </p>
          </BrutalCard>
        )}

        <section>
          <h3 className="font-display text-lg uppercase mb-2">
            spelers · {members.length}
          </h3>
          <div className="flex flex-col gap-1.5">
            {members.map((m) => (
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
                {isOwner && !m.isOwner && (
                  <button
                    type="button"
                    onClick={() => setKickTarget({ id: m.userId, name: m.name })}
                    className="brut-chip bg-hot text-paper !py-0.5 !px-1.5 text-[10px]
                               active:translate-x-[1px] active:translate-y-[1px] transition-transform"
                  >
                    sell
                  </button>
                )}
                {m.isOwner ? (
                  <span className="brut-chip bg-pop !py-0.5 !px-1.5 text-[10px]">
                    Trainer
                  </span>
                ) : (
                  <span className="brut-chip bg-sky text-paper !py-0.5 !px-1.5 text-[10px]">
                    speler
                  </span>
                )}
              </BrutalCard>
            ))}
          </div>
        </section>

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
