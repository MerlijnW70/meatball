/**
 * Beheer-modal voor een team. Bevat alle admin-acties die voorheen op de
 * GroupDetail-pagina stonden: invite-code + delen, seizoen pushen (owner),
 * verlaten / opheffen. Open via het ⚙-icoon op GroupDetail.
 */
import { useEffect, useMemo, useState } from "react";
import { useGroupMembers, useMyClubs, useMyInviteFor, useMyInviteReveal } from "../hooks";
import { useStore } from "../store";
import { client } from "../spacetime";
import { go } from "../router";
import { BrutalCard } from "./BrutalCard";
import { BrutalButton } from "./BrutalButton";
import { ConfirmModal } from "./ConfirmModal";
import { friendlyError } from "../utils/errors";
import type { Group } from "../types";

interface Props {
  group: Group;
  onClose: () => void;
}

export function GroupManageModal({ group, onClose }: Props) {
  const me = useStore((s) => s.session.me);
  const members = useGroupMembers(group.id);
  const myInvite = useMyInviteFor(group.id);
  const myClubs = useMyClubs(500);
  const reveal = useMyInviteReveal(myInvite?.id ?? null);

  const isOwner = useMemo(
    () => !!me && group.owner_user_id === me.id,
    [me, group],
  );

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [shareSeasonOpen, setShareSeasonOpen] = useState(false);

  const shareUrl = reveal
    ? `${location.origin}${location.pathname}#/join/${reveal.code}`
    : "";

  useEffect(() => {
    document.body.classList.add("modal-open");
    return () => document.body.classList.remove("modal-open");
  }, []);

  const flashCopied = (which: "code" | "link") => {
    setCopied(which);
    setTimeout(() => setCopied((c) => (c === which ? null : c)), 1500);
  };

  const copyText = async (text: string): Promise<boolean> => {
    if (navigator.clipboard?.writeText) {
      try { await navigator.clipboard.writeText(text); return true; } catch {}
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch { return false; }
  };

  const copyCode = async () => {
    if (!reveal) return;
    const ok = await copyText(reveal.code);
    if (ok) { flashCopied("code"); setErr(null); }
    else setErr("Kopiëren lukte niet — selecteer de code handmatig.");
  };

  const copyLink = async () => {
    if (!shareUrl) return;
    const ok = await copyText(shareUrl);
    if (ok) { flashCopied("link"); setErr(null); }
    else setErr("Kopiëren lukte niet — selecteer de link handmatig.");
  };

  const shareWhatsapp = () => {
    if (!reveal) return;
    const msg = `Doe mee met ${group.name} op Meatball 🥩\n${shareUrl}`;
    const nav = navigator as Navigator & {
      share?: (d: { title?: string; text?: string; url?: string }) => Promise<void>;
    };
    if (typeof nav.share === "function") {
      nav.share({
        title: `Meatball · ${group.name}`, text: msg, url: shareUrl,
      }).catch(() => {
        window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
      });
      return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const regenerateInvite = async () => {
    setBusy(true); setErr(null);
    try { await client().regenerateGroupInvite(group.id); }
    catch (e) { setErr(friendlyError(e)); }
    finally { setBusy(false); }
  };

  const confirmReplace = async () => {
    await regenerateInvite();
    setReplaceOpen(false);
  };

  const confirmShareSeason = async () => {
    setBusy(true); setErr(null);
    try {
      await client().shareSeasonWithCrew(group.id);
      setShareSeasonOpen(false);
    } catch (e) { setErr(friendlyError(e)); }
    finally { setBusy(false); }
  };

  const confirmLeave = async () => {
    setBusy(true); setErr(null);
    try {
      await client().leaveGroup(group.id);
      setLeaveOpen(false);
      onClose();
      go("/home");
    } catch (e) { setErr(friendlyError(e)); setLeaveOpen(false); }
    finally { setBusy(false); }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-ink/70 flex items-end sm:items-center
                 justify-center p-0 sm:p-6 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md brut-card bg-paper shadow-brutLg p-5 rounded-none
                   max-h-dvh overflow-y-auto flex flex-col gap-4"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl uppercase">beheer team</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="sluiten"
            className="brut-btn bg-ink text-paper !py-2 !px-4 text-lg"
          >
            ✕
          </button>
        </div>

        {/* Invite sectie */}
        <section>
          <h3 className="font-display text-lg uppercase mb-2">koop speler</h3>
          <BrutalCard tone="pop" className="!p-3">
            {reveal ? (
              <>
                <p className="text-[10px] font-bold uppercase tracking-widest opacity-70">
                  code
                </p>
                <p className="font-display text-4xl tracking-widest select-all">
                  {reveal.code}
                </p>
                <BrutalButton
                  onClick={shareWhatsapp}
                  variant="mint" size="lg" block
                  className="mt-3"
                >
                  💬 deel uitnodiging
                </BrutalButton>
                <div className="flex gap-2 mt-2">
                  <BrutalButton
                    onClick={copyLink}
                    variant={copied === "link" ? "mint" : "ink"}
                    size="sm" block
                  >
                    {copied === "link" ? "✓ gekopieerd" : "📋 kopieer link"}
                  </BrutalButton>
                  <BrutalButton
                    onClick={copyCode}
                    variant={copied === "code" ? "mint" : "paper"}
                    size="sm" block
                  >
                    {copied === "code" ? "✓ gekopieerd" : "📋 code"}
                  </BrutalButton>
                </div>
              </>
            ) : (
              <>
                <p className="text-xs font-bold">
                  {myInvite
                    ? "De code is niet meer zichtbaar — alleen 5 min na aanmaken. Maak een nieuwe om te delen."
                    : "Nog geen code — maak je eigen uitnodiging aan om vrienden erbij te halen."}
                </p>
                <BrutalButton
                  onClick={regenerateInvite}
                  variant="hot" size="md" block
                  disabled={busy}
                  className="mt-3"
                >
                  {busy ? "…" : myInvite ? "🔄 maak nieuwe code" : "+ maak mijn code"}
                </BrutalButton>
              </>
            )}

            {reveal && (
              <button
                type="button"
                onClick={() => setReplaceOpen(true)}
                disabled={busy}
                className="block w-full text-[10px] font-bold uppercase
                           tracking-widest opacity-60 mt-3 hover:opacity-100"
              >
                vervang code
              </button>
            )}
          </BrutalCard>
        </section>

        {/* Owner: deel seizoen */}
        {isOwner && members.length > 1 && myClubs.length > 0 && (
          <BrutalButton
            onClick={() => setShareSeasonOpen(true)}
            variant="sky" size="md" block
            disabled={busy}
          >
            📋 deel mijn seizoen ({myClubs.length}) met het team
          </BrutalButton>
        )}

        {/* Owner: pending invite-requests */}
        {isOwner && (
          <PendingRequestsSection
            groupId={group.id}
            onError={setErr}
            busy={busy}
            setBusy={setBusy}
          />
        )}

        {err && (
          <p className="brut-card bg-hot text-paper p-2 font-bold">{err}</p>
        )}

        {/* Verlaten / opheffen */}
        <BrutalButton
          onClick={() => setLeaveOpen(true)}
          variant="ink" size="md" block
          disabled={busy} className="mt-2"
        >
          {isOwner ? "Trainer — team opheffen" : "verlaat team"}
        </BrutalButton>
      </div>

      <ConfirmModal
        open={leaveOpen}
        title={isOwner ? "team opheffen?" : "team verlaten?"}
        body={isOwner
          ? <>Je bent de <span className="bg-pop px-1">Trainer</span> van <span className="bg-pop px-1">{group.name}</span>. Als je vertrekt en er zijn geen andere spelers meer, wordt het team én alle uitnodigingen definitief opgeheven.</>
          : <>Je verdwijnt uit <span className="bg-pop px-1">{group.name}</span>. Je kan later weer mee via een nieuwe uitnodiging.</>
        }
        confirmLabel={isOwner ? "opheffen" : "verlaat"}
        cancelLabel="blijf"
        variant="hot"
        busy={busy}
        onCancel={() => setLeaveOpen(false)}
        onConfirm={confirmLeave}
      />

      <ConfirmModal
        open={shareSeasonOpen}
        title="seizoen delen?"
        body={
          <>
            Alle <span className="bg-pop px-1">{myClubs.length}</span> kantines uit jouw seizoen
            worden toegevoegd aan het seizoen van <span className="bg-pop px-1">{members.length}</span> teamgenoten (inclusief jezelf).
            Bestaande kantines blijven staan.
          </>
        }
        confirmLabel="deel"
        cancelLabel="annuleer"
        variant="mint"
        busy={busy}
        onCancel={() => setShareSeasonOpen(false)}
        onConfirm={confirmShareSeason}
      />

      <ConfirmModal
        open={replaceOpen}
        title="vervang code?"
        body={<>De huidige code wordt ongeldig. Bestaande links werken niet meer. Spelers die al lid zijn, blijven erbij.</>}
        confirmLabel="vervang"
        cancelLabel="laat staan"
        variant="hot"
        busy={busy}
        onCancel={() => setReplaceOpen(false)}
        onConfirm={confirmReplace}
      />
    </div>
  );
}

/** Lijst van openstaande invite-requests voor dit team; Trainer kan
 *  per request goedkeuren of afwijzen. */
function PendingRequestsSection({
  groupId, onError, busy, setBusy,
}: {
  groupId: bigint;
  onError: (msg: string | null) => void;
  busy: boolean;
  setBusy: (v: boolean) => void;
}) {
  const requests = useStore((s) => s.inviteRequests);
  const users = useStore((s) => s.users);
  const pending = useMemo(
    () => Array.from(requests.values())
      .filter((r) => r.group_id === groupId)
      .sort((a, b) => Number(a.requested_at) - Number(b.requested_at)),
    [requests, groupId],
  );

  if (pending.length === 0) return null;

  const approve = async (id: bigint) => {
    setBusy(true); onError(null);
    try { await client().approveInviteRequest(id); }
    catch (e) { onError(friendlyError(e)); }
    finally { setBusy(false); }
  };
  const reject = async (id: bigint) => {
    setBusy(true); onError(null);
    try { await client().rejectInviteRequest(id); }
    catch (e) { onError(friendlyError(e)); }
    finally { setBusy(false); }
  };

  return (
    <section>
      <p className="text-xs font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5">
        <span className="inline-block w-2 h-2 bg-hot border border-ink"
          style={{ animation: "livepulse 1.2s ease-in-out infinite" }} />
        invite-requests · {pending.length}
      </p>
      <div className="flex flex-col gap-1.5">
        {pending.map((r) => {
          const u = users.get(r.from_user_id.toString());
          return (
            <BrutalCard key={r.id.toString()} className="!p-2 flex items-center gap-2">
              <p className="flex-1 min-w-0 font-display uppercase truncate">
                {u?.screen_name ?? "iemand"}
              </p>
              <button
                type="button"
                onClick={() => reject(r.id)}
                disabled={busy}
                aria-label="afwijzen"
                className="brut-chip bg-ink text-paper !py-0.5 !px-2 text-[10px]
                           active:translate-x-[1px] active:translate-y-[1px] transition-transform"
              >
                ✕ nee
              </button>
              <button
                type="button"
                onClick={() => approve(r.id)}
                disabled={busy}
                aria-label="goedkeuren"
                className="brut-chip bg-mint !py-0.5 !px-2 text-[10px] font-display
                           active:translate-x-[1px] active:translate-y-[1px] transition-transform"
              >
                ✓ ja
              </button>
            </BrutalCard>
          );
        })}
      </div>
    </section>
  );
}
