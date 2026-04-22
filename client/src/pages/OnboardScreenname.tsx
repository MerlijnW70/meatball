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
      // Wacht op user-row sync via subscription zodat session.me beschikbaar
      // is voor de vervolgstappen (invite-accept + membership-polling).
      let meNow = useStore.getState().session.me;
      for (let i = 0; i < 30 && !meNow; i++) {
        const id = session.identity;
        const found = Array.from(useStore.getState().users.values())
          .find((u) => u.identity === id);
        if (found) {
          useStore.getState().setMe(found);
          meNow = found;
          break;
        }
        await new Promise((r) => setTimeout(r, 100));
      }

      // WhatsApp-invite flow: accepteer de code DIRECT hier. Na accept wacht
      // op de nieuwe group_membership via subscription → team-page.
      // Check beide storages (iOS Safari kan sessionStorage tussen navigates
      // wipen; localStorage is backup).
      let pendingInvite: string | null = null;
      try { pendingInvite = sessionStorage.getItem("meatball.pendingInvite"); } catch {}
      if (!pendingInvite) {
        try { pendingInvite = localStorage.getItem("meatball.pendingInvite"); } catch {}
      }
      console.log("[onboard] pending invite:", pendingInvite, "me:", meNow?.id?.toString());
      if (pendingInvite) {
        try { sessionStorage.removeItem("meatball.pendingInvite"); } catch {}
        try { localStorage.removeItem("meatball.pendingInvite"); } catch {}
        let inviteErr: string | null = null;
        try {
          await client().acceptGroupInvite(pendingInvite);
          console.log("[onboard] invite accepted");
        }
        catch (e) {
          inviteErr = friendlyError(e);
          console.warn("[onboard] invite accept failed:", inviteErr);
        }
        if (!inviteErr && meNow) {
          let teamId: bigint | null = null;
          for (let i = 0; i < 40; i++) {
            const latest = Array.from(useStore.getState().groupMemberships.values())
              .filter((m) => m.user_id === meNow!.id)
              .sort((a, b) => Number(b.joined_at) - Number(a.joined_at))[0];
            if (latest) { teamId = latest.group_id; break; }
            await new Promise((r) => setTimeout(r, 150));
          }
          console.log("[onboard] team after invite:", teamId?.toString() ?? "NOT FOUND");
          if (teamId) { go(`/group/${teamId}`); return; }
        }
        if (inviteErr) {
          setErr(`Team niet gekoppeld: ${inviteErr}`);
          return;
        }
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
            je veld positie
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

