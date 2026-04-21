/**
 * Wedstrijd-playback — dumb renderer + game-netwerk-style interpolation.
 *
 * Server (Rust) is authoritative: tick_positions (5Hz) werkt x/y bij met
 * phase / pressure / support / smooth wander. Client:
 *   - Bufferd twee server-snapshots per speler (prev + target)
 *   - Interpoleert lineair tussen die twee over exact SERVER_TICK_MS
 *   - GPU-composited via CSS transform + container query units
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { getActiveConnection, subscribeMatch, unsubscribeMatch } from "../spacetime/subscriptions";
import { useStore } from "../store";
import { TopBar } from "../components/TopBar";
import { BrutalCard } from "../components/BrutalCard";
import { Avatar } from "../components/Avatar";
import type { MatchEvent, MatchPlayer } from "../types";

// Server tikt posities elke 100ms (10Hz) — deze constante bepaalt hoe lang
// de client-interpolatie loopt tussen twee snapshots.
const SERVER_TICK_MS = 110;
const BALL_TICK_MS = 110;
const GOAL_CELEBRATE_MS = 2200;

interface Pos { x: number; y: number; }
interface Interp {
  prevX: number; prevY: number;
  targetX: number; targetY: number;
  startedAt: number;
  seenX: number; seenY: number;
}

function makeInterp(x: number, y: number, now: number): Interp {
  return { prevX: x, prevY: y, targetX: x, targetY: y, startedAt: now, seenX: x, seenY: y };
}

function computeDisplay(st: Interp, now: number, windowMs: number): Pos {
  const t = Math.min(1, (now - st.startedAt) / windowMs);
  // Ease-in-out maakt overgangen iets organischer dan puur lineair.
  const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  return {
    x: st.prevX + (st.targetX - st.prevX) * eased,
    y: st.prevY + (st.targetY - st.prevY) * eased,
  };
}

/** Update interp state als server een nieuwe positie heeft gestuurd. */
function observeServerPos(
  st: Interp, serverX: number, serverY: number, now: number, windowMs: number,
): Interp {
  if (serverX === st.seenX && serverY === st.seenY) return st;
  const cur = computeDisplay(st, now, windowMs);
  return {
    prevX: cur.x, prevY: cur.y,
    targetX: serverX, targetY: serverY,
    startedAt: now,
    seenX: serverX, seenY: serverY,
  };
}

