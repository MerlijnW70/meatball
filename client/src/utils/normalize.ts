export function normalizeName(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9\- ]/g, "");
}

/** Simpele similarity: >0.85 = vermoedelijk duplicate. */
export function similarity(a: string, b: string): number {
  const x = normalizeName(a), y = normalizeName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  // bigram overlap
  const grams = (s: string) => {
    const out = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
    return out;
  };
  const A = grams(x), B = grams(y);
  let inter = 0;
  A.forEach((g) => B.has(g) && inter++);
  return (2 * inter) / (A.size + B.size);
}
