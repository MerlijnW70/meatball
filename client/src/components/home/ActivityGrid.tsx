/**
 * De hoofd tile-grid op de home. 2-koloms op mobile (groeit naar 3 op sm+).
 * Elke tegel heeft live-stats uit de store zodat de grid "leeft" zonder dat
 * de gebruiker door diepere features hoeft te navigeren om te zien wat er
 * speelt.
 *
 * Tiles zijn licht gekanteld in een alternerend patroon (prikbord-kaartjes
 * vibe) zodat de grid niet te strak oogt.
 */
import { useMemo } from "react";
import { useStore } from "../../store";
import { useMyClubs, useMyGroups } from "../../hooks";
import { ActivityTile } from "./ActivityTile";

const TILT_PATTERN = [-1, 1, 1, -1, -1, 1]; // subtiel, alternerend

export function ActivityGrid() {
  const me = useStore((s) => s.session.me);
  const myGroups = useMyGroups();
  const myClubs = useMyClubs(50);
  const matches = useStore((s) => s.matches);
  const fixtures = useStore((s) => s.matchFixtures);
  const groupMemberships = useStore((s) => s.groupMemberships);

  // Hoeveel kantines zijn er landelijk in de database? (Discovery-signaal.)
  const totalClubs = useStore((s) => s.clubs.size);

  // Aantal open voorspellingen voor mijn teams.
  const openFixturesCount = useMemo(() => {
    if (!me) return 0;
    const myGroupIds = new Set<string>();
    for (const m of groupMemberships.values()) {
      if (m.user_id === me.id) myGroupIds.add(m.group_id.toString());
    }
    if (myGroupIds.size === 0) return 0;
    const now = Date.now() * 1000;
    return Array.from(fixtures.values())
      .filter((f) => !f.final_entered
        && f.kickoff_at > now
        && myGroupIds.has(f.group_id.toString()))
      .length;
  }, [fixtures, groupMemberships, me]);

  // Aantal live-matches waar mijn team in zit (of wereldwijd als ik geen team heb).
  const liveMatchesCount = useMemo(() => {
    if (!me) return 0;
    const myGroupIds = new Set<string>();
    for (const m of groupMemberships.values()) {
      if (m.user_id === me.id) myGroupIds.add(m.group_id.toString());
    }
    if (myGroupIds.size === 0) {
      return Array.from(matches.values()).filter((m) => m.is_live).length;
    }
    return Array.from(matches.values()).filter((m) => {
      if (!m.is_live) return false;
      return (m.home_is_group && myGroupIds.has(m.home_club_id.toString()))
        || (m.away_is_group && myGroupIds.has(m.away_club_id.toString()));
    }).length;
  }, [matches, groupMemberships, me]);

  const tiles = [
    {
      emoji: "🥩",
      image: "/tiles/kantines.png",
      label: "kantines",
      sub: myClubs.length > 0
        ? `${myClubs.length} in jouw seizoen`
        : "ontdek & rate",
      tone: "mint" as const,
      to: "/seizoen",
      badge: myClubs.length > 0 ? `${myClubs.length}` : null,
    },
    {
      emoji: "⚽",
      image: "/tiles/wedstrijden.png",
      label: "wedstrijden",
      sub: openFixturesCount > 0 ? "voorspel de uitslag" : "plan & voorspel",
      tone: "hot" as const,
      to: "/wedstrijden",
      badge: openFixturesCount > 0 ? `${openFixturesCount} open` : null,
      badgePulse: openFixturesCount > 0,
    },
    {
      emoji: "👑",
      label: myGroups.length > 0 ? "jouw team" : "team",
      sub: myGroups.length > 0
        ? myGroups[0]!.name
        : "maak of zoek",
      tone: "pop" as const,
      to: myGroups.length === 1
        ? `/group/${myGroups[0]!.id}`
        : "/teams/zoek",
    },
    {
      emoji: "🏆",
      label: "ranglijst",
      sub: "top kantines van NL",
      tone: "sky" as const,
      to: "/ranglijst",
      badge: totalClubs > 0 ? `${totalClubs}` : null,
    },
    {
      emoji: "🎯",
      label: "speel",
      sub: "hoger-lager & quiz",
      tone: "bruise" as const,
      to: "/speel",
      badge: "BINNENKORT",
      disabled: true,
    },
    {
      emoji: "🗺️",
      label: "ontdek",
      sub: "kantines in de buurt",
      tone: "paper" as const,
      to: "/ontdek",
      badge: "BINNENKORT",
      disabled: true,
    },
  ];

  return (
    <section>
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h2 className="font-display text-xl uppercase">wat ga je doen?</h2>
        {liveMatchesCount > 0 && (
          <span
            className="brut-chip bg-hot text-paper !py-0 !px-2 text-[10px] font-display uppercase
                       flex items-center gap-1"
          >
            <span
              className="inline-block w-1.5 h-1.5 bg-paper rounded-full"
              style={{ animation: "livepulse 1s ease-in-out infinite" }}
            />
            {liveMatchesCount} live
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {tiles.map((t, i) => (
          <ActivityTile
            key={t.label}
            emoji={t.emoji}
            image={"image" in t ? (t as { image?: string }).image : undefined}
            label={t.label}
            sub={t.sub}
            tone={t.tone}
            to={t.to}
            badge={t.badge}
            badgePulse={t.badgePulse}
            disabled={t.disabled}
            tilt={TILT_PATTERN[i % TILT_PATTERN.length]}
          />
        ))}
      </div>
    </section>
  );
}
