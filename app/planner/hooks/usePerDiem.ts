"use client";
// app/planner/hooks/usePerDiem.ts
//
// The driver's per diem: their home base, the days they have claimed (written through the offline store, so a
// claim with no signal lands later), and the server's suggestions for the last two weeks. The rules are in
// lib/perdiem/perDiem.ts.

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { TripStore, TripStoreState } from "@/lib/trips/tripStore";
import type { PerDiemDayRow } from "@/lib/trips/types";
import { dayCards, homeProblem, recentDays, type DaySuggestion, type Home, type Source } from "@/lib/perdiem/perDiem";
import { fetchSuggestions, geocodeCity } from "@/lib/perdiem/client";
import { deviceTz } from "@/lib/reports/dateRange";

const DAYS = 14;

export function usePerDiem(o: { store: TripStore | null; state: TripStoreState; syncNow: () => unknown; userId: string | null; companyId: string | null; enabled: boolean }) {
  const { store, state, syncNow, userId, companyId, enabled } = o;
  const [home, setHome] = useState<Home | null | undefined>(undefined); // undefined = loading
  const [suggestions, setSuggestions] = useState<DaySuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const tz = useMemo(() => deviceTz(), []);
  const days = useMemo(() => recentDays(Date.now(), tz, DAYS), [tz, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    if (!userId || !store) return;
    setLoading(true);
    const [h, d] = await Promise.all([
      supabase.from("per_diem_homes").select("city, state, lat, lon, radius_miles").eq("user_id", userId).maybeSingle(),
      supabase.from("per_diem_days").select("*").eq("user_id", userId).gte("day", days[days.length - 1]),
    ]);
    const hr = h.data as { city: string; state: string; lat: number | null; lon: number | null; radius_miles: number } | null;
    setHome(hr ? { city: hr.city, state: hr.state, lat: hr.lat, lon: hr.lon, radiusMiles: hr.radius_miles } : null);
    if (!d.error) store.hydrate("per_diem_days", (d.data ?? []) as PerDiemDayRow[]);
    if (hr) { const s = await fetchSuggestions(days, tz); if (s) setSuggestions(s.suggestions); }
    setLoading(false);
  }, [userId, store, days, tz]);
  useEffect(() => { if (enabled) void load(); }, [enabled, load]);

  const claimed = useMemo(
    () => (store && userId ? store.list("per_diem_days", (r) => r.user_id === userId) : []).map((r) => ({ day: r.day, city: r.city, state: r.state, source: r.source as Source, status: r.status })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, userId, state],
  );
  const cards = useMemo(() => dayCards(days, claimed, suggestions), [days, claimed, suggestions]);

  const write = useCallback((day: string, patch: Partial<PerDiemDayRow> & Pick<PerDiemDayRow, "city" | "state" | "source" | "status">) => {
    if (!store || !userId || !companyId) return;
    store.put("per_diem_days", { user_id: userId, day, company_id: companyId, note: null, ...patch, state: patch.state.trim().toUpperCase(), city: patch.city.trim() });
    void syncNow();
  }, [store, userId, companyId, syncNow]);

  const claim = useCallback((day: string, city: string, st: string, source: Source) => write(day, { city, state: st, source, status: "claimed" }), [write]);
  const withdraw = useCallback((day: string) => {
    const mine = claimed.find((c) => c.day === day);
    if (mine) write(day, { city: mine.city, state: mine.state, source: mine.source, status: "withdrawn" });
  }, [claimed, write]);

  const saveHome = useCallback(async (city: string, st: string, radius: number): Promise<string | null> => {
    const problem = homeProblem(city, st, radius);
    if (problem) return problem;
    if (!userId || !companyId) return "Not signed in.";
    const geo = await geocodeCity(city.trim(), st.trim().toUpperCase());
    const row = { user_id: userId, company_id: companyId, city: city.trim(), state: st.trim().toUpperCase(), lat: geo?.lat ?? null, lon: geo?.lon ?? null, radius_miles: Math.round(radius), updated_at: new Date().toISOString() };
    const { error } = await supabase.from("per_diem_homes").upsert(row, { onConflict: "user_id" });
    if (error) return error.message;
    setHome({ city: row.city, state: row.state, lat: row.lat, lon: row.lon, radiusMiles: row.radius_miles });
    const s = await fetchSuggestions(days, tz);
    if (s) setSuggestions(s.suggestions);
    return geo ? null : "Saved, but I couldn't find that city on the map, so I can't suggest days from the truck's GPS yet.";
  }, [userId, companyId, days, tz]);

  return { home, cards, loading, claim, withdraw, saveHome, reload: load };
}
