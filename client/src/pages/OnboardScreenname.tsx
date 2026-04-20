import { useMemo, useState } from "react";
import { friendlyError } from "../utils/errors";
import { validateScreenname } from "../utils/screenname";
import { defaultAvatarFor, randomAvatar } from "../utils/avatar";
import { ALLOWED_POSITIONS, POSITION_LABEL, POSITION_SHORT, type Position } from "../types";
import { BrutalButton } from "../components/BrutalButton";
import { BrutalInput } from "../components/BrutalInput";
import { TopBar } from "../components/TopBar";
import { Avatar } from "../components/Avatar";
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
      <TopBar title="speler" back="/" />
      <main className="flex-1 p-5 flex flex-col gap-5 pb-10">
        <h2 className="font-display text-3xl uppercase leading-tight">
          Kies een <span className="bg-pop px-1">spelersnaam</span>
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

        {/* Avatar preview + shuffle */}
        <section className="flex flex-col items-center gap-3">
          <Avatar userId={null} size="xl" override={{
            color: avatar.color, icon: avatar.icon, decor,
          }} />
          <BrutalButton onClick={shuffle} variant="pop" size="md">
            🎲 nieuwe look
          </BrutalButton>
        </section>

        {/* Veldpositie — 4-3-3 pitch */}
        <section>
          <p className="text-xs font-bold uppercase tracking-widest mb-2">
            jouw positie op het veld
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

/** 4-3-3 keuze-raster in de vorm van een voetbalveld van boven gezien. */
function PitchPicker({
  value, onChange,
}: {
  value: Position | null;
  onChange: (p: Position) => void;
}) {
  const rows: Position[][] = [
    ["lw", "st", "rw"],
    ["lm", "cm", "rm"],
    ["lb", "lcb", "rcb", "rb"],
    ["keeper"],
  ];

  return (
    <div className="brut-card bg-mint/70 !p-3 flex flex-col gap-2">
      {rows.map((row, i) => (
        <div key={i}
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}
        >
          {ALLOWED_POSITIONS.includes("keeper") /* type-guard */ && row.map((p) => {
            const on = value === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => onChange(p)}
                aria-pressed={on}
                aria-label={POSITION_LABEL[p]}
                title={POSITION_LABEL[p]}
                className={`border-4 border-ink py-3 px-1 text-center
                  font-display uppercase leading-none shadow-brutSm
                  ${on ? "bg-ink text-paper" : "bg-paper"}
                  active:translate-x-[2px] active:translate-y-[2px] transition-transform`}
              >
                <span className="block text-base">{POSITION_SHORT[p]}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
