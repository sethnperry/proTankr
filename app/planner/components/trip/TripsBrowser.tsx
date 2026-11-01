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
import { TrailerHeader, useTrailerHeaderData } from "../TrailerViews";
import { useProductsCatalog } from "@/lib/queries/useProductsCatalog";
import { useCompanyRoster } from "@/app/planner/hooks/useCompanyRoster";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import type { TripCompartmentLoadRow, TripDeliveryRow, TripOrderRow, TripPickupRow, TripRow } from "@/lib/trips/types";
import { fmtDateTime } from "../../trips/PtdDocument";
import { usePending } from "@/lib/ui/pending";

const STATUS: Record<TripRow["status"], { label: string; color: string }> = {
  dispatched: { label: "Dispatched", color: "#93c5fd" },
  draft: { label: "Not loaded", color: "rgba(255,255,255,0.5)" },
  loading: { label: "Loading", color: "#fbbf24" },
  in_transit: { label: "In transit", color: "#60a5fa" },
  delivering: { label: "Delivering", color: "#60a5fa" },
  parked: { label: "Parked preloaded", color: "#93c5fd" },
  complete: { label: "Complete", color: "#4ade80" },
  cancelled: { label: "Cancelled", color: "rgba(255,255,255,0.35)" },
};

const card: React.CSSProperties = {
  display: "block", width: "100%", textAlign: "left", borderRadius: 2, border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.03)", padding: 12, marginBottom: 10, color: "#fff", cursor: "pointer",
};
const chip: React.CSSProperties = { padding: "8px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer", border: "1px solid rgba(255,255,255,0.14)", background: "#0a0a0b", color: "rgba(255,255,255,0.8)" };
const chipOn: React.CSSProperties = { ...chip, border: "1px solid #fff", background: "#fff", color: "#000" };

type Bundle = { trips: TripRow[]; orders: TripOrderRow[]; pickups: TripPickupRow[]; deliveries: TripDeliveryRow[]; comps: TripCompartmentLoadRow[] };
const EMPTY: Bundle = { trips: [], orders: [], pickups: [], deliveries: [], comps: [] };

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

