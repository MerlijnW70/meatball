/**
 * Zustand store: session + gecachede tables.
 * Alle tables worden gevuld door `spacetime.ts` vanuit SpacetimeDB-callbacks.
 * UI componenten lezen hier direct uit voor realtime rerender.
 */
import { create } from "zustand";
import type {
  ActivityEvent, City, Club, ClubMembership, ClubMood, Follow, Group,
  GroupInvite, GroupInviteReveal, GroupMembership, Province, Rating, RatingIntent,
  RatingTag, RatingVote, Session as LiveSession, Snack, SnackLike, SnackStats,
  User, UserReaction,
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
  groups: IdMap<Group>;
  groupMemberships: IdMap<GroupMembership>;
  groupInvites: IdMap<GroupInvite>;
  groupInviteReveals: IdMap<GroupInviteReveal>;
  memberships: IdMap<ClubMembership>;

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
  upsertMembership: (m: ClubMembership) => void;
  deleteMembership: (id: bigint) => void;
  upsertGroup: (g: Group) => void;
  deleteGroup: (id: bigint) => void;
  upsertGroupMembership: (m: GroupMembership) => void;
  deleteGroupMembership: (id: bigint) => void;
  upsertGroupInvite: (i: GroupInvite) => void;
  deleteGroupInvite: (id: bigint) => void;
  upsertGroupInviteReveal: (r: GroupInviteReveal) => void;
  deleteGroupInviteReveal: (inviteId: bigint) => void;
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
  follows: m(), moods: m(), votes: m(), memberships: m(),
  groups: m(), groupMemberships: m(), groupInvites: m(), groupInviteReveals: m(),

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
  upsertVote: (v) => set((s) => ({ votes: put(s.votes, v.id, v) })),
  deleteVote: (id) => set((s) => ({ votes: del(s.votes, id) })),
  upsertMembership: (mb) => set((s) => ({ memberships: put(s.memberships, mb.id, mb) })),
  deleteMembership: (id) => set((s) => ({ memberships: del(s.memberships, id) })),
  upsertGroup: (g) => set((s) => ({ groups: put(s.groups, g.id, g) })),
  deleteGroup: (id) => set((s) => ({ groups: del(s.groups, id) })),
  upsertGroupMembership: (gm) => set((s) => ({ groupMemberships: put(s.groupMemberships, gm.id, gm) })),
  deleteGroupMembership: (id) => set((s) => ({ groupMemberships: del(s.groupMemberships, id) })),
  upsertGroupInvite: (gi) => set((s) => ({ groupInvites: put(s.groupInvites, gi.id, gi) })),
  deleteGroupInvite: (id) => set((s) => ({ groupInvites: del(s.groupInvites, id) })),
  upsertGroupInviteReveal: (r) => set((s) => ({ groupInviteReveals: put(s.groupInviteReveals, r.invite_id, r) })),
  deleteGroupInviteReveal: (inviteId) => set((s) => ({ groupInviteReveals: del(s.groupInviteReveals, inviteId) })),
}));
