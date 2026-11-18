// lib/recap/laneServer.ts
//
// Database side of the shared lane statistics (laneStats.ts). Server only. Everything fails open: if the table or
// function is missing (migration not applied) the recap simply falls back to the older estimates.

import type { SupabaseClient } from "@supabase/supabase-js";
import { laneKey, laneKeysFor, statKey, type LaneBook, type LaneLeg, type LaneStat } from "./laneStats.ts";

/** Adds legs to the shared averages. Each leg is counted once, ever (the ledger), at both the place and the city level. */
export async function recordLaneLegs(admin: SupabaseClient, legs: LaneLeg[]): Promise<number> {
  let added = 0;
  const one = async (l: LaneLeg, level: "place" | "city") => {
    const key = level === "place" ? laneKey(l.fromKey, l.toKey) : l.fromCity && l.toCity ? laneKey(l.fromCity, l.toCity) : null;
    if (!key) return;
    const { data, error } = await admin.rpc("lane_stats_add", {
      p_leg_id: `${l.legId}|${level}`, p_level: level, p_lane_key: key, p_kind: l.kind,
      p_from_label: level === "place" ? l.fromLabel : l.fromCity, p_to_label: level === "place" ? l.toLabel : l.toCity,
      p_minutes: l.minutes, p_miles: l.miles,
    });
    if (error) throw new Error(error.message);
    if (data === true) added++;
  };
  try {
    for (let i = 0; i < legs.length; i += 10) {
      await Promise.all(legs.slice(i, i + 10).flatMap((l) => [one(l, "place"), one(l, "city")]));
    }
  } catch { /* table or function not there yet */ }
  return added;
}

/** The shared averages for the lanes a recap needs. */
export async function loadLaneBook(
  admin: SupabaseClient,
  legs: { fromKey: string; toKey: string; fromCity: string | null; toCity: string | null }[],
  cityOf: (stopKey: string | null) => string | null,
): Promise<LaneBook | undefined> {
  const keys = laneKeysFor(legs);
  const stats = new Map<string, LaneStat>();
  try {
    for (const [level, list] of [["place", keys.place], ["city", keys.city]] as const) {
      for (let i = 0; i < list.length; i += 100) {
        const { data, error } = await admin.from("lane_stats").select("level, lane_key, kind, trips, mean_minutes, m2_minutes, miles_n, mean_miles").eq("level", level).in("lane_key", list.slice(i, i + 100));
        if (error) return undefined;
        for (const r of (data ?? []) as any[]) {
          const trips = Number(r.trips);
          stats.set(statKey(level, r.kind, r.lane_key), { level, key: r.lane_key, kind: r.kind, trips, meanMin: Number(r.mean_minutes), sdMin: trips > 1 ? Math.sqrt(Number(r.m2_minutes) / (trips - 1)) : 0, miles: r.mean_miles == null ? null : Number(r.mean_miles), milesN: Number(r.miles_n) });
        }
      }
    }
  } catch { return undefined; }
  return { stats, cityOf };
}
