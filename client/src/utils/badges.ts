/**
 * 100 badges over 5 tiers — common · uncommon · rare · epic · mythic.
 * Alles wordt client-side afgeleid uit de bestaande store-tables zonder
 * extra schema. Eén context wordt per call opgebouwd; elke badge heeft
 * een check() die het uit die context bepaalt.
 */
import type {
  Club, ClubMembership, Follow, Rating, Snack, SnackLike, User, UserReaction,
} from "../types";
import { defaultAvatarFor } from "./avatar";

export type Tier = "common" | "uncommon" | "rare" | "epic" | "mythic";

export interface Badge {
  id: string;
  emoji: string;
  title: string;
  hint: string;
  tier: Tier;
  unlocked: boolean;
  progress?: { current: number; target: number };
}

export interface BadgeInputs {
  me: User;
  ratings: ReadonlyMap<string, Rating>;
  likes: ReadonlyMap<string, SnackLike>;
  snacks: ReadonlyMap<string, Snack>;
  clubs: ReadonlyMap<string, Club>;
  memberships: ReadonlyMap<string, ClubMembership>;
  follows: ReadonlyMap<string, Follow>;
  reactions: ReadonlyMap<string, UserReaction>;
}

interface Ctx {
  ratingsCount: number;
  likesGiven: number;
  likesReceivedOnMine: number;
  scoreCounts: number[];                       // index 1..10 → count
  scoresGiven: Set<number>;                    // unique scores
  perfectTens: number;
  twosOrLess: number;
  fivePlusGiven: number;                       // ratings ≥ 5 count
  ninesPlus: number;
  belowFive: number;
  avgGiven: number | null;
  distinctClubsRated: number;
  distinctProvincesRated: number;
  distinctCitiesRated: number;
  memberships: number;
  clubsCreated: number;
  snacksCreated: number;
  smaakmakerCount: number;                     // mijn snacks met ≥5 ratings
  pioneerClubs: number;                         // ik = eerste rater bij die club
  followersCount: number;
  followingCount: number;
  mutualFollows: number;
  reactionsReceivedTotal: number;
  reactionsGivenTotal: number;
  reactionsReceivedByEmoji: Map<string, number>;
  hasNonDefaultAvatar: boolean;
  bigSpread: boolean;                           // alle scores 1-10 gegeven
  rangedLow: boolean;                           // alle 1-5 gegeven
  rangedHigh: boolean;                          // alle 6-10 gegeven
}

