// lib/geo/county.ts
//
// County (or borough) for a delivery location. Server-side only. Never from a phone's GPS pin: the person
// adding a location may not be at the site, so the address (or the city) decides.
//
//   street address on file -> Census address geocoder, then OpenStreetMap's Nominatim
//   otherwise (or if both fail) -> the zip code's area (zip + city + state) -> the city's center point (FCC area lookup)
//
// Returns the name as given ("Hillsborough County", "Kings County"), or null.

const UA = "ProTankr/1.0 (support@protankr.com)";
const t = (v: string | null | undefined) => (v ?? "").trim();

/** County of a point (FCC Census area lookup). */
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

async function censusAddress(street: string, city: string, state: string, zip: string): Promise<string | null> {
  try {
    const q = new URLSearchParams({ street, city, state, benchmark: "Public_AR_Current", vintage: "Current_Current", format: "json" });
    if (zip) q.set("zip", zip);
    const r = await fetch(`https://geocoding.geo.census.gov/geocoder/geographies/address?${q}`, { cache: "no-store", signal: AbortSignal.timeout(7000) });
    if (!r.ok) return null;
    const j = (await r.json()) as { result?: { addressMatches?: { geographies?: { Counties?: { NAME?: unknown }[] } }[] } };
    const n = j.result?.addressMatches?.[0]?.geographies?.Counties?.[0]?.NAME;
    return typeof n === "string" && n.trim() ? n.trim() : null;
  } catch {
    return null;
  }
}

async function nominatim(q: string): Promise<string | null> {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q, format: "json", addressdetails: "1", limit: "1", countrycodes: "us" })}`,
      { cache: "no-store", headers: { "User-Agent": UA }, signal: AbortSignal.timeout(7000) });
    if (!r.ok) return null;
    const j = (await r.json()) as { address?: { county?: unknown } }[];
    const n = j[0]?.address?.county;
    return typeof n === "string" && n.trim() ? n.trim() : null;
  } catch {
    return null;
  }
}

/** Structured lookup by zip (+ city, state): the zip's own area, closer than the whole city's center. */
async function nominatimZip(city: string, state: string, zip: string): Promise<string | null> {
  try {
    const q = new URLSearchParams({ postalcode: zip.slice(0, 5), country: "us", format: "json", addressdetails: "1", limit: "1" });
    if (city) q.set("city", city);
    if (state) q.set("state", state);
    const r = await fetch(`https://nominatim.openstreetmap.org/search?${q}`, { cache: "no-store", headers: { "User-Agent": UA }, signal: AbortSignal.timeout(7000) });
    if (!r.ok) return null;
    const j = (await r.json()) as { address?: { county?: unknown } }[];
    const n = j[0]?.address?.county;
    return typeof n === "string" && n.trim() ? n.trim() : null;
  } catch {
    return null;
  }
}

export type PlaceInput = { address?: string | null; city?: string | null; state?: string | null; zip?: string | null };

export async function countyForPlace(p: PlaceInput, cityCenter?: { lat: number; lon: number } | null): Promise<string | null> {
  const street = t(p.address), city = t(p.city), state = t(p.state), zip = t(p.zip);
  if (street && city && state) {
    const c = (await censusAddress(street, city, state, zip)) ?? (await nominatim(`${street}, ${city}, ${state}${zip ? ` ${zip}` : ""}`));
    if (c) return c;
  }
  // No street address (or it wasn't found): the zip breaks the tie for a city that spans counties.
  if (zip && /^\d{5}/.test(zip)) {
    const c = await nominatimZip(city, state, zip);
    if (c) return c;
  }
  if (cityCenter) {
    const c = await countyFor(cityCenter.lat, cityCenter.lon);
    if (c) return c;
  }
  return city && state ? nominatim(`${city}, ${state}`) : null;
}

/** Zip code for a street address: the Census address geocoder, then Nominatim. Null when it can't be found. */
export async function zipForAddress(p: PlaceInput): Promise<string | null> {
  const street = t(p.address), city = t(p.city), state = t(p.state);
  if (!street || !city || !state) return null;
  try {
    const q = new URLSearchParams({ street, city, state, benchmark: "Public_AR_Current", format: "json" });
    const r = await fetch(`https://geocoding.geo.census.gov/geocoder/locations/address?${q}`, { cache: "no-store", signal: AbortSignal.timeout(7000) });
    if (r.ok) {
      const j = (await r.json()) as { result?: { addressMatches?: { addressComponents?: { zip?: unknown } }[] } };
      const z = j.result?.addressMatches?.[0]?.addressComponents?.zip;
      if (typeof z === "string" && /^\d{5}/.test(z.trim())) return z.trim().slice(0, 5);
    }
  } catch { /* try the next source */ }
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q: `${street}, ${city}, ${state}`, format: "json", addressdetails: "1", limit: "1", countrycodes: "us" })}`,
      { cache: "no-store", headers: { "User-Agent": UA }, signal: AbortSignal.timeout(7000) });
    if (r.ok) {
      const j = (await r.json()) as { address?: { postcode?: unknown } }[];
      const z = j[0]?.address?.postcode;
      if (typeof z === "string" && /^\d{5}/.test(z.trim())) return z.trim().slice(0, 5);
    }
  } catch { /* none found */ }
  return null;
}
