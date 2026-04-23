/**
 * Social proof op de ClubView: avatar-rij van mensen die JIJ kent (follows
 * + team-mates) en die hier ook rateden. Motiveert in-seizoen bezoek +
 * volgt-loop voor nieuwe users.
 *
 * Hidden als er niemand match'd — geen lege placeholder.
 */
import { useMemo } from "react";
import { useStore } from "../../store";
import { Avatar } from "../Avatar";
import { go } from "../../router";

const MAX_VISIBLE = 10;

export function SocialProofStrip({ clubId }: { clubId: bigint }) {
  const me = useStore((s) => s.session.me);
  const follows = useStore((s) => s.follows);
  const groupMemberships = useStore((s) => s.groupMemberships);
  const ratings = useStore((s) => s.ratings);
  const snacks = useStore((s) => s.snacks);

  const connected = useMemo(() => {
    if (!me) return { list: [] as bigint[], total: 0 };
    // Verzamel IDs van users die "dichtbij" zijn: volg-relaties + team-mates.
    const known = new Set<string>();
    for (const f of follows.values()) {
      if (f.follower_id === me.id) known.add(f.followee_id.toString());
    }
    const myGroupIds = new Set<string>();
    for (const m of groupMemberships.values()) {
      if (m.user_id === me.id) myGroupIds.add(m.group_id.toString());
    }
    if (myGroupIds.size > 0) {
      for (const m of groupMemberships.values()) {
        if (myGroupIds.has(m.group_id.toString()) && m.user_id !== me.id) {
          known.add(m.user_id.toString());
        }
      }
    }
    if (known.size === 0) return { list: [] as bigint[], total: 0 };

    // snack_id → club_id lookup zodat we ratings kunnen filteren op deze club.
    const snackToClub = new Map<string, string>();
    for (const s of snacks.values()) {
      snackToClub.set(s.id.toString(), s.club_id.toString());
    }
    const targetClub = clubId.toString();

    // Dedupe op user_id — één avatar per persoon, ongeacht aantal ratings.
    const ratersHere = new Map<string, bigint>();
    for (const r of ratings.values()) {
      const uidStr = r.user_id.toString();
      if (!known.has(uidStr)) continue;
      if (ratersHere.has(uidStr)) continue;
      const clubStr = snackToClub.get(r.snack_id.toString());
      if (clubStr !== targetClub) continue;
      ratersHere.set(uidStr, r.user_id);
    }
    return {
      list: Array.from(ratersHere.values()),
      total: ratersHere.size,
    };
  }, [follows, groupMemberships, ratings, snacks, clubId, me]);

  if (connected.total === 0) return null;

  const visible = connected.list.slice(0, MAX_VISIBLE);
  const overflow = connected.total - visible.length;

  return (
    <section aria-label="bekenden hier">
      <p className="text-[10px] font-bold uppercase tracking-widest opacity-70 mb-1.5">
        ✨ bekenden die hier rateden
      </p>
      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1
                      [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {visible.map((userId) => (
          <button
            key={userId.toString()}
            type="button"
            onClick={() => go(`/u/${userId}`)}
            aria-label="open profiel"
            className="shrink-0 active:translate-x-[1px] active:translate-y-[1px] transition-transform"
          >
            <Avatar userId={userId} size="md" className="shadow-brutSm" />
          </button>
        ))}
        {overflow > 0 && (
          <div className="shrink-0 flex items-center justify-center w-11 h-11
                          brut-card bg-paper !p-0 text-[10px] font-display uppercase">
            +{overflow}
          </div>
        )}
      </div>
    </section>
  );
}
