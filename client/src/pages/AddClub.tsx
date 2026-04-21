import { useMemo, useState } from "react";
import { friendlyError } from "../utils/errors";
import { useStore } from "../store";
import { client } from "../spacetime";
import { go } from "../router";
import { TopBar } from "../components/TopBar";
import { BrutalCard } from "../components/BrutalCard";
import { BrutalButton } from "../components/BrutalButton";
import { BrutalInput } from "../components/BrutalInput";
import { normalizeName, similarity } from "../utils/normalize";
import { waitFor } from "../utils/wait";

export function AddClubPage() {
  const clubs = useStore((s) => s.clubs);
  const setSession = useStore((s) => s.setSession);

  const [clubName, setClubName] = useState(() => {
    const draft = sessionStorage.getItem("meatball.draftClubName");
    if (draft) sessionStorage.removeItem("meatball.draftClubName");
    return draft ?? "";
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const dupeClubs = useMemo(() => {
    if (clubName.trim().length < 3) return [];
    return Array.from(clubs.values())
      .map((c) => ({ c, s: similarity(c.name, clubName) }))
      .filter((x) => x.s > 0.55)
      .sort((a, b) => b.s - a.s)
      .slice(0, 3);
  }, [clubs, clubName]);

  const canSubmit = clubName.trim().length >= 2 && !busy;

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      // Geen provincie/stad meer vereist — server staat 0 toe als "onbekend".
      await client().addClub(clubName.trim(), 0n, 0n);
      // Wacht kort tot de nieuwe club via subscription binnen is zodat 'ie
      // ook al op de feed staat wanneer we navigeren. Daarna altijd terug
      // naar de seizoens-feed (i.p.v. direct de club-page openen).
      const ckey = normalizeName(clubName);
      await waitFor((state) =>
        Array.from(state.clubs.values()).find((c) => c.name_key === ckey),
      );
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
          Zoek bestaande of type nieuwe naam
        </p>

        <BrutalInput
          autoFocus
          placeholder="bv. VV Gruno"
          value={clubName}
          onChange={(e) => setClubName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && canSubmit && submit()}
          maxLength={60}
        />

        {dupeClubs.length > 0 && (
          <BrutalCard tone="sky" className="!p-3">
            <p className="text-xs font-bold uppercase mb-2">misschien bedoel je?</p>
            <div className="flex flex-col gap-2">
              {dupeClubs.map(({ c }) => (
                <button
                  key={c.id.toString()}
                  type="button"
                  onClick={() => {
                    setSession({
                      clubId: c.id, cityId: c.city_id, provinceId: c.province_id,
                    });
                    go(`/club/${c.id}`);
                  }}
                  className="text-left brut-card bg-paper text-ink p-2"
                >
                  <span className="font-display uppercase">{c.name}</span>
                </button>
              ))}
            </div>
          </BrutalCard>
        )}

        {err && <p className="brut-card bg-hot text-paper p-2 font-bold">{err}</p>}

        <BrutalButton
          variant="hot" size="lg" block
          disabled={!canSubmit}
          onClick={submit}
        >
          {busy ? "opslaan…" : "toevoegen"}
        </BrutalButton>
      </main>
    </div>
  );
}
