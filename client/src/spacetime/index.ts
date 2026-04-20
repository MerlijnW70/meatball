/**
 * Barrel voor de SpacetimeDB-laag.
 *
 * Layout:
 *   connect.ts         — DbConnection bootstrap
 *   client-factory.ts  — reducer-call wrappers
 *   subscriptions.ts   — globale + club-scoped subscriptions
 *   tables.ts          — table → store piping
 *   mappers.ts         — camelCase wire → snake_case UI adapters
 *   mock.ts            — offline seed voor VITE_MOCK=1
 *   singleton.ts       — globale `client()` accessor
 *   types.ts           — MeatballClient interface + constants
 */
export { connect } from "./connect";
export { client } from "./singleton";
export type { MeatballClient } from "./types";
