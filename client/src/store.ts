/**
 * Zustand store: session + gecachede tables.
 * Alle tables worden gevuld door `spacetime.ts` vanuit SpacetimeDB-callbacks.
 * UI componenten lezen hier direct uit voor realtime rerender.
 */
import { create } from "zustand";
import type {
  ActivityEvent, City, Club, ClubMembership, ClubMood, FootballMatch, Follow,
  Group, GroupInvite, GroupMembership, InviteRequest,
  MatchEvent, MatchFixture, MatchPlayer, MatchPrediction,
  Province, Rating, RatingIntent, RatingReaction,
  RatingTag, RatingVote, Session as LiveSession, Snack, SnackLike, SnackStats,
  User, UserPosition, UserReaction,
} from "./types";

type IdMap<T> = Map<string, T>;
const m = <T>(): IdMap<T> => new Map();

export interface Session {
  identity: string | null;
  me: User | null;
  provinceId: bigint | null;
  cityId: bigint | null;
  clubId: bigint | null;
  connected: boolean;
}

interface AppState {
  session: Session;
  users: IdMap<User>;
  provinces: IdMap<Province>;
  cities: IdMap<City>;
  clubs: IdMap<Club>;
  snacks: IdMap<Snack>;
  ratings: IdMap<Rating>;
  ratingTags: IdMap<RatingTag>;
  stats: IdMap<SnackStats>;
  activity: IdMap<ActivityEvent>;
  likes: IdMap<SnackLike>;
  sessions: IdMap<LiveSession>;
  intents: IdMap<RatingIntent>;
  reactions: IdMap<UserReaction>;
  follows: IdMap<Follow>;
  moods: IdMap<ClubMood>;
  votes: IdMap<RatingVote>;
  /**
   * Reverse-index van rating_id → lijst van votes voor die rating.
   * Word door upsertVote/deleteVote onderhouden. Laat `useRatingVotes`
   * O(votesForThisRating) werken ipv O(totalVotes).
   */
  votesByRating: Map<string, RatingVote[]>;
  ratingReactions: IdMap<RatingReaction>;
  /** Zelfde indexed-lookup pattern als votesByRating. */
  reactionsByRating: Map<string, RatingReaction[]>;
  groups: IdMap<Group>;
  groupMemberships: IdMap<GroupMembership>;
  groupInvites: IdMap<GroupInvite>;
  userPositions: IdMap<UserPosition>;
  memberships: IdMap<ClubMembership>;
  inviteRequests: IdMap<InviteRequest>;
  matches: IdMap<FootballMatch>;
  matchPlayers: IdMap<MatchPlayer>;
  matchEvents: IdMap<MatchEvent>;
  matchFixtures: IdMap<MatchFixture>;
  matchPredictions: IdMap<MatchPrediction>;

  setSession: (patch: Partial<Session>) => void;
  setMe: (u: User | null) => void;
  resetLocal: () => void;

  // table mutators (called from spacetime.ts listeners)
  upsertUser: (u: User) => void;       deleteUser: (id: bigint) => void;
  upsertProvince: (p: Province) => void;
  upsertCity: (c: City) => void;
  upsertClub: (c: Club) => void;
  upsertSnack: (s: Snack) => void;
  upsertRating: (r: Rating) => void;   deleteRating: (id: bigint) => void;
  upsertRatingTag: (t: RatingTag) => void;
  upsertStats: (s: SnackStats) => void;
  upsertActivity: (a: ActivityEvent) => void;
  upsertLike: (l: SnackLike) => void;
  deleteLike: (id: bigint) => void;
  upsertSession: (s: LiveSession) => void;
  deleteSession: (identity: string) => void;
  upsertIntent: (i: RatingIntent) => void;
  deleteIntent: (identity: string) => void;
  upsertReaction: (r: UserReaction) => void;
  deleteReaction: (id: bigint) => void;
  upsertFollow: (f: Follow) => void;
  deleteFollow: (id: bigint) => void;
  upsertMood: (m: ClubMood) => void;
  deleteMood: (id: bigint) => void;
  upsertVote: (v: RatingVote) => void;
  deleteVote: (id: bigint) => void;
  upsertRatingReaction: (r: RatingReaction) => void;
  deleteRatingReaction: (id: bigint) => void;
  upsertMembership: (m: ClubMembership) => void;
  deleteMembership: (id: bigint) => void;
  upsertGroup: (g: Group) => void;
  deleteGroup: (id: bigint) => void;
  upsertGroupMembership: (m: GroupMembership) => void;
  deleteGroupMembership: (id: bigint) => void;
  upsertGroupInvite: (i: GroupInvite) => void;
  deleteGroupInvite: (id: bigint) => void;
  upsertUserPosition: (p: UserPosition) => void;
  deleteUserPosition: (userId: bigint) => void;
  upsertInviteRequest: (r: InviteRequest) => void;
  deleteInviteRequest: (id: bigint) => void;
  upsertMatch: (m: FootballMatch) => void;
  deleteMatch: (id: bigint) => void;
  upsertMatchPlayer: (p: MatchPlayer) => void;
  deleteMatchPlayer: (id: bigint) => void;
  upsertMatchEvent: (e: MatchEvent) => void;
  deleteMatchEvent: (id: bigint) => void;
  upsertMatchFixture: (f: MatchFixture) => void;
  deleteMatchFixture: (id: bigint) => void;
  upsertMatchPrediction: (p: MatchPrediction) => void;
  deleteMatchPrediction: (id: bigint) => void;
}

