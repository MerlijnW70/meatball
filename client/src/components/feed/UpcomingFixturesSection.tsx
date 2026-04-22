/**
 * Komende real-life wedstrijden: toont per team-fixture een card met
 * datum + tegenstander + 3-state strip (voorspel / wacht op uitslag /
 * eindstand). Trainer ziet een 'plan wedstrijd' knop + 'voer uitslag in'.
 * Per team max 2 zichtbaar; rest achter expand-knop.
 */
import { useMemo, useState } from "react";
import { useStore } from "../../store";
import { BrutalCard } from "../BrutalCard";
import { FixtureCreateModal } from "../FixtureCreateModal";
import { PredictionModal } from "../PredictionModal";
import { ResultEntryModal } from "../ResultEntryModal";
import { formatKickoff } from "../../utils/format";
import {
  clearPredictionCache,
  loadPredictionCache,
} from "../../utils/predictionCache";
import type { Group, MatchFixture, MatchPrediction } from "../../types";

type MyPrediction = MatchPrediction | null;
type MyTip = { home: number; away: number } | null;

export function UpcomingFixturesSection() {
  const me = useStore((s) => s.session.me);
  const groupsMap = useStore((s) => s.groups);
  const groupMemberships = useStore((s) => s.groupMemberships);
  const fixturesMap = useStore((s) => s.matchFixtures);
  const clubsMap = useStore((s) => s.clubs);
  const [creatingForGroup, setCreatingForGroup] = useState<bigint | null>(null);

  // Groepen waar ik lid van ben.
  const myGroupIds = useMemo(() => {
    if (!me) return new Set<string>();
    const s = new Set<string>();
    for (const m of groupMemberships.values()) {
      if (m.user_id === me.id) s.add(m.group_id.toString());
    }
    return s;
  }, [groupMemberships, me]);

  // Open fixtures + recent-afgelopen (laatste 7 dagen) voor mijn teams.
  // Afgelopen fixtures blijven even zichtbaar zodat iedereen de punten ziet.
  const fixtures = useMemo(() => {
    const sevenDaysAgoMicros = (Date.now() - 7 * 24 * 60 * 60 * 1000) * 1000;
    return Array.from(fixturesMap.values())
      .filter((f) => {
        if (!myGroupIds.has(f.group_id.toString())) return false;
        if (!f.final_entered) return true;
        return f.kickoff_at > sevenDaysAgoMicros;
      })
      .sort((a, b) => {
        // Toekomstige fixtures eerst (chronologisch), dan afgelopen (nieuwste eerst).
        const af = a.final_entered;
        const bf = b.final_entered;
        if (af !== bf) return af ? 1 : -1;
        return af
          ? Number(b.kickoff_at - a.kickoff_at)
          : Number(a.kickoff_at - b.kickoff_at);
      });
  }, [fixturesMap, myGroupIds]);

  // Per team max 2 fixtures default — rest verstopt achter expand-knop.
  const fixturesByGroup = useMemo(() => {
    const map = new Map<string, MatchFixture[]>();
    for (const f of fixtures) {
      const key = f.group_id.toString();
      const arr = map.get(key);
      if (arr) arr.push(f);
      else map.set(key, [f]);
    }
    return map;
  }, [fixtures]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleExpand = (groupKey: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  };

  // Teams waar ik Trainer van ben — mogen fixtures toevoegen.
  const myTrainerGroups = useMemo(() => {
    if (!me) return [] as Group[];
    return Array.from(groupsMap.values())
      .filter((g) => g.owner_user_id === me.id);
  }, [groupsMap, me]);

  if (fixtures.length === 0 && myTrainerGroups.length === 0) return null;

  return (
    <section>
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <h3 className="font-display text-lg uppercase">
          {fixtures.length === 1 ? "komende wedstrijd" : "komende wedstrijden"}
        </h3>
        {myTrainerGroups.length === 1 && (
          <button
            type="button"
            onClick={() => setCreatingForGroup(myTrainerGroups[0].id)}
            className="border-2 border-ink py-1 px-2.5 bg-sky/30 text-ink text-[10px]
                       font-display uppercase tracking-widest
                       hover:bg-sky/50
                       active:translate-x-[1px] active:translate-y-[1px] transition-all"
          >
            + plan wedstrijd
          </button>
        )}
      </div>
      <p className="text-[11px] font-bold uppercase tracking-widest opacity-70 mb-3">
        Voorspel de uitslag · win kaart-punten voor je team
      </p>

      {fixtures.length === 0 ? (
        <BrutalCard className="!p-3 text-center">
          <p className="text-sm font-bold opacity-60">
            Nog geen wedstrijden gepland
          </p>
        </BrutalCard>
      ) : (
        <div className="flex flex-col gap-3">
          {Array.from(fixturesByGroup.entries()).map(([groupKey, groupFixtures]) => {
            const expanded = expandedGroups.has(groupKey);
            const visible = expanded ? groupFixtures : groupFixtures.slice(0, 2);
            const hidden = groupFixtures.length - visible.length;
            return (
              <div key={groupKey} className="flex flex-col gap-2">
                {visible.map((f) => {
                  const group = groupsMap.get(f.group_id.toString());
                  const opponent = clubsMap.get(f.opponent_club_id.toString());
                  return (
                    <FixtureCard
                      key={f.id.toString()}
                      fixture={f}
                      groupName={group?.name ?? "jouw team"}
                      opponentName={opponent?.name ?? "tegenstander"}
                    />
                  );
                })}
                {(hidden > 0 || (expanded && groupFixtures.length > 2)) && (
                  <button
                    type="button"
                    onClick={() => toggleExpand(groupKey)}
                    className="border-2 border-ink py-1.5 px-3 bg-paper text-[10px]
                               font-display uppercase tracking-widest text-ink/70
                               hover:bg-ink/5
                               active:translate-x-[1px] active:translate-y-[1px] transition-all"
                  >
                    {expanded
                      ? "− toon minder"
                      : `+ ${hidden} ${hidden === 1 ? "wedstrijd" : "wedstrijden"} meer`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {creatingForGroup !== null && (
        <FixtureCreateModal
          groupId={creatingForGroup}
          onClose={() => setCreatingForGroup(null)}
        />
      )}
    </section>
  );
}

function FixtureCard({
  fixture, groupName, opponentName,
}: {
  fixture: MatchFixture;
  groupName: string;
  opponentName: string;
}) {
  const me = useStore((s) => s.session.me);
  const groupsMap = useStore((s) => s.groups);
  const predictionsMap = useStore((s) => s.matchPredictions);
  const [predictOpen, setPredictOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);

  const group = groupsMap.get(fixture.group_id.toString());
  const isTrainer = !!me && !!group && group.owner_user_id === me.id;

  const kickoffMicros = fixture.kickoff_at;
  const kickoff = formatKickoff(kickoffMicros);

  const home = fixture.we_are_home ? groupName : opponentName;
  const away = fixture.we_are_home ? opponentName : groupName;

  const myPrediction = useMemo(() => {
    if (!me) return null;
    return Array.from(predictionsMap.values())
      .find((p) => p.fixture_id === fixture.id && p.user_id === me.id) ?? null;
  }, [predictionsMap, fixture.id, me]);

  const totalPredictions = useMemo(() => {
    return Array.from(predictionsMap.values())
      .filter((p) => p.fixture_id === fixture.id).length;
  }, [predictionsMap, fixture.id]);

  // Server-side home_score/away_score zijn 0 vóór reveal (privacy). Pre-reveal
  // lezen we de eigen tip uit localStorage; post-reveal komt 'ie uit de public
  // tabel (en ruimen we de cache op).
  const myTip = useMemo(() => {
    if (!me || !myPrediction) return null;
    if (myPrediction.scored) {
      clearPredictionCache(me.id, fixture.id);
      return { home: myPrediction.home_score, away: myPrediction.away_score };
    }
    return loadPredictionCache(me.id, fixture.id);
  }, [me, myPrediction, fixture.id]);

  const now = Date.now();
  const kickoffMs = kickoffMicros / 1000;
  const locked = now > kickoffMs - 60_000;
  const kickoffPassed = now > kickoffMs;
  const finished = fixture.final_entered;

  const topStripBg = finished ? "bg-mint text-ink" : "bg-ink text-paper";

  return (
    <>
      <BrutalCard className="!p-0 overflow-hidden">
        {/* Header: datum / tijd */}
        <div className={`${topStripBg} px-3 py-1.5 flex items-center justify-between text-[10px] font-display uppercase tracking-widest`}>
          <span>{kickoff.when}</span>
          <span className="opacity-70">
            {finished ? "afgelopen" : kickoffPassed ? "wacht op uitslag" : kickoff.relative}
          </span>
        </div>

        {/* Teams + evt. score */}
        <div className="px-3 py-2.5 flex items-center gap-2">
          <span className="font-display text-base uppercase leading-tight flex-1 min-w-0 truncate">
            {home}
          </span>
          {finished ? (
            <span className="font-display text-2xl tabular-nums px-2">
              {fixture.final_home_score}–{fixture.final_away_score}
            </span>
          ) : (
            <span className="font-display text-sm opacity-50">vs</span>
          )}
          <span className="font-display text-base uppercase leading-tight flex-1 min-w-0 truncate text-right">
            {away}
          </span>
        </div>

        {/* Bottom-strook verschilt per status */}
        {finished ? (
          <ResultStrip prediction={myPrediction} myTip={myTip} />
        ) : kickoffPassed ? (
          <AwaitingResultStrip
            isTrainer={isTrainer}
            hasPredicted={!!myPrediction}
            myTip={myTip}
            onEnterResult={() => setResultOpen(true)}
          />
        ) : (
          <PredictStrip
            hasPredicted={!!myPrediction}
            myTip={myTip}
            locked={locked}
            onPredict={() => setPredictOpen(true)}
          />
        )}

        {!finished && totalPredictions > 0 && (
          <div className="bg-paper px-3 py-1 text-[9px] font-bold uppercase tracking-widest opacity-60 text-center border-t-2 border-ink/20">
            {totalPredictions} {totalPredictions === 1 ? "speler heeft" : "spelers hebben"} voorspeld
          </div>
        )}
      </BrutalCard>

      {predictOpen && me && (
        <PredictionModal
          fixtureId={fixture.id}
          homeName={home}
          awayName={away}
          kickoffMicros={kickoffMicros}
          userId={me.id}
          initialHome={myTip?.home ?? null}
          initialAway={myTip?.away ?? null}
          onClose={() => setPredictOpen(false)}
        />
      )}
      {resultOpen && (
        <ResultEntryModal
          fixtureId={fixture.id}
          homeName={home}
          awayName={away}
          onClose={() => setResultOpen(false)}
        />
      )}
    </>
  );
}

function PredictStrip({
  hasPredicted, myTip, locked, onPredict,
}: {
  hasPredicted: boolean;
  myTip: MyTip;
  locked: boolean;
  onPredict: () => void;
}) {
  return (
    <div className="border-t-4 border-ink bg-mint/30 px-3 py-2 flex items-center gap-2">
      {hasPredicted ? (
        <>
          <span className="text-[10px] font-bold uppercase tracking-widest opacity-70 flex-1">
            jouw tip:
            <span className="ml-1 font-display text-sm text-ink">
              {myTip ? `${myTip.home}–${myTip.away}` : "ingestuurd ✓"}
            </span>
          </span>
          {!locked && (
            <button
              type="button"
              onClick={onPredict}
              className="border-2 border-ink py-1 px-2 bg-paper text-[10px] font-display uppercase
                         active:translate-x-[1px] active:translate-y-[1px] transition-transform"
            >
              wijzig
            </button>
          )}
        </>
      ) : (
        <>
          <span className="text-[10px] font-bold uppercase tracking-widest opacity-70 flex-1">
            {locked ? "voorspellingen gesloten" : "jij hebt nog niet voorspeld"}
          </span>
          {!locked && (
            <button
              type="button"
              onClick={onPredict}
              className="border-2 border-ink py-1 px-3 bg-hot text-paper text-[10px] font-display uppercase
                         active:translate-x-[1px] active:translate-y-[1px] transition-transform"
            >
              🎯 voorspel
            </button>
          )}
        </>
      )}
    </div>
  );
}

function AwaitingResultStrip({
  isTrainer, hasPredicted, myTip, onEnterResult,
}: {
  isTrainer: boolean;
  hasPredicted: boolean;
  myTip: MyTip;
  onEnterResult: () => void;
}) {
  return (
    <div className="border-t-4 border-ink bg-sky/30 px-3 py-2 flex items-center gap-2">
      <span className="text-[10px] font-bold uppercase tracking-widest opacity-70 flex-1">
        {hasPredicted
          ? <>jouw tip: <span className="font-display text-sm text-ink">
              {myTip ? `${myTip.home}–${myTip.away}` : "ingestuurd ✓"}
            </span></>
          : "wacht op uitslag van de Trainer"}
      </span>
      {isTrainer && (
        <button
          type="button"
          onClick={onEnterResult}
          className="border-2 border-ink py-1 px-3 bg-hot text-paper text-[10px] font-display uppercase
                     active:translate-x-[1px] active:translate-y-[1px] transition-transform"
        >
          voer uitslag in
        </button>
      )}
    </div>
  );
}

function ResultStrip({
  prediction, myTip,
}: {
  prediction: MyPrediction;
  myTip: MyTip;
}) {
  if (!prediction) {
    return (
      <div className="border-t-4 border-ink bg-paper px-3 py-2">
        <span className="text-[10px] font-bold uppercase tracking-widest opacity-50">
          jij hebt niet voorspeld — geen punten
        </span>
      </div>
    );
  }
  const pts = prediction.points_awarded;
  const tone =
    pts === 10 ? { bg: "bg-mint", label: "EXACT!" } :
    pts === 5 ? { bg: "bg-pop", label: "winnaar + diff" } :
    pts === 3 ? { bg: "bg-sky text-paper", label: "winnaar" } :
    { bg: "bg-ink/10", label: "mis" };
  // Server heeft na reveal de scores in de public tabel gezet; val terug op
  // myTip (localStorage) als de reveal-sync nog niet binnen is.
  const tipHome = prediction.scored ? prediction.home_score : myTip?.home ?? 0;
  const tipAway = prediction.scored ? prediction.away_score : myTip?.away ?? 0;
  return (
    <div className={`border-t-4 border-ink ${tone.bg} px-3 py-2 flex items-center gap-2`}>
      <span className="text-[10px] font-bold uppercase tracking-widest flex-1">
        jouw tip: <span className="font-display text-sm">
          {tipHome}–{tipAway}
        </span>
        <span className="ml-2 opacity-70">· {tone.label}</span>
      </span>
      <span className="font-display text-xl leading-none tabular-nums">
        {pts > 0 ? `+${pts}` : "0"} pt
      </span>
    </div>
  );
}
