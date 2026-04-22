/**
 * Offline mock-mode voor UI-dev zonder draaiende SpacetimeDB.
 * Geseed met een handvol provincies/steden/clubs; reducer-calls muteren
 * direct de Zustand store.
 */
import { useStore } from "../store";
import type { User } from "../types";
import { setClient } from "./singleton";

export function installMockSeed() {
  const s = useStore.getState();
  const now = Date.now() * 1000;
  const provs = [
    "Groningen","Friesland","Drenthe","Overijssel","Flevoland","Gelderland",
    "Utrecht","Noord-Holland","Zuid-Holland","Zeeland","Noord-Brabant","Limburg",
  ];
  provs.forEach((name, i) => s.upsertProvince({ id: BigInt(i + 1), name }));

  [
    { id: 1n, province_id: 1n, name: "Groningen" },
    { id: 2n, province_id: 1n, name: "Haren" },
    { id: 3n, province_id: 7n, name: "Utrecht" },
    { id: 4n, province_id: 8n, name: "Amsterdam" },
  ].forEach((c) => s.upsertCity({ ...c, name_key: c.name.toLowerCase() }));

  [
    { id: 1n, name: "VV Gruno", city_id: 1n, province_id: 1n },
    { id: 2n, name: "SC Stadspark", city_id: 1n, province_id: 1n },
    { id: 3n, name: "FC Haren", city_id: 2n, province_id: 1n },
  ].forEach((c) => s.upsertClub({
    ...c, name_key: c.name.toLowerCase(),
    created_by: 0n, created_at: now,
  }));

  setClient({
    identity: "mock",
    disconnect: () => {},
    registerUser: async (name) => {
      const me: User = {
        id: 1n, identity: "mock", screen_name: name,
        screen_name_key: name.toLowerCase(), created_at: Date.now()*1000,
        avatar_color: "pop", avatar_icon: "🥩", avatar_decor: "none|none|0",
      };
      s.upsertUser(me); s.setMe(me);
    },
    addCity: async (pid, name) => s.upsertCity({
      id: BigInt(useStore.getState().cities.size + 100),
      province_id: pid, name, name_key: name.toLowerCase(),
    }),
    addClub: async (name, pid, cid) => s.upsertClub({
      id: BigInt(useStore.getState().clubs.size + 100),
      name, name_key: name.toLowerCase(),
      province_id: pid, city_id: cid,
      created_by: 1n, created_at: Date.now()*1000,
    }),
    addSnack: async (cid, name) => s.upsertSnack({
      id: BigInt(useStore.getState().snacks.size + 100),
      club_id: cid, name, name_key: name.toLowerCase(),
      created_by: 1n, created_at: Date.now()*1000,
    }),
    beginRating: async () => {},
    endRating: async () => {},
    sendReaction: async () => {},
    toggleFollow: async () => {},
    voteClubMood: async () => {},
    clearClubMood: async () => {},
    voteRating: async () => {},
    setAvatar: async () => {},
    setPosition: async () => {},
    joinClub: async () => {},
    leaveClub: async () => {},
    createGroup: async (_name: string, _inviteCode: string) => {},
    renameGroup: async () => {},
    createGroupInvite: async (_gid: bigint, _ttl: number, _max: number, _code: string) => {},
    regenerateGroupInvite: async (_gid: bigint, _code: string) => {},
    acceptGroupInvite: async () => {},
    revokeGroupInvite: async () => {},
    leaveGroup: async () => {},
    kickGroupMember: async () => {},
    shareSeasonWithCrew: async () => {},
    simulateMatch: async (_homeId: bigint, _homeIsGroup: boolean, _awayId: bigint, _awayIsGroup: boolean) => {},
    requestTeamInvite: async () => {},
    approveInviteRequest: async () => {},
    rejectInviteRequest: async () => {},
    createMatchFixture: async () => {},
    submitPrediction: async () => {},
    enterMatchResult: async () => {},
    deleteMatchFixture: async () => {},
    toggleLike: async (sid) => {
      const me = useStore.getState().session.me;
      if (!me) return;
      const existing = Array.from(useStore.getState().likes.values())
        .find((l) => l.user_id === me.id && l.snack_id === sid);
      if (existing) s.deleteLike(existing.id);
      else {
        s.upsertLike({
          id: BigInt(Date.now()),
          user_id: me.id, snack_id: sid,
          club_id: useStore.getState().snacks.get(sid.toString())?.club_id ?? 0n,
          created_at: Date.now() * 1000,
        });
      }
    },
    submitRating: async (sid, score, review, tags) => {
      const id = BigInt(useStore.getState().ratings.size + 100);
      const snack = useStore.getState().snacks.get(sid.toString())!;
      s.upsertRating({
        id, user_id: 1n, club_id: snack.club_id, snack_id: sid,
        score, review_text: review, created_at: Date.now()*1000,
      });
      tags.forEach((t, i) => s.upsertRatingTag({
        id: BigInt(Date.now()+i), rating_id: id,
        snack_id: sid, club_id: snack.club_id, tag: t,
      }));
      const prev = useStore.getState().stats.get(sid.toString());
      const sum = (prev?.sum_score ?? 0n) + BigInt(score);
      const count = (prev?.rating_count ?? 0n) + 1n;
      s.upsertStats({
        snack_id: sid, club_id: snack.club_id,
        sum_score: sum, rating_count: count,
        avg_score_x100: Number((sum * 100n) / count),
        last_rated_at: Date.now()*1000,
      });
      s.upsertActivity({
        id: BigInt(Date.now()),
        kind: { tag: "RatingSubmitted" },
        club_id: snack.club_id, user_id: 1n, snack_id: sid,
        text: `${useStore.getState().session.me?.screen_name ?? "jij"} gaf ${snack.name} een ${score}`,
        created_at: Date.now()*1000,
      });
    },
  });
}
