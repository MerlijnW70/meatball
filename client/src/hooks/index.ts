/**
 * Barrel voor alle afgeleide selectors over de Zustand store.
 *
 * Layout:
 *   clubs.ts     — club/snack lookups (useMyClubs, useClub, useSnacks)
 *   presence.ts  — online/rating-intent
 *   ratings.ts   — stats/likes/raters/votes/leaderboard
 *   badges.ts    — useBadgesFor + tier metadata re-exports
 *   profile.ts   — useUserProfile aggregatie
 *   social.ts    — follows + reactions-lists
 *   unread.ts    — unread-tellers + mark-as-read
 */
export * from "./clubs";
export * from "./presence";
export * from "./ratings";
export * from "./badges";
export * from "./profile";
export * from "./social";
export * from "./unread";
export * from "./groups";
