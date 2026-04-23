/**
 * Account-koppeling via backup-code voor onze auth-loze app.
 *
 * Flow 1 — Maak code: client genereert random 8-char code, stuurt 'm
 * (plaintext) mee met create_backup_code. Server slaat alleen een
 * SHA-256 hash op. Code wordt éénmalig aan user getoond — zelf bewaren.
 *
 * Flow 2 — Gebruik code: user op nieuw device voert code in, server
 * swapt de identity tussen de auto-user en de target user, zodat je
 * je originele account + data terug hebt.
 */
import { useState } from "react";
import { useStore } from "../../store";
import { client } from "../../spacetime";
import { friendlyError } from "../../utils/errors";
import { INVITE_ALPHA, generateInviteCode } from "../../utils/inviteCode";
import { BrutalCard } from "../BrutalCard";
import { BrutalButton } from "../BrutalButton";
import { BrutalInput } from "../BrutalInput";

// Zelfde alphabet als invite-codes, 8 chars voor leesbaarheid.
const BACKUP_CODE_LEN = 8;

function makeBackupCode(): string {
  // 8 chars = 2× 4 chars — we bouwen 'm door 2× invite-code-generator
  // te concat'en (die is 6 chars); slice tot 8.
  // Alternatief: eigen crypto.getRandomValues — korter hier door generator
  // te recyclen voor consistentie.
  const a = generateInviteCode();
  const b = generateInviteCode();
  return (a + b).slice(0, BACKUP_CODE_LEN);
}

export function BackupCodeCard() {
  const me = useStore((s) => s.session.me);
  const [mode, setMode] = useState<"idle" | "show" | "input">("idle");
  const [generatedCode, setGeneratedCode] = useState<string>("");
  const [inputCode, setInputCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!me) return null;

  const createCode = async () => {
    setBusy(true); setErr(null);
    try {
      // 1x retryen bij collision (extreem zeldzaam bij 30^8 mogelijkheden).
      let code = makeBackupCode();
      try { await client().createBackupCode(code); }
      catch (e) {
        const msg = friendlyError(e);
        if (msg.toLowerCase().includes("bestaat al")) {
          code = makeBackupCode();
          await client().createBackupCode(code);
        } else {
          throw e;
        }
      }
      setGeneratedCode(code);
      setMode("show");
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(generatedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // negeer
    }
  };

  const normalizedInput = inputCode.trim().toUpperCase();
  const canRedeem =
    normalizedInput.length === BACKUP_CODE_LEN
    && [...normalizedInput].every((c) => INVITE_ALPHA.includes(c))
    && !busy;

  const redeem = async () => {
    if (!canRedeem) return;
    setBusy(true); setErr(null);
    try {
      await client().redeemBackupCode(normalizedInput);
      // Na identity-swap krijgt de client een nieuwe user-row binnen via
      // subscription; App.tsx syncf vervolgens session.me automatisch.
      setInputCode("");
      setMode("idle");
      // Korte bevestiging via alert — geen toasts (die staan uit).
      alert("Gekoppeld! Je account is hersteld.");
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BrutalCard tone="sky" className="!p-3 flex flex-col gap-2 text-paper">
      <p className="font-display text-lg uppercase leading-tight">
        🔐 backup-code
      </p>
      <p className="text-[10px] font-bold uppercase tracking-widest opacity-90 leading-tight">
        Hou je account bij 'n devicewissel of als je browser-data wordt gewist
      </p>

      {mode === "idle" && (
        <div className="flex flex-col gap-2 mt-1">
          <BrutalButton
            onClick={createCode} disabled={busy}
            variant="hot" size="md" block
          >
            {busy ? "…" : "🔑 maak nieuwe code"}
          </BrutalButton>
          <button
            type="button"
            onClick={() => setMode("input")}
            className="text-[10px] font-bold uppercase tracking-widest text-paper/80
                       hover:text-paper underline decoration-2 underline-offset-2"
          >
            ik heb al een code → koppel dit device
          </button>
          {err && (
            <p className="brut-card bg-hot text-paper p-2 font-bold text-xs">{err}</p>
          )}
        </div>
      )}

      {mode === "show" && (
        <div className="flex flex-col gap-2 mt-1">
          <div className="brut-card bg-paper text-ink !p-3 text-center">
            <p className="font-display text-3xl sm:text-4xl tracking-[0.25em] leading-none
                          select-all break-all">
              {generatedCode}
            </p>
          </div>
          <p className="text-[10px] font-bold uppercase tracking-widest opacity-90 leading-tight
                        bg-hot text-paper p-2 border-2 border-paper">
            ⚠️ bewaar 'm nú — server laat 'm niet nog 's zien
          </p>
          <div className="flex gap-2">
            <BrutalButton
              onClick={copyCode} disabled={copied}
              variant={copied ? "mint" : "ink"} size="sm" block
            >
              {copied ? "✓ gekopieerd" : "📋 kopieer"}
            </BrutalButton>
            <BrutalButton
              onClick={() => setMode("idle")}
              variant="paper" size="sm" block
            >
              klaar
            </BrutalButton>
          </div>
        </div>
      )}

      {mode === "input" && (
        <div className="flex flex-col gap-2 mt-1">
          <BrutalInput
            placeholder="X X X X X X X X"
            value={inputCode}
            onChange={(e) => {
              const up = e.target.value.toUpperCase();
              const cleaned = [...up].filter((c) => INVITE_ALPHA.includes(c))
                .slice(0, BACKUP_CODE_LEN).join("");
              setInputCode(cleaned);
              if (err) setErr(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && canRedeem && redeem()}
            maxLength={BACKUP_CODE_LEN}
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="tracking-[0.25em] text-center uppercase !text-ink"
          />
          {err && (
            <p className="brut-card bg-hot text-paper p-2 font-bold text-xs">{err}</p>
          )}
          <div className="flex gap-2">
            <BrutalButton
              onClick={() => { setMode("idle"); setInputCode(""); setErr(null); }}
              variant="paper" size="sm" block
            >
              terug
            </BrutalButton>
            <BrutalButton
              onClick={redeem} disabled={!canRedeem}
              variant="hot" size="sm" block
            >
              {busy ? "…" : "koppel →"}
            </BrutalButton>
          </div>
          <p className="text-[9px] font-bold uppercase tracking-widest opacity-80 leading-tight">
            Pas op: de account op dit device wordt vervangen. Data die je nu
            lokaal hebt (weinig bij eerste bezoek) gaat verloren.
          </p>
        </div>
      )}
    </BrutalCard>
  );
}
