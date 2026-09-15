// lib/fuelTempPredictor.ts
// Simplified physics model: a single-time-constant thermal lag against REAL
// past ambient readings (self-collected in ambient_temp_history), plus a
// small bounded solar allowance and the existing learned bias correction.
//
// Rewritten 2026-08-10 to fix a real architecture bug in the prior version:
// that predictor simulated forward through OpenWeather's OneCall "hourly"
// field, which is a *forecast* (current hour -> next 24-48h), not history.
// Walking a forward-lag simulation through 24 forecast hours and returning
// the value at the far end meant the "predicted fuel temp now" was actually
// the simulated temp ~23 hours in the future, mislabeled as "now" -- no
// amount of tuning the old k0/betaSun/wind knobs could fix that, since the
// simulation was oriented backwards relative to what it was answering.
//
// This version walks forward through real PAST points (oldest -> now),
// which is the only orientation that can honestly answer "what is it now."
// It also collapses four tunable knobs (k0, betaSun, cwWind,
// maxWindMultiplier) down to one (halfLifeHours) -- a tank's thermal lag is
// well described by a single exponential time constant, and a single knob
// is far easier to reason about and tune against real bias data than four
// interacting ones. Above-ground, light-colored (white/light gray) tanks.

export type AmbientPoint = { ts: number; tempF: number };

export type PredictorParams = {
  // How long until the tank has closed half the gap to a new ambient level.
  // Replaces the old tankPreset/k0 system -- this app doesn't know individual
  // tank sizes today, so one reasonable default stands in for all of them,
  // same simplification the old code made (tankPreset was hardcoded "large"
  // at every call site, never actually varied).
  halfLifeHours?: number; // default 20
  // Small, bounded daytime allowance -- capped so it can never "run away"
  // the way the old hour-by-hour accumulated solar term theoretically could.
  maxSolarBumpF?: number; // default 3
  cloudPct?: number | null; // 0..100, reduces the solar bump when overcast
  // Historical bias correction from terminal_temp_bias (unchanged from before).
  biasCorrectionF?: number;
  biasSampleCount?: number;
};

export type FuelTempResult = {
  predictedFuelTempF: number;
  confidence: "high" | "medium" | "low";
  biasApplied: number;
  biasSampleCount: number;
  debug?: {
    seedFuelTempF: number;
    pointCount: number;
    halfLifeHours: number;
    rawPrediction: number; // before bias correction
  };
};

function deg2rad(d: number) {
  return (d * Math.PI) / 180;
}
function rad2deg(r: number) {
  return (r * 180) / Math.PI;
}
function clamp(x: number, a: number, b: number) {
  return Math.max(a, Math.min(b, x));
}
function round1(x: number) {
  return Math.round(x * 10) / 10;
}

/**
 * Solar elevation (radians) from timestamp + lat/lon. Lightweight
 * approximation to keep deps out (swap for suncalc later if you want).
 */
export function solarElevationRad(unixSeconds: number, latDeg: number, lonDeg: number): number {
  const date = new Date(unixSeconds * 1000);

  const msPerDay = 86400000;
  const jd = date.getTime() / msPerDay + 2440587.5;
  const n = jd - 2451545.0;

  const L = (280.46 + 0.9856474 * n) % 360;
  const g = (357.528 + 0.9856003 * n) % 360;

  const lambda = L + 1.915 * Math.sin(deg2rad(g)) + 0.02 * Math.sin(deg2rad(2 * g));
  const epsilon = 23.439 - 0.0000004 * n;

  const sinDec = Math.sin(deg2rad(epsilon)) * Math.sin(deg2rad(lambda));
  const dec = Math.asin(sinDec);

  const y = Math.tan(deg2rad(epsilon) / 2) ** 2;
  const eqTime =
    4 *
    rad2deg(
      y * Math.sin(2 * deg2rad(L)) -
        2 * 0.0167 * Math.sin(deg2rad(g)) +
        4 * 0.0167 * y * Math.sin(deg2rad(g)) * Math.cos(2 * deg2rad(L)) -
        0.5 * y * y * Math.sin(4 * deg2rad(L)) -
        1.25 * 0.0167 * 0.0167 * Math.sin(2 * deg2rad(g))
    );

  const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  const trueSolarMinutes = (utcMinutes + eqTime + 4 * lonDeg) % 1440;

  const hourAngleDeg = trueSolarMinutes / 4 - 180;
  const ha = deg2rad(hourAngleDeg);

  const lat = deg2rad(latDeg);

  const sinEl = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(ha);
  return Math.asin(clamp(sinEl, -1, 1));
}

// Confidence now reflects how much REAL history we've collected for this
// city, not weather clarity -- data maturity is what actually gates
// accuracy in this model (the old cloud/wind-based confidence was measuring
// a different thing than what the model's own reliability depended on).
function confidenceFromHistory(history: AmbientPoint[], nowTs: number): "high" | "medium" | "low" {
  if (history.length === 0) return "low";
  const spanHours = (nowTs - history[0].ts) / 3600;
  if (history.length >= 8 && spanHours >= 8) return "high";
  if (history.length >= 3) return "medium";
  return "low";
}

