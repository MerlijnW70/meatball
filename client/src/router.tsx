/**
 * Zero-dep hash-based router. Geen react-router nodig voor een MVP.
 * Routes: `/`, `/onboard/name`, `/onboard/province`, `/onboard/city`,
 *         `/clubs`, `/clubs/new`, `/home`,
 *         `/club/:id`, `/club/:id/top`, `/club/:id/snack/new`,
 *         `/club/:id/snack/:sid`
 */
import { useEffect, useState } from "react";

export type Route = {
  path: string;
  params: Record<string, string>;
};

const parse = (hash: string): Route => {
  const path = hash.replace(/^#/, "") || "/";
  return { path, params: {} };
};

export function useRoute(): [Route, (path: string) => void] {
  const [route, setRoute] = useState<Route>(() => parse(location.hash));
  useEffect(() => {
    const handler = () => setRoute(parse(location.hash));
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  const nav = (path: string) => { location.hash = path; };
  return [route, nav];
}

/**
 * Patroon matcher met `:param` placeholders.
 * Returnt `null` bij geen match, of een object met captured params.
 */
export function match(
  pattern: string, path: string,
): Record<string, string> | null {
  const pp = pattern.split("/").filter(Boolean);
  const rp = path.split("/").filter(Boolean);
  if (pp.length !== rp.length) return null;
  const out: Record<string, string> = {};
  for (let i = 0; i < pp.length; i++) {
    if (pp[i].startsWith(":")) out[pp[i].slice(1)] = decodeURIComponent(rp[i]);
    else if (pp[i] !== rp[i]) return null;
  }
  return out;
}

export const go = (path: string) => { location.hash = path; };
