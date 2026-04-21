/**
 * Kantine-picker voor het seizoen. Alleen bestaande kantines uit de seed
 * kunnen worden toegevoegd — geen fantasy-creatie.
 */
import { useMemo, useState } from "react";
import { friendlyError } from "../utils/errors";
import { useStore } from "../store";
import { client } from "../spacetime";
import { go } from "../router";
import { TopBar } from "../components/TopBar";
import { BrutalCard } from "../components/BrutalCard";
import { BrutalInput } from "../components/BrutalInput";
import { similarity } from "../utils/normalize";

export function AddClubPage() {
  const clubs = useStore((s) => s.clubs);
  const memberships = useStore((s) => s.memberships);
  const me = useStore((s) => s.session.me);

  const [query, setQuery] = useState(() => {
    const draft = sessionStorage.getItem("meatball.draftClubName");
    if (draft) sessionStorage.removeItem("meatball.draftClubName");
    return draft ?? "";
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Ik ken de club-ids die al in mijn seizoen zitten zodat we die kunnen markeren.
  const myClubIds = useMemo(() => {
    const s = new Set<string>();
    if (!me) return s;
    for (const m of memberships.values()) {
      if (m.user_id === me.id) s.add(m.club_id.toString());
    }
    return s;
  }, [me, memberships]);

  const results = useMemo(() => {
    const q = query.trim();
    if (q.length < 2) return [];
    const qLower = q.toLowerCase();
    return Array.from(clubs.values())
      .map((c) => ({
        c,
        // Substring eerst (1.0), anders fuzzy Dice-similarity.
        score: c.name.toLowerCase().includes(qLower)
          ? 1.0
          : similarity(c.name, q),
      }))
      .filter((x) => x.score > 0.42)
      .sort((a, b) => b.score - a.score)
      .slice(0, 30);
  }, [clubs, query]);

  const add = async (clubId: bigint) => {
    setBusy(true); setErr(null);
    try {
      await client().joinClub(clubId);
      go("/home");
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh flex flex-col">
      <TopBar title="Seizoen kantine" back="/home" />
      <main className="flex-1 p-4 flex flex-col gap-4">
        <h2 className="font-display text-2xl uppercase leading-tight">
          Kantine voor<br />
          <span className="bg-pop px-1">jouw seizoen</span>
        </h2>
        <p className="text-xs font-bold uppercase tracking-widest opacity-70 -mt-2">
          Kies uit de lijst · tik om toe te voegen
        </p>

        <BrutalInput
          autoFocus
          placeholder="Zoek kantine…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={60}
        />

        {err && (
          <p className="brut-card bg-hot text-paper p-2 font-bold">{err}</p>
        )}

        {query.trim().length < 2 && (
          <p className="text-sm font-bold opacity-60">
            Type minimaal 2 letters om te zoeken…
          </p>
        )}

        {query.trim().length >= 2 && results.length === 0 && (
          <BrutalCard className="!p-4 text-center">
            <p className="font-display text-lg uppercase">geen kantine gevonden</p>
            <p className="text-xs font-bold opacity-70 mt-1">
              Probeer andere spelling
            </p>
          </BrutalCard>
        )}

        <div className="flex flex-col gap-2">
          {results.map(({ c }) => {
            const already = myClubIds.has(c.id.toString());
            return (
              <button
                key={c.id.toString()}
                type="button"
                onClick={() => !already && !busy && add(c.id)}
                disabled={already || busy}
                className={`brut-card text-left !p-3 flex items-center gap-3
                  ${already ? "bg-paper opacity-50" : "bg-paper"}
                  active:translate-x-[2px] active:translate-y-[2px] transition-transform
                  disabled:cursor-not-allowed`}
              >
                <p className="flex-1 min-w-0 font-display text-lg uppercase leading-tight truncate">
                  {c.name}
                </p>
                {already ? (
                  <span className="shrink-0 brut-chip bg-mint !py-0.5 !px-1.5 text-[10px] font-display">
                    ✓ in seizoen
                  </span>
                ) : (
                  <span className="shrink-0 brut-chip bg-hot text-paper !py-0.5 !px-1.5 text-[10px] font-display">
                    + toevoegen
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </main>
    </div>
  );
}