function buildContext(i: BadgeInputs): Ctx {
  const meId = i.me.id;
  const myRatings: Rating[] = [];
  const scoreCounts = Array<number>(11).fill(0);
  const scoresGiven = new Set<number>();
  const ratedClubIds = new Set<string>();
  for (const r of i.ratings.values()) {
    if (r.user_id !== meId) continue;
    myRatings.push(r);
    if (r.score >= 1 && r.score <= 10) {
      scoreCounts[r.score]++;
      scoresGiven.add(r.score);
    }
    ratedClubIds.add(r.club_id.toString());
  }

  // distinct provinces / cities afgeleid uit clubs van mijn ratings
  const distinctProv = new Set<string>();
  const distinctCity = new Set<string>();
  for (const cid of ratedClubIds) {
    const c = i.clubs.get(cid);
    if (!c) continue;
    distinctProv.add(c.province_id.toString());
    distinctCity.add(c.city_id.toString());
  }

  let likesGiven = 0;
  for (const l of i.likes.values()) {
    if (l.user_id === meId) likesGiven++;
  }

  const mySnacks: Snack[] = [];
  for (const s of i.snacks.values()) if (s.created_by === meId) mySnacks.push(s);
  const mySnackIds = new Set(mySnacks.map((s) => s.id.toString()));
  let likesReceivedOnMine = 0;
  for (const l of i.likes.values()) {
    if (mySnackIds.has(l.snack_id.toString())) likesReceivedOnMine++;
  }
  const ratingsPerSnack = new Map<string, number>();
  for (const r of i.ratings.values()) {
    const k = r.snack_id.toString();
    ratingsPerSnack.set(k, (ratingsPerSnack.get(k) ?? 0) + 1);
  }
  let smaakmakerCount = 0;
  for (const sid of mySnackIds) {
    if ((ratingsPerSnack.get(sid) ?? 0) >= 5) smaakmakerCount++;
  }

  let clubsCreated = 0;
  for (const c of i.clubs.values()) if (c.created_by === meId) clubsCreated++;

  // pioneer = eerste rater per club
  const firstByClub = new Map<string, { uid: bigint; at: number }>();
  for (const r of i.ratings.values()) {
    const k = r.club_id.toString();
    const at = Number(r.created_at);
    const prev = firstByClub.get(k);
    if (!prev || at < prev.at) firstByClub.set(k, { uid: r.user_id, at });
  }
  let pioneerClubs = 0;
  for (const v of firstByClub.values()) if (v.uid === meId) pioneerClubs++;

  let memberships = 0;
  for (const m of i.memberships.values()) if (m.user_id === meId) memberships++;

  let followersCount = 0;
  let followingCount = 0;
  const followingSet = new Set<string>();
  const followersSet = new Set<string>();
  for (const f of i.follows.values()) {
    if (f.followee_id === meId) { followersCount++; followersSet.add(f.follower_id.toString()); }
    if (f.follower_id === meId) { followingCount++; followingSet.add(f.followee_id.toString()); }
  }
  let mutualFollows = 0;
  for (const u of followingSet) if (followersSet.has(u)) mutualFollows++;

  let reactionsReceivedTotal = 0;
  let reactionsGivenTotal = 0;
  const reactionsReceivedByEmoji = new Map<string, number>();
  for (const r of i.reactions.values()) {
    if (r.to_user_id === meId) {
      reactionsReceivedTotal++;
      reactionsReceivedByEmoji.set(r.emoji, (reactionsReceivedByEmoji.get(r.emoji) ?? 0) + 1);
    }
    if (r.from_user_id === meId) reactionsGivenTotal++;
  }

  // Avatar — niet-default als één van de 5 axes afwijkt van deterministic default
  const def = defaultAvatarFor(i.me.screen_name);
  const decorParts = (i.me.avatar_decor ?? "none|none|0").split("|");
  const userPattern = decorParts[0] ?? "none";
  const userAccent = decorParts[1] ?? "none";
  const userRotation = decorParts[2] ?? "0";
  const hasNonDefaultAvatar =
    i.me.avatar_color !== def.color
    || i.me.avatar_icon !== def.icon
    || userPattern !== def.pattern
    || userAccent !== def.accent
    || userRotation !== def.rotation;

  // Range-spread checks
  const has = (n: number) => scoresGiven.has(n);
  const bigSpread = [1,2,3,4,5,6,7,8,9,10].every(has);
  const rangedLow = [1,2,3,4,5].every(has);
  const rangedHigh = [6,7,8,9,10].every(has);

  // Aggregaten op score
  const ninesPlus = scoreCounts[9] + scoreCounts[10];
  const belowFive = scoreCounts[1]+scoreCounts[2]+scoreCounts[3]+scoreCounts[4];
  const fivePlusGiven = scoreCounts[5]+scoreCounts[6]+scoreCounts[7]+scoreCounts[8]+scoreCounts[9]+scoreCounts[10];
  const perfectTens = scoreCounts[10];
  const twosOrLess = scoreCounts[1]+scoreCounts[2];
  const avgGiven = myRatings.length
    ? myRatings.reduce((s, r) => s + r.score, 0) / myRatings.length
    : null;

  return {
    ratingsCount: myRatings.length,
    likesGiven, likesReceivedOnMine,
    scoreCounts, scoresGiven, perfectTens, twosOrLess, fivePlusGiven, ninesPlus, belowFive,
    avgGiven,
    distinctClubsRated: ratedClubIds.size,
    distinctProvincesRated: distinctProv.size,
    distinctCitiesRated: distinctCity.size,
    memberships, clubsCreated, snacksCreated: mySnacks.length,
    smaakmakerCount, pioneerClubs,
    followersCount, followingCount, mutualFollows,
    reactionsReceivedTotal, reactionsGivenTotal, reactionsReceivedByEmoji,
    hasNonDefaultAvatar, bigSpread, rangedLow, rangedHigh,
  };
}

// ──────────────── Definities ─────────────────
type Def = {
  id: string; emoji: string; title: string; hint: string; tier: Tier;
  check: (c: Ctx) => { unlocked: boolean; progress?: { current: number; target: number } };
};

