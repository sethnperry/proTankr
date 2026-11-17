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
import { dotsFor, initialsOf, driverActivity, nextDeliveryIndex, placeLine, lastPlace, storeLabel, type LoadedDot } from "@/lib/equipment/boardStatus";
import { stripSegments, type StripSeg } from "@/lib/equipment/trailerStrip";
import { fetchTrailerResidue } from "@/lib/equipment/fetchTrailerResidue";
import type { PlanLineComp } from "../components/PlanLine";

// A fuel stop left open longer than this was abandoned, not in progress.
const FUEL_STALE_MS = 3 * 3600_000;
const CARRYING = ["loading", "in_transit", "delivering", "parked"];

export function useEquipmentBoardStatus(enabled: boolean, claimerIds: string[], trailerIds: string[], refreshKey?: unknown, truckIds: string[] = []) {
  const catalog = useProductsCatalog();
  const terminals = useTerminalsCatalog();
  const [plannedPickup, setPlannedPickup] = useState<Record<string, string>>({});
  const [lastStops, setLastStops] = useState<Record<string, { at: string | null; line: string }[]>>({});
  const [initials, setInitials] = useState<Record<string, string>>({});
  const [aboard, setAboard] = useState<Record<string, { comp: number; productId: string | null }[]>>({});

  const [compSizes, setCompSizes] = useState<Record<string, { comp: number; size: number | null }[]>>({});
  const [residueBy, setResidueBy] = useState<Record<string, Record<number, string>>>({});
  // Trailers a driver took (shown by the tracker) without anyone saying what they hold: "Undefined" until someone does.
  const [undefinedIds, setUndefinedIds] = useState<Set<string>>(new Set());

  const [activity, setActivity] = useState<Record<string, string>>({});
  const [destByTrailer, setDestByTrailer] = useState<Record<string, string>>({});

  // Who last parked each unit (initials), for a unit nobody holds right now.
  const [parkedByUnit, setParkedByUnit] = useState<Record<string, string>>({});
  // Units the tracker puts a driver in with no confirmed pairing yet.
  const [unconfirmed, setUnconfirmed] = useState<Set<string>>(new Set());
  const unitKey = [...new Set([...truckIds, ...trailerIds])].sort().join(",");
  useEffect(() => {
    if (!enabled || !unitKey) { setParkedByUnit({}); setUnconfirmed(new Set()); return; }
    let alive = true;
    void (async () => {
      try {
        const ids = unitKey.split(",");
        const [pk, ho] = await Promise.all([
          supabase.from("equipment_parks").select("unit_id, parked_by").in("unit_id", ids),
          // A driver the tracker shows in a truck with no confirmed pairing yet: an unconfirmed pairing.
          supabase.from("equipment_handoffs").select("user_id, truck_id, trailer_id").is("ended_at", null).is("resolved_at", null),
        ]);
        const rows: { unit_id: string; parked_by: string | null }[] = ((pk.data ?? []) as { unit_id: string; parked_by: string | null }[]).filter((r) => r.parked_by);
        const idSet = new Set(ids);
        const handed: { unit_id: string; parked_by: string | null }[] = [];
        for (const h of (ho.data ?? []) as { user_id: string; truck_id: string | null; trailer_id: string | null }[]) {
          if (h.truck_id && idSet.has(h.truck_id)) handed.push({ unit_id: h.truck_id, parked_by: h.user_id });
          if (h.trailer_id && idSet.has(h.trailer_id)) handed.push({ unit_id: h.trailer_id, parked_by: h.user_id });
        }
        if (alive) setUnconfirmed(new Set(handed.map((r) => r.unit_id)));
        const all = [...rows, ...handed];
        const who = [...new Set(all.map((r) => r.parked_by as string))];
        if (!who.length) { if (alive) setParkedByUnit({}); return; }
        const { data: nm } = await supabase.rpc("get_display_names_full", { p_user_ids: who });
        const ini = new Map(((nm ?? []) as { user_id?: string; display_name?: string | null }[]).map((r) => [r.user_id ?? "", initialsOf(r.display_name)]));
        const out: Record<string, string> = {};
        for (const r of all) { const v = ini.get(r.parked_by as string); if (v) out[r.unit_id] = v; }
        if (alive) setParkedByUnit(out);
      } catch { /* fail open */ }
    })();
    return () => { alive = false; };
  }, [enabled, unitKey, refreshKey]);

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
        const sel = "trip_id, driver_id, trailer_id, status, started_at";
        const [a, b, fu] = await Promise.all([
          drivers.length ? supabase.from("trips").select(sel).in("driver_id", drivers).in("status", CARRYING.concat("draft")) : Promise.resolve({ data: [] as any[] }),
          trailers.length ? supabase.from("trips").select(sel).in("trailer_id", trailers).in("status", CARRYING) : Promise.resolve({ data: [] as any[] }),
          drivers.length ? supabase.from("fuel_purchases").select("driver_id, started_at").in("driver_id", drivers).is("finished_at", null).neq("status", "complete").gte("started_at", new Date(Date.now() - FUEL_STALE_MS).toISOString()) : Promise.resolve({ data: [] as any[] }),
        ]);
        const trips = new Map<string, { trip_id: string; driver_id: string; trailer_id: string | null; status: string; started_at?: string }>();
        for (const t of [...((a.data ?? []) as any[]), ...((b.data ?? []) as any[])]) trips.set(t.trip_id, t);
        const ids = [...trips.keys()];
        const [pk, dl] = ids.length
          ? await Promise.all([
              supabase.from("trip_pickups").select("trip_id, arrived_at, left_at, outcome").in("trip_id", ids),
              supabase.from("trip_deliveries").select("trip_id, arrived_at, left_at, status, seq, location_id, one_off_name").in("trip_id", ids),
            ])
          : [{ data: [] as any[] }, { data: [] as any[] }];
        const locIds = [...new Set(((dl.data ?? []) as any[]).map((d) => d.location_id).filter(Boolean))];
        const lr = locIds.length ? await supabase.from("delivery_locations").select("location_id, name, location_number").in("location_id", locIds) : { data: [] as any[] };
        const locName = new Map(((lr.data ?? []) as any[]).map((l) => [l.location_id, storeLabel(l.name, l.location_number)]));
        // A fuel stop only counts when it is newer than the driver's newest trip (a new trip means they moved on).
        const newestTrip = new Map<string, string>();
        for (const t of trips.values()) { const at = String((t as any).started_at ?? ""); if (at > (newestTrip.get(t.driver_id) ?? "")) newestTrip.set(t.driver_id, at); }
        const fuelers = new Set(((fu.data ?? []) as any[]).filter((f) => String(f.started_at) > (newestTrip.get(f.driver_id) ?? "")).map((f) => f.driver_id));
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

  // Where each empty trailer is or is going: a planned pickup (draft or dispatched trip) wins,
  // otherwise the store it last delivered to.
  useEffect(() => {
    if (!enabled || !trailerKey) { setLastStops({}); setPlannedPickup({}); return; }
    let alive = true;
    void (async () => {
      try {
        const ids = trailerKey.split(",");
        const [tr, dsp] = await Promise.all([
          supabase.from("trips").select("trip_id, trailer_id, status").in("trailer_id", ids).order("started_at", { ascending: false }).limit(400),
          supabase.from("trips").select("trip_id, planned_trailer_id").in("planned_trailer_id", ids).eq("status", "dispatched"),
        ]);
        const trips = (tr.data ?? []) as { trip_id: string; trailer_id: string; status: string }[];
        const dispatched = (dsp.data ?? []) as { trip_id: string; planned_trailer_id: string }[];
        const allIds = [...trips.map((t) => t.trip_id), ...dispatched.map((t) => t.trip_id)];
        if (allIds.length === 0) { if (alive) { setLastStops({}); setPlannedPickup({}); } return; }
        const [pk, dl] = await Promise.all([
          supabase.from("trip_pickups").select("trip_id, terminal_id, left_at, outcome, seq").in("trip_id", allIds).order("seq"),
          supabase.from("trip_deliveries").select("trip_id, location_id, one_off_name, left_at").in("trip_id", trips.map((t) => t.trip_id)).not("left_at", "is", null),
        ]);
        const locIds = [...new Set(((dl.data ?? []) as any[]).map((d) => d.location_id).filter(Boolean))];
        const lr = locIds.length ? await supabase.from("delivery_locations").select("location_id, name, location_number").in("location_id", locIds) : { data: [] as any[] };
        const loc = new Map(((lr.data ?? []) as any[]).map((l) => [l.location_id, l]));
        const trailerOf = new Map<string, string>([...trips.map((t) => [t.trip_id, t.trailer_id] as [string, string]), ...dispatched.map((t) => [t.trip_id, t.planned_trailer_id] as [string, string])]);
        const planning = new Set<string>([...trips.filter((t) => t.status === "draft" || t.status === "loading").map((t) => t.trip_id), ...dispatched.map((t) => t.trip_id)]);
        const term = new Map(terminals.data.map((t) => [String(t.terminal_id), t]));
        const planned: Record<string, string> = {};
        for (const r of (pk.data ?? []) as any[]) {
          if (!planning.has(r.trip_id) || r.left_at || r.outcome === "no_load" || !r.terminal_id) continue;
          const tid = trailerOf.get(r.trip_id); const t = term.get(String(r.terminal_id));
          if (tid && t && !planned[tid]) planned[tid] = placeLine("terminal", String(t.terminal_name ?? ""), t.city);
        }
        const out: Record<string, { at: string | null; line: string }[]> = {};
        // A manual status update (STUD) with a location is the newest word on where the trailer is.
        const st = await supabase.from("trailers").select("trailer_id, status_code, status_updated_at, current_local_area, current_region").in("trailer_id", ids);
        for (const r of (st.data ?? []) as any[]) {
          const line = String(r.current_local_area || r.current_region || "").trim();
          if (r.status_code && r.status_updated_at && line) (out[r.trailer_id] ??= []).push({ at: r.status_updated_at, line });
        }
        for (const r of (dl.data ?? []) as any[]) {
          const tid = trailerOf.get(r.trip_id); const l = r.location_id ? loc.get(r.location_id) : null;
          const name = l ? storeLabel(l.name, l.location_number) : r.one_off_name;
          if (tid && name) (out[tid] ??= []).push({ at: r.left_at, line: placeLine("store", String(name), null) });
        }
        if (alive) { setLastStops(out); setPlannedPickup(planned); }
      } catch { /* fail open */ }
    })();
    return () => { alive = false; };
  }, [enabled, trailerKey, refreshKey, terminals.data]);

  const lastPlaceByTrailer = useMemo(() => {
    const o: Record<string, string> = {};
    for (const [id, st] of Object.entries(lastStops)) { const v = lastPlace(st); if (v) o[id] = v; }
    for (const [id, v] of Object.entries(plannedPickup)) o[id] = v;
    return o;
  }, [lastStops, plannedPickup]);

  // Compartment sizes, and what each trailer last held (cleared by a wash after that load).
  useEffect(() => {
    if (!enabled || !trailerKey) { setCompSizes({}); setResidueBy({}); return; }
    let alive = true;
    const chunk = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
    void (async () => {
      try {
        const ids = trailerKey.split(",");
        const { sizes, residue } = await fetchTrailerResidue(ids);
        if (alive) setCompSizes(sizes);
        const out = residue;
        if (alive) setResidueBy(out);
      } catch { /* fail open: gray outlines */ }
    })();
    return () => { alive = false; };
  }, [enabled, trailerKey, refreshKey]);

  useEffect(() => {
    if (!enabled || !trailerKey) { setUndefinedIds(new Set()); return; }
    let alive = true;
    void (async () => {
      try {
        const { data } = await supabase.from("equipment_handoffs").select("trailer_id").in("trailer_id", trailerKey.split(",")).is("resolved_at", null);
        if (alive) setUndefinedIds(new Set(((data ?? []) as { trailer_id: string | null }[]).map((r) => r.trailer_id).filter((x): x is string => !!x)));
      } catch { /* fail open: no Undefined tag */ }
    })();
    return () => { alive = false; };
  }, [enabled, trailerKey, refreshKey]);

  const colorOf = useMemo(() => {
    const by = new Map(catalog.data.map((p) => [p.product_id, p.hex_code || productColorFor(p.display_name || p.product_name)]));
    return (id: string) => by.get(id) ?? "#ffffff";
  }, [catalog.data]);

  const codeOf = useMemo(() => {
    const by = new Map(catalog.data.map((p) => { const nm = String(p.display_name || p.product_name || ""); return [p.product_id, String(p.button_code ?? (nm.split(" ")[0] || "")).trim().toUpperCase()] as const; }));
    return (id: string) => by.get(id) ?? "";
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
      const codes: Record<number, string> = {};
      for (const a of aboard[tid] ?? []) if (a.productId) { now[a.comp] = colorOf(a.productId); codes[a.comp] = codeOf(a.productId); }
      const res: Record<number, string> = {};
      for (const [c, pid] of Object.entries(residueBy[tid] ?? {})) res[Number(c)] = colorOf(pid);
      out[tid] = stripSegments(comps, now, res, codes);
    }
    return out;
  }, [compSizes, aboard, residueBy, colorOf, codeOf]);

  // Each trailer as plan-style codes, highest comp first: D2/--/D2. A loaded compartment shows its product code; an
  // empty one shows dashes in the color of what it last held, gray once washed.
  const codesByTrailer = useMemo(() => {
    const codeOf = new Map(catalog.data.map((p) => [p.product_id, String(p.button_code ?? (p.display_name || p.product_name || "PRD").split(" ")[0]).trim().toUpperCase()]));
    const out: Record<string, PlanLineComp[]> = {};
    for (const [tid, comps] of Object.entries(compSizes)) {
      if (undefinedIds.has(tid)) { out[tid] = [{ num: 0, code: "Undefined", name: null, color: "#fbbf24" }]; continue; }
      const now = new Map((aboard[tid] ?? []).filter((a) => a.productId).map((a) => [a.comp, a.productId as string]));
      out[tid] = [...comps].sort((a, b) => b.comp - a.comp).map((c) => {
        const pid = now.get(c.comp);
        if (pid) return { num: c.comp, code: codeOf.get(pid) ?? "PRD", name: null, color: colorOf(pid) };
        const rp = residueBy[tid]?.[c.comp];
        return rp ? { num: c.comp, code: "--", name: null, color: colorOf(rp) } : { num: c.comp, code: null, name: null, color: null };
      });
    }
    return out;
  }, [catalog.data, compSizes, aboard, residueBy, colorOf, undefinedIds]);

  return { initials, loadedByTrailer, strips, activity, destByTrailer, lastPlaceByTrailer, codesByTrailer, parkedByUnit, unconfirmed };
}
