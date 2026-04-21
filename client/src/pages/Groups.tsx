/**
 * Crews overzicht: jouw groepen + actie om een nieuwe aan te maken of
 * een uitnodigingscode te plakken.
 */
import { useState } from "react";
import { useMyGroups } from "../hooks";
import { client } from "../spacetime";
import { go } from "../router";
import { TopBar } from "../components/TopBar";
import { BrutalCard } from "../components/BrutalCard";
import { BrutalButton } from "../components/BrutalButton";
import { BrutalInput } from "../components/BrutalInput";
import { useStore } from "../store";
import { friendlyError } from "../utils/errors";

export function GroupsPage() {
  const groups = useMyGroups();
  const me = useStore((s) => s.session.me);
  const ownsTeam = !!me && groups.some((g) => g.owner_user_id === me.id);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const create = async () => {
    if (!me) return;
    setBusy(true); setErr(null);
    const prevMax = Array.from(useStore.getState().groups.values())
      .reduce((acc, g) => g.id > acc ? g.id : acc, 0n);
    try {
      await client().createGroup(name.trim());
      setName("");
      // Wacht kort op het nieuwe team via subscription, navigeer dan door.
      for (let i = 0; i < 30; i++) {
        const fresh = Array.from(useStore.getState().groups.values())
          .filter((g) => g.owner_user_id === me.id && g.id > prevMax)
          .sort((a, b) => Number(b.id - a.id))[0];
        if (fresh) { go(`/group/${fresh.id}`); return; }
        await new Promise((r) => setTimeout(r, 100));
      }
    } catch (e) { setErr(friendlyError(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-dvh flex flex-col">
      <TopBar title="team" back="/home" hideCrews />
      <main className="flex-1 p-4 flex flex-col gap-4">

        {!ownsTeam && (
          <BrutalCard tone="pop" className="!p-3">
            <p className="text-xs font-bold uppercase tracking-widest mb-2">
              Team oprichten
            </p>
            <BrutalInput
              placeholder="bv. VV Gehaktbal"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && canCreate() && create()}
              maxLength={40}
            />
            <BrutalButton
              variant="hot" size="md" block
              disabled={!canCreate()}
              onClick={create}
              className="mt-2"
            >
              {busy ? "…" : "+ maak team"}
            </BrutalButton>
          </BrutalCard>
        )}

        {/* Aangemaakte teams direct onder 'Team oprichten' — alleen als je er
            minstens één hebt. */}
        {groups.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="font-display text-lg uppercase">jouw team</h3>
            {groups.map((g) => (
              <button
                key={g.id.toString()}
                type="button"
                onClick={() => go(`/group/${g.id}`)}
                className="brut-card bg-paper p-3 text-left
                           active:translate-x-[2px] active:translate-y-[2px] transition-transform"
              >
                <p className="font-display text-xl uppercase truncate">{g.name}</p>
              </button>
            ))}
          </section>
        )}

        {err && (
          <p className="brut-card bg-hot text-paper p-2 font-bold">{err}</p>
        )}
      </main>
    </div>
  );

  function canCreate() {
    return !busy && name.trim().length >= 3;
  }
}
