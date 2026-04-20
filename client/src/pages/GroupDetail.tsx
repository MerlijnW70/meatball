/**
 * Crew-detail: leden, crew-scoped activity, uitnodigingen + kick/leave.
 */
import { useMemo, useState } from "react";
import { useGroup, useGroupMembers, useIsGroupMember, useMyClubs, useMyInviteFor, useMyInviteReveal } from "../hooks";
import { useStore } from "../store";
import { client } from "../spacetime";
import { go } from "../router";
import { TopBar } from "../components/TopBar";
import { BrutalCard } from "../components/BrutalCard";
import { BrutalButton } from "../components/BrutalButton";
import { Avatar } from "../components/Avatar";
import { ConfirmModal } from "../components/ConfirmModal";
import { friendlyError } from "../utils/errors";

export function GroupDetailPage({ groupId }: { groupId: bigint }) {
  const me = useStore((s) => s.session.me);
  const group = useGroup(groupId);
  const members = useGroupMembers(groupId);
  const myInvite = useMyInviteFor(groupId);
  const isMember = useIsGroupMember(groupId);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [shareSeasonOpen, setShareSeasonOpen] = useState(false);
  const [kickTarget, setKickTarget] = useState<{ id: bigint; name: string } | null>(null);

  const isOwner = useMemo(
    () => !!me && !!group && group.owner_user_id === me.id,
    [me, group],
  );

  // Aantal eigen kantines (alleen relevant voor owner-share).
  const myClubs = useMyClubs(500);

  const reveal = useMyInviteReveal(myInvite?.id ?? null);
  const shareUrl = reveal
    ? `${location.origin}${location.pathname}#/join/${reveal.code}`
    : "";

  const regenerateInvite = async () => {
    setBusy(true); setErr(null);
    try { await client().regenerateGroupInvite(groupId); }
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
      await client().shareSeasonWithCrew(groupId);
      setShareSeasonOpen(false);
    } catch (e) { setErr(friendlyError(e)); }
    finally { setBusy(false); }
  };

  const flashCopied = (which: "code" | "link") => {
    setCopied(which);
    setTimeout(() => setCopied((c) => (c === which ? null : c)), 1500);
  };

  const copyText = async (text: string): Promise<boolean> => {
    // Moderne API — vereist secure context + toestemming.
    if (navigator.clipboard?.writeText) {
      try { await navigator.clipboard.writeText(text); return true; } catch {}
    }
    // Fallback: tijdelijke textarea + execCommand.
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
    else setErr("Kopiëren lukte niet — selecteer de code en kopieer handmatig.");
  };

  const copyLink = async () => {
    if (!shareUrl) return;
    const ok = await copyText(shareUrl);
    if (ok) { flashCopied("link"); setErr(null); }
    else setErr("Kopiëren lukte niet — selecteer de link en kopieer handmatig.");
  };

  const shareWhatsapp = () => {
    if (!reveal || !group) return;
    // Web Share API kiest op mobiel het OS-share-sheet (WhatsApp, iMessage, ...)
    // met Meatball pre-filled. Op desktop fallt 'ie terug op wa.me (WhatsApp Web).
    const msg = `Doe mee met ${group.name} op Meatball 🥩\n${shareUrl}`;
    const nav = navigator as Navigator & {
      share?: (d: { title?: string; text?: string; url?: string }) => Promise<void>;
    };
    if (typeof nav.share === "function") {
      nav.share({
        title: `Meatball · ${group.name}`,
        text: msg,
        url: shareUrl,
      }).catch(() => {
        // User cancelled of share faalde → fallback naar wa.me
        window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
      });
      return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const confirmLeave = async () => {
    setBusy(true); setErr(null);
    try {
      await client().leaveGroup(groupId);
      setLeaveOpen(false);
      go("/groups");
    } catch (e) { setErr(friendlyError(e)); setLeaveOpen(false); }
    finally { setBusy(false); }
  };

  const confirmKick = async () => {
    if (!kickTarget) return;
    const target = kickTarget;
    setBusy(true); setErr(null);
    try { await client().kickGroupMember(groupId, target.id); }
    catch (e) { setErr(friendlyError(e)); }
    finally {
      setBusy(false);
      setKickTarget(null);
    }
  };

  if (!group) {
    return (
      <div className="min-h-dvh flex flex-col">
        <TopBar title="crew" back="/groups" />
        <main className="flex-1 p-6">
          <BrutalCard>
            <p className="font-bold">Crew niet gevonden.</p>
          </BrutalCard>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col">
      <TopBar title={group.name} back="/groups" hideCrews />
      <main className="flex-1 px-4 py-5 flex flex-col gap-4">

        {!isMember && (
          <BrutalCard tone="hot" className="!p-3 text-paper">
            <p className="font-display uppercase">je bent geen lid</p>
            <p className="text-[11px] font-bold mt-1 opacity-90">
              Vraag een lid om een uitnodigingscode.
            </p>
          </BrutalCard>
        )}

        {/* Leden */}
        <section>
          <h3 className="font-display text-lg uppercase mb-2">
            leden · {members.length}
          </h3>
          <div className="flex flex-col gap-1.5">
            {members.map((m) => (
              <BrutalCard
                key={m.membership.id.toString()}
                className="!p-2 flex items-center gap-2"
              >
                <Avatar userId={m.userId} size="sm" />
                <button
                  type="button"
                  onClick={() => go(`/u/${m.userId}`)}
                  className="font-display uppercase truncate flex-1 text-left"
                >
                  {m.name}
                </button>
                {isOwner && !m.isOwner && (
                  <button
                    type="button"
                    onClick={() => setKickTarget({ id: m.userId, name: m.name })}
                    className="brut-chip bg-hot text-paper !py-0.5 !px-1.5 text-[10px]
                               active:translate-x-[1px] active:translate-y-[1px] transition-transform"
                  >
                    kick
                  </button>
                )}
                {m.isOwner ? (
                  <span className="brut-chip bg-pop !py-0.5 !px-1.5 text-[10px]">
                    owner
                  </span>
                ) : (
                  <span className="brut-chip bg-sky text-paper !py-0.5 !px-1.5 text-[10px]">
                    member
                  </span>
                )}
              </BrutalCard>
            ))}
          </div>
        </section>

        {/* Invite — één grote deel-knop als reveal fresh, anders vervang */}
        {isMember && (
          <section>
            <h3 className="font-display text-lg uppercase mb-2">nodig uit</h3>
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
        )}

        {err && (
          <p className="brut-card bg-hot text-paper p-2 font-bold">{err}</p>
        )}

        {/* Owner-only: push eigen seizoen naar alle leden */}
        {isOwner && members.length > 1 && myClubs.length > 0 && (
          <BrutalButton
            onClick={() => setShareSeasonOpen(true)}
            variant="sky" size="md" block
            disabled={busy} className="mt-2"
          >
            📋 deel mijn seizoen ({myClubs.length}) met de crew
          </BrutalButton>
        )}

        {isMember && (
          <BrutalButton
            onClick={() => setLeaveOpen(true)}
            variant="ink" size="md" block
            disabled={busy} className="mt-4"
          >
            {isOwner ? "owner — crew opheffen" : "verlaat crew"}
          </BrutalButton>
        )}
      </main>

      <ConfirmModal
        open={leaveOpen}
        title={isOwner ? "crew opheffen?" : "crew verlaten?"}
        body={isOwner
          ? <>Je bent de <span className="bg-pop px-1">owner</span> van <span className="bg-pop px-1">{group.name}</span>. Als je vertrekt en er zijn geen andere leden meer, wordt de crew én alle uitnodigingen definitief opgeheven.</>
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
            worden toegevoegd aan het seizoen van <span className="bg-pop px-1">{members.length}</span> crew-leden (inclusief jezelf).
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
        body={<>De huidige code wordt ongeldig. Bestaande links werken niet meer. Leden die al lid zijn, blijven lid.</>}
        confirmLabel="vervang"
        cancelLabel="laat staan"
        variant="hot"
        busy={busy}
        onCancel={() => setReplaceOpen(false)}
        onConfirm={confirmReplace}
      />

      <ConfirmModal
        open={!!kickTarget}
        title="lid eruit?"
        body={kickTarget && (
          <><span className="bg-pop px-1">{kickTarget.name}</span> wordt verwijderd uit de crew. Ze kunnen alleen terug met een nieuwe code.</>
        )}
        confirmLabel="kick"
        cancelLabel="annuleer"
        variant="hot"
        busy={busy}
        onCancel={() => setKickTarget(null)}
        onConfirm={confirmKick}
      />
    </div>
  );
}
