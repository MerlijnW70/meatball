import { useMemo, useState } from "react";
import { friendlyError } from "../utils/errors";
import { validateScreenname } from "../utils/screenname";
import { defaultAvatarFor, TONE_BG } from "../utils/avatar";
import {
  ALLOWED_AVATAR_COLORS, ALLOWED_AVATAR_ICONS, ALLOWED_POSITIONS,
  type Position,
} from "../types";
import { BrutalButton } from "../components/BrutalButton";
import { BrutalInput } from "../components/BrutalInput";
import { TopBar } from "../components/TopBar";
import { Avatar } from "../components/Avatar";
import { go } from "../router";
import { client } from "../spacetime";
import { useStore } from "../store";

const POSITION_LABELS: Record<Position, string> = {
  keeper: "keeper",
  verdediger: "verdediger",
  middenvelder: "middenvelder",
  aanvaller: "aanvaller",
};

const POSITION_ICON: Record<Position, string> = {
  keeper: "🧤",
  verdediger: "🛡",
  middenvelder: "🎯",
  aanvaller: "⚽",
};

export function OnboardScreennamePage() {
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const session = useStore((s) => s.session);
  const users = useStore((s) => s.users);

  // null betekent: volg deterministische default uit de naam.
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
  // Decor blijft "none|none|0" zodat we geen patronen/rotaties meer opleggen,
  // maar het server-schema hetzelfde blijft.
  const decor = "none|none|0";

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
        const me = Array.from(useStore.getState().users.values())
          .find((u) => u.identity === id);
        if (me) useStore.getState().setMe(me);
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
      <TopBar title="Je naam" back="/" />
      <main className="flex-1 p-5 flex flex-col gap-5 pb-10">
        <h2 className="font-display text-3xl uppercase leading-tight">
          Kies een <span className="bg-pop px-1">screenname</span>
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

        {/* Avatar */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <Avatar userId={null} size="xl" override={{
              color: avatar.color, icon: avatar.icon, decor,
            }} />
            <div className="flex-1 min-w-0">
              <p className="font-display text-xl uppercase leading-tight">jouw avatar</p>
              <p className="text-[10px] font-bold uppercase tracking-widest opacity-70">
                kies een kleur + icoon
              </p>
            </div>
          </div>

          <Sub label="kleur">
            <div className="grid grid-cols-8 gap-1">
              {ALLOWED_AVATAR_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  aria-label={c}
                  className={`${TONE_BG[c]} aspect-square border-4 border-ink
                    ${avatar.color === c ? "ring-4 ring-ink" : "shadow-brutSm"}
                    active:translate-x-[2px] active:translate-y-[2px] transition-transform`}
                />
              ))}
            </div>
          </Sub>

          <Sub label="icoon">
            <div className="grid grid-cols-8 gap-1">
              {ALLOWED_AVATAR_ICONS.map((i) => (
                <button key={i} type="button" onClick={() => setIcon(i)}
                  aria-pressed={avatar.icon === i}
                  className={`aspect-square border-2 border-ink text-lg
                    ${avatar.icon === i ? "bg-ink text-paper" : "bg-paper"}
                    active:translate-x-[2px] active:translate-y-[2px] transition-transform`}
                >{i}</button>
              ))}
            </div>
          </Sub>
        </section>

        {/* Veldpositie */}
        <section>
          <p className="text-[10px] font-bold uppercase tracking-widest opacity-70 mb-2">
            jouw positie op het veld
          </p>
          <div className="grid grid-cols-2 gap-2">
            {ALLOWED_POSITIONS.map((p) => {
              const active = position === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPosition(p)}
                  aria-pressed={active}
                  className={`flex items-center gap-2 border-4 border-ink py-2 px-3
                    font-display uppercase text-sm shadow-brutSm
                    ${active ? "bg-ink text-paper" : "bg-paper"}
                    active:translate-x-[2px] active:translate-y-[2px] transition-transform`}
                >
                  <span className="text-xl leading-none" aria-hidden>
                    {POSITION_ICON[p]}
                  </span>
                  <span className="truncate">{POSITION_LABELS[p]}</span>
                </button>
              );
            })}
          </div>
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

function Sub({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest opacity-70 mb-1">
        {label}
      </p>
      {children}
    </div>
  );
}
