"use client";
// app/planner/components/trip/TripsBrowser.tsx
//
// The trips list, shared by the Driver Dashboard (a driver's own trips, whatever truck or place, local-first)
// and the Dispatch Dashboard (the whole company, with filters for driver, truck and period). Each card opens
// its Product Transfer Document (docs/trip-workflow-design.md §13).

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { pruneMissingTrips } from "@/lib/trips/pruneTrips";
import { useTripStore } from "@/lib/trips/useTripStore";
import { setTripHidden } from "@/lib/trips/tripFlow";
import { dispatchedForDriver } from "@/lib/trips/tripLogic";
import { swapRunOrder } from "@/lib/dispatch/dispatchTrip";
import { cancelReasonsText } from "@/lib/trips/cancelReasons";
import { ptdCode } from "@/lib/trips/code39";
import { useTrailerHeaderData } from "../TrailerViews";
import { PlanLine, type PlanLineComp } from "../PlanLine";
import { productColorFor } from "../../utils/productColor";
import { useProductsCatalog } from "@/lib/queries/useProductsCatalog";
import { useCompanyRoster } from "@/app/planner/hooks/useCompanyRoster";
import { PickSheet } from "@/lib/ui/PickSheet";
import type { EmptyMoveRow, TripCompartmentLoadRow, TripDeliveryRow, TripOrderRow, TripPickupRow, TripRow } from "@/lib/trips/types";
import { moveKindLabel, moveMiles } from "@/lib/moves/emptyMoves";
import { fmtDateTime } from "../../trips/PtdDocument";
import { usePending } from "@/lib/ui/pending";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { forceCancelTrip } from "@/lib/dispatch/tripEdits";

const STATUS: Record<TripRow["status"], { label: string; color: string }> = {
  dispatched: { label: "Dispatched", color: "#93c5fd" },
  draft: { label: "Enroute", color: "#60a5fa" },
  loading: { label: "Arrived", color: "#fbbf24" },
  in_transit: { label: "Enroute", color: "#60a5fa" },
  delivering: { label: "Enroute", color: "#60a5fa" },
  parked: { label: "Parked", color: "#93c5fd" },
  complete: { label: "Complete", color: "#4ade80" },
  cancelled: { label: "Canceled", color: "rgba(255,255,255,0.35)" },
};

const TRAILER_COLOR: Record<string, string> = { Cleaned: "rgba(255,255,255,0.55)", Residue: "rgba(255,255,255,0.55)", Loading: "#fbbf24", Loaded: "#4ade80", Unloading: "#60a5fa", Preloaded: "#93c5fd" };
const card: React.CSSProperties = {
  display: "block", width: "100%", textAlign: "left", borderRadius: 2, border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.03)", padding: 12, marginBottom: 10, color: "#fff", cursor: "pointer",
};
const chip: React.CSSProperties = { padding: "8px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer", border: "1px solid rgba(255,255,255,0.14)", background: "#0a0a0b", color: "rgba(255,255,255,0.8)" };
const chipOn: React.CSSProperties = { ...chip, border: "1px solid #fff", background: "#fff", color: "#000" };

type Bundle = { trips: TripRow[]; orders: TripOrderRow[]; pickups: TripPickupRow[]; deliveries: TripDeliveryRow[]; comps: TripCompartmentLoadRow[]; moves: EmptyMoveRow[] };
const EMPTY: Bundle = { trips: [], orders: [], pickups: [], deliveries: [], comps: [], moves: [] };

const PERIODS = [{ id: "7", label: "7d", days: 7 }, { id: "30", label: "30d", days: 30 }, { id: "90", label: "90d", days: 90 }, { id: "all", label: "All", days: 0 }];

/** Reads the children of a set of trips (orders, stops, compartments) a few hundred at a time. */
async function fetchChildren(ids: string[], isLive: () => boolean, onPart: (p: Partial<Bundle>) => void) {
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const [o, pk, dl, cl] = await Promise.all([
      supabase.from("trip_orders").select("*").in("trip_id", chunk),
      supabase.from("trip_pickups").select("*").in("trip_id", chunk),
      supabase.from("trip_deliveries").select("*").in("trip_id", chunk),
      supabase.from("trip_compartment_loads").select("*").in("trip_id", chunk),
    ]);
    if (!isLive()) return;
    onPart({ orders: (o.data ?? []) as TripOrderRow[], pickups: (pk.data ?? []) as TripPickupRow[], deliveries: (dl.data ?? []) as TripDeliveryRow[], comps: (cl.data ?? []) as TripCompartmentLoadRow[] });
  }
}

