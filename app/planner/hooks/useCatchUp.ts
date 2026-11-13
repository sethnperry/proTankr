"use client";
// app/planner/hooks/useCatchUp.ts
//
// The end-of-shift catch-up: asks the server what the truck did between the shift's start and end, drops what the
// app already knows (trips, empty moves, fuel stops), and shows the rest as quick cards. Answers become empty moves
// and trailer statuses. If the driver isn't ready, or the shift was closed for them, the window is kept and the
// catch-up opens the next time the app does.

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { TripStore, TripStoreState } from "@/lib/trips/tripStore";
import { newMove } from "@/lib/moves/emptyMoves";
import { kindsOf, type DeliveryLocation } from "@/lib/trips/deliveryLocations";
import { allocateOdometer, buildCatchUp, type CatchUpCard, type LegCard, type Place, type Window } from "@/lib/shifts/catchUp";
import type { Drive } from "@/lib/shifts/trailStops";
import type { CatchUpAnswers } from "../components/shift/CatchUpSheet";

type Pending = { truckId: string; from: string; to: string; endOdo: number | null; savedAt: number };
type Recap = { connected: boolean; drives: Drive[]; events: { type: "hook" | "drop"; at: string; trailerId: string; trailerName: string; lat: number | null; lon: number | null }[]; odo: { firstMi: number; lastMi: number } | null };

export function useCatchUp(o: { store: TripStore | null; state: TripStoreState; syncNow: () => unknown; userId: string | null; companyId: string | null; truckId: string | null; trailerId: string | null; locations: DeliveryLocation[]; shiftOpen: boolean }) {
  const { store, state, syncNow, userId, companyId, truckId, trailerId, locations, shiftOpen } = o;
  const [cards, setCards] = useState<CatchUpCard[]>([]);
  const [open, setOpen] = useState(false);
  const ctx = useRef<{ win: Pending; recap: Recap; then?: () => void } | null>(null);
  const key = userId ? `proTankr:u:${userId}:catchUp` : null;
  const busy = useRef(false);

  const places: Place[] = locations.map((l) => ({ id: l.location_id, name: l.name, lat: l.lat, lon: l.lon, kinds: kindsOf(l) as string[] }));

  const start = useCallback(async (win: Pending, then?: () => void): Promise<void> => {
    if (!store || !userId || busy.current) { then?.(); return; }
    busy.current = true;
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const r = token ? await fetch(`/api/telematics/shift-recap?truckId=${encodeURIComponent(win.truckId)}&from=${encodeURIComponent(win.from)}&to=${encodeURIComponent(win.to)}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }) : null;
      const recap = r && r.ok ? ((await r.json()) as Recap) : null;
      if (!recap || !recap.connected) { if (key) localStorage.removeItem(key); then?.(); return; }
      // What the app already knows: whole trips, empty moves, fuel stops.
      const accounted: Window[] = [];
      for (const t of store.list("trips", (x) => x.driver_id === userId)) if (t.started_at && t.status !== "dispatched") accounted.push({ from: t.started_at, to: t.completed_at ?? t.cancelled_at ?? win.to });
      for (const m of store.list("empty_moves", (x) => x.driver_id === userId)) accounted.push({ from: m.started_at, to: m.ended_at ?? win.to });
      try {
        const f = await supabase.from("fuel_purchases").select("started_at, finished_at").eq("truck_id", win.truckId).gte("started_at", win.from).lte("started_at", win.to);
        for (const x of (f.data ?? []) as { started_at: string; finished_at: string | null }[]) accounted.push({ from: x.started_at, to: x.finished_at ?? x.started_at });
      } catch { /* fuel is only a hint */ }
      const first = recap.events[0];
      const trailerAtStart = first ? first.type === "drop" : !!trailerId;
      const found = buildCatchUp({ drives: recap.drives, events: recap.events, accounted, places, trailerAtStart });
      if (found.length === 0) { if (key) localStorage.removeItem(key); then?.(); return; }
      if (key) localStorage.setItem(key, JSON.stringify(win));
      ctx.current = { win, recap, then };
      setCards(found);
      setOpen(true);
    } catch (e) {
      console.warn("[catch-up] failed:", e);
      then?.();
    } finally { busy.current = false; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, userId, key, trailerId, locations]);

  const clear = () => { if (key) { try { localStorage.removeItem(key); } catch { /* storage blocked */ } } };
  const close = () => { setOpen(false); const t = ctx.current?.then; ctx.current = null; t?.(); };

  const apply = useCallback(async (answers: CatchUpAnswers) => {
    const c = ctx.current;
    if (!c || !store || !userId || !companyId) { close(); return; }
    const legs = cards.filter((x): x is LegCard => x.type === "leg" && answers[x.id] !== "part_of_trip");
    const odo = allocateOdometer(legs, c.recap.odo, c.win.endOdo);
    for (const l of legs) {
      const a = answers[l.id];
      const kind = a === "personal" ? (l.trailerOn ? "empty_return" : "bobtail") : (a as "empty_return" | "bobtail" | "reposition");
      const id = crypto.randomUUID();
      const mv = newMove({ id, companyId, driverId: userId, truckId: c.win.truckId, trailerId: l.trailerOn ? trailerId : null, kind, from: { id: l.fromPlaceId, text: l.fromLabel }, to: { id: l.toPlaceId, text: l.toLabel }, beginMiles: odo[l.id]?.begin ?? null, nowIso: l.startAt });
      store.put("empty_moves", mv as any);
      store.put("empty_moves", { move_id: id, ended_at: l.endAt, end_miles: odo[l.id]?.end ?? null, source: "geotab", ...(a === "personal" ? { billable: false, notes: "Personal conveyance" } : {}) } as any);
    }
    for (const d of cards) {
      if (d.type !== "drop") continue;
      const where = answers[d.id];
      const shop = where === "maintenance";
      try {
        await supabase.rpc("set_equipment_status", { p_unit_kind: "trailer", p_unit_id: d.trailerId, p_status: shop ? "deadline" : "readyline", p_region: null, p_local_area: null, p_notes: `${shop ? "At" : "Left at"} ${d.placeLabel}`, p_sub_status: shop ? "Maintenance" : "Parked" });
        if (d.lat != null && d.lon != null) await supabase.rpc("park_equipment", { p_truck_id: null, p_trailer_id: d.trailerId, p_lat: d.lat, p_lon: d.lon, p_label: d.placeLabel, p_place_id: d.placeId });
      } catch (e) { console.warn("[catch-up] trailer status failed:", e); }
    }
    void syncNow();
    clear();
    close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, store, userId, companyId, trailerId, syncNow]);

  /** Not now: the window stays and the catch-up opens again next time. */
  const skip = useCallback(() => close(), []); // eslint-disable-line react-hooks/exhaustive-deps

  // A catch-up left over from an earlier shift (skipped, or the shift was closed for the driver) opens with the app.
  const triedPending = useRef(false);
  useEffect(() => {
    if (triedPending.current || !key || !store || !userId || !companyId || !locations.length || shiftOpen) return;
    triedPending.current = true;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const p = JSON.parse(raw) as Pending;
      if (Date.now() - p.savedAt > 48 * 3600_000) { localStorage.removeItem(key); return; }
      void start(p);
    } catch { /* ignore a bad value */ }
  }, [key, store, userId, companyId, locations.length, shiftOpen, start, state]);

  const begin = useCallback((w: { truckId: string; from: string; to: string; endOdo: number | null }, then?: () => void) => start({ ...w, savedAt: Date.now() }, then), [start]);
  return { cards, open, begin, apply, skip };
}
