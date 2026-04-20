/**
 * Reducer-calls via de SpacetimeDB connection → onze MeatballClient interface.
 * In SpacetimeDB 2.x krijgen reducers één object met named args (camelCase).
 * `critical=false` = fout wordt stil geslikt met een log/toast i.p.v. gegooid.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { toast } from "../components/Toast";
import { friendlyError } from "../utils/errors";
import type { MeatballClient } from "./types";

export function makeClient(conn: any): MeatballClient {
  const R = conn.reducers;

  const call = async (
    name: string,
    args: unknown,
    critical = true,
  ): Promise<void> => {
    try {
      await R[name](args);
    } catch (e) {
      const msg = friendlyError(e);
      console.error(`[spacetime] reducer ${name} faalde:`, e);
      if (!critical) {
        toast.hot(`kon ${name} niet doen: ${msg}`);
        return;
      }
      throw new Error(msg);
    }
  };

  return {
    identity: conn.identity?.toHexString?.() ?? "",
    disconnect: () => { try { conn.disconnect?.(); } catch {} },
    registerUser: (screenName) => call("registerUser", { screenName }),
    addCity: (provinceId, name) => call("addCity", { provinceId, name }),
    addClub: (name, provinceId, cityId) => call("addClub", { name, provinceId, cityId }),
    addSnack: (clubId, name) => call("addSnack", { clubId, name }),
    submitRating: (snackId, score, reviewText, tags) =>
      call("submitRating", { snackId, score, reviewText, tags }),
    toggleLike: (snackId) => call("toggleLike", { snackId }, false),
    beginRating: (snackId) => call("beginRating", { snackId }, false),
    endRating: () => call("endRating", {}, false),
    sendReaction: (toUserId, emoji) => call("sendReaction", { toUserId, emoji }),
    toggleFollow: (toUserId) => call("toggleFollow", { toUserId }),
    voteClubMood: (clubId, emoji) => call("voteClubMood", { clubId, emoji }),
    clearClubMood: (clubId) => call("clearClubMood", { clubId }),
    voteRating: (ratingId, value) => call("voteRating", { ratingId, value }),
    setAvatar: (color, icon, decor) => call("setAvatar", { color, icon, decor }),
    setPosition: (position) => call("setPosition", { position }),
    joinClub: (clubId) => call("joinClub", { clubId }, false),
    leaveClub: (clubId) => call("leaveClub", { clubId }, false),
    createGroup: (name) => call("createGroup", { name }),
    renameGroup: (groupId, name) => call("renameGroup", { groupId, name }),
    createGroupInvite: (groupId, ttlSecs, maxUses) =>
      call("createGroupInvite", { groupId, ttlSecs: BigInt(ttlSecs), maxUses }),
    regenerateGroupInvite: (groupId) =>
      call("regenerateGroupInvite", { groupId }),
    acceptGroupInvite: (code) => call("acceptGroupInvite", { code }),
    revokeGroupInvite: (inviteId) => call("revokeGroupInvite", { inviteId }),
    leaveGroup: (groupId) => call("leaveGroup", { groupId }),
    kickGroupMember: (groupId, targetUserId) =>
      call("kickGroupMember", { groupId, targetUserId }),
    shareSeasonWithCrew: (groupId) =>
      call("shareSeasonWithCrew", { groupId }),
    simulateMatch: (homeClubId, awayClubId) =>
      call("simulateMatch", { homeClubId, awayClubId }),
  };
}
