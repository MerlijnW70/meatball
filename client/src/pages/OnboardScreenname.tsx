import { useMemo, useState } from "react";
import { friendlyError } from "../utils/errors";
import { validateScreenname } from "../utils/screenname";
import { defaultAvatarFor, randomAvatar } from "../utils/avatar";
import { type Position } from "../types";
import { BrutalButton } from "../components/BrutalButton";
import { BrutalInput } from "../components/BrutalInput";
import { TopBar } from "../components/TopBar";
import { Avatar } from "../components/Avatar";
import { PitchPicker } from "../components/PitchPicker";
import { go } from "../router";
import { client } from "../spacetime";
import { useStore } from "../store";

export function OnboardScreennamePage() {
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const session = useStore((s) => s.session);
  const users = useStore((s) => s.users);

  const [color, setColor] = useState<string | null>(null);
  const [icon, setIcon] = useState<string | null>(null);
  const [position, setPosition] = useState<Position | null>(null);

  const validation = useMemo(
    () => validateScreenname(name, users, session.identity),
    [name, users, session.identity],
  );
  const showClientError = touched && validation.kind === "invalid";
  const canSubmit = validation.kind === "valid" && !!position && !busy;

  const auto = defaultAvatarFor(name);
  const avatar = {
    color: color ?? auto.color,
    icon: icon ?? auto.icon,
  };
  const decor = "none|none|0";

  const shuffle = () => {
    const r = randomAvatar();
    setColor(r.color);
    setIcon(r.icon);
  };

  const submit = async () => {
    if (!canSubmit) return;
    setErr(null); setBusy(true);
    try {
      await client().registerUser(name.trim());
      try { await client().setAvatar(avatar.color, avatar.icon, decor); }
      catch { /* avatar non-critical */ }
      if (position) {
        try { await client().setPosition(position); }
        catch { /* positie non-critical */ }
      }
      if (!useStore.getState().session.me) {
        const id = session.identity;
        const meUser = Array.from(useStore.getState().users.values())
          .find((u) => u.identity === id);
        if (meUser) useStore.getState().setMe(meUser);
      }

      // WhatsApp-invite flow: accepteer de code DIRECT hier zodat we niet
      // afhankelijk zijn van redirect-timing + subscription-sync. Daarna
      // landen op de team-page i.p.v. home.
      const pendingInvite = sessionStorage.getItem("meatball.pendingInvite");
      if (pendingInvite) {
        sessionStorage.removeItem("meatball.pendingInvite");
        try { await client().acceptGroupInvite(pendingInvite); }
        catch (e) {
          // Al een error-UX tonen is overkill bij onboarding — log en ga door.
          console.warn("[onboard] invite accept failed", friendlyError(e));
        }
        // Wacht kort op de nieuwe group_membership via subscription.
        const meNow = useStore.getState().session.me;
        let teamId: bigint | null = null;
        for (let i = 0; i < 20 && meNow; i++) {
          const latest = Array.from(useStore.getState().groupMemberships.values())
            .filter((m) => m.user_id === meNow.id)
            .sort((a, b) => Number(b.joined_at) - Number(a.joined_at))[0];
          if (latest) { teamId = latest.group_id; break; }
          await new Promise((r) => setTimeout(r, 150));
        }
        if (teamId) { go(`/group/${teamId}`); return; }
      }
      go("/home");
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const inputTone =
    validation.kind === "valid" ? "ring-4 ring-mint"
    : showClientError ? "ring-4 ring-hot"
    : "";

  return (
    <div className="min-h-dvh flex flex-col">
      <TopBar title="speler" back="/" />
      <main className="flex-1 p-5 flex flex-col gap-5 pb-10">
        <h2 className="font-display text-3xl uppercase leading-tight">
          <span className="bg-pop px-1">spelersnaam</span>
        </h2>

        <div>
          <BrutalInput
            autoFocus
            placeholder="bv. FrikandelFred"
            value={name}
            maxLength={24}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            inputMode="text"
            onChange={(e) => {
              const cleaned = e.target.value.replace(/[^A-Za-z0-9_\-]/g, "");
              setName(cleaned);
              if (!touched) setTouched(true);
              if (err) setErr(null);
            }}
            onBlur={() => setTouched(true)}
            onKeyDown={(e) => e.key === "Enter" && canSubmit && submit()}
            className={inputTone}
          />
          {showClientError && (
            <p className="brut-card bg-hot text-paper p-2 mt-2 text-sm font-bold">
              {(validation as { kind: "invalid"; message: string }).message}
            </p>
          )}
          {validation.kind === "valid" && (
            <p className="text-xs font-bold uppercase tracking-widest text-mint mt-2">
              ✓ ziet er goed uit
            </p>
          )}
        </div>

        {/* Avatar preview — tik om te shufflen */}
        <section className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={shuffle}
            aria-label="shuffle avatar"
            className="rounded-none active:translate-x-[2px] active:translate-y-[2px]
                       transition-transform cursor-pointer"
          >
            <Avatar userId={null} size="xl" override={{
              color: avatar.color, icon: avatar.icon, decor,
            }} />
          </button>
          <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">
            🎲 tik voor nieuwe look
          </p>
        </section>

        {/* Veldpositie — 4-3-3 pitch */}
        <section>
          <p className="text-xs font-bold uppercase tracking-widest mb-2">
            Kantine positie
          </p>
          <PitchPicker value={position} onChange={setPosition} />
          {!position && (
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-60 mt-2">
              kies een positie om door te gaan
            </p>
          )}
        </section>

        {err && (
          <p className="brut-card bg-hot text-paper p-2 font-bold">{err}</p>
        )}

        <BrutalButton
          variant="hot" size="lg" block
          disabled={!canSubmit}
          onClick={submit}
        >
          {busy ? "…" : "volgende →"}
        </BrutalButton>
      </main>
    </div>
  );
}

