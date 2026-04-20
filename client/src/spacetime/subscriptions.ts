/**
 * Scoped subscriptions.
 * - Phase A (globaal):   kleine lookup-tables + user-specifieke streams.
 * - Phase B (per club):  heavy tables die per-club scopebaar zijn.
 * Zwaar-data blijft daardoor lineair met club-grootte, niet met totale DB.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { toast } from "../components/Toast";
import { friendlyError } from "../utils/errors";

let globalSub: any = null;
let clubSub: any = null;

export function subscribeGlobal(conn: any) {
  if (globalSub) return;
  globalSub = conn.subscriptionBuilder()
    .onApplied(() => console.log("[spacetime] global snapshot applied"))
    .onError((_c: any, e: Error) => {
      console.error("[spacetime] global sub error", e);
      toast.hot(`subscription error: ${friendlyError(e)}`);
    })
    .subscribe([
      "SELECT * FROM province",
      "SELECT * FROM city",
      "SELECT * FROM club",
      "SELECT * FROM user",
      "SELECT * FROM session",
      "SELECT * FROM follow",
      "SELECT * FROM rating_intent",
      "SELECT * FROM user_reaction",
      "SELECT * FROM rating_vote",
      "SELECT * FROM club_membership",
      // `snack`, `snack_stats`, `rating` en `snack_like` zijn globaal zodat
      // de seizoens-feed realtime blijft voor alle lid-kantines zonder per-club
      // sub te hoeven spinnen. `rating_tag` + `activity_event` + `club_mood`
      // blijven scoped — die heb je pas nodig op de club-detail-page.
      "SELECT * FROM snack",
      "SELECT * FROM snack_stats",
      "SELECT * FROM rating",
      "SELECT * FROM snack_like",
      "SELECT * FROM group",
      "SELECT * FROM group_membership",
      "SELECT * FROM group_invite",
      "SELECT * FROM group_invite_reveal",
    ]);
}

export function subscribeClub(conn: any, clubId: bigint) {
  // oude club-subscription eerst afsluiten zodat de SDK deletes van
  // vorige scope uitlevert en we met een schone lei beginnen.
  unsubscribeClub();
  const cid = clubId.toString();
  clubSub = conn.subscriptionBuilder()
    .onApplied(() => console.log(`[spacetime] club ${cid} snapshot applied`))
    .onError((_c: any, e: Error) => {
      console.error("[spacetime] club sub error", e);
      toast.hot(`club subscription error: ${friendlyError(e)}`);
    })
    .subscribe([
      // Detail-page-only tables: zwaar per rij, heb je alleen nodig als je
      // daadwerkelijk de club opent. (snack/snack_stats/rating/snack_like
      // staan globaal voor de seizoens-feed.)
      `SELECT * FROM rating_tag WHERE club_id = ${cid}`,
      `SELECT * FROM club_mood WHERE club_id = ${cid}`,
      `SELECT * FROM activity_event WHERE club_id = ${cid}`,
    ]);
}

export function unsubscribeClub() {
  if (clubSub) {
    try { clubSub.unsubscribe(); } catch (e) {
      console.warn("[spacetime] unsubscribe failed", e);
    }
    clubSub = null;
  }
}
