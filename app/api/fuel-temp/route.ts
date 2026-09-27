// app/api/fuel-temp/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { predictFuelTempNow, type AmbientPoint } from "@/lib/fuelTempPredictor";

export const runtime = "nodejs";
// Explicit, not just implied by the fetch(...,{cache:"no-store"}) calls
// inside this route -- eliminates any possibility of Vercel's own route
// response caching serving a stale prediction for this POST endpoint,
// which otherwise would have been silently indistinguishable from a
// client-side staleness bug (both look like "the number never updates").
export const dynamic = "force-dynamic";

function tryGetSupabaseAdmin() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) return null;
    return createClient(url, serviceKey, { auth: { persistSession: false } });
  } catch {
    return null;
  }
}

// Normalize city/state into a stable cache key
function makeCityKey(city: string, state: string): string {
  return `${city.trim().toLowerCase().replace(/\s+/g, "_")}|${state.trim().toLowerCase()}`;
}

async function geocodeCityState(args: { city: string; state: string; apiKey: string }) {
  const { city, state, apiKey } = args;
  const q = encodeURIComponent(`${city},${state},US`);
  const url = `https://api.openweathermap.org/geo/1.0/direct?q=${q}&limit=1&appid=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  const json: any = await res.json();
  const item = Array.isArray(json) ? json[0] : null;
  const lat = Number(item?.lat);
  const lon = Number(item?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

// `current` conditions plus today's `daily` min/max (only to seed the lag
// model). The model itself walks real past readings from
// ambient_temp_history, not a forecast -- hourly forecast stays excluded.
async function fetchCurrentConditions(args: { lat: number; lon: number; apiKey: string }) {
  const { lat, lon, apiKey } = args;
  const url =
    `https://api.openweathermap.org/data/3.0/onecall` +
    `?lat=${encodeURIComponent(String(lat))}` +
    `&lon=${encodeURIComponent(String(lon))}` +
    `&exclude=minutely,hourly,alerts` +
    `&units=imperial` +
    `&appid=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenWeather OneCall 3.0 error (${res.status}) ${text ? "- " + text.slice(0, 140) : ""}`.trim());
  }
  const json: any = await res.json();
  const tempF = Number(json?.current?.temp);
  const cloudPct = Number(json?.current?.clouds);
  // Today's min/max (same call, no extra cost) -- their midpoint is the daily
  // mean, the tank's equilibrium, used to seed the lag model (see
  // fuelTempPredictor.ts's seed comment for the bug this fixes).
  const dMin = Number(json?.daily?.[0]?.temp?.min);
  const dMax = Number(json?.daily?.[0]?.temp?.max);
  return {
    tempF: Number.isFinite(tempF) ? tempF : null,
    cloudPct: Number.isFinite(cloudPct) ? cloudPct : null,
    dailyMeanF: Number.isFinite(dMin) && Number.isFinite(dMax) ? (dMin + dMax) / 2 : null,
  };
}

// Insert "now" into this city's rolling history, throttled so a busy
// terminal (many drivers polling the same city) doesn't spam near-duplicate
// rows -- only writes when the most recent stored point is stale enough to
// be worth a new sample. Also prunes anything older than the model needs.
const MIN_SAMPLE_INTERVAL_MIN = 20;
const HISTORY_LOOKBACK_HOURS = 30;