/** An empty move (bobtail, empty return, reposition) as a two-line card in the trips list. */
function MoveCard({ m, who, trailerParts, trailerWord }: { m: EmptyMoveRow; who: string; trailerParts: PlanLineComp[]; trailerWord: string | null }) {
  const done = !!m.ended_at;
  const miles = moveMiles(m);
  const from = m.from_text || "—";
  const to = m.to_text || (done ? "—" : "…");
  return (
    <div style={{ ...card, cursor: "default", display: "block", padding: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ flexShrink: 0, fontSize: 14, fontWeight: 800 }}>{who}</span>
        <span style={{ minWidth: 0, flex: 1, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
          {m.trailer_id && trailerParts.length > 0 && <PlanLine letter="" detail={false} comps={trailerParts} />}
        </span>
        {trailerWord && <span style={{ flexShrink: 0, fontSize: 12, color: "rgba(255,255,255,0.55)" }}>{trailerWord}</span>}
        <span style={{ flexShrink: 0, fontSize: 13, fontWeight: 800, color: done ? "#4ade80" : "#60a5fa" }}>{done ? "Complete" : "Enroute"}</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 4 }}>
        <span style={{ minWidth: 0, flex: 1, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", fontSize: 13, color: "rgba(255,255,255,0.65)" }}>
          <span style={{ fontWeight: 800, color: "#fff" }}>{moveKindLabel(m.kind)}</span>{" · "}{from} → {to}{miles != null ? ` · ${miles} mi` : ""}
        </span>
        <span className="dash-num" style={{ flexShrink: 0, fontSize: 12, color: "rgba(255,255,255,0.6)", whiteSpace: "nowrap" }}>{done ? fmtDateTime(m.ended_at) : `Began ${fmtDateTime(m.started_at)}`}</span>
      </div>
    </div>
  );
}

export function TripsBrowser({ mode, userId, companyId, onOpen, region = null, canForceCancel = false }: {
  mode: "driver" | "company";
  /** The signed-in (or impersonated) user. Driver mode lists only this user's trips. */
  userId: string | null;
  companyId?: string | null;
  /** Open a trip's PTD. Defaults to the route; the caller can add a busy state. */
  onOpen?: (tripId: string) => void;
  /** The Dispatch board's Region filter, when one is on: only these drivers and trucks. */
  region?: { label: string; driverIds: Set<string>; truckOk: (truckId: string) => boolean } | null;
  /** Admins only: show "Cancel trip…" on any open trip, even one marked loaded (for test and mistaken loads). */
  canForceCancel?: boolean;
}) {
  const nav = usePending();
  const open = onOpen ?? ((id: string) => nav.go(id, `/planner/trips/${id}`));
  const company = mode === "company";
  const { state, store, syncNow } = useTripStore(company ? null : userId);
  const [showHidden, setShowHidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [locs, setLocs] = useState<Record<string, string>>({});
  const catalog = useProductsCatalog();

  // ── company filters ──
  const roster = useCompanyRoster(companyId ?? null);
  const [driverId, setDriverId] = useState("");
  const [truckId, setTruckId] = useState("");
  const [area, setArea] = useState("");
  const [orderNo, setOrderNo] = useState("");
  const [sheet, setSheet] = useState<null | "order" | "area" | "driver" | "truck">(null);
  const [period, setPeriod] = useState("30");
  const [trucks, setTrucks] = useState<{ truck_id: string; truck_name: string; local_area: string | null }[]>([]);
  const [server, setServer] = useState<Bundle>(EMPTY);
  useEffect(() => {
    if (!companyId) return;
    void supabase.from("trucks").select("truck_id, truck_name, local_area").eq("company_id", companyId).order("truck_name")
      .then((r) => setTrucks(((r.data ?? []) as { truck_id: string; truck_name: string; local_area?: string | null }[]).map((t) => ({ ...t, local_area: t.local_area ?? null }))));
  }, [companyId]);
  const truckName = useMemo(() => new Map(trucks.map((t) => [t.truck_id, t.truck_name])), [trucks]);
  const driverName = useMemo(() => new Map(roster.members.map((m) => [m.user_id, m.display_name])), [roster.members]);

  // The locations' names for each delivery, shown in the route line.
  const loadLocs = async (dels: TripDeliveryRow[], isLive: () => boolean) => {
    const locIds = [...new Set(dels.map((d) => d.location_id).filter(Boolean))] as string[];
    if (!locIds.length) return;
    const lr = await supabase.from("delivery_locations").select("location_id, name, location_number").in("location_id", locIds);
    if (isLive()) setLocs((m) => ({ ...m, ...Object.fromEntries(((lr.data ?? []) as { location_id: string; name: string; location_number: string | null }[]).map((l) => [l.location_id, [l.name, l.location_number].filter(Boolean).join(" ")])) }));
  };

  // Driver: the last 50 of their own trips, merged into the phone's store.
  useEffect(() => {
    if (company || !store || !userId) return;
    let cancelled = false;
    (async () => {
      try {
        const t = await supabase.from("trips").select("*").eq("driver_id", userId).order("created_at", { ascending: false }).limit(50);
        if (cancelled || t.error) return;
        const trips = (t.data ?? []) as TripRow[];
        store.hydrate("trips", trips);
        // Trips deleted on the server leave the phone's list too.
        pruneMissingTrips(store, userId, trips, 50);
        const since = new Date(Date.now() - 60 * 86400_000).toISOString();
        const mv = await supabase.from("empty_moves").select("*").eq("driver_id", userId).or(`ended_at.is.null,started_at.gte.${since}`).limit(200);
        if (!cancelled && !mv.error) store.hydrate("empty_moves", (mv.data ?? []) as EmptyMoveRow[]);
        await fetchChildren(trips.map((x) => x.trip_id), () => !cancelled, (p) => {
          if (p.orders) store.hydrate("trip_orders", p.orders);
          if (p.pickups) store.hydrate("trip_pickups", p.pickups);
          if (p.comps) store.hydrate("trip_compartment_loads", p.comps);
          if (p.deliveries) { store.hydrate("trip_deliveries", p.deliveries); void loadLocs(p.deliveries, () => !cancelled); }
        });
      } catch (e) {
        console.warn("[trips] list failed:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [company, store, userId]);

  // Dispatch: the company's trips for the filters picked.
  const regionTrucks = useMemo(() => trucks.filter((t) => !region || region.truckOk(t.truck_id)), [trucks, region]);
  const areaTruckIds = useMemo(() => (area ? regionTrucks.filter((t) => (t.local_area ?? "").trim() === area).map((t) => t.truck_id) : null), [area, regionTrucks]);
  const regionKey = region ? `${region.label}:${region.driverIds.size}` : "";
  const areaKey = areaTruckIds ? areaTruckIds.join(",") : "";
  useEffect(() => {
    if (!company || !companyId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        let q = supabase.from("trips").select("*").eq("company_id", companyId).order("created_at", { ascending: false }).limit(120);
        const days = PERIODS.find((p) => p.id === period)?.days ?? 0;
        if (days) q = q.gte("created_at", new Date(Date.now() - days * 86400000).toISOString());
        const NONE = ["00000000-0000-0000-0000-000000000000"];
        if (truckId) q = q.eq("truck_id", truckId);
        else if (areaTruckIds) q = q.in("truck_id", areaTruckIds.length ? areaTruckIds : NONE);
        if (driverId) q = q.eq("driver_id", driverId);
        else if (region) q = q.in("driver_id", region.driverIds.size ? [...region.driverIds] : NONE);
        const t = await q;
        if (cancelled || t.error) return;
        const trips = (t.data ?? []) as TripRow[];
        // Empty moves for the same filters (period, truck, driver), so the list is every move the fleet made.
        let mq = supabase.from("empty_moves").select("*").eq("company_id", companyId).order("started_at", { ascending: false }).limit(120);
        if (days) mq = mq.gte("started_at", new Date(Date.now() - days * 86400000).toISOString());
        if (truckId) mq = mq.eq("truck_id", truckId);
        else if (areaTruckIds) mq = mq.in("truck_id", areaTruckIds.length ? areaTruckIds : NONE);
        if (driverId) mq = mq.eq("driver_id", driverId);
        else if (region) mq = mq.in("driver_id", region.driverIds.size ? [...region.driverIds] : NONE);
        const mv = await mq;
        if (cancelled) return;
        setServer({ ...EMPTY, trips, moves: mv.error ? [] : ((mv.data ?? []) as EmptyMoveRow[]) });
        await fetchChildren(trips.map((x) => x.trip_id), () => !cancelled, (p) => {
          setServer((b) => ({ ...b, orders: [...b.orders, ...(p.orders ?? [])], pickups: [...b.pickups, ...(p.pickups ?? [])], deliveries: [...b.deliveries, ...(p.deliveries ?? [])], comps: [...b.comps, ...(p.comps ?? [])] }));
          if (p.deliveries) void loadLocs(p.deliveries, () => !cancelled);
        });
      } catch (e) {
        console.warn("[trips] company list failed:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company, companyId, truckId, period, driverId, areaKey, regionKey]);

  const bundle: Bundle = useMemo(() => {
    if (company) return server;
    if (!store || !userId) return EMPTY;
    const trips = store.list("trips", (t) => t.driver_id === userId);
    const ids = new Set(trips.map((t) => t.trip_id));
    return {
      trips,
      orders: store.list("trip_orders", (o) => ids.has(o.trip_id)),
      pickups: store.list("trip_pickups", (k) => ids.has(k.trip_id)),
      deliveries: store.list("trip_deliveries", (d) => ids.has(d.trip_id)),
      comps: store.list("trip_compartment_loads", (c) => ids.has(c.trip_id)),
      moves: store.list("empty_moves", (m) => m.driver_id === userId),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company, server, store, userId, state]);

  const rows = useMemo(() => {
    const when = (t: TripRow) => t.completed_at ?? t.started_at ?? "";
    // A driver's queued loads come first, in the order they will run; dispatch sees plain newest first.
    const queued = !company && userId ? dispatchedForDriver(bundle.trips, userId) : [];
    const queuedIds = new Set(queued.map((t) => t.trip_id));
    const rest = bundle.trips.filter((t) => !queuedIds.has(t.trip_id)).sort((a, b) => (when(b) || "9999").localeCompare(when(a) || "9999"));
    return [...queued, ...rest].map((t) => {
      const orders = bundle.orders.filter((o) => o.trip_id === t.trip_id);
      const primary = orders.find((o) => o.is_primary);
      const numbered = orders.filter((o) => o.order_number);
      // Origin to destination: where it loaded and where it went. Racks it couldn't load at and cancelled stops are left out.
      const picks = bundle.pickups.filter((k) => k.trip_id === t.trip_id && k.outcome !== "no_load").sort((a, b) => a.seq - b.seq);
      const drops = bundle.deliveries.filter((d) => d.trip_id === t.trip_id && d.status !== "cancelled").sort((a, b) => a.seq - b.seq);
      const from = picks.map((k) => [k.name, [k.city, k.state].filter(Boolean).join(", ")].filter(Boolean).join(" ")).filter(Boolean).join(" + ");
      const to = drops.map((d) => (d.location_id && locs[d.location_id]) || d.one_off_name || "").filter(Boolean).join(" + ");
      const route = [from, to].filter(Boolean).join(" → ");
      // What the trailer carried, comp by comp, for the tab down the card's right edge.
      const loadedBy: Record<number, string | null> = {};
      for (const c of bundle.comps) {
        if (c.trip_id !== t.trip_id || c.disposition === "cancelled" || !c.product_id) continue;
        loadedBy[c.comp_number] = c.product_id;
      }
      const mine = bundle.comps.filter((c) => c.trip_id === t.trip_id && c.disposition !== "cancelled");
      const aboard = mine.some((c) => c.disposition === "loaded");
      const delivered = mine.some((c) => c.disposition === "delivered");
      // The trailer's cargo condition: Cleaned or Residue at rest, Loading, Loaded, Unloading, Preloaded.
      const atDrop = drops.some((d) => d.arrived_at && !d.left_at);
      const atRack = bundle.pickups.some((k) => k.trip_id === t.trip_id && k.arrived_at && !k.left_at && !k.outcome);
      const trailerState: "Cleaned" | "Residue" | "Loading" | "Loaded" | "Unloading" | "Preloaded" | null =
        t.status === "parked" ? "Preloaded"
        : t.status === "complete" || t.status === "cancelled" ? (delivered ? "Residue" : null)
        : atDrop ? "Unloading" : atRack ? "Loading" : aboard ? "Loaded" : null;
      // Truck: where it is in the trip; Arrived whenever it is sitting at a stop.
      const truckLabel = t.status === "complete" || t.status === "cancelled" || t.status === "parked" || t.status === "dispatched" ? STATUS[t.status].label
        : atDrop || atRack ? "Arrived" : "Enroute";
      return { trip: t, loadedBy, trailerState, truckLabel, order: primary?.order_number ?? numbered[0]?.order_number ?? null, more: Math.max(0, numbered.length - 1), route };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle, locs, catalog.data, company, userId]);
  const hdr = useTrailerHeaderData([...rows.map((r) => r.trip.trailer_id), ...bundle.moves.map((m) => m.trailer_id)]);
  // A trailer with nothing in motion is Residue (it still holds its last product) or Cleaned (washed, nothing in it).
  const trailerStateFor = (ts: string | null, trailerId: string | null) =>
    (ts ?? (trailerId && Object.keys(hdr.residue[trailerId] ?? {}).length ? "Residue" : "Cleaned")) as "Cleaned" | "Residue" | "Loading" | "Loaded" | "Unloading" | "Preloaded";
  // The trailer as plan-style codes, highest compartment first: D2/--/D2.
  const codesFor = (trailerId: string | null, loadedBy: Record<number, string | null>): PlanLineComp[] => {
    // A compartment holding this trip's product shows its code. An empty one shows dashes in the color of the last
    // product it held (residue), and gray dashes only once the trailer is cleaned.
    const res = (trailerId && hdr.residue[trailerId]) || {};
    const nums = new Set<number>([...Object.keys(loadedBy).map(Number), ...((trailerId && hdr.sizes[trailerId]) || []).map((c) => c.comp)]);
    const info = (pid: string | null | undefined) => {
      const p = pid ? catalog.data.find((x) => x.product_id === pid) : null;
      const name = p ? (p.display_name ?? p.product_name) : null;
      return { p, name, color: p ? (p.hex_code?.trim() || productColorFor(name ?? "")) : null };
    };
    return [...nums].sort((x, y) => y - x).map((n) => {
      const here = info(loadedBy[n]);
      if (here.p) return { num: n, code: String(here.p.button_code ?? (here.name ?? "PRD").split(" ")[0]).trim().toUpperCase(), name: here.name, color: here.color };
      const last = info(res[n]);
      return last.p ? { num: n, code: "--", name: last.name, color: last.color } : { num: n, code: null, name: null, color: null };
    });
  };
  // An open trip shows its ETA when dispatch planned one; a finished one, when it ended.
  const endText = (t: TripRow) => {
    if (t.status === "complete" || t.status === "cancelled") return fmtDateTime(t.cancelled_at ?? t.completed_at ?? t.started_at);
    const eta = fmtDateTime(t.planned_end_at);
    return eta ? `ETA ${eta}` : (fmtDateTime(t.started_at) ? `Began ${fmtDateTime(t.started_at)}` : "Not started");
  };

  // Admin clean-up: cancel an open trip with a typed confirmation.
  const [killing, setKilling] = useState<{ tripId: string; label: string; status: string } | null>(null);
  const [killWord, setKillWord] = useState("");
  const [killNote, setKillNote] = useState("");
  const [killBusy, setKillBusy] = useState(false);
  const [killErr, setKillErr] = useState<string | null>(null);
  // Long-press (touch) or right-click opens the trip's options for an admin.
  const [optionsFor, setOptionsFor] = useState<{ tripId: string; label: string; status: string } | null>(null);
  const pressTimer = React.useRef<number | null>(null);
  const pressed = React.useRef(false);
  const startPress = (e: React.TouchEvent, info: { tripId: string; label: string; status: string }) => {
    pressed.current = false;
    if (pressTimer.current != null) window.clearTimeout(pressTimer.current);
    pressTimer.current = window.setTimeout(() => { pressed.current = true; setOptionsFor(info); }, 550);
    void e;
  };
  const endPress = () => { if (pressTimer.current != null) window.clearTimeout(pressTimer.current); pressTimer.current = null; };
  const closeKill = () => { setKilling(null); setKillWord(""); setKillNote(""); setKillErr(null); };
  const doKill = async () => {
    if (!killing || !userId) return;
    setKillBusy(true); setKillErr(null);
    const err = await forceCancelTrip(killing.tripId, userId, killNote);
    setKillBusy(false);
    if (err) { setKillErr(err); return; }
    setServer((b) => ({ ...b, trips: b.trips.map((t) => (t.trip_id === killing.tripId ? { ...t, status: "cancelled", cancelled_at: new Date().toISOString() } : t)), comps: b.comps.map((c) => (c.trip_id === killing.tripId && c.disposition !== "delivered" ? { ...c, disposition: "cancelled" } : c)) }));
    closeKill();
  };

  const hiddenCount = company ? 0 : rows.filter((r) => r.trip.driver_hidden).length;
  const orderNumbers = useMemo(() => [...new Set(bundle.orders.map((o) => o.order_number).filter(Boolean) as string[])].sort(), [bundle.orders]);
  const hasOrder = (tripId: string) => bundle.orders.some((o) => o.trip_id === tripId && o.order_number === orderNo);
  const visible = (showHidden || company ? rows : rows.filter((r) => !r.trip.driver_hidden)).filter((r) => !orderNo || hasOrder(r.trip.trip_id));
  const moveWho = (m: EmptyMoveRow) => [(driverName.get(m.driver_id) ?? "").split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 3).toUpperCase() || "Driver", m.truck_id ? truckName.get(m.truck_id) : null].filter(Boolean).join(" ");
  // Empty moves sit in the same list, by the time they ended (or started, while open).
  const moveWhen = (m: EmptyMoveRow) => m.ended_at ?? m.started_at;
  const tripWhen = (r: { trip: TripRow }) => r.trip.completed_at ?? r.trip.cancelled_at ?? r.trip.started_at ?? "";
  const feed = useMemo(() => {
    type Item = { t: "trip"; row: (typeof visible)[number]; at: string } | { t: "move"; m: EmptyMoveRow; at: string };
    const queued = visible.filter((r) => r.trip.status === "dispatched").map((row): Item => ({ t: "trip", row, at: "9999" }));
    const rest: Item[] = [
      ...visible.filter((r) => r.trip.status !== "dispatched").map((row): Item => ({ t: "trip", row, at: tripWhen(row) || "9999" })),
      ...(orderNo ? [] : bundle.moves.filter((m) => !(m.notes === "Cancelled" && m.end_miles == null)).map((m): Item => ({ t: "move", m, at: moveWhen(m) }))),
    ].sort((a, b) => b.at.localeCompare(a.at));
    return [...queued, ...rest];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, bundle.moves, orderNo]);
  const setHidden = (tripId: string, hidden: boolean) => {
    if (!store) return;
    setTripHidden(store, tripId, hidden);
    void syncNow();
  };

  // Moving a not-begun load swaps run order with its neighbour (the driver's own queue). Once begun it can't move.
  const queue = company ? [] : visible.filter((r) => r.trip.status === "dispatched").map((r) => r.trip);
  const moveQueued = (tripId: string, dir: -1 | 1) => {
    if (!store) return;
    const i = queue.findIndex((t) => t.trip_id === tripId);
    const other = queue[i + dir];
    if (i < 0 || !other) return;
    for (const pt of swapRunOrder(queue[i], other)) store.put("trips", pt);
    void syncNow();
  };

  const areas = useMemo(() => [...new Set(regionTrucks.map((t) => (t.local_area ?? "").trim()).filter(Boolean))].sort((x, y) => x.localeCompare(y)), [regionTrucks]);
  const memberOpts = roster.members.filter((m) => !region || region.driverIds.has(m.user_id)).map((m) => ({ value: m.user_id, label: m.display_name }));
  const filterBtn = (key: "order" | "area" | "driver" | "truck", label: string, value: string) => (
    <button key={key} type="button" onClick={() => setSheet(key)}
      style={{ ...(value ? chipOn : chip), padding: "10px 4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value || label}</button>
  );
  return (
    <div>
      {company && (
        <div style={{ marginBottom: 14 }}>
          {region && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 8 }}>Region: {region.label}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
            {filterBtn("order", "Order", orderNo)}
            {filterBtn("area", "Area", area)}
            {filterBtn("driver", "Driver", driverName.get(driverId) ?? "")}
            {filterBtn("truck", "Truck", truckId ? `Truck ${truckName.get(truckId) ?? ""}` : "")}
            {PERIODS.map((p) => <button key={p.id} type="button" onClick={() => setPeriod(p.id)} style={{ ...(period === p.id ? chipOn : chip), padding: "10px 4px" }}>{p.label}</button>)}
          </div>
          <PickSheet open={sheet === "order"} title="Order" allLabel="All orders" options={orderNumbers.map((n) => ({ value: n, label: n }))} value={orderNo} onPick={setOrderNo} onClose={() => setSheet(null)} />
          <PickSheet open={sheet === "area"} title="Area" allLabel="All areas" options={areas.map((a) => ({ value: a, label: a }))} value={area} onPick={(v) => { setArea(v); if (v) setTruckId(""); }} onClose={() => setSheet(null)} />
          <PickSheet open={sheet === "driver"} title="Driver" allLabel="All drivers" options={memberOpts} value={driverId} onPick={setDriverId} onClose={() => setSheet(null)} />
          <PickSheet open={sheet === "truck"} title="Truck" allLabel="All trucks" options={regionTrucks.map((t) => ({ value: t.truck_id, label: `Truck ${t.truck_name}` }))} value={truckId} onPick={(v) => { setTruckId(v); if (v) setArea(""); }} onClose={() => setSheet(null)} />
        </div>
      )}
      {company && canForceCancel && visible.length > 0 && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", margin: "-4px 0 10px" }}>Press and hold a trip (right-click on a computer) for options.</div>}
      {visible.length === 0 && (
        <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 15, textAlign: "center", marginTop: 40 }}>
          {loading ? "Loading…" : rows.length ? "Nothing to show." : company ? "No trips match." : "No trips yet. Start one from the Driver Dashboard."}
        </div>
      )}
      {feed.map((f) => {
        if (f.t === "move") return <MoveCard key={f.m.move_id} m={f.m} who={moveWho(f.m)} trailerParts={codesFor(f.m.trailer_id, {})} trailerWord={f.m.trailer_id ? trailerStateFor(null, f.m.trailer_id) : null} />;
        const { trip, order, more, route, loadedBy, trailerState: ts, truckLabel } = f.row;
        const s = { ...STATUS[trip.status], label: truckLabel };
        const cancelled = trip.status === "cancelled";
        const reasons = cancelled ? cancelReasonsText(trip.cancel_reasons) : "";
        const who = [(driverName.get(trip.driver_id) ?? "").split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 3).toUpperCase() || "Driver", trip.truck_id ? truckName.get(trip.truck_id) : null].filter(Boolean).join(" ");
        const canOpenOptions = company && canForceCancel && trip.status !== "complete" && trip.status !== "cancelled";
        const info = { tripId: trip.trip_id, label: order ? `Order ${order}` : ptdCode(trip.trip_id), status: s.label };
        return (
          <div key={trip.trip_id} role="button" tabIndex={0} aria-busy={nav.is(trip.trip_id)}
            {...(canOpenOptions ? {
              onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); setOptionsFor(info); },
              onTouchStart: (e: React.TouchEvent) => startPress(e, info),
              onTouchEnd: endPress, onTouchMove: endPress, onTouchCancel: endPress,
            } : {})}
            onClick={() => { if (pressed.current) { pressed.current = false; return; } open(trip.trip_id); }}
            onKeyDown={(e) => { if (e.key === "Enter") open(trip.trip_id); }}
            style={{ ...card, display: "flex", padding: 0, overflow: "hidden", opacity: trip.driver_hidden && !company ? 0.55 : 1, ...(canOpenOptions ? { WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" } : {}) }}>
            <div style={{ flex: 1, minWidth: 0, padding: 12 }}>
              {/* Line 1: who and truck, what the trailer carries and its state, then the truck's state. */}
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <span style={{ flexShrink: 0, fontSize: 14, fontWeight: 800 }}>{who}</span>
                <span style={{ minWidth: 0, flex: 1, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                  <PlanLine letter="" detail={false} comps={codesFor(trip.trailer_id, loadedBy)} />
                </span>
                <span style={{ flexShrink: 0, fontSize: 12, color: TRAILER_COLOR[trailerStateFor(ts, trip.trailer_id)] }}>{trailerStateFor(ts, trip.trailer_id)}</span>
                <span style={{ flexShrink: 0, fontSize: 13, fontWeight: 800, color: s.color }}>{s.label}</span>
              </div>
              {/* Line 2: order, terminal and city to customer and store; ETA or the end time at the right. */}
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 4 }}>
                <span style={{ minWidth: 0, flex: 1, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", fontSize: 13, color: "rgba(255,255,255,0.65)" }}>
                  <span style={{ fontWeight: 800, color: "#fff" }}>{order ?? ptdCode(trip.trip_id)}{more > 0 ? ` +${more}` : ""}</span>
                  {" · "}{route || [trip.shipper, trip.customer].filter(Boolean).join(" → ") || "—"}
                </span>
                <span className="dash-num" style={{ flexShrink: 0, fontSize: 12, color: "rgba(255,255,255,0.6)", whiteSpace: "nowrap" }}>
                  {endText(trip)}
                </span>
              </div>
              {reasons && <div style={{ fontSize: 13, color: "#f87171", marginTop: 2 }}>{reasons}</div>}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 2 }}>
                <span />
                {trip.status === "dispatched" && queue.length > 1 && (
                  <span onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginRight: 4 }}>Run order</span>
                    {([-1, 1] as const).map((dir) => {
                      const ok = !!queue[queue.findIndex((t) => t.trip_id === trip.trip_id) + dir];
                      return (
                        <button key={dir} type="button" aria-label={dir === -1 ? "Run earlier" : "Run later"} disabled={!ok}
                          onClick={() => moveQueued(trip.trip_id, dir)}
                          style={{ border: "1px solid rgba(255,255,255,0.2)", background: "transparent", color: ok ? "#fff" : "rgba(255,255,255,0.2)", borderRadius: 2, padding: "4px 10px", fontSize: 13, cursor: ok ? "pointer" : "default" }}>
                          {dir === -1 ? "▲" : "▼"}
                        </button>
                      );
                    })}
                  </span>
                )}
                {cancelled && !company && (
                  <button type="button"
                    onClick={(e) => { e.stopPropagation(); setHidden(trip.trip_id, !trip.driver_hidden); }}
                    style={{ border: "none", background: "transparent", color: "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: 700, cursor: "pointer", padding: "4px 0" }}>
                    {trip.driver_hidden ? "Unhide" : "Hide"}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
      <FullscreenModal open={!!optionsFor} title={optionsFor ? optionsFor.label : "Trip"} onClose={() => setOptionsFor(null)} footer={null}>
        {optionsFor && (
          <>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginBottom: 10 }}>{optionsFor.status}</div>
            <button type="button" onClick={() => { const t = optionsFor; setOptionsFor(null); open(t.tripId); }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "14px 14px", fontSize: 15, fontWeight: 700, color: "#fff", background: "#0f0f10", border: "1px solid rgba(255,255,255,0.12)", cursor: "pointer", marginBottom: 8 }}>Open PTD ›</button>
            <button type="button" onClick={() => { const t = optionsFor; setOptionsFor(null); setKilling(t); }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "14px 14px", fontSize: 15, fontWeight: 700, color: "#f87171", background: "#0f0f10", border: "1px solid rgba(248,113,113,0.4)", cursor: "pointer" }}>Cancel trip…</button>
          </>
        )}
      </FullscreenModal>
      <FullscreenModal open={!!killing} title="Cancel this trip?" onClose={closeKill} footer={null}>
        {killing && (
          <>
            <div style={{ fontSize: 16, fontWeight: 800 }}>{killing.label} · {killing.status}</div>
            <div style={{ fontSize: 14, color: "#fbbf24", marginTop: 10, lineHeight: 1.45 }}>
              This cancels the trip even if product is marked loaded, and releases the trailer. Use it for test or mistaken loads only. If real product is on the trailer, park or deliver it instead. It cannot be undone, and the driver is notified.
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.55)", margin: "14px 0 6px", textTransform: "uppercase", letterSpacing: "0.08em" }}>Note (optional)</div>
            <input value={killNote} onChange={(e) => setKillNote(e.target.value)} placeholder="Test load" style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", fontSize: 16, color: "#fff", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 2 }} />
            <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.55)", margin: "14px 0 6px", textTransform: "uppercase", letterSpacing: "0.08em" }}>Type CANCEL to confirm</div>
            <input value={killWord} onChange={(e) => setKillWord(e.target.value)} autoCapitalize="characters" autoComplete="off" style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", fontSize: 16, color: "#fff", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 2 }} />
            {killErr && <div style={{ color: "#f87171", fontSize: 13, marginTop: 10 }}>{killErr}</div>}
            <button type="button" disabled={killBusy || killWord.trim().toUpperCase() !== "CANCEL"} onClick={() => void doKill()}
              style={{ width: "100%", marginTop: 14, padding: "14px 0", fontSize: 14, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", background: killWord.trim().toUpperCase() === "CANCEL" ? "#ef4444" : "rgba(255,255,255,0.1)", color: "#fff", border: "none", borderRadius: 2, cursor: "pointer" }}>
              {killBusy ? "Cancelling…" : "Cancel trip"}
            </button>
            <button type="button" onClick={closeKill} style={{ width: "100%", marginTop: 10, padding: "14px 0", fontSize: 14, fontWeight: 800, background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 2, cursor: "pointer" }}>Keep the trip</button>
          </>
        )}
      </FullscreenModal>
      {company && rows.length >= 120 && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", textAlign: "center" }}>Showing the newest 120. Narrow the filters to see older ones.</div>}
      {hiddenCount > 0 && (
        <button type="button" onClick={() => setShowHidden((v) => !v)}
          style={{ display: "block", margin: "10px auto 0", border: "none", background: "transparent", color: "rgba(255,255,255,0.55)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          {showHidden ? "Hide hidden trips" : `Show hidden (${hiddenCount})`}
        </button>
      )}
    </div>
  );
}