/** One pick from a list, with search at the top. "" = no filter. */
function PickSheet({ open, title, allLabel, options, value, onPick, onClose }: {
  open: boolean; title: string; allLabel: string; options: { value: string; label: string }[]; value: string; onPick: (v: string) => void; onClose: () => void;
}) {
  const [q, setQ] = useState("");
  useEffect(() => { if (open) setQ(""); }, [open]);
  const shown = options.filter((o) => !q.trim() || o.label.toLowerCase().includes(q.trim().toLowerCase()));
  const row = (v: string, label: string) => (
    <button key={v || "all"} type="button" onClick={() => { onPick(v); onClose(); }}
      style={{ display: "flex", alignItems: "center", width: "100%", textAlign: "left", padding: "13px 14px 13px 0", border: "none", borderTop: "1px solid rgba(255,255,255,0.12)", background: "#0f0f10", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
      <span aria-hidden style={{ width: 4, alignSelf: "stretch", background: value === v ? "#fff" : "transparent", marginRight: 12 }} />
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
    </button>
  );
  return (
    <FullscreenModal open={open} title={title} onClose={onClose} footer={null}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" autoFocus
        style={{ width: "100%", boxSizing: "border-box", background: "#0a0a0b", border: "1px solid rgba(255,255,255,0.12)", color: "#fff", fontSize: 16, padding: "11px 12px", borderRadius: 0, outline: "none", marginBottom: 10 }} />
      <div style={{ background: "#0f0f10", border: "1px solid rgba(255,255,255,0.12)" }}>
        {!q.trim() && row("", allLabel)}
        {shown.length === 0 && <div style={{ padding: 14, fontSize: 14, color: "rgba(255,255,255,0.5)" }}>No matches.</div>}
        {shown.map((o) => row(o.value, o.label))}
      </div>
    </FullscreenModal>
  );
}

export function TripsBrowser({ mode, userId, companyId, onOpen, region = null }: {
  mode: "driver" | "company";
  /** The signed-in (or impersonated) user. Driver mode lists only this user's trips. */
  userId: string | null;
  companyId?: string | null;
  /** Open a trip's PTD. Defaults to the route; the caller can add a busy state. */
  onOpen?: (tripId: string) => void;
  /** The Dispatch board's Region filter, when one is on: only these drivers and trucks. */
  region?: { label: string; driverIds: Set<string>; truckOk: (truckId: string) => boolean } | null;
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
  const roster = useCompanyRoster(company ? companyId ?? null : null);
  const [driverId, setDriverId] = useState("");
  const [truckId, setTruckId] = useState("");
  const [area, setArea] = useState("");
  const [orderNo, setOrderNo] = useState("");
  const [sheet, setSheet] = useState<null | "order" | "area" | "driver" | "truck">(null);
  const [period, setPeriod] = useState("30");
  const [trucks, setTrucks] = useState<{ truck_id: string; truck_name: string; local_area: string | null }[]>([]);
  const [server, setServer] = useState<Bundle>(EMPTY);
  useEffect(() => {
    if (!company || !companyId) return;
    void supabase.from("trucks").select("truck_id, truck_name, local_area").eq("company_id", companyId).order("truck_name")
      .then((r) => setTrucks(((r.data ?? []) as { truck_id: string; truck_name: string; local_area?: string | null }[]).map((t) => ({ ...t, local_area: t.local_area ?? null }))));
  }, [company, companyId]);
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
        setServer({ ...EMPTY, trips });
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
      return { trip: t, loadedBy, order: primary?.order_number ?? numbered[0]?.order_number ?? null, more: Math.max(0, numbered.length - 1), route };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle, locs, catalog.data, company, userId]);
  const hdr = useTrailerHeaderData(rows.map((r) => r.trip.trailer_id));

  const hiddenCount = company ? 0 : rows.filter((r) => r.trip.driver_hidden).length;
  const orderNumbers = useMemo(() => [...new Set(bundle.orders.map((o) => o.order_number).filter(Boolean) as string[])].sort(), [bundle.orders]);
  const hasOrder = (tripId: string) => bundle.orders.some((o) => o.trip_id === tripId && o.order_number === orderNo);
  const visible = (showHidden || company ? rows : rows.filter((r) => !r.trip.driver_hidden)).filter((r) => !orderNo || hasOrder(r.trip.trip_id));
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
      {visible.length === 0 && (
        <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 15, textAlign: "center", marginTop: 40 }}>
          {loading ? "Loading…" : rows.length ? "Nothing to show." : company ? "No trips match." : "No trips yet. Start one from the Driver Dashboard."}
        </div>
      )}
      {visible.map(({ trip, order, more, route, loadedBy }) => {
        const s = STATUS[trip.status];
        const cancelled = trip.status === "cancelled";
        const reasons = cancelled ? cancelReasonsText(trip.cancel_reasons) : "";
        const who = company ? [(driverName.get(trip.driver_id) ?? "").split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 3).toUpperCase() || "Driver", trip.truck_id ? truckName.get(trip.truck_id) : null].filter(Boolean).join(" ") : "";
        return (
          <div key={trip.trip_id} role="button" tabIndex={0} aria-busy={nav.is(trip.trip_id)}
            onClick={() => open(trip.trip_id)}
            onKeyDown={(e) => { if (e.key === "Enter") open(trip.trip_id); }}
            style={{ ...card, display: "flex", padding: 0, overflow: "hidden", opacity: trip.driver_hidden && !company ? 0.55 : 1 }}>
            <div style={{ flex: 1, minWidth: 0, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div style={{ display: "flex", gap: 6, minWidth: 0, fontSize: 16, fontWeight: 800 }}>
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {order ? `Order ${order}` : ptdCode(trip.trip_id)}
                  </span>
                  {more > 0 && <span style={{ flexShrink: 0, color: "rgba(255,255,255,0.55)" }}>+{more}</span>}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: s.color, flexShrink: 0 }}>{s.label}</div>
              </div>

              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>
                {route || [trip.shipper, trip.customer].filter(Boolean).join(" → ") || "—"}
              </div>
              {reasons && <div style={{ fontSize: 13, color: "#f87171", marginTop: 2 }}>{reasons}</div>}
              {company && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", alignItems: "center", gap: 10, marginTop: 8 }}>
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 14, fontWeight: 700 }}>{who}</span>
                  <span style={{ minWidth: 0 }}><TrailerHeader variant="side" trailerId={trip.trailer_id} loaded={loadedBy} data={hdr} height={12} /></span>
                  <span className="dash-num" style={{ textAlign: "right", fontSize: 12, color: "rgba(255,255,255,0.6)", whiteSpace: "nowrap" }}>
                    {fmtDateTime(trip.cancelled_at ?? trip.completed_at ?? trip.started_at) || "Not started"}
                  </span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 2 }}>
                {!company && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
                  {fmtDateTime(trip.cancelled_at ?? trip.completed_at ?? trip.started_at) || "Not started"}
                </div>}
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
            {!company && <TrailerHeader variant="bird" trailerId={trip.trailer_id} loaded={loadedBy} data={hdr} />}
          </div>
        );
      })}
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
