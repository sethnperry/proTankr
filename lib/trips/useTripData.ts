"use client";
// lib/trips/useTripData.ts
//
// Company-level trip data the pickup/delivery screens read: trip settings and
// delay reasons (design §5), the driver's saved signature (§8), and the full
// delivery locations list with tanks (§4).
//
// Settings and reasons are cached on the phone so the screens still work with
// no signal. Every read fails open to the defaults.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { DeliveryLocation, LocationTank } from "./deliveryLocations";

export type TripSettings = {
  begin_offset_minutes: number; // old single offset, the fallback for both below
  loading_begin_offset_minutes: number | null;
  delivery_begin_offset_minutes: number | null;
  loading_delay_threshold_minutes: number;
  delivery_delay_threshold_minutes: number;
  require_consignee_signature: boolean;
  require_tank_readings: boolean;
  // Dispatch timeline rules (20261020020000). Absent before that migration.
  max_shift_hours?: number;
  gauging_cutoff?: string;
  gauging_minutes?: number;
  // Stamp arrival from the truck's position (20261027000000). Absent = on.
  auto_stamp_arrival?: boolean;
  // Drop sequence (20261033000000). Absent before that migration.
  delivery_prep_minutes?: number;
  pump_gal_per_min?: number;
  unaccounted_grace_minutes?: number;
};

export const DEFAULT_TRIP_SETTINGS: TripSettings = {
  begin_offset_minutes: 10,
  loading_begin_offset_minutes: 10,
  delivery_begin_offset_minutes: 10,
  loading_delay_threshold_minutes: 30,
  delivery_delay_threshold_minutes: 30,
  require_consignee_signature: false,
  require_tank_readings: false,
};

// Minutes subtracted from "now" to prefill Began when the driver finishes a
// pickup or delivery.
export function loadingOffset(s: TripSettings): number {
  return s.loading_begin_offset_minutes ?? s.begin_offset_minutes;
}
export function deliveryOffset(s: TripSettings): number {
  return s.delivery_begin_offset_minutes ?? s.begin_offset_minutes;
}

export type DelayReason = { reason_id: string; kind: "loading" | "delivery"; label: string; sort_order: number; is_active: boolean };

function readCache<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function writeCache(key: string, v: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage full or blocked */
  }
}

export function useTripSettings(companyId: string | null) {
  const cacheKey = companyId ? `proTankr:tripSettings:${companyId}` : null;
  const [settings, setSettings] = useState<TripSettings>(DEFAULT_TRIP_SETTINGS);
  const [reasons, setReasons] = useState<DelayReason[]>([]);

  const load = useCallback(async () => {
    if (!companyId || !cacheKey) return;
    try {
      const [s, r] = await Promise.all([
        supabase.from("trip_settings").select("*").eq("company_id", companyId).maybeSingle(),
        supabase.from("delay_reasons").select("reason_id,kind,label,sort_order,is_active").eq("company_id", companyId)
          .order("sort_order").order("label"),
      ]);
      const next = { ...DEFAULT_TRIP_SETTINGS, ...((s.data as Partial<TripSettings>) ?? {}) };
      const list = (r.data ?? []) as DelayReason[];
      if (!s.error) setSettings(next);
      if (!r.error) setReasons(list);
      if (!s.error && !r.error) writeCache(cacheKey, { settings: next, reasons: list });
    } catch (e) {
      console.warn("[trips] settings failed:", e);
    }
  }, [companyId, cacheKey]);

  useEffect(() => {
    if (!cacheKey) return;
    const cached = readCache<{ settings: TripSettings; reasons: DelayReason[] }>(cacheKey);
    if (cached) {
      setSettings({ ...DEFAULT_TRIP_SETTINGS, ...cached.settings });
      setReasons(cached.reasons ?? []);
    }
    void load();
  }, [cacheKey, load]);

  return { settings, reasons, reload: load };
}

// The driver's own saved signature (svg path data), or null.
export function useDriverSignature(userId: string | null) {
  const cacheKey = userId ? `proTankr:u:${userId}:signature` : null;
  const [svg, setSvg] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userId || !cacheKey) return;
    const cached = readCache<string>(cacheKey);
    if (cached) setSvg(cached);
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.from("driver_signatures").select("signature_svg").eq("user_id", userId).maybeSingle();
        if (cancelled || error) return;
        const v = (data as { signature_svg: string } | null)?.signature_svg ?? null;
        setSvg(v);
        writeCache(cacheKey, v);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, cacheKey]);

  const save = useCallback(async (next: string) => {
    if (!userId || !cacheKey) throw new Error("Not signed in.");
    setSvg(next);
    writeCache(cacheKey, next);
    const { error } = await supabase.from("driver_signatures").upsert({ user_id: userId, signature_svg: next }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
  }, [userId, cacheKey]);

  return { svg, loaded, save };
}

