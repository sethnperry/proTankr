// lib/geo/county.ts
//
// County (or borough) for a point, from the FCC's free Census area lookup. Server-side only.
// Returns the name as the Census gives it ("Hillsborough County", "Kings County"), or null.

export async function countyFor(lat: number, lon: number): Promise<string | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  try {
    const r = await fetch(`https://geo.fcc.gov/api/census/area?lat=${lat}&lon=${lon}&format=json`, { cache: "no-store", signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const j = (await r.json()) as { results?: { county_name?: unknown }[] };
    const n = j.results?.[0]?.county_name;
    return typeof n === "string" && n.trim() ? n.trim() : null;
  } catch {
    return null;
  }
}

/** "Hillsborough" -> "Hillsborough County" is how the Census gives it; keep it as returned. */
export const COUNTY_LABEL = (c: string | null | undefined) => (c ?? "").trim();