const LS_KEY = "meatball.session.v1";

const loadSession = (): Session => {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return empty();
    const j = JSON.parse(raw);
    return {
      identity: j.identity ?? null,
      me: null, // refresh from server
      provinceId: j.provinceId ? BigInt(j.provinceId) : null,
      cityId: j.cityId ? BigInt(j.cityId) : null,
      clubId: j.clubId ? BigInt(j.clubId) : null,
      connected: false,
    };
  } catch { return empty(); }
};

const empty = (): Session => ({
  identity: null, me: null,
  provinceId: null, cityId: null, clubId: null,
  connected: false,
});

const persist = (s: Session) => {
  localStorage.setItem(LS_KEY, JSON.stringify({
    identity: s.identity,
    provinceId: s.provinceId?.toString() ?? null,
    cityId: s.cityId?.toString() ?? null,
    clubId: s.clubId?.toString() ?? null,
  }));
};

// Force React to see Map changes by replacing the reference.
const put = <T>(map: IdMap<T>, key: bigint | string, value: T): IdMap<T> => {
  const next = new Map(map);
  next.set(typeof key === "bigint" ? key.toString() : key, value);
  return next;
};
const del = <T>(map: IdMap<T>, key: bigint | string): IdMap<T> => {
  const next = new Map(map);
  next.delete(typeof key === "bigint" ? key.toString() : key);
  return next;
};

