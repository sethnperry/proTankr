// lib/perdiem/client.ts
//
// The phone's calls for per diem: ask the server for suggestions, and turn a home city into coordinates.
// Browser only (fetch).

import { supabase } from "@/lib/supabase/client";
import type { DaySuggestion } from "./perDiem";

async function token(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function fetchSuggestions(days: string[], tz: string): Promise<{ suggestions: DaySuggestion[]; needsHome: boolean } | null> {
  try {
    const t = await token();
    if (!t) return null;
    const res = await fetch("/api/per-diem/suggest", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${t}` }, body: JSON.stringify({ days, tz }) });
    if (!res.ok) return null;
    const j = await res.json();
    return { suggestions: (j.suggestions ?? []) as DaySuggestion[], needsHome: !!j.needsHome };
  } catch { return null; }
}

export async function geocodeCity(city: string, state: string): Promise<{ lat: number; lon: number } | null> {
  try {
    const t = await token();
    if (!t) return null;
    const res = await fetch(`/api/geocode?${new URLSearchParams({ city, state })}`, { headers: { authorization: `Bearer ${t}` } });
    if (!res.ok) return null;
    const j = await res.json();
    return Number.isFinite(j.lat) && Number.isFinite(j.lon) ? { lat: j.lat, lon: j.lon } : null;
  } catch { return null; }
}
