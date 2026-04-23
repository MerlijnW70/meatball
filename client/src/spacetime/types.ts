/** Publieke client interface — wat de UI mag aanroepen. */
export interface MeatballClient {
  identity: string;
  disconnect(): void;
  registerUser(screenName: string): Promise<void>;
  addCity(provinceId: bigint, name: string): Promise<void>;
  addClub(name: string, provinceId: bigint, cityId: bigint): Promise<void>;
  addSnack(clubId: bigint, name: string): Promise<void>;
  submitRating(
    snackId: bigint, score: number, review: string, tags: string[]
  ): Promise<void>;
  toggleLike(snackId: bigint): Promise<void>;
  beginRating(snackId: bigint): Promise<void>;
  endRating(): Promise<void>;
  sendReaction(toUserId: bigint, emoji: string): Promise<void>;
  toggleFollow(toUserId: bigint): Promise<void>;
  voteClubMood(clubId: bigint, emoji: string): Promise<void>;
  clearClubMood(clubId: bigint): Promise<void>;
  voteRating(ratingId: bigint, value: 1 | -1): Promise<void>;
  toggleRatingReaction(ratingId: bigint, emoji: string): Promise<void>;
  createBackupCode(code: string): Promise<void>;
  redeemBackupCode(code: string): Promise<void>;
  setAvatar(color: string, icon: string, decor: string): Promise<void>;
  setPosition(position: string): Promise<void>;
  joinClub(clubId: bigint): Promise<void>;
  leaveClub(clubId: bigint): Promise<void>;
  createGroup(name: string, inviteCode: string): Promise<void>;
  renameGroup(groupId: bigint, name: string): Promise<void>;
  createGroupInvite(
    groupId: bigint, ttlSecs: number, maxUses: number, inviteCode: string,
  ): Promise<void>;
  regenerateGroupInvite(groupId: bigint, inviteCode: string): Promise<void>;
  acceptGroupInvite(code: string): Promise<void>;
  revokeGroupInvite(inviteId: bigint): Promise<void>;
  leaveGroup(groupId: bigint): Promise<void>;
  kickGroupMember(groupId: bigint, targetUserId: bigint): Promise<void>;
  shareSeasonWithCrew(groupId: bigint): Promise<void>;
  simulateMatch(
    homeId: bigint, homeIsGroup: boolean,
    awayId: bigint, awayIsGroup: boolean,
  ): Promise<void>;
  requestTeamInvite(groupId: bigint): Promise<void>;
  approveInviteRequest(requestId: bigint): Promise<void>;
  rejectInviteRequest(requestId: bigint): Promise<void>;
  createMatchFixture(
    groupId: bigint, opponentClubId: bigint,
    weAreHome: boolean, kickoffAtMicros: bigint,
  ): Promise<void>;
  submitPrediction(
    fixtureId: bigint, homeScore: number, awayScore: number,
  ): Promise<void>;
  enterMatchResult(
    fixtureId: bigint, homeScore: number, awayScore: number,
  ): Promise<void>;
  deleteMatchFixture(fixtureId: bigint): Promise<void>;
}

export const TOKEN_KEY = "meatball.spacetime.token.v1";