const prog = (cur: number, target: number) => ({
  current: Math.min(cur, target), target,
});
const count = (n: number, target: number) =>
  ({ unlocked: n >= target, progress: prog(n, target) });
const flag = (b: boolean) => ({ unlocked: b });

const RX = (emoji: string) => (c: Ctx) => c.reactionsReceivedByEmoji.get(emoji) ?? 0;

const DEFS: readonly Def[] = [
  // ─────── COMMON · 40 ───────
  { id: "first_rating", emoji: "🥩", title: "eerste hap", hint: "post je eerste rating", tier: "common",
    check: (c) => count(c.ratingsCount, 1) },
  { id: "ratings_5", emoji: "🍖", title: "vijf-pak", hint: "5 ratings",  tier: "common",
    check: (c) => count(c.ratingsCount, 5) },
  { id: "ratings_10", emoji: "🌭", title: "decimeter", hint: "10 ratings", tier: "common",
    check: (c) => count(c.ratingsCount, 10) },
  { id: "first_like", emoji: "❤️", title: "eerste hartslag", hint: "geef je eerste like", tier: "common",
    check: (c) => count(c.likesGiven, 1) },
  { id: "likes_5", emoji: "💞", title: "liefdes-vink", hint: "5 likes uitgedeeld", tier: "common",
    check: (c) => count(c.likesGiven, 5) },
  { id: "likes_10", emoji: "💖", title: "warmpjes", hint: "10 likes uitgedeeld", tier: "common",
    check: (c) => count(c.likesGiven, 10) },
  { id: "first_member", emoji: "🏟", title: "eerste seizoen", hint: "voeg een kantine toe", tier: "common",
    check: (c) => count(c.memberships, 1) },
  { id: "members_3", emoji: "🎒", title: "trio", hint: "3 kantines in seizoen", tier: "common",
    check: (c) => count(c.memberships, 3) },
  { id: "members_5", emoji: "🏕️", title: "vijf-koppig", hint: "5 kantines in seizoen", tier: "common",
    check: (c) => count(c.memberships, 5) },
  { id: "score_1", emoji: "💀", title: "ondergrens", hint: "geef ergens een 1", tier: "common",
    check: (c) => flag(c.scoreCounts[1] >= 1) },
  { id: "score_2", emoji: "🤢", title: "twee-fluit", hint: "geef ergens een 2", tier: "common",
    check: (c) => flag(c.scoreCounts[2] >= 1) },
  { id: "score_3", emoji: "🙄", title: "drie-zucht", hint: "geef ergens een 3", tier: "common",
    check: (c) => flag(c.scoreCounts[3] >= 1) },
  { id: "score_4", emoji: "😐", title: "vier-bloos", hint: "geef ergens een 4", tier: "common",
    check: (c) => flag(c.scoreCounts[4] >= 1) },
  { id: "score_5", emoji: "🙂", title: "vijfje", hint: "geef ergens een 5", tier: "common",
    check: (c) => flag(c.scoreCounts[5] >= 1) },
  { id: "score_6", emoji: "🥖", title: "zesje", hint: "geef ergens een 6", tier: "common",
    check: (c) => flag(c.scoreCounts[6] >= 1) },
  { id: "score_7", emoji: "🥗", title: "zeven-mark", hint: "geef ergens een 7", tier: "common",
    check: (c) => flag(c.scoreCounts[7] >= 1) },
  { id: "score_8", emoji: "🌟", title: "acht-baas", hint: "geef ergens een 8", tier: "common",
    check: (c) => flag(c.scoreCounts[8] >= 1) },
  { id: "score_9", emoji: "🎯", title: "negen-shot", hint: "geef ergens een 9", tier: "common",
    check: (c) => flag(c.scoreCounts[9] >= 1) },
  { id: "score_10", emoji: "🥇", title: "tien-tot-niet", hint: "geef ergens een 10", tier: "common",
    check: (c) => flag(c.scoreCounts[10] >= 1) },
  { id: "first_react_in", emoji: "📬", title: "post in", hint: "ontvang je eerste reactie", tier: "common",
    check: (c) => count(c.reactionsReceivedTotal, 1) },
  { id: "first_react_out", emoji: "📨", title: "post uit", hint: "stuur je eerste reactie", tier: "common",
    check: (c) => count(c.reactionsGivenTotal, 1) },
  { id: "first_thumbs", emoji: "👍", title: "duim omhoog", hint: "ontvang een 👍", tier: "common",
    check: (c) => count(RX("👍")(c), 1) },
  { id: "first_heart", emoji: "💗", title: "hartstilstand", hint: "ontvang een ❤️", tier: "common",
    check: (c) => count(RX("❤️")(c), 1) },
  { id: "first_fire", emoji: "🔥", title: "vuurvlam", hint: "ontvang een 🔥", tier: "common",
    check: (c) => count(RX("🔥")(c), 1) },
  { id: "first_smile", emoji: "😄", title: "lacher", hint: "ontvang een 😄", tier: "common",
    check: (c) => count(RX("😄")(c), 1) },
  { id: "first_angry", emoji: "😡", title: "boze burger", hint: "ontvang een 😡", tier: "common",
    check: (c) => count(RX("😡")(c), 1) },
  { id: "first_follow_out", emoji: "👀", title: "kijker", hint: "volg iemand", tier: "common",
    check: (c) => count(c.followingCount, 1) },
  { id: "first_follower", emoji: "👋", title: "publiek", hint: "krijg een follower", tier: "common",
    check: (c) => count(c.followersCount, 1) },
  { id: "first_received_like", emoji: "🌷", title: "eerste fan", hint: "ontvang een like op eigen snack", tier: "common",
    check: (c) => count(c.likesReceivedOnMine, 1) },
  { id: "first_club_created", emoji: "🏗️", title: "bouwer", hint: "voeg een kantine toe (als nieuw)", tier: "common",
    check: (c) => count(c.clubsCreated, 1) },
  { id: "rated_3_clubs", emoji: "🎒", title: "rondje rijden", hint: "rate bij 3 verschillende kantines", tier: "common",
    check: (c) => count(c.distinctClubsRated, 3) },
  { id: "rated_5_clubs", emoji: "🚲", title: "rondje fietsen", hint: "rate bij 5 verschillende kantines", tier: "common",
    check: (c) => count(c.distinctClubsRated, 5) },
  { id: "polite_8s", emoji: "🤝", title: "vriendelijk", hint: "5 ratings van een 8", tier: "common",
    check: (c) => count(c.scoreCounts[8], 5) },
  { id: "generous_9_10", emoji: "🌈", title: "vrijgevig", hint: "5 ratings van een 9 of 10", tier: "common",
    check: (c) => count(c.ninesPlus, 5) },
  { id: "strict_judge", emoji: "⚖️", title: "strenge rechter", hint: "5 ratings ≤ 4", tier: "common",
    check: (c) => count(c.belowFive, 5) },
  { id: "follows_5", emoji: "👯", title: "kennissenkring", hint: "volg 5 users", tier: "common",
    check: (c) => count(c.followingCount, 5) },
  { id: "first_mutual", emoji: "🤜🤛", title: "eerste maatje", hint: "1 wederzijdse volger", tier: "common",
    check: (c) => count(c.mutualFollows, 1) },
  { id: "first_pioneer", emoji: "📣", title: "eerste op'n club", hint: "wees de eerste rater bij een club", tier: "common",
    check: (c) => count(c.pioneerClubs, 1) },
  { id: "avatar_personalized", emoji: "🎨", title: "stijlbewust", hint: "pas je avatar aan", tier: "common",
    check: (c) => flag(c.hasNonDefaultAvatar) },
  { id: "ranged_low", emoji: "🪜", title: "lage spreiding", hint: "geef alle scores 1-5 minstens 1×", tier: "common",
    check: (c) => flag(c.rangedLow) },

  // ─────── UNCOMMON · 30 ───────
  { id: "ratings_25", emoji: "🍔", title: "kwart-eeuw", hint: "25 ratings", tier: "uncommon",
    check: (c) => count(c.ratingsCount, 25) },
  { id: "ratings_50", emoji: "🍕", title: "halve eeuw", hint: "50 ratings", tier: "uncommon",
    check: (c) => count(c.ratingsCount, 50) },
  { id: "likes_25", emoji: "💕", title: "liefdesbus", hint: "25 likes uitgedeeld", tier: "uncommon",
    check: (c) => count(c.likesGiven, 25) },
  { id: "likes_50", emoji: "💘", title: "liefdesregen", hint: "50 likes uitgedeeld", tier: "uncommon",
    check: (c) => count(c.likesGiven, 50) },
  { id: "members_10", emoji: "🧳", title: "rondreiziger", hint: "10 kantines in seizoen", tier: "uncommon",
    check: (c) => count(c.memberships, 10) },
  { id: "provinces_3", emoji: "🗺️", title: "tri-provincie", hint: "rate in 3 verschillende provincies", tier: "uncommon",
    check: (c) => count(c.distinctProvincesRated, 3) },
  { id: "provinces_5", emoji: "🇳🇱", title: "halve NL", hint: "rate in 5 verschillende provincies", tier: "uncommon",
    check: (c) => count(c.distinctProvincesRated, 5) },
  { id: "cities_5", emoji: "🏘️", title: "stad-stamper", hint: "rate in 5 verschillende steden", tier: "uncommon",
    check: (c) => count(c.distinctCitiesRated, 5) },
  { id: "smaakmaker", emoji: "🏆", title: "smaakmaker", hint: "voeg snack toe die 5+ ratings krijgt", tier: "uncommon",
    check: (c) => count(c.smaakmakerCount, 1) },
  { id: "all_scores", emoji: "💯", title: "score-collector", hint: "geef elk cijfer 1-10 minstens 1×", tier: "uncommon",
    check: (c) => flag(c.bigSpread) },
  { id: "top_25_high", emoji: "🥇", title: "high-roller", hint: "25 ratings ≥ 9", tier: "uncommon",
    check: (c) => count(c.ninesPlus, 25) },
  { id: "safe_25", emoji: "🥈", title: "veiligheidstof", hint: "25 ratings van 7 of 8", tier: "uncommon",
    check: (c) => count(c.scoreCounts[7] + c.scoreCounts[8], 25) },
  { id: "boozers_5", emoji: "💢", title: "boze burger++", hint: "5 ratings van 1 of 2", tier: "uncommon",
    check: (c) => count(c.twosOrLess, 5) },
  { id: "react_25_out", emoji: "📡", title: "zender", hint: "stuur 25 reacties", tier: "uncommon",
    check: (c) => count(c.reactionsGivenTotal, 25) },
  { id: "react_10_in", emoji: "🛎️", title: "ontvanger", hint: "ontvang 10 reacties", tier: "uncommon",
    check: (c) => count(c.reactionsReceivedTotal, 10) },
  { id: "hearts_25", emoji: "💌", title: "hartdief", hint: "ontvang 25 ❤️", tier: "uncommon",
    check: (c) => count(RX("❤️")(c), 25) },
  { id: "fires_25", emoji: "🌶️", title: "vlammenmagneet", hint: "ontvang 25 🔥", tier: "uncommon",
    check: (c) => count(RX("🔥")(c), 25) },
  { id: "thumbs_25", emoji: "👍", title: "duim-king", hint: "ontvang 25 👍", tier: "uncommon",
    check: (c) => count(RX("👍")(c), 25) },
  { id: "followers_5", emoji: "📣", title: "ster-tje", hint: "5 followers", tier: "uncommon",
    check: (c) => count(c.followersCount, 5) },
  { id: "following_25", emoji: "🌐", title: "sociale spil", hint: "volg 25 users", tier: "uncommon",
    check: (c) => count(c.followingCount, 25) },
  { id: "mutuals_5", emoji: "🤝", title: "kring-knetter", hint: "5 wederzijdse volgers", tier: "uncommon",
    check: (c) => count(c.mutualFollows, 5) },
  { id: "pioneer_5", emoji: "🚩", title: "vlaggenplanter", hint: "eerste rater bij 5 clubs", tier: "uncommon",
    check: (c) => count(c.pioneerClubs, 5) },
  { id: "creator_3", emoji: "🛠️", title: "kantine-maker", hint: "3 clubs aangemaakt", tier: "uncommon",
    check: (c) => count(c.clubsCreated, 3) },
  { id: "creator_5", emoji: "🏘️", title: "wijk-bouwer", hint: "5 clubs aangemaakt", tier: "uncommon",
    check: (c) => count(c.clubsCreated, 5) },
  { id: "ranged_high", emoji: "🪜", title: "hoge spreiding", hint: "geef alle scores 6-10 minstens 1×", tier: "uncommon",
    check: (c) => flag(c.rangedHigh) },
  { id: "received_25", emoji: "💖", title: "geliefd", hint: "25 likes ontvangen op eigen snacks", tier: "uncommon",
    check: (c) => count(c.likesReceivedOnMine, 25) },
  { id: "rated_10_clubs", emoji: "🛣️", title: "rondrit", hint: "rate bij 10 verschillende kantines", tier: "uncommon",
    check: (c) => count(c.distinctClubsRated, 10) },
  { id: "perfect_tens_5", emoji: "🌟", title: "tien-tien-tien", hint: "5 ratings van een 10", tier: "uncommon",
    check: (c) => count(c.perfectTens, 5) },
  { id: "all_react_types", emoji: "🎭", title: "emoji-magneet", hint: "ontvang alle 5 reactie-emojis", tier: "uncommon",
    check: (c) => flag(["👍","❤️","🔥","😄","😡"].every((e) => (c.reactionsReceivedByEmoji.get(e) ?? 0) >= 1)) },
  { id: "snacks_3", emoji: "🍳", title: "menu-uitbreider", hint: "voeg 3 snacks toe", tier: "uncommon",
    check: (c) => count(c.snacksCreated, 3) },

  // ─────── RARE · 15 ───────
  { id: "ratings_100", emoji: "💯", title: "honderd-club", hint: "100 ratings", tier: "rare",
    check: (c) => count(c.ratingsCount, 100) },
  { id: "ratings_250", emoji: "🔥", title: "fanatieke vreter", hint: "250 ratings", tier: "rare",
    check: (c) => count(c.ratingsCount, 250) },
  { id: "members_25", emoji: "🚌", title: "team-bus", hint: "25 kantines in seizoen", tier: "rare",
    check: (c) => count(c.memberships, 25) },
  { id: "all_provinces", emoji: "🇳🇱", title: "land-rater", hint: "rate in alle 12 provincies", tier: "rare",
    check: (c) => count(c.distinctProvincesRated, 12) },
  { id: "ninesplus_100", emoji: "🥇", title: "kwaliteits-jager", hint: "100 ratings ≥ 9", tier: "rare",
    check: (c) => count(c.ninesPlus, 100) },
  { id: "below5_50", emoji: "🪦", title: "botte rater", hint: "50 ratings ≤ 4", tier: "rare",
    check: (c) => count(c.belowFive, 50) },
  { id: "hearts_100", emoji: "💖", title: "hartendief XL", hint: "100 ❤️ ontvangen", tier: "rare",
    check: (c) => count(RX("❤️")(c), 100) },
  { id: "fires_100", emoji: "🔥", title: "fakkeldrager", hint: "100 🔥 ontvangen", tier: "rare",
    check: (c) => count(RX("🔥")(c), 100) },
  { id: "followers_25", emoji: "👑", title: "publiekstrekker", hint: "25 followers", tier: "rare",
    check: (c) => count(c.followersCount, 25) },
  { id: "pioneer_25", emoji: "🏁", title: "vlaggen-vlechter", hint: "eerste rater bij 25 clubs", tier: "rare",
    check: (c) => count(c.pioneerClubs, 25) },
  { id: "creator_10", emoji: "🏛️", title: "buurtopbouw", hint: "10 clubs aangemaakt", tier: "rare",
    check: (c) => count(c.clubsCreated, 10) },
  { id: "following_100", emoji: "📡", title: "influencer-light", hint: "volg 100 users", tier: "rare",
    check: (c) => count(c.followingCount, 100) },
  { id: "fair_judge", emoji: "⚖️", title: "eerlijke rechter", hint: "elke score 1-10 minstens 5×", tier: "rare",
    check: (c) => flag([1,2,3,4,5,6,7,8,9,10].every((n) => c.scoreCounts[n] >= 5)) },
  { id: "cities_10", emoji: "🌆", title: "stad-tour", hint: "rate in 10 steden", tier: "rare",
    check: (c) => count(c.distinctCitiesRated, 10) },
  { id: "received_100", emoji: "🎖️", title: "veteraan", hint: "100 likes ontvangen", tier: "rare",
    check: (c) => count(c.likesReceivedOnMine, 100) },

  // ─────── EPIC · 10 ───────
  { id: "ratings_500", emoji: "🏆", title: "vijfhonderd-baas", hint: "500 ratings", tier: "epic",
    check: (c) => count(c.ratingsCount, 500) },
  { id: "ninesplus_250", emoji: "🥇", title: "perfectie-jager", hint: "250 ratings ≥ 9", tier: "epic",
    check: (c) => count(c.ninesPlus, 250) },
  { id: "followers_50", emoji: "👑", title: "stadion-vol", hint: "50 followers", tier: "epic",
    check: (c) => count(c.followersCount, 50) },
  { id: "members_50", emoji: "🚄", title: "seizoens-monster", hint: "50 kantines in seizoen", tier: "epic",
    check: (c) => count(c.memberships, 50) },
  { id: "cities_25", emoji: "🌍", title: "land-bezoeker", hint: "25 verschillende steden", tier: "epic",
    check: (c) => count(c.distinctCitiesRated, 25) },
  { id: "pioneer_50", emoji: "⛳", title: "vlaggenplanter+", hint: "eerste rater bij 50 clubs", tier: "epic",
    check: (c) => count(c.pioneerClubs, 50) },
  { id: "react_250", emoji: "💜", title: "bewonderaar-ster", hint: "250 reacties ontvangen", tier: "epic",
    check: (c) => count(c.reactionsReceivedTotal, 250) },
  { id: "smaakmaker_10", emoji: "🦄", title: "smaakgod", hint: "10 snacks toegevoegd met 5+ ratings", tier: "epic",
    check: (c) => count(c.smaakmakerCount, 10) },
  { id: "creator_25", emoji: "🏗️", title: "stadsbouwer", hint: "25 clubs aangemaakt", tier: "epic",
    check: (c) => count(c.clubsCreated, 25) },
  { id: "received_250", emoji: "💎", title: "schat", hint: "250 likes ontvangen", tier: "epic",
    check: (c) => count(c.likesReceivedOnMine, 250) },

  // ─────── MYTHIC · 5 ───────
  { id: "ratings_1000", emoji: "👑", title: "duizend-eter", hint: "1000 ratings", tier: "mythic",
    check: (c) => count(c.ratingsCount, 1000) },
  { id: "followers_100", emoji: "🌌", title: "icoon", hint: "100 followers", tier: "mythic",
    check: (c) => count(c.followersCount, 100) },
  { id: "universal", emoji: "🪐", title: "universeel", hint: "12 provincies + 25 steden + 50 kantines", tier: "mythic",
    check: (c) => flag(c.distinctProvincesRated >= 12 && c.distinctCitiesRated >= 25 && c.memberships >= 50) },
  { id: "creator_50", emoji: "🏰", title: "rijksstichter", hint: "50 clubs aangemaakt", tier: "mythic",
    check: (c) => count(c.clubsCreated, 50) },
  { id: "goat", emoji: "🐐", title: "GOAT", hint: "1000 ratings + 500 likes ontvangen + 100 followers", tier: "mythic",
    check: (c) => flag(c.ratingsCount >= 1000 && c.likesReceivedOnMine >= 500 && c.followersCount >= 100) },
];

export const TIER_ORDER: Tier[] = ["common", "uncommon", "rare", "epic", "mythic"];

export const TIER_META: Record<Tier, { label: string; bg: string; fg: string; border: string }> = {
  common:   { label: "common",   bg: "bg-paper",  fg: "text-ink",   border: "border-ink" },
  uncommon: { label: "uncommon", bg: "bg-pop",    fg: "text-ink",   border: "border-ink" },
  rare:     { label: "rare",     bg: "bg-mint",   fg: "text-ink",   border: "border-ink" },
  epic:     { label: "epic",     bg: "bg-sky",    fg: "text-paper", border: "border-ink" },
  mythic:   { label: "mythic",   bg: "bg-hot",    fg: "text-paper", border: "border-ink" },
};

export function computeBadges(inputs: BadgeInputs): Badge[] {
  const ctx = buildContext(inputs);
  return DEFS.map((d) => {
    const r = d.check(ctx);
    return {
      id: d.id, emoji: d.emoji, title: d.title, hint: d.hint, tier: d.tier,
      unlocked: r.unlocked,
      progress: r.progress,
    };
  });
}

export const TOTAL_BADGES = DEFS.length;
