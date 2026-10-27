// lib/telematics/nameMatch.ts
//
// Comparing a typed driver name with the names in Geotab: ignore case, accents,
// punctuation and spacing; find near misses (one typo, swapped order).

export const normName = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

function distance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return dp[a.length][b.length];
}

/** Names that are probably the same person: within two letters, or the same words in another order. */
export function closeNames(typed: string, candidates: string[]): string[] {
  const t = normName(typed);
  if (t.length < 3) return [];
  const words = (s: string) => s.toLowerCase().split(/\s+/).filter(Boolean).map(normName).sort().join("|");
  const tw = words(typed);
  return candidates.filter((c) => {
    const n = normName(c);
    if (!n || n === t) return false;
    return words(c) === tw || distance(t, n) <= (t.length > 9 ? 2 : 1);
  });
}