export function MatchPage({ matchId }: { matchId: bigint }) {
  const matchRow = useStore((s) => s.matches.get(matchId.toString()));
  const matchEvents = useStore((s) => s.matchEvents);
  const matchPlayers = useStore((s) => s.matchPlayers);
  const clubs = useStore((s) => s.clubs);
  const groups = useStore((s) => s.groups);

  useEffect(() => {
    const conn = getActiveConnection();
    if (conn) subscribeMatch(conn, matchId);
    return () => unsubscribeMatch();
  }, [matchId]);

  const events = useMemo(() => {
    const mid = matchId.toString();
    return Array.from(matchEvents.values())
      .filter((e) => e.match_id.toString() === mid)
      .sort((a, b) => (a.minute - b.minute) || Number(a.id - b.id));
  }, [matchEvents, matchId]);

  const players = useMemo(() => {
    const mid = matchId.toString();
    return Array.from(matchPlayers.values())
      .filter((p) => p.match_id.toString() === mid);
  }, [matchPlayers, matchId]);

  const entityName = (id: bigint, isGroup: boolean, fallback: string) => {
    const key = id.toString();
    if (isGroup) return groups.get(key)?.name ?? fallback;
    return clubs.get(key)?.name ?? fallback;
  };
  const homeName = matchRow
    ? entityName(matchRow.home_club_id, matchRow.home_is_group, "thuis")
    : "thuis";
  const awayName = matchRow
    ? entityName(matchRow.away_club_id, matchRow.away_is_group, "uit")
    : "uit";

  const lastEvent = events[events.length - 1];
  const currentMinute = lastEvent?.minute ?? 0;
  const isFinished = events.some((e) => e.kind.tag === "FullTime");

  const lastEventIdRef = useRef<string | null>(null);
  const lastEventArrivedAtRef = useRef<number>(0);
  const currentEventId = lastEvent?.id.toString() ?? null;
  if (currentEventId && currentEventId !== lastEventIdRef.current) {
    lastEventIdRef.current = currentEventId;
    lastEventArrivedAtRef.current = performance.now();
  }

  const homeScore = matchRow?.home_score ?? 0;
  const awayScore = matchRow?.away_score ?? 0;

  // Interp state per speler + bal.
  const playerInterpRef = useRef<Map<string, Interp>>(new Map());
  const ballInterpRef = useRef<Interp>(makeInterp(50, 50, performance.now()));

  // Update interp-state bij nieuwe server-posities.
  const now = performance.now();
  for (const p of players) {
    const key = p.id.toString();
    const cur = playerInterpRef.current.get(key);
    if (!cur) {
      playerInterpRef.current.set(key, makeInterp(p.x, p.y, now));
    } else {
      playerInterpRef.current.set(key, observeServerPos(cur, p.x, p.y, now, SERVER_TICK_MS));
    }
  }
  if (matchRow) {
    ballInterpRef.current = observeServerPos(
      ballInterpRef.current, matchRow.ball_x, matchRow.ball_y, now, BALL_TICK_MS,
    );
  }

  // RAF → re-render elke frame voor interpolatie.
  const [, setFrame] = useState(0);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      setFrame((f) => (f + 1) % 1_000_000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const sinceLastEvent = now - lastEventArrivedAtRef.current;
  const scorerPlayerId =
    lastEvent?.kind.tag === "Goal" ? lastEvent.match_player_id : 0n;
  const scorerCelebrating = scorerPlayerId !== 0n && sinceLastEvent < GOAL_CELEBRATE_MS;

  if (!matchRow) {
    return (
      <div className="min-h-dvh flex flex-col">
        <TopBar title="wedstrijd" back="/home" />
        <main className="flex-1 p-6">
          <BrutalCard><p className="font-bold">Wedstrijd laadt…</p></BrutalCard>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col">
      <TopBar title="wedstrijd" back="/home" />
      <main className="flex-1 px-3 py-4 flex flex-col gap-4 max-w-2xl w-full mx-auto">
        <BrutalCard className="!p-0 overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center">
            <div className="bg-pop px-3 py-3 border-r-4 border-ink">
              <p className="text-[10px] font-bold uppercase tracking-widest opacity-70">thuis</p>
              <p className="font-display text-lg uppercase leading-tight truncate">{homeName}</p>
            </div>
            <div className="bg-ink text-paper px-4 py-3 flex items-center gap-2">
              <span className="font-display text-3xl">{homeScore}</span>
              <span className="font-display text-xl opacity-60">–</span>
              <span className="font-display text-3xl">{awayScore}</span>
            </div>
            <div className="bg-sky px-3 py-3 border-l-4 border-ink text-right">
              <p className="text-[10px] font-bold uppercase tracking-widest opacity-70">uit</p>
              <p className="font-display text-lg uppercase leading-tight truncate">{awayName}</p>
            </div>
          </div>
          <div className="bg-paper border-t-4 border-ink px-3 py-2 flex items-center justify-between text-sm">
            <span className="font-display uppercase">
              {isFinished ? "afgelopen" : `${currentMinute}'`}
              {!isFinished && currentMinute >= 45 && currentMinute < 90 ? " · 2e helft" : ""}
            </span>
            {!isFinished && (
              <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest">
                <span
                  className="inline-block w-1.5 h-1.5 bg-hot border border-ink"
                  style={{ animation: "livepulse 1.2s ease-in-out infinite" }}
                />
                live
              </span>
            )}
          </div>
        </BrutalCard>

        <Pitch
          players={players}
          playerInterpRef={playerInterpRef}
          ballInterp={ballInterpRef.current}
          scorerPlayerId={scorerCelebrating ? scorerPlayerId : 0n}
          now={now}
        />

        <section>
          <h3 className="font-display text-lg uppercase mb-2">verslag</h3>
          <div className="flex flex-col gap-1.5">
            {events.length === 0 && (
              <p className="text-sm opacity-60 font-bold">fluitsignaal volgt…</p>
            )}
            {[...events].reverse().map((e) => (
              <EventRow key={e.id.toString()} ev={e} />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function Pitch({
  players, playerInterpRef, ballInterp, scorerPlayerId, now,
}: {
  players: MatchPlayer[];
  playerInterpRef: React.MutableRefObject<Map<string, Interp>>;
  ballInterp: Interp;
  scorerPlayerId: bigint;
  now: number;
}) {
  return (
    <div
      className="relative mx-auto border-4 border-ink shadow-brutSm"
      style={{
        aspectRatio: "3 / 5",
        // Cap hoogte op 55dvh zodat scorebord + pitch + wat events
        // tegelijk in beeld passen op elk device. Breedte volgt aspect.
        width: "min(100%, 22rem, calc(55dvh * 3 / 5))",
        background: "#1FAE6B",
        backgroundImage: `repeating-linear-gradient(
          180deg, rgba(255,255,255,0.07) 0 8%, transparent 8% 16%)`,
        // Schakel container query units aan op kinderen (cqw / cqh).
        containerType: "size",
      }}
    >
      <svg
        viewBox="0 0 100 100" preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full pointer-events-none"
      >
        <rect x="1" y="1" width="98" height="98" fill="none" stroke="white" strokeWidth="0.4" opacity="0.6" />
        <line x1="1" y1="50" x2="99" y2="50" stroke="white" strokeWidth="0.4" opacity="0.6" />
        <circle cx="50" cy="50" r="8" fill="none" stroke="white" strokeWidth="0.4" opacity="0.6" />
        <rect x="25" y="87" width="50" height="12" fill="none" stroke="white" strokeWidth="0.4" opacity="0.6" />
        <rect x="25" y="1" width="50" height="12" fill="none" stroke="white" strokeWidth="0.4" opacity="0.6" />
        <rect x="40" y="99" width="20" height="1" fill="white" opacity="0.8" />
        <rect x="40" y="0" width="20" height="1" fill="white" opacity="0.8" />
      </svg>

      {players.map((p) => {
        const st = playerInterpRef.current.get(p.id.toString());
        const disp = st ? computeDisplay(st, now, SERVER_TICK_MS) : { x: p.x, y: p.y };
        const isScorer = scorerPlayerId !== 0n && p.id === scorerPlayerId;
        const isBot = p.user_id === 0n;
        return (
          <div
            key={p.id.toString()}
            className="absolute top-0 left-0"
            style={{
              // GPU-composited transform i.p.v. layout-triggering left/top.
              transform:
                `translate(${disp.x}cqw, ${disp.y}cqh) ` +
                `translate(-50%, -50%) ` +
                `scale(${isScorer ? 1.35 : 1})`,
              filter: isScorer ? "drop-shadow(0 0 6px #FFE066)" : undefined,
              zIndex: isScorer ? 4 : 2,
              willChange: "transform",
            }}
            title={p.display_name}
          >
            <Avatar
              userId={isBot ? null : p.user_id}
              override={isBot ? {
                color: p.avatar_color, icon: p.avatar_icon, decor: "none|none|0",
              } : undefined}
              size="xs"
            />
          </div>
        );
      })}

      {(() => {
        const bd = computeDisplay(ballInterp, now, BALL_TICK_MS);
        return (
          <div
            className="absolute top-0 left-0 w-3 h-3 rounded-full bg-paper border-2 border-ink shadow"
            style={{
              transform:
                `translate(${bd.x}cqw, ${bd.y}cqh) translate(-50%, -50%)`,
              zIndex: 5,
              willChange: "transform",
            }}
            aria-hidden
          />
        );
      })()}
    </div>
  );
}

function EventRow({ ev }: { ev: MatchEvent }) {
  const tone =
    ev.kind.tag === "Goal" ? "bg-pop" :
    ev.kind.tag === "SaveByKeeper" ? "bg-sky text-paper" :
    ev.kind.tag === "FullTime" ? "bg-ink text-paper" :
    ev.kind.tag === "HalfTime" ? "bg-ink text-paper" :
    "bg-paper";
  return (
    <div className={`brut-card !p-2 flex items-center gap-2 ${tone}`}>
      <span className="font-display text-xs uppercase tracking-widest w-10 shrink-0">
        {ev.minute}&apos;
      </span>
      <span className="text-sm font-bold flex-1 leading-tight">{ev.text}</span>
    </div>
  );
}