export const useStore = create<AppState>((set, get) => ({
  session: loadSession(),
  users: m(), provinces: m(), cities: m(), clubs: m(),
  snacks: m(), ratings: m(), ratingTags: m(), stats: m(), activity: m(),
  likes: m(), sessions: m(), intents: m(), reactions: m(),
  follows: m(), moods: m(), votes: m(), votesByRating: new Map(),
  ratingReactions: m(), reactionsByRating: new Map(), memberships: m(),
  groups: m(), groupMemberships: m(), groupInvites: m(),
  userPositions: m(), inviteRequests: m(),
  matches: m(), matchPlayers: m(), matchEvents: m(),
  matchFixtures: m(), matchPredictions: m(),

  setSession: (patch) => {
    const next = { ...get().session, ...patch };
    persist(next);
    set({ session: next });
  },
  setMe: (u) => {
    const next = { ...get().session, me: u };
    set({ session: next });
  },
  resetLocal: () => {
    localStorage.removeItem(LS_KEY);
    set({ session: empty() });
  },

  upsertUser: (u) => set((s) => ({ users: put(s.users, u.id, u) })),
  deleteUser: (id) => set((s) => ({ users: del(s.users, id) })),
  upsertProvince: (p) => set((s) => ({ provinces: put(s.provinces, p.id, p) })),
  upsertCity: (c) => set((s) => ({ cities: put(s.cities, c.id, c) })),
  upsertClub: (c) => set((s) => ({ clubs: put(s.clubs, c.id, c) })),
  upsertSnack: (sn) => set((s) => ({ snacks: put(s.snacks, sn.id, sn) })),
  upsertRating: (r) => set((s) => ({ ratings: put(s.ratings, r.id, r) })),
  deleteRating: (id) => set((s) => ({ ratings: del(s.ratings, id) })),
  upsertRatingTag: (t) => set((s) => ({ ratingTags: put(s.ratingTags, t.id, t) })),
  upsertStats: (x) => set((s) => ({ stats: put(s.stats, x.snack_id, x) })),
  upsertActivity: (a) => set((s) => ({ activity: put(s.activity, a.id, a) })),
  upsertLike: (l) => set((s) => ({ likes: put(s.likes, l.id, l) })),
  deleteLike: (id) => set((s) => ({ likes: del(s.likes, id) })),
  upsertSession: (x) => set((s) => ({ sessions: put(s.sessions, x.identity, x) })),
  deleteSession: (identity) => set((s) => ({ sessions: del(s.sessions, identity) })),
  upsertIntent: (x) => set((s) => ({ intents: put(s.intents, x.identity, x) })),
  deleteIntent: (identity) => set((s) => ({ intents: del(s.intents, identity) })),
  upsertReaction: (r) => set((s) => ({ reactions: put(s.reactions, r.id, r) })),
  deleteReaction: (id) => set((s) => ({ reactions: del(s.reactions, id) })),
  upsertFollow: (f) => set((s) => ({ follows: put(s.follows, f.id, f) })),
  deleteFollow: (id) => set((s) => ({ follows: del(s.follows, id) })),
  upsertMood: (mo) => set((s) => ({ moods: put(s.moods, mo.id, mo) })),
  deleteMood: (id) => set((s) => ({ moods: del(s.moods, id) })),
  upsertVote: (v) => set((s) => {
    const votes = put(s.votes, v.id, v);
    const index = new Map(s.votesByRating);
    // Verwijder uit vorige bucket (als rating_id is gewijzigd — zeldzaam
    // maar defensief). Oude bucket alleen muteren als nodig; zo blijven
    // ongemoeide buckets referentieel stabiel en re-render selectors niet.
    const prev = s.votes.get(v.id.toString());
    if (prev && prev.rating_id !== v.rating_id) {
      const oldKey = prev.rating_id.toString();
      const oldArr = (index.get(oldKey) ?? []).filter((x) => x.id !== v.id);
      if (oldArr.length > 0) index.set(oldKey, oldArr);
      else index.delete(oldKey);
    }
    const newKey = v.rating_id.toString();
    const existing = (index.get(newKey) ?? []).filter((x) => x.id !== v.id);
    existing.push(v);
    index.set(newKey, existing);
    return { votes, votesByRating: index };
  }),
  deleteVote: (id) => set((s) => {
    const vote = s.votes.get(id.toString());
    const votes = del(s.votes, id);
    if (!vote) return { votes };
    const index = new Map(s.votesByRating);
    const k = vote.rating_id.toString();
    const arr = (index.get(k) ?? []).filter((x) => x.id !== id);
    if (arr.length > 0) index.set(k, arr);
    else index.delete(k);
    return { votes, votesByRating: index };
  }),
  upsertRatingReaction: (r) => set((s) => {
    const ratingReactions = put(s.ratingReactions, r.id, r);
    const index = new Map(s.reactionsByRating);
    const prev = s.ratingReactions.get(r.id.toString());
    if (prev && prev.rating_id !== r.rating_id) {
      const oldKey = prev.rating_id.toString();
      const oldArr = (index.get(oldKey) ?? []).filter((x) => x.id !== r.id);
      if (oldArr.length > 0) index.set(oldKey, oldArr);
      else index.delete(oldKey);
    }
    const newKey = r.rating_id.toString();
    const existing = (index.get(newKey) ?? []).filter((x) => x.id !== r.id);
    existing.push(r);
    index.set(newKey, existing);
    return { ratingReactions, reactionsByRating: index };
  }),
  deleteRatingReaction: (id) => set((s) => {
    const reaction = s.ratingReactions.get(id.toString());
    const ratingReactions = del(s.ratingReactions, id);
    if (!reaction) return { ratingReactions };
    const index = new Map(s.reactionsByRating);
    const k = reaction.rating_id.toString();
    const arr = (index.get(k) ?? []).filter((x) => x.id !== id);
    if (arr.length > 0) index.set(k, arr);
    else index.delete(k);
    return { ratingReactions, reactionsByRating: index };
  }),
  upsertMembership: (mb) => set((s) => ({ memberships: put(s.memberships, mb.id, mb) })),
  deleteMembership: (id) => set((s) => ({ memberships: del(s.memberships, id) })),
  upsertGroup: (g) => set((s) => ({ groups: put(s.groups, g.id, g) })),
  deleteGroup: (id) => set((s) => ({ groups: del(s.groups, id) })),
  upsertGroupMembership: (gm) => set((s) => ({ groupMemberships: put(s.groupMemberships, gm.id, gm) })),
  deleteGroupMembership: (id) => set((s) => ({ groupMemberships: del(s.groupMemberships, id) })),
  upsertGroupInvite: (gi) => set((s) => ({ groupInvites: put(s.groupInvites, gi.id, gi) })),
  deleteGroupInvite: (id) => set((s) => ({ groupInvites: del(s.groupInvites, id) })),
  upsertUserPosition: (p) => set((s) => ({ userPositions: put(s.userPositions, p.user_id, p) })),
  deleteUserPosition: (uid) => set((s) => ({ userPositions: del(s.userPositions, uid) })),
  upsertInviteRequest: (r) => set((s) => ({ inviteRequests: put(s.inviteRequests, r.id, r) })),
  deleteInviteRequest: (id) => set((s) => ({ inviteRequests: del(s.inviteRequests, id) })),
  upsertMatch: (mt) => set((s) => ({ matches: put(s.matches, mt.id, mt) })),
  deleteMatch: (id) => set((s) => ({ matches: del(s.matches, id) })),
  upsertMatchPlayer: (p) => set((s) => ({ matchPlayers: put(s.matchPlayers, p.id, p) })),
  deleteMatchPlayer: (id) => set((s) => ({ matchPlayers: del(s.matchPlayers, id) })),
  upsertMatchEvent: (e) => set((s) => ({ matchEvents: put(s.matchEvents, e.id, e) })),
  deleteMatchEvent: (id) => set((s) => ({ matchEvents: del(s.matchEvents, id) })),
  upsertMatchFixture: (f) => set((s) => ({ matchFixtures: put(s.matchFixtures, f.id, f) })),
  deleteMatchFixture: (id) => set((s) => ({ matchFixtures: del(s.matchFixtures, id) })),
  upsertMatchPrediction: (p) => set((s) => ({ matchPredictions: put(s.matchPredictions, p.id, p) })),
  deleteMatchPrediction: (id) => set((s) => ({ matchPredictions: del(s.matchPredictions, id) })),
}));
