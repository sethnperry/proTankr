// apiBasis.ts
// Resolves WHICH API a planned product's density stands on, and how much to
// trust it -- the single source of truth shared by the density calc
// (page.tsx lbsPerGalForProductId) and Plan Review's Tune-panel display, so
// the number the driver sees and the number the gallons are computed from can
// never disagree.
//
// See resolveApiBasis below for the rules. Density and display share this one
// resolver so the planned gallons, the Tune line and the Log the Load prefill
// all stand on the same number.

// Back-correct an observed API at temp to API_60 (same formula as
// planMath.backCorrectApiTo60 -- inlined here to keep this module dependency-
// free so it runs under the node test runner without ESM extension gymnastics).
function backCorrectApiTo60(observedApi: number, observedTempF: number, alphaPerF: number): number {
  return observedApi + alphaPerF * (observedTempF - 60);
}

// Tier drives COLOR only (how fresh the reading is). Which API is used is a
// separate rule, below. (2026-09-29, per driver spec.)
export type ApiTier = "tuned" | "high" | "recent" | "medium" | "low";

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
  displayApi: number; // the API value to SHOW (and prefill at Log the Load)
  tier: ApiTier;
  // False only for a genuinely new terminal/product pair: nothing has ever
  // been recorded here. Log the Load leaves the API box blank in that case so
  // the first reading saved is a real BOL number, never product min.
  hasHistory: boolean;
};

const HOUR_MS = 3600 * 1000;
const LAST_READING_MAX_AGE_MS = 7 * 24 * HOUR_MS;

// Rules (driver spec, 2026-09-29):
//   tuned            -> the driver's own entry.
//   no history       -> product min (first load at this terminal).
//   reading <= 7 days -> that last reading, as-is.
//   reading >  7 days -> the terminal's min (lowest ever recorded here).
//                        Never back to product min unless a real reading was it.
// Color is age only: <=6h green, <=12h white, <=24h orange, older red.
export function resolveApiBasis(inp: ApiBasisInput): ApiBasis {
  const alpha = Number(inp.alphaPerF);

  const productMin = inp.apiMin != null && Number.isFinite(inp.apiMin) ? Number(inp.apiMin) : Number(inp.api60Ref);
  const observed = [inp.minApiObserved, inp.lastApi]
    .filter((v): v is number => v != null && Number.isFinite(v))
    .map(Number);
  const hasHistory = observed.length > 0;
  const terminalFloor = hasHistory ? Math.min(...observed) : productMin;

  if (inp.tuned && Number.isFinite(inp.tuned.api) && Number.isFinite(inp.tuned.tempF)) {
    return {
      api60: backCorrectApiTo60(Number(inp.tuned.api), Number(inp.tuned.tempF), alpha),
      displayApi: Number(inp.tuned.api),
      tier: "tuned",
      hasHistory,
    };
  }

  // No usable last reading (never loaded here, or a reading with no time):
  // the terminal floor, which is product min when there's no history at all.
  if (inp.lastApi == null || !Number.isFinite(inp.lastApi) || !inp.lastApiUpdatedAt) {
    return { api60: terminalFloor, displayApi: terminalFloor, tier: "low", hasHistory };
  }

  const t = new Date(inp.lastApiUpdatedAt).getTime();
  const ageMs = Number.isNaN(t) ? Infinity : inp.nowMs - t;
  const tier: ApiTier =
    ageMs <= 6 * HOUR_MS ? "high" :
    ageMs <= 12 * HOUR_MS ? "recent" :
    ageMs <= 24 * HOUR_MS ? "medium" : "low";

  if (ageMs <= LAST_READING_MAX_AGE_MS) {
    const observedTemp = inp.lastTempF != null && Number.isFinite(inp.lastTempF) ? Number(inp.lastTempF) : 60;
    return {
      api60: backCorrectApiTo60(Number(inp.lastApi), observedTemp, alpha),
      displayApi: Number(inp.lastApi),
      tier,
      hasHistory,
    };
  }

  return { api60: terminalFloor, displayApi: terminalFloor, tier: "low", hasHistory };
}

export function apiTierColor(tier: ApiTier): string {
  switch (tier) {
    case "tuned": return "#ffffff";  // the driver's own entry
    case "high": return "#4ade80";   // green, <= 6h
    case "recent": return "#ffffff"; // white, 6-12h
    case "medium": return "#fb923c"; // orange, 12-24h
    case "low": return "#f87171";    // red, > 24h or no reading
  }
}