async function collectAmbientHistory(
  // Typed loosely to match how the rest of this file already treats the
  // service-role client -- ambient_temp_history isn't in the generated
  // Database types, and Supabase's default generic makes .insert() with a
  // literal object a hard type error otherwise (unlike .select(), which
  // resolves loosely enough not to complain).
  supabase: any,
  cityKey: string,
  nowTs: number,
  ambientNowF: number
): Promise<AmbientPoint[]> {
  const lookbackTs = nowTs - HISTORY_LOOKBACK_HOURS * 3600;

  const { data: rows } = await supabase
    .from("ambient_temp_history")
    .select("ts, temp_f")
    .eq("city_key", cityKey)
    .gte("ts", new Date(lookbackTs * 1000).toISOString())
    .order("ts", { ascending: true });

  const history: AmbientPoint[] = (rows ?? []).map((r: any) => ({
    ts: Math.floor(new Date(r.ts).getTime() / 1000),
    tempF: Number(r.temp_f),
  }));

  const lastPoint = history[history.length - 1];
  const staleEnough = !lastPoint || nowTs - lastPoint.ts >= MIN_SAMPLE_INTERVAL_MIN * 60;

  if (staleEnough) {
    try {
      await supabase.from("ambient_temp_history").insert({
        city_key: cityKey,
        ts: new Date(nowTs * 1000).toISOString(),
        temp_f: ambientNowF,
      });
      history.push({ ts: nowTs, tempF: ambientNowF });
    } catch {
      // Non-fatal (e.g. a near-simultaneous insert from another request
      // racing on the same primary key) -- the prediction still works fine
      // off whatever history was already read.
    }

    // Housekeeping, non-fatal -- keep the table from growing unbounded.
    try {
      await supabase
        .from("ambient_temp_history")
        .delete()
        .eq("city_key", cityKey)
        .lt("ts", new Date(lookbackTs * 1000).toISOString());
    } catch { /* non-fatal */ }
  }

  return history;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { city, state, terminalId } = body as {
      city: string;
      state: string;
      terminalId?: string; // used only for the per-terminal bias lookup below
    };

    if (!city || !state) {
      return NextResponse.json({ error: "city and state are required." }, { status: 400 });
    }

    const owKey = process.env.OPENWEATHER_API_KEY;
    if (!owKey) return NextResponse.json({ error: "OPENWEATHER_API_KEY not set." }, { status: 500 });

    // Supabase is optional — used for ambient history, bias lookup, and city lat/lon
    const supabase = tryGetSupabaseAdmin();
    const cityKey = makeCityKey(city, state);
    const nowTs = Math.floor(Date.now() / 1000);

    // Resolve coordinates -- city-level only. Ambient temp doesn't need
    // per-terminal precision (every terminal in a city geocodes to
    // essentially the same point anyway -- confirmed live, the only
    // "variance" ever seen between terminals in the same city was noise
    // from repeated geocoding calls, a few hundred feet apart at most).
    // Caching this once per city instead of once per terminal also removes
    // the whole class of bug a per-terminal cache is exposed to: 3 real
    // terminals across 2 cities were once found with lat/lon stored as
    // literal (0,0) -- "Null Island", a point in the Gulf of Guinea --
    // which silently resolved to real (but wrong) weather for that spot
    // instead of ever re-geocoding. (0,0) is excluded here for the same
    // reason, defensively, in case old terminal-level bad data patterns
    // recur at the city level for any reason.
    const isRealCoord = (a: number | null, b: number | null): a is number =>
      Number.isFinite(a) && Number.isFinite(b) && !(a === 0 && b === 0);

    let resolvedLat: number | null = null;
    let resolvedLon: number | null = null;
    let cityId: string | null = null;

    if (supabase) {
      try {
        const { data: crow } = await supabase
          .from("cities")
          .select("city_id, lat, lon")
          .eq("city_name", city)
          .eq("state_code", state)
          .maybeSingle();
        cityId = (crow as any)?.city_id ?? null;
        const cLat = Number((crow as any)?.lat);
        const cLon = Number((crow as any)?.lon);
        if (isRealCoord(cLat, cLon)) {
          resolvedLat = cLat;
          resolvedLon = cLon;
        }
      } catch { /* non-fatal */ }
    }

    if (resolvedLat == null || resolvedLon == null) {
      const geo = await geocodeCityState({ city, state, apiKey: owKey });
      if (!geo) {
        return NextResponse.json(
          { error: "Unable to resolve lat/lon for city/state." },
          { status: 400 }
        );
      }
      resolvedLat = geo.lat;
      resolvedLon = geo.lon;

      // Cache it on the city (once, not once per terminal) so future
      // requests for this city skip the geocode call entirely.
      if (supabase && cityId) {
        try {
          await supabase.from("cities").update({ lat: resolvedLat, lon: resolvedLon }).eq("city_id", cityId);
        } catch { /* non-fatal */ }
      }
    }

    // Current conditions -- always fetched fresh (a single lightweight
    // `current`-only call, no forecast payload to cache anymore).
    const current = await fetchCurrentConditions({ lat: resolvedLat, lon: resolvedLon, apiKey: owKey });
    const cloudPct = current.cloudPct;
    const ambientUsed = current.tempF;

    if (typeof ambientUsed !== "number" || !Number.isFinite(ambientUsed)) {
      return NextResponse.json(
        { error: "Unable to fetch current ambient temp from OneCall." },
        { status: 502 }
      );
    }

    // Real ambient history for this city -- the actual fix (see
    // lib/fuelTempPredictor.ts header). Falls back to an empty array (and
    // the predictor's own "no history yet" branch) if Supabase is unavailable.
    const history = supabase
      ? await collectAmbientHistory(supabase, cityKey, nowTs, ambientUsed)
      : [];

    // Look up historical bias correction for this terminal + hour + month
    let biasCorrectionF = 0;
    let biasSampleCount = 0;
    if (supabase && terminalId) {
      try {
        const nowDate = new Date(nowTs * 1000);
        // Bucketed to a 3-hour window (0,3,6,...,21) rather than the exact UTC hour.
        // Must match the bucketing in useLoadWorkflow.ts's write side.
        const hourUtc = Math.floor(nowDate.getUTCHours() / 3) * 3;
        const monthOfYear = nowDate.getUTCMonth() + 1;

        const { data: biasRow } = await supabase
          .from("terminal_temp_bias")
          .select("mean_error, sample_count")
          .eq("terminal_id", terminalId)
          .eq("hour_of_day", hourUtc)
          .eq("month_of_year", monthOfYear)
          .maybeSingle();

        if (biasRow) {
          biasCorrectionF = Number(biasRow.mean_error) || 0;
          biasSampleCount = Number(biasRow.sample_count) || 0;
        }
      } catch { /* non-fatal */ }
    }

    const result = predictFuelTempNow(history, ambientUsed, nowTs, resolvedLat, resolvedLon, {
      halfLifeHours: 20,
      maxSolarBumpF: 3,
      cloudPct,
      biasCorrectionF,
      biasSampleCount,
      seedTempF: current.dailyMeanF,
    });

    return NextResponse.json({
      city,
      state,
      cityKey,
      lat: resolvedLat,
      lon: resolvedLon,
      ambientNowF: ambientUsed,
      predictedFuelTempF: result.predictedFuelTempF,
      confidence: result.confidence,
      biasApplied: result.biasApplied,
      biasSampleCount: result.biasSampleCount,
      historyPoints: history.length,
      dailyMeanF: current.dailyMeanF,
      seedF: result.debug?.seedFuelTempF ?? null,
      rawPredictionF: result.debug?.rawPrediction ?? null,
    });
  } catch (e: any) {
    console.error("[fuel-temp]", e?.message);
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
