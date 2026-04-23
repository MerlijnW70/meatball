/**
 * Pipe elke SpacetimeDB tabel → Zustand store: initial iter + onInsert/Update/Delete.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useStore } from "../store";
import {
  toActivity, toCity, toClub, toClubMembership, toClubMood, toFollow,
  toFootballMatch, toGroup, toGroupInvite,
  toGroupMembership, toInviteRequest, toMatchEvent, toMatchFixture,
  toMatchPlayer, toMatchPrediction,
  toProvince, toRating, toRatingIntent, toRatingReaction, toRatingTag, toRatingVote, toSession,
  toSnack, toSnackLike, toSnackStats, toUser, toUserPosition, toUserReaction,
} from "./mappers";

export function wireTables(conn: any) {
  const s = useStore.getState();
  const db = conn.db;

  const pipe = <Row, Out>(
    tableRef: any,
    name: string,
    toOut: (r: Row) => Out,
    upsert: (o: Out) => void,
    remove?: (o: Out) => void,
  ) => {
    if (!tableRef) {
      console.warn(`[spacetime] tabel-accessor ontbreekt: ${name}`);
      return;
    }
    const safeMap = (r: Row): Out | null => {
      try { return toOut(r); } catch (e) {
        console.error(`[spacetime] mapper ${name} faalde`, e, r);
        return null;
      }
    };
    try {
      for (const r of tableRef.iter()) {
        const o = safeMap(r);
        if (o) upsert(o);
      }
    } catch (e) {
      console.error(`[spacetime] iter ${name} faalde`, e);
    }
    tableRef.onInsert?.((_: any, r: Row) => {
      const o = safeMap(r);
      if (o) upsert(o);
    });
    tableRef.onUpdate?.((_: any, _o: Row, r: Row) => {
      const o = safeMap(r);
      if (o) upsert(o);
    });
    if (remove) tableRef.onDelete?.((_: any, r: Row) => {
      const o = safeMap(r);
      if (o) remove(o);
    });
  };

  // SpacetimeDB 2.x: accessor-name is exact die van `accessor = …` in Rust,
  // dus snake_case voor multi-word tabellen.
  pipe(db.user, "user", toUser, s.upsertUser, (r) => s.deleteUser(r.id));
  pipe(db.province, "province", toProvince, s.upsertProvince);
  pipe(db.city, "city", toCity, s.upsertCity);
  pipe(db.club, "club", toClub, s.upsertClub);
  pipe(db.snack, "snack", toSnack, s.upsertSnack);
  pipe(db.rating, "rating", toRating, s.upsertRating, (r) => s.deleteRating(r.id));
  pipe(db.rating_tag, "rating_tag", toRatingTag, s.upsertRatingTag);
  pipe(db.snack_stats, "snack_stats", toSnackStats, s.upsertStats);
  pipe(db.activity_event, "activity_event", toActivity, s.upsertActivity);
  pipe(db.snack_like, "snack_like", toSnackLike, s.upsertLike, (l) => s.deleteLike(l.id));
  pipe(db.session, "session", toSession, s.upsertSession, (r) => s.deleteSession(r.identity));
  pipe(db.rating_intent, "rating_intent", toRatingIntent, s.upsertIntent, (r) => s.deleteIntent(r.identity));
  pipe(db.user_reaction, "user_reaction", toUserReaction, s.upsertReaction, (r) => s.deleteReaction(r.id));
  pipe(db.follow, "follow", toFollow, s.upsertFollow, (f) => s.deleteFollow(f.id));
  pipe(db.club_mood, "club_mood", toClubMood, s.upsertMood, (m) => s.deleteMood(m.id));
  pipe(db.rating_vote, "rating_vote", toRatingVote, s.upsertVote, (v) => s.deleteVote(v.id));
  pipe(db.rating_reaction, "rating_reaction", toRatingReaction,
    s.upsertRatingReaction, (r) => s.deleteRatingReaction(r.id));
  pipe(db.club_membership, "club_membership", toClubMembership, s.upsertMembership, (m) => s.deleteMembership(m.id));
  pipe(db.group, "group", toGroup, s.upsertGroup, (g) => s.deleteGroup(g.id));
  pipe(db.group_membership, "group_membership", toGroupMembership, s.upsertGroupMembership, (m) => s.deleteGroupMembership(m.id));
  pipe(db.group_invite, "group_invite", toGroupInvite, s.upsertGroupInvite, (i) => s.deleteGroupInvite(i.id));
  pipe(db.user_position, "user_position", toUserPosition, s.upsertUserPosition, (p) => s.deleteUserPosition(p.user_id));
  pipe(db.invite_request, "invite_request", toInviteRequest, s.upsertInviteRequest, (r) => s.deleteInviteRequest(r.id));
  pipe(db.match_fixture, "match_fixture", toMatchFixture, s.upsertMatchFixture, (f) => s.deleteMatchFixture(f.id));
  pipe(db.match_prediction, "match_prediction", toMatchPrediction, s.upsertMatchPrediction, (p) => s.deleteMatchPrediction(p.id));
  pipe(db.football_match, "football_match", toFootballMatch, s.upsertMatch, (mt) => s.deleteMatch(mt.id));
  pipe(db.match_player, "match_player", toMatchPlayer, s.upsertMatchPlayer, (p) => s.deleteMatchPlayer(p.id));
  pipe(db.match_event, "match_event", toMatchEvent, s.upsertMatchEvent, (e) => s.deleteMatchEvent(e.id));
}
