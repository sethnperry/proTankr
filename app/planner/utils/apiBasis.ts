// apiBasis.ts
// Resolves WHICH API a planned product's density stands on, and how much to
// trust it -- the single source of truth shared by the density calc
// (page.tsx lbsPerGalForProductId) and Plan Review's Tune-panel display, so
// the number the driver sees and the number the gallons are computed from can
// never disagree.
//
// Confidence tiers (per explicit driver direction, matching the temp
// prediction's own high/medium/low palette so the whole Tune line reads as
// one confidence signal):
//   tuned  -- the driver's own gauge/BOL entry. Always wins outright -- this
//             IS the density calc's basis -- but colored separately from
//             "high" (white, not green): it's the driver's own word, not a
//             system-verified network reading, so it shouldn't look like the
//             same kind of confidence as one.                             [white]
//   high   -- a real network reading updated within the last 12 hours --
//             trust the network API as-is.                                [green]
//   medium -- a real reading updated 12-24 hours ago -- a half-day-old
//             number isn't wrong, but it isn't current either, so split the
//             difference between it and the terminal's own observed floor.
//                                                                         [amber]
//   low    -- either a reading older than 24 hours, or nothing has ever
//             been observed for this product at this terminal at all --
//             fall back to the terminal's own floor (its lowest/heaviest
//             observed reading, or the product's published minimum when
//             there's no observation history yet).                        [red]
//
// Safety: whenever a reading isn't fresh enough to trust outright, density
// falls back toward the HEAVIEST value available (lower API = denser), so a
// stale or unknown reading can only ever make the plan more conservative,
// never lighter.

// Back-correct an observed API at temp to API_60 (same formula as
// planMath.backCorrectApiTo60 -- inlined here to keep this module dependency-
// free so it runs under the node test runner without ESM extension gymnastics).
function backCorrectApiTo60(observedApi: number, observedTempF: number, alphaPerF: number): number {
  return observedApi + alphaPerF * (observedTempF - 60);
}

export type ApiTier = "tuned" | "high" | "medium" | "low";

export type ApiBasisInput = {
  alphaPerF: number;
  api60Ref: number;               // products.api_60 (last-resort reference)
  apiMin: number | null;          // products.api_min (published heaviest)
  minApiObserved: number | null;  // rack_product_status.min_api_observed
  lastApi: number | null;         // last observed API at this terminal
  lastTempF: number | null;       // temp that reading was observed at
  lastApiUpdatedAt: string | null;
  tuned: { api: number; tempF: number } | null;
  nowMs: number;
};

export type ApiBasis = {
  api60: number;      // API_60 the density calc should use
  displayApi: number; // the API value to SHOW in the Tune line
  tier: ApiTier;
};

const TWELVE_HOURS_MS = 12 * 3600 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 3600 * 1000;

export function resolveApiBasis(inp: ApiBasisInput): ApiBasis {
  const alpha = Number(inp.alphaPerF);

  // The terminal's own floor: its lowest (heaviest) ever-observed reading,
  // never lighter than the product's own published minimum. With no
  // observation history at all, this collapses to the product minimum --
  // which is exactly the "never updated before at a terminal -> product
  // min" case, so it needs no separate branch.
  const apiMinFallback = inp.apiMin != null && Number.isFinite(inp.apiMin) ? Number(inp.apiMin) : Number(inp.api60Ref);
  const terminalFloor = inp.minApiObserved != null && Number.isFinite(inp.minApiObserved)
    ? Math.min(Number(inp.minApiObserved), apiMinFallback)
    : apiMinFallback;

  // 1. Driver's own gauge/BOL entry always wins outright -- highest
  //    confidence, no staleness question to ask. Its own tier/color ("tuned",
  //    white) rather than sharing "high"/green with an automatic network
  //    reading -- a manual entry is trustworthy but isn't the same kind of
  //    signal as a system-verified fresh reading.
  if (inp.tuned && Number.isFinite(inp.tuned.api) && Number.isFinite(inp.tuned.tempF)) {
    return {
      api60: backCorrectApiTo60(Number(inp.tuned.api), Number(inp.tuned.tempF), alpha),
      displayApi: Number(inp.tuned.api),
      tier: "tuned",
    };
  }

  // 2. Nothing has ever been observed here for this product -- there's no
  //    "age" to judge, just a lack of history. Low confidence, terminal
  //    floor (== the product's published minimum with no history to beat it).
  if (inp.lastApi == null || !Number.isFinite(inp.lastApi) || !inp.lastApiUpdatedAt) {
    return { api60: terminalFloor, displayApi: terminalFloor, tier: "low" };
  }

  const observedTemp = inp.lastTempF != null && Number.isFinite(inp.lastTempF) ? Number(inp.lastTempF) : 60;
  const lastApi60 = backCorrectApiTo60(Number(inp.lastApi), observedTemp, alpha);
  const t = new Date(inp.lastApiUpdatedAt).getTime();
  const ageMs = Number.isNaN(t) ? Infinity : inp.nowMs - t;

  // 3. Updated within the last 12 hours -> high confidence, trust the
  //    network reading as-is.
  if (ageMs <= TWELVE_HOURS_MS) {
    return { api60: lastApi60, displayApi: Number(inp.lastApi), tier: "high" };
  }

  // 4. Updated 12-24 hours ago -> medium confidence. Predict a safer number
  //    by splitting the difference between the last network reading and the
  //    terminal's own observed floor, rather than either trusting a
  //    half-day-old reading outright or jumping straight to the worst case.
  if (ageMs <= TWENTY_FOUR_HOURS_MS) {
    const blended = (lastApi60 + terminalFloor) / 2;
    return { api60: blended, displayApi: blended, tier: "medium" };
  }

  // 5. Older than 24 hours -> low confidence. Nothing recent enough to
  //    trust -- fall back to the terminal's own observed floor.
  return { api60: terminalFloor, displayApi: terminalFloor, tier: "low" };
}

// Tier -> confidence color, matching the temp prediction's own high/medium/low
// palette exactly so the whole Tune line reads as one confidence signal.
export function apiTierColor(tier: ApiTier): string {
  switch (tier) {
    case "tuned": return "#ffffff";  // white -- the driver's own entry, not a system confidence rating
    case "high": return "#4ade80";   // green
    case "medium": return "#fbbf24"; // amber
    case "low": return "#f87171";    // red
  }
}
