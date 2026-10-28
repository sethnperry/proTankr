"use client";
// app/planner/hooks/useEquipmentBoardStatus.ts
//
// What the equipment board shows under a combo's unit numbers: who has the truck
// (initials) and what the trailer is carrying (one colored dot per loaded compartment).
// Read straight from the server (trips and their compartments are readable company-wide).
// Fails open: with no data the board just shows no extra line.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useProductsCatalog } from "@/lib/queries/useProductsCatalog";
import { useTerminalsCatalog } from "@/lib/queries/useTerminalsCatalog";
import { productColorFor } from "../utils/productColor";
import { dotsFor, initialsOf, driverActivity, nextDeliveryIndex, placeLine, lastPlace, type LoadedDot } from "@/lib/equipment/boardStatus";
import { stripSegments, residueStands, type StripSeg } from "@/lib/equipment/trailerStrip";

const CARRYING = ["loading", "in_transit", "delivering", "parked"];

export function useEquipmentBoardStatus(enabled: boolean, claimerIds: string[], trailerIds: string[], refreshKey?: unknown) {
  const catalog = useProductsCatalog();
  const terminals = useTerminalsCatalog();
  const [lastStops, setLastStops] = useState<Record<string, { at: string | null; line: string }[]>>({});
  const [initials, setInitials] = useState<Record<string, string>>({});
  const [aboard, setAboard] = useState<Record<string, { comp: number; productId: string | null }[]>>({});

  const [compSizes, setCompSizes] = useState<Record<string, { comp: number; size: number | null }[]>>({});
  const [residueBy, setResidueBy] = useState<Record<string, Record<number, string>>>({});

  const [activity, setActivity] = useState<Record<string, string>>({});
  const [destByTrailer, setDestByTrailer] = useState<Record<string, string>>({});

  const claimKey = [...new Set(claimerIds)].sort().join(",");
  const trailerKey = [...new Set(trailerIds)].sort().join(",");

  useEffect(() => {
    if (!enabled || !claimKey) { setInitials({}); return; }
    let alive = true;
    void (async () => {
      try {
        const { data } = await supabase.rpc("get_display_names_full", { p_user_ids: claimKey.split(",") });
        const m: Record<string, string> = {};
        for (const r of (data ?? []) as { user_id?: string; display_name?: string | null }[]) {
          if (r.user_id) m[r.user_id] = initialsOf(r.display_name);
        }
        if (alive) setInitials(m);
      } catch { /* fail open */ }
    })();
    return () => { alive = false; };
  }, [enabled, claimKey, refreshKey]);

  useEffect(() => {
    if (!enabled || !trailerKey) { setAboard({}); return; }
    let alive = true;
    void (async () => {
      try {
        const ids = trailerKey.split(",");
        const tr = await supabase.from("trips").select("trip_id, trailer_id").in("trailer_id", ids).in("status", CARRYING);
        const trips = (tr.data ?? []) as { trip_id: string; trailer_id: string }[];
        if (trips.length === 0) { if (alive) setAboard({}); return; }
        const cl = await supabase.from("trip_compartment_loads").select("trip_id, comp_number, product_id")
          .in("trip_id", trips.map((t) => t.trip_id)).eq("disposition", "loaded");
        const trailerOf = new Map(trips.map((t) => [t.trip_id, t.trailer_id]));
        const out: Record<string, { comp: number; productId: string | null }[]> = {};
        for (const r of (cl.data ?? []) as { trip_id: string; comp_number: number; product_id: string | null }[]) {
          const tid = trailerOf.get(r.trip_id);
          if (!tid) continue;
          (out[tid] ??= []).push({ comp: Number(r.comp_number), productId: r.product_id });
        }
        if (alive) setAboard(out);
      } catch { /* fail open */ }
    })();
    return () => { alive = false; };
  }, [enabled, trailerKey, refreshKey]);

  // What each holder is doing (from their open trip or an open fuel stop) and where each loaded trailer is headed.
  useEffect(() => {
    if (!enabled || (!claimKey && !trailerKey)) { setActivity({}); setDestByTrailer({}); return; }
    let alive = true;
    void (async () => {
      try {
        const drivers = claimKey ? claimKey.split(",") : [];
        const trailers = trailerKey ? trailerKey.split(",") : [];
        const sel = "trip_id, driver_id, trailer_id, status";
        const [a, b, fu] = await Promise.all([
          drivers.length ? supabase.from("trips").select(sel).in("driver_id", drivers).in("status", CARRYING.concat("draft")) : Promise.resolve({ data: [] as any[] }),
          trailers.length ? supabase.from("trips").select(sel).in("trailer_id", trailers).in("status", CARRYING) : Promise.resolve({ data: [] as any[] }),
          drivers.length ? supabase.from("fuel_purchases").select("driver_id").in("driver_id", drivers).is("finished_at", null).neq("status", "complete") : Promise.resolve({ data: [] as any[] }),
        ]);
        const trips = new Map<string, { trip_id: string; driver_id: string; trailer_id: string | null; status: string }>();
        for (const t of [...((a.data ?? []) as any[]), ...((b.data ?? []) as any[])]) trips.set(t.trip_id, t);
        const ids = [...trips.keys()];
        const [pk, dl] = ids.length
          ? await Promise.all([
              supabase.from("trip_pickups").select("trip_id, arrived_at, left_at, outcome").in("trip_id", ids),
              supabase.from("trip_deliveries").select("trip_id, arrived_at, left_at, status, seq, location_id, one_off_name").in("trip_id", ids),
            ])
          : [{ data: [] as any[] }, { data: [] as any[] }];
        const locIds = [...new Set(((dl.data ?? []) as any[]).map((d) => d.location_id).filter(Boolean))];
        const lr = locIds.length ? await supabase.from("delivery_locations").select("location_id, name").in("location_id", locIds) : { data: [] as any[] };
        const locName = new Map(((lr.data ?? []) as any[]).map((l) => [l.location_id, String(l.name ?? "")]));
        const fuelers = new Set(((fu.data ?? []) as any[]).map((f) => f.driver_id));
        const act: Record<string, string> = {};
        const dest: Record<string, string> = {};
        for (const t of trips.values()) {
          const ps = ((pk.data ?? []) as any[]).filter((x) => x.trip_id === t.trip_id);
          const ds = ((dl.data ?? []) as any[]).filter((x) => x.trip_id === t.trip_id);
          if (drivers.includes(t.driver_id)) { const v = driverActivity({ status: t.status, pickups: ps, deliveries: ds }, fuelers.has(t.driver_id)); if (v) act[t.driver_id] = v; }
          if (t.trailer_id && CARRYING.includes(t.status)) {
            const i = nextDeliveryIndex(ds);
            if (i >= 0) { const n = ds[i].location_id ? locName.get(ds[i].location_id) : ds[i].one_off_name; if (n) dest[t.trailer_id] = n; }
          }
        }
        for (const id of fuelers) if (!act[id as string]) act[id as string] = "Fueling";
        if (alive) { setActivity(act); setDestByTrailer(dest); }
      } catch { /* fail open */ }
    })();
    return () => { alive = false; };
  }, [enabled, claimKey, trailerKey, refreshKey]);

  // Where each trailer last was: its newest finished pickup (terminal) or delivery (store).
  useEffect(() => {
    if (!enabled || !trailerKey) { setLastStops({}); return; }
    let alive = true;
    void (async () => {
      try {
        const ids = trailerKey.split(",");
        const tr = await supabase.from("trips").select("trip_id, trailer_id").in("trailer_id", ids).order("started_at", { ascending: false }).limit(400);
        const trips = (tr.data ?? []) as { trip_id: string; trailer_id: string }[];
        if (trips.length === 0) { if (alive) setLastStops({}); return; }
        const tids = trips.map((t) => t.trip_id);
        const [pk, dl] = await Promise.all([
          supabase.from("trip_pickups").select("trip_id, terminal_id, left_at, outcome").in("trip_id", tids).not("left_at", "is", null),
          supabase.from("trip_deliveries").select("trip_id, location_id, one_off_name, left_at").in("trip_id", tids).not("left_at", "is", null),
        ]);
        const locIds = [...new Set(((dl.data ?? []) as any[]).map((d) => d.location_id).filter(Boolean))];
        const lr = locIds.length ? await supabase.from("delivery_locations").select("location_id, name, city").in("location_id", locIds) : { data: [] as any[] };
        const loc = new Map(((lr.data ?? []) as any[]).map((l) => [l.location_id, l]));
        const trailerOf = new Map(trips.map((t) => [t.trip_id, t.trailer_id]));
        const term = new Map(terminals.data.map((t) => [String(t.terminal_id), t]));
        const out: Record<string, { at: string | null; line: string }[]> = {};
        for (const r of (pk.data ?? []) as any[]) {
          const tid = trailerOf.get(r.trip_id); const t = r.terminal_id ? term.get(String(r.terminal_id)) : null;
          if (!tid || !t || r.outcome === "no_load") continue;
          (out[tid] ??= []).push({ at: r.left_at, line: placeLine("terminal", String(t.terminal_name ?? ""), t.city) });
        }
        for (const r of (dl.data ?? []) as any[]) {
          const tid = trailerOf.get(r.trip_id); const l = r.location_id ? loc.get(r.location_id) : null;
          const name = l?.name ?? r.one_off_name;
          if (!tid || !name) continue;
          (out[tid] ??= []).push({ at: r.left_at, line: placeLine("store", String(name), l?.city) });
        }
        if (alive) setLastStops(out);
      } catch { /* fail open */ }
    })();
    return () => { alive = false; };
  }, [enabled, trailerKey, refreshKey, terminals.data]);

  const lastPlaceByTrailer = useMemo(() => {
    const o: Record<string, string> = {};
    for (const [id, st] of Object.entries(lastStops)) { const v = lastPlace(st); if (v) o[id] = v; }
    return o;
  }, [lastStops]);

  // Compartment sizes, and what each trailer last held (cleared by a wash after that load).
  useEffect(() => {
    if (!enabled || !trailerKey) { setCompSizes({}); setResidueBy({}); return; }
    let alive = true;
    const chunk = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
    void (async () => {
      try {
        const ids = trailerKey.split(",");
        const sizes: Record<string, { comp: number; size: number | null }[]> = {};
        const comboTrailer = new Map<string, string>();
        for (const part of chunk(ids, 80)) {
          const [tc, cb] = await Promise.all([
            supabase.from("trailer_compartments").select("trailer_id, comp_number, max_gallons").in("trailer_id", part),
            supabase.from("equipment_combos").select("combo_id, trailer_id").in("trailer_id", part),
          ]);
          for (const r of (tc.data ?? []) as { trailer_id: string; comp_number: number; max_gallons: number | null }[])
            (sizes[r.trailer_id] ??= []).push({ comp: Number(r.comp_number), size: r.max_gallons != null ? Number(r.max_gallons) : null });
          for (const r of (cb.data ?? []) as { combo_id: string; trailer_id: string }[]) comboTrailer.set(r.combo_id, r.trailer_id);
        }
        if (alive) setCompSizes(sizes);

        // Newest finished load per trailer.
        const lastLoad = new Map<string, { loadId: string; at: string }>();
        for (const part of chunk([...comboTrailer.keys()], 80)) {
          const { data } = await supabase.from("load_log").select("load_id, combo_id, completed_at").in("combo_id", part).eq("status", "loaded")
            .not("completed_at", "is", null).order("completed_at", { ascending: false }).limit(1000);
          for (const r of (data ?? []) as { load_id: string; combo_id: string; completed_at: string }[]) {
            const tid = comboTrailer.get(r.combo_id);
            if (tid && (!lastLoad.get(tid) || r.completed_at > lastLoad.get(tid)!.at)) lastLoad.set(tid, { loadId: r.load_id, at: r.completed_at });
          }
        }
        const lastWash = new Map<string, string>();
        for (const part of chunk(ids, 80)) {
          const { data } = await supabase.from("wash_records").select("trailer_id, washed_at").in("trailer_id", part).order("washed_at", { ascending: false }).limit(1000);
          for (const r of (data ?? []) as { trailer_id: string | null; washed_at: string }[]) if (r.trailer_id && !lastWash.has(r.trailer_id)) lastWash.set(r.trailer_id, r.washed_at);
        }
        const standing = [...lastLoad.entries()].filter(([tid, l]) => residueStands(l.at, lastWash.get(tid) ?? null));
        const byLoad = new Map<string, Record<number, string>>();
        for (const part of chunk(standing.map(([, l]) => l.loadId), 80)) {
          const { data } = await supabase.from("load_lines").select("load_id, comp_number, product_id").in("load_id", part);
          for (const r of (data ?? []) as { load_id: string; comp_number: number; product_id: string | null }[])
            if (r.product_id) (byLoad.get(r.load_id) ?? byLoad.set(r.load_id, {}).get(r.load_id)!)[Number(r.comp_number)] = String(r.product_id);
        }
        const out: Record<string, Record<number, string>> = {};
        for (const [tid, l] of standing) if (byLoad.has(l.loadId)) out[tid] = byLoad.get(l.loadId)!;
        if (alive) setResidueBy(out);
      } catch { /* fail open: gray outlines */ }
    })();
    return () => { alive = false; };
  }, [enabled, trailerKey, refreshKey]);

  const colorOf = useMemo(() => {
    const by = new Map(catalog.data.map((p) => [p.product_id, p.hex_code || productColorFor(p.display_name || p.product_name)]));
    return (id: string) => by.get(id) ?? "#ffffff";
  }, [catalog.data]);

  const loadedByTrailer = useMemo(() => {
    const out: Record<string, LoadedDot[]> = {};
    for (const [tid, comps] of Object.entries(aboard)) {
      const dots = dotsFor(comps, colorOf);
      if (dots.length) out[tid] = dots;
    }
    return out;
  }, [aboard, colorOf]);

  const strips = useMemo(() => {
    const out: Record<string, StripSeg[]> = {};
    for (const [tid, comps] of Object.entries(compSizes)) {
      const now: Record<number, string> = {};
      for (const a of aboard[tid] ?? []) if (a.productId) now[a.comp] = colorOf(a.productId);
      const res: Record<number, string> = {};
      for (const [c, pid] of Object.entries(residueBy[tid] ?? {})) res[Number(c)] = colorOf(pid);
      out[tid] = stripSegments(comps, now, res);
    }
    return out;
  }, [compSizes, aboard, residueBy, colorOf]);

  return { initials, loadedByTrailer, strips, activity, destByTrailer, lastPlaceByTrailer };
}
