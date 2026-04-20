import type { MeatballClient } from "./types";

let _client: MeatballClient | null = null;

export const client = (): MeatballClient => {
  if (!_client) throw new Error("SpacetimeDB nog niet verbonden");
  return _client;
};

export const setClient = (c: MeatballClient | null): void => {
  _client = c;
};