// The company's delivery locations with tanks and this driver's stars.
export function useDeliveryLocationList(companyId: string | null, userId: string | null) {
  const cacheKey = companyId && userId ? `proTankr:u:${userId}:locations:${companyId}` : null;
  const [locations, setLocations] = useState<DeliveryLocation[]>([]);
  const [tanks, setTanks] = useState<LocationTank[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!companyId || !userId || !cacheKey) return;
    setLoading(true);
    try {
      const cols = "location_id,company_id,name,location_number,address,city,state,lat,lon,delivery_type,notes,is_active";
      const query = (c: string) => supabase.from("delivery_locations").select(c).eq("company_id", companyId).eq("is_active", true).order("name");
      const [withArea, s] = await Promise.all([
        query(`${cols},zip,region,local_area`),
        supabase.from("delivery_location_stars").select("location_id").eq("user_id", userId),
      ]);
      // Before the 2026-10-11 migration there is no zip column; read without it.
      // region (2026-10-22) and zip (2026-10-11) may not exist yet.
      const withRegion = withArea.error ? await query(`${cols},zip,region`) : withArea;
      const first = withRegion.error ? await query(`${cols},zip`) : withRegion;
      const l = first.error ? await query(cols) : first;
      if (l.error) return;
      const starred = new Set(((s.data ?? []) as { location_id: string }[]).map((r) => r.location_id));
      const locs = ((l.data ?? []) as unknown as Omit<DeliveryLocation, "starred">[]).map((r) => ({
        ...r, lat: r.lat == null ? null : Number(r.lat), lon: r.lon == null ? null : Number(r.lon), starred: starred.has(r.location_id),
      }));
      let tankRows: LocationTank[] = [];
      const ids = locs.map((x) => x.location_id);
      for (let i = 0; i < ids.length; i += 200) {
        // hose_length_ft (2026-10-19) may not exist yet; read without it then.
        const tq = (c: string) => supabase.from("delivery_location_tanks")
          .select(c).in("location_id", ids.slice(i, i + 200)).eq("is_active", true);
        const base = "tank_id,location_id,tank_number,product_id,capacity_gallons,is_active";
        let t = await tq(`${base},hose_length_ft,sort_order`);
        if (t.error) t = await tq(`${base},hose_length_ft`);
        if (t.error) t = await tq(base);
        tankRows = tankRows.concat(((t.data ?? []) as unknown as LocationTank[]).map((x) => ({
          ...x,
          capacity_gallons: x.capacity_gallons == null ? null : Number(x.capacity_gallons),
          hose_length_ft: x.hose_length_ft == null ? null : Number(x.hose_length_ft),
        })));
      }
      setLocations(locs);
      setTanks(tankRows);
      writeCache(cacheKey, { locations: locs, tanks: tankRows });
    } catch (e) {
      console.warn("[trips] locations failed:", e);
    } finally {
      setLoading(false);
    }
  }, [companyId, userId, cacheKey]);

  useEffect(() => {
    if (!cacheKey) return;
    const cached = readCache<{ locations: DeliveryLocation[]; tanks: LocationTank[] }>(cacheKey);
    if (cached) {
      setLocations(cached.locations ?? []);
      setTanks(cached.tanks ?? []);
    }
    void load();
  }, [cacheKey, load]);

  const toggleStar = useCallback(async (locationId: string, star: boolean) => {
    if (!userId) return;
    setLocations((ls) => ls.map((l) => (l.location_id === locationId ? { ...l, starred: star } : l)));
    const res = star
      ? await supabase.from("delivery_location_stars").upsert({ user_id: userId, location_id: locationId }, { onConflict: "user_id,location_id" })
      : await supabase.from("delivery_location_stars").delete().eq("user_id", userId).eq("location_id", locationId);
    if (res.error) {
      setLocations((ls) => ls.map((l) => (l.location_id === locationId ? { ...l, starred: !star } : l)));
      throw new Error(res.error.message);
    }
  }, [userId]);

  return { locations, tanks, loading, reload: load, toggleStar };
}

// Remembers tanks seen at a delivery (§4: "tanks are remembered"). Adds tank
// numbers the location doesn't have yet and fills in a missing product; never
// overwrites a product someone already set.
export async function rememberTanks(
  locationId: string,
  seen: { tank_number: string; product_id: string | null }[],
  existing: LocationTank[],
) {
  const have = new Map(existing.filter((t) => t.location_id === locationId).map((t) => [t.tank_number.trim(), t]));
  // Two shapes (new tank / fill a product), sent separately: a bulk upsert
  // sends the union of keys, which would null tank_id on the new rows.
  const now = new Date().toISOString();
  const added: Record<string, unknown>[] = [];
  const filled: Record<string, unknown>[] = [];
  for (const s of seen) {
    const num = s.tank_number.trim();
    if (!num) continue;
    const old = have.get(num);
    if (!old) {
      added.push({ location_id: locationId, tank_number: num, product_id: s.product_id, client_updated_at: now });
      have.set(num, { tank_id: "", location_id: locationId, tank_number: num, product_id: s.product_id, capacity_gallons: null, is_active: true });
    } else if (!old.product_id && s.product_id) {
      filled.push({ tank_id: old.tank_id, location_id: locationId, tank_number: num, product_id: s.product_id, client_updated_at: now });
    }
  }
  for (const rows of [added, filled]) {
    if (!rows.length) continue;
    const { error } = await supabase.from("delivery_location_tanks").upsert(rows, { onConflict: "location_id,tank_number" });
    if (error) console.warn("[trips] remember tanks failed:", error.message);
  }
}

// Saves the driver's tank order for a store: sort_order 0..n over the names given (saved tanks only).
export async function saveTankOrder(locationId: string, ordered: string[], existing: LocationTank[]) {
  const have = new Map(existing.filter((t) => t.location_id === locationId).map((t) => [t.tank_number.trim(), t]));
  const rows = ordered.flatMap((n, i) => {
    const t = have.get(n.trim());
    return t ? [{ tank_id: t.tank_id, location_id: locationId, tank_number: t.tank_number, sort_order: i, client_updated_at: new Date().toISOString() }] : [];
  });
  if (!rows.length) return;
  const { error } = await supabase.from("delivery_location_tanks").upsert(rows, { onConflict: "location_id,tank_number" });
  if (error) console.warn("[trips] save tank order failed:", error.message);
}