/**
 * Predict fuel temp "now" from real past ambient readings ending at now.
 * `history` must be real observations (self-collected), ascending by ts,
 * NOT a forecast -- the whole point of this rewrite is that direction.
 */
export function predictFuelTempNow(
  history: AmbientPoint[],
  ambientNowF: number,
  nowTs: number,
  latDeg: number,
  lonDeg: number,
  params: PredictorParams = {}
): FuelTempResult {
  const halfLifeHours = params.halfLifeHours ?? 20;
  const maxSolarBumpF = params.maxSolarBumpF ?? 3;
  const k = Math.log(2) / halfLifeHours; // per-hour decay rate toward ambient

  // history may already end at "now" (the caller just inserted this exact
  // sample before calling in) -- don't double it up with a duplicate-
  // timestamp point, which would otherwise just contribute a harmless but
  // sloppy zero-dt step.
  const lastHistoryPoint = history[history.length - 1];
  const points: AmbientPoint[] =
    lastHistoryPoint && lastHistoryPoint.ts === nowTs
      ? history
      : [...history, { ts: nowTs, tempF: ambientNowF }];

  if (points.length < 2) {
    // No real history yet for this city (brand new) -- fall back to a
    // fixed small lag rather than guessing from a single point.
    const biasF = params.biasCorrectionF ?? 0;
    return {
      predictedFuelTempF: round1(ambientNowF - 2 + biasF),
      confidence: "low",
      biasApplied: round1(biasF),
      biasSampleCount: params.biasSampleCount ?? 0,
    };
  }

  // Walk the lag forward through real past points, ending at "now" -- this
  // is the actual fix (see file header): previously this walked forward
  // through a *forecast*, ending up to 23 hours in the future.
  let Tf = points[0].tempF;
  for (let i = 1; i < points.length; i++) {
    // Capped at 6h so one stale/missing sample can't cause a single huge jump.
    const dtHours = clamp((points[i].ts - points[i - 1].ts) / 3600, 0, 6);
    Tf = Tf + k * (points[i].tempF - Tf) * dtHours;
  }

  // Small, bounded daytime allowance -- a single evaluation at "now", not
  // accumulated hour-by-hour, so it can never run away regardless of how
  // much history is fed in.
  const el = solarElevationRad(nowTs, latDeg, lonDeg);
  const sunFactor = Math.max(0, Math.sin(el));
  const cloud = clamp((params.cloudPct ?? 0) / 100, 0, 1);
  const solarBump = maxSolarBumpF * sunFactor * (1 - cloud);

  const rawPrediction = Tf + solarBump;

  // Learned bias correction -- ramps continuously from sample 1 rather than
  // gating to zero below some threshold. BIAS_RAMP_SAMPLES controls how fast:
  // lowered from 4 to 1.5 on 2026-09-15 after a real report of the symptom
  // this produces -- a terminal that only sees a handful of loads per
  // (hour-of-day bucket, month) combo per month could go months before a
  // driver's correction ever meaningfully moved the next prediction (at /4,
  // one sample is only tanh(1/4)=~25% trusted; a terminal_temp_bias row with
  // sample_count=1 and mean_error=+3 only nudged the very next same-bucket
  // prediction by +0.7F, nowhere near the full +3F the driver had actually
  // corrected). At /1.5, one sample is ~58% trusted, three samples ~96% --
  // meaningfully responsive after the very first correction, while a single
  // sample still isn't taken as complete gospel (guards against one
  // fat-fingered gauge/BOL entry). Note this doesn't decay old samples --
  // mean_error is a running Welford mean over every completed load ever, so
  // a single early outlier stays diluted rather than forgotten; that's a
  // separate, unaddressed question from how fast a GOOD sample gets trusted.
  const BIAS_RAMP_SAMPLES = 1.5;
  const biasSamples = params.biasSampleCount ?? 0;
  const biasRaw = params.biasCorrectionF ?? 0;
  const biasWeight = biasSamples > 0 ? Math.tanh(biasSamples / BIAS_RAMP_SAMPLES) : 0;
  const biasApplied = biasRaw * biasWeight;

  let result = rawPrediction + biasApplied;

  // Hard boundary: "always lag behind ambient" isn't just an emergent
  // property of the math, it's enforced -- the prediction can never sit
  // outside the recent real-ambient range by more than a small margin, so
  // a bad bias sample or an edge case in the solar term can't send it
  // somewhere physically implausible.
  const recentTemps = points.map((p) => p.tempF);
  const recentMin = Math.min(...recentTemps);
  const recentMax = Math.max(...recentTemps);
  result = clamp(result, recentMin - 2, recentMax + maxSolarBumpF);

  return {
    predictedFuelTempF: round1(result),
    confidence: confidenceFromHistory(history, nowTs),
    biasApplied: round1(biasApplied),
    biasSampleCount: biasSamples,
    debug: {
      seedFuelTempF: points[0].tempF,
      pointCount: points.length,
      halfLifeHours,
      rawPrediction: round1(rawPrediction),
    },
  };
}
