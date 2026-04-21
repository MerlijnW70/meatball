/**
 * Landing bij `/join/:code` — probeert de code direct te accepteren en
 * stuurt daarna door naar het team. Faalt gracieus met een foutmelding.
 */
import { useEffect, useState } from "react";
import { client } from "../spacetime";
import { useStore } from "../store";
import { go } from "../router";
import { TopBar } from "../components/TopBar";
import { BrutalCard } from "../components/BrutalCard";
import { BrutalButton } from "../components/BrutalButton";
import { friendlyError } from "../utils/errors";

export function JoinInvitePage({ code }: { code: string }) {
  const [state, setState] = useState<"idle" | "accepting" | "ok" | "err">("idle");
  const [err, setErr] = useState<string | null>(null);
  const me = useStore((s) => s.session.me);

  useEffect(() => {
    if (!me) return; // wacht tot we weten wie we zijn
    if (state !== "idle") return;
    setState("accepting");
    (async () => {
      try {
        await client().acceptGroupInvite(code);
        // Na acceptatie is er een nieuwe group_membership voor mij; pak de
        // meest recente en navigeer er naartoe.
        const me = useStore.getState().session.me;
        const latest = me
          ? Array.from(useStore.getState().groupMemberships.values())
              .filter((m) => m.user_id === me.id)
              .sort((a, b) => Number(b.joined_at) - Number(a.joined_at))[0]
          : null;
        if (latest) go(`/group/${latest.group_id}`);
        else go("/home");
        setState("ok");
      } catch (e) {
        setErr(friendlyError(e));
        setState("err");
      }
    })();
  }, [code, me, state]);

  return (
    <div className="min-h-dvh flex flex-col">
      <TopBar title="uitnodiging" back="/home" />
      <main className="flex-1 p-4 flex flex-col gap-3">
        {!me && (
          <BrutalCard tone="pop">
            <p className="font-display text-xl uppercase">eerst een naam</p>
            <p className="text-xs font-bold mt-1">
              Kies een screenname voor je meedoet.
            </p>
            <BrutalButton
              variant="ink" size="md" block className="mt-2"
              onClick={() => {
                // Bewaar de invite-code zodat we na onboarding hier terugkomen
                // om alsnog te accepteren (anders blijft de user op /home steken).
                sessionStorage.setItem("meatball.pendingInvite", code);
                go("/onboard/name");
              }}
            >
              Naam kiezen
            </BrutalButton>
          </BrutalCard>
        )}
        {state === "accepting" && (
          <BrutalCard>
            <p className="font-bold">bezig met toevoegen…</p>
          </BrutalCard>
        )}
        {state === "err" && (
          <BrutalCard tone="hot" className="text-paper">
            <p className="font-display uppercase">fout</p>
            <p className="text-xs mt-1">{err}</p>
            <BrutalButton
              variant="ink" size="md" block className="mt-3"
              onClick={() => go("/home")}
            >
              terug naar home
            </BrutalButton>
          </BrutalCard>
        )}
      </main>
    </div>
  );
}
