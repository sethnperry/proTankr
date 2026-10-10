"use client";
// app/planner/home/page.tsx
//
// Driver dashboard (trip workflow phase 2, docs/trip-workflow-design.md §9 and
// §14): where the driver's trip stands, one big button for the next step, and
// the everyday tools underneath.
//
// Everything about the trip is local-first: Start Load writes to the offline
// trip store (lib/trips) and syncs in the background, so a driver with no
// signal at the terminal still gets a working button.
//
// The big button walks the trip: Start Load → Arrived → (Planner) → Loaded →
// Arrived → Finish Delivery. The load itself is begun in the Planner, which
// attaches it to this trip (useLoadWorkflow -> linkLoadToOpenTrip).

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useCalculatorShell } from "../CalculatorShellContext";
import { canReachDestination } from "@/lib/ui/driver/navDestinations";
import { useTripStore } from "@/lib/trips/useTripStore";
import { newId } from "@/lib/trips/tripStore";
import { useTripHydration } from "@/lib/trips/useTripHydration";
import { rememberTanks, useDeliveryLocationList, useDriverSignature, useTripSettings } from "@/lib/trips/useTripData";
import { locationPlace, locationTitle, type LatLon } from "@/lib/trips/deliveryLocations";
import { useProductsCatalog } from "@/lib/queries/useProductsCatalog";
import { useTerminalsCatalog } from "@/lib/queries/useTerminalsCatalog";
import {
  applyStartLoad,
  buildStartLoad,
  cancelTrip,
  lastShipperCustomer,
  openTripForDriver,
  truckBeginMiles,
  tripChildren,
  type StartLoadDelivery,
} from "@/lib/trips/tripLogic";
import {
  activePickup,
  addPickup,
  arriveDelivery,
  arrivePickup,
  compartmentsForDelivery,
  confirmLoaded,
  finishDelivery,
  handoffCandidate,
  nextStep,
  onBoard,
  pickupNeedsOdometer,
  plannedDeliveries,
  rerouteDelivery,
  splitToNewDelivery,
  takeOverTrip,
  tripSnapshot,
  type DeliveryDestination,
} from "@/lib/trips/tripFlow";
import type { TripDeliveryRow, TripRow } from "@/lib/trips/types";
import { StartLoadSheet, type StartLoadValues } from "../components/StartLoadSheet";
import { LoadedSheet, type LoadedSubmit } from "../components/trip/LoadedSheet";
import { FinishDeliverySheet, type FinishDeliverySubmit } from "../components/trip/FinishDeliverySheet";
import { LocationPicker } from "../components/trip/LocationPicker";

const STATUS_LABEL: Record<TripRow["status"], string> = {
  draft: "Not loaded yet",
  loading: "Loading",
  in_transit: "In transit",
  delivering: "Delivering",
  complete: "Complete",
  cancelled: "Cancelled",
};

const card: React.CSSProperties = {
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.03)",
  padding: 14,
};
const muted = "rgba(255,255,255,0.5)";
const smallLink: React.CSSProperties = {
  border: "none", background: "transparent", color: "rgba(255,255,255,0.75)", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0,
};

type PickerMode =
  | { mode: "add" }
  | { mode: "split"; ids: string[]; from: string | null }
  | { mode: "reroute"; delivery: TripDeliveryRow };

export default function HomePage() {
  const shell = useCalculatorShell();
  const router = useRouter();
  const { equipment, location, terminals, expirations } = shell;
  const userId = shell.effectiveUserId || null;
  const companyId = shell.companyId || null;
  const truckId = equipment.selectedCombo?.truck_id ?? equipment.currentTruckId ?? null;
  const trailerId = equipment.selectedCombo?.trailer_id ?? equipment.currentTrailerId ?? null;

  // Same audience as the driver Planner. Waits for role/super-admin/solo to
  // resolve, same as the Cards and Dispatch gates.
  useEffect(() => {
    if (shell.role == null || !shell.isSuperAdminResolved || shell.isSolo === null) return;
    if (!canReachDestination("home", shell.role, shell.isSuperAdmin, shell.isSolo)) {
      router.replace("/planner/dispatch");
    }
  }, [shell.role, shell.isSuperAdmin, shell.isSuperAdminResolved, shell.isSolo, router]);

  const { state, store, syncNow, pendingCount, failed } = useTripStore(userId);
  useTripHydration(store, userId, truckId, trailerId);
  const { settings, reasons } = useTripSettings(companyId);
  const signature = useDriverSignature(userId);
  const locList = useDeliveryLocationList(companyId, userId);
  const locations = locList.locations;
  const { data: products } = useProductsCatalog();
  const { data: terminalCatalog } = useTerminalsCatalog();

  const productName = (id: string | null) => {
    if (!id) return "Product";
    const p = products.find((x) => x.product_id === id);
    return p ? String(p.display_name || p.product_name || "Product") : "Product";
  };
  const deliveryName = (d: TripDeliveryRow) => {
    const loc = d.location_id ? locations.find((l) => l.location_id === d.location_id) : null;
    return loc ? locationTitle(loc) : d.one_off_name ?? "Delivery";
  };

  const trips = useMemo(() => Object.values(state.rows.trips ?? {}) as TripRow[], [state]);
  const openTrip = userId ? openTripForDriver(trips, userId) : null;
  const children = useMemo(
    () => (store && openTrip ? tripChildren(store, openTrip.trip_id) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, openTrip?.trip_id, state],
  );
  const snap = useMemo(
    () => (store && openTrip ? tripSnapshot(store, openTrip.trip_id) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, openTrip?.trip_id, state],
  );
  const step = nextStep(openTrip, snap, deliveryName);
  const handoff = !openTrip && userId ? handoffCandidate(trips, trailerId, userId) : null;

  // ── Current terminal (the Planner's) ───────────────────────────────────────
  const terminalName = useMemo(() => {
    const id = String(location.selectedTerminalId || "");
    if (!id) return null;
    const t = terminals.terminals.find((x) => String(x.terminal_id) === id)
      ?? terminals.terminalCatalog.find((x) => String(x.terminal_id) === id);
    return t?.terminal_name ? String(t.terminal_name) : "Terminal";
  }, [location.selectedTerminalId, terminals.terminals, terminals.terminalCatalog]);
  const placeLabel = [location.selectedCity, location.selectedState].filter(Boolean).join(", ");
  const pickupLabel = terminalName ? `${terminalName}${placeLabel ? ` · ${placeLabel}` : ""}` : null;

  const equipmentLabel = equipment.equipmentLabel
    ?? (equipment.isBobtail ? `Truck ${equipment.currentTruckName ?? ""} (bobtail)`.trim() : "No equipment selected");

  // Near Me measures from the pickup terminal (§4).
  const origin = useMemo<LatLon | null>(() => {
    const p = snap ? activePickup(snap.pickups) ?? [...snap.pickups].reverse().find((x) => x.terminal_id) : null;
    const id = String(p?.terminal_id || location.selectedTerminalId || "");
    const t = id ? terminalCatalog.find((x) => String(x.terminal_id) === id) : null;
    return t && t.lat != null && t.lon != null ? { lat: Number(t.lat), lon: Number(t.lon) } : null;
  }, [snap, location.selectedTerminalId, terminalCatalog]);

  // ── Start Load prefills ────────────────────────────────────────────────────
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editing = !!openTrip;

  const initialValues = useMemo<StartLoadValues>(() => {
    if (openTrip && children && snap) {
      const planned = plannedDeliveries(snap.deliveries);
      return {
        orderNumber: children.primaryOrder?.order_number ?? "",
        extraOrderNumbers: children.extraOrders.map((o) => o.order_number ?? ""),
        shipper: openTrip.shipper ?? "",
        customer: openTrip.customer ?? "",
        deliveries: planned.length
          ? planned.map((d) => ({ locationId: d.location_id, oneOffName: d.one_off_name, deliveryType: d.delivery_type }))
          : [{ locationId: null, oneOffName: "", deliveryType: "drop" }],
        beginMiles: openTrip.begin_miles == null ? "" : String(openTrip.begin_miles),
      };
    }
    const prev = userId ? lastShipperCustomer(trips, userId) : { shipper: null, customer: null };
    const miles = truckBeginMiles(trips, truckId);
    return {
      orderNumber: "",
      extraOrderNumbers: [],
      shipper: prev.shipper ?? "",
      customer: prev.customer ?? "",
      deliveries: [defaultDelivery()],
      beginMiles: miles == null ? "" : String(miles),
    };

    // The delivery the driver used last (this phone's history), else their
    // first starred location, else a blank one-off.
    function defaultDelivery(): StartLoadDelivery {
      if (store && userId) {
        const mine = new Map(trips.filter((t) => t.driver_id === userId).map((t) => [t.trip_id, t]));
        const recent = store
          .list("trip_deliveries", (d) => mine.has(d.trip_id) && !!d.location_id && d.status !== "cancelled")
          .sort((a, b) => String(b.client_updated_at ?? "").localeCompare(String(a.client_updated_at ?? "")))[0];
        const loc = recent && locations.find((l) => l.location_id === recent.location_id);
        if (loc) return { locationId: loc.location_id, oneOffName: null, deliveryType: loc.delivery_type };
      }
      const star = locations.find((l) => l.starred);
      if (star) return { locationId: star.location_id, oneOffName: null, deliveryType: star.delivery_type };
      return { locationId: null, oneOffName: "", deliveryType: "drop" };
    }
  }, [openTrip, children, snap, trips, userId, truckId, store, locations]);

  const submit = (v: StartLoadValues) => {
    if (!store || !userId || !companyId) {
      setError("Still signing you in. Try again in a moment.");
      return;
    }
    const miles = v.beginMiles.trim() === "" ? null : Number(v.beginMiles);
    setBusy(true);
    setError(null);
    try {
      const rows = buildStartLoad(
        {
          companyId,
          userId,
          truckId,
          trailerId,
          orderNumber: v.orderNumber,
          extraOrderNumbers: v.extraOrderNumbers,
          shipper: v.shipper,
          customer: v.customer,
          pickup: {
            terminalId: location.selectedTerminalId || null,
            rackId: location.selectedRackId || null,
            name: terminalName,
            city: location.selectedCity || null,
            state: location.selectedState || null,
          },
          deliveries: v.deliveries,
          beginMiles: miles != null && Number.isFinite(miles) ? miles : null,
        },
        {
          now: new Date(),
          newId,
          existing: openTrip && children
            ? { trip: openTrip, orders: children.orders, pickups: children.pickups, deliveries: store.list("trip_deliveries", (d) => d.trip_id === openTrip.trip_id) }
            : null,
        },
      );
      applyStartLoad(store, rows);
      setSheetOpen(false);
      void syncNow();
    } catch (e: any) {
      setError(e?.message ?? "Couldn't save the load.");
    } finally {
      setBusy(false);
    }
  };

  const [confirmCancel, setConfirmCancel] = useState(false);
  const doCancelTrip = () => {
    if (!store || !userId || !openTrip) return;
    cancelTrip(store, openTrip, userId, { now: new Date(), newId });
    setConfirmCancel(false);
    void syncNow();
  };

  // ── Pickup / delivery steps ────────────────────────────────────────────────
  const [loadedOpen, setLoadedOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [picker, setPicker] = useState<PickerMode | null>(null);
  const [notice, setNotice] = useState<{ text: string; tripId: string | null } | null>(null);
  const clock = () => ({ now: new Date(), newId });

  const loadedPickup = step.kind === "loaded" ? step.pickup : null;
  const finishDeliveryRow = step.kind === "finish_delivery" ? step.delivery : null;

  const onLoadedSubmit = (v: LoadedSubmit) => {
    if (!store || !userId || !companyId || !loadedPickup) return;
    confirmLoaded(store, {
      userId, companyId, trailerId, pickup: loadedPickup, ...v, ...clock(),
    });
    setLoadedOpen(false);
    setNotice({ text: "Loaded. Drive safe.", tripId: null });
    void syncNow();
  };

  const onFinishSubmit = async (v: FinishDeliverySubmit) => {
    if (!store || !userId || !companyId || !finishDeliveryRow || !openTrip) return;
    const tripId = openTrip.trip_id;
    const { tripComplete } = finishDelivery(store, {
      userId, companyId, trailerId, delivery: finishDeliveryRow, ...v, ...clock(),
    });
    setFinishOpen(false);
    setNotice(tripComplete
      ? { text: "Trip complete.", tripId }
      : { text: "Delivery finished.", tripId: null });
    void syncNow();
    if (finishDeliveryRow.location_id) {
      const seen = v.tanks.map((t) => ({ tank_number: t.tank_number, product_id: t.product_id }));
      await rememberTanks(finishDeliveryRow.location_id, seen, locList.tanks);
      void locList.reload();
    }
  };

  const onPick = (to: DeliveryDestination) => {
    if (!store || !userId || !openTrip || !picker || !snap) return;
    if (picker.mode === "reroute") {
      rerouteDelivery(store, { userId, delivery: picker.delivery, to, ...clock() });
    } else {
      const ids = picker.mode === "split" ? picker.ids : onBoard(snap.compLoads).map((c) => c.compartment_load_id);
      splitToNewDelivery(store, {
        userId, tripId: openTrip.trip_id, compartmentLoadIds: ids, to,
        fromDeliveryId: picker.mode === "split" ? picker.from : null, ...clock(),
      });
    }
    setPicker(null);
    void syncNow();
  };

  const addAnotherPickup = () => {
    if (!store || !userId || !openTrip) return;
    addPickup(store, {
      userId, tripId: openTrip.trip_id,
      terminalId: location.selectedTerminalId || null,
      rackId: location.selectedRackId || null,
      name: terminalName,
      city: location.selectedCity || null,
      state: location.selectedState || null,
      ...clock(),
    });
    void syncNow();
  };

  const onBigButton = () => {
    setNotice(null);
    if (!store || !userId) return;
    switch (step.kind) {
      case "start":
        setError(null);
        setSheetOpen(true);
        break;
      case "planner":
        router.push("/planner");
        break;
      case "arrive_pickup":
        arrivePickup(store, { userId, pickup: step.pickup, ...clock() });
        void syncNow();
        break;
      case "loaded":
        setLoadedOpen(true);
        break;
      case "add_delivery":
        setPicker({ mode: "add" });
        break;
      case "arrive_delivery":
        arriveDelivery(store, { userId, delivery: step.delivery, ...clock() });
        void syncNow();
        break;
      case "finish_delivery":
        setFinishOpen(true);
        break;
    }
  };

  // ── Handoff (§10) ──────────────────────────────────────────────────────────
  const [handoffName, setHandoffName] = useState<string | null>(null);
  useEffect(() => {
    const id = handoff?.driver_id;
    if (!id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc("get_display_names_full", { p_user_ids: [id] });
      const row = ((data ?? []) as any[]).find((r) => r?.user_id === id);
      if (!cancelled) setHandoffName(row?.display_name ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [handoff?.driver_id]);
  const doTakeOver = () => {
    if (!store || !userId || !handoff) return;
    takeOverTrip(store, { userId, trip: handoff, truckId, ...clock() });
    void syncNow();
  };

  const expired = expirations.expiredCount ?? 0;
  const warning = expirations.warningCount ?? 0;
  const canCards = canReachDestination("cards", shell.role, shell.isSuperAdmin, shell.isSolo ?? false);

  const pickups = snap?.pickups ?? [];
  const liveDeliveries = (snap?.deliveries ?? []).filter((d) => d.status !== "cancelled");
  const anyDelivered = liveDeliveries.some((d) => d.status === "complete");
  const canAddPickup = !!openTrip && openTrip.status !== "draft" && !!snap && !activePickup(snap.pickups) && !anyDelivered;
  const plannedCount = snap ? plannedDeliveries(snap.deliveries).length : 0;

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "12px 16px 40px", color: "#fff" }}>
      <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -0.02, marginBottom: 12 }}>Driver Dashboard</div>

      {/* Handoff */}
      {handoff && (
        <div style={{ ...card, marginBottom: 14, borderColor: "rgba(251,191,36,0.5)" }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>
            {handoffName ?? "Another driver"} has an open trip on this trailer.
          </div>
          <div style={{ fontSize: 13, color: muted, marginTop: 4 }}>
            Take it over to finish the deliveries.
          </div>
          <button type="button" onClick={doTakeOver}
            style={{ marginTop: 10, borderRadius: 10, border: "none", background: "#fbbf24", color: "#000", padding: "10px 14px", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
            Take Over Trip
          </button>
        </div>
      )}

      {/* Trip */}
      {openTrip ? (
        <div style={{ ...card, marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: muted, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Current trip · {STATUS_LABEL[openTrip.status]}
            </div>
            <button type="button" onClick={() => { setError(null); setSheetOpen(true); }} style={smallLink}>Edit</button>
          </div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>
            {children?.primaryOrder?.order_number ? `Order ${children.primaryOrder.order_number}` : "No order number"}
            {children && children.extraOrders.length > 0 && (
              <span style={{ fontSize: 13, fontWeight: 600, color: muted }}> +{children.extraOrders.length} more</span>
            )}
          </div>
          {(openTrip.shipper || openTrip.customer) && (
            <div style={{ fontSize: 13, color: muted, marginTop: 2 }}>
              {[openTrip.shipper, openTrip.customer].filter(Boolean).join(" → ")}
            </div>
          )}

          {pickups.map((p, i) => (
            <div key={p.pickup_id} style={{ fontSize: 14, marginTop: i === 0 ? 10 : 4, display: "flex", gap: 6 }}>
              <span style={{ color: muted, width: 66, flexShrink: 0 }}>{pickups.length > 1 ? `Pickup ${i + 1}` : "Pickup"}</span>
              <span style={{ flex: 1, minWidth: 0 }}>{p.name ?? "Not set"}</span>
              <span style={{ color: muted, fontSize: 12 }}>{p.left_at ? "Loaded" : p.arrived_at ? "Arrived" : ""}</span>
            </div>
          ))}
          {liveDeliveries.length === 0 && (
            <div style={{ fontSize: 14, marginTop: 4 }}><span style={{ color: muted }}>Delivery </span>Not set</div>
          )}
          {liveDeliveries.map((d, i) => (
            <div key={d.delivery_id} style={{ fontSize: 14, marginTop: 4, display: "flex", gap: 6, alignItems: "baseline" }}>
              <span style={{ color: muted, width: 66, flexShrink: 0 }}>{liveDeliveries.length > 1 ? `Delivery ${i + 1}` : "Delivery"}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                {deliveryName(d)}
                {d.location_id && (() => {
                  const loc = locations.find((l) => l.location_id === d.location_id);
                  const place = loc ? locationPlace(loc) : "";
                  return place ? <span style={{ color: muted, fontSize: 12 }}> · {place}</span> : null;
                })()}
              </span>
              {d.status === "complete" ? (
                <span style={{ color: muted, fontSize: 12 }}>Done</span>
              ) : (
                <button type="button" onClick={() => setPicker({ mode: "reroute", delivery: d })} style={{ ...smallLink, fontSize: 12 }}>
                  Change
                </button>
              )}
            </div>
          ))}

          <div style={{ display: "flex", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
            {canAddPickup && (
              <button type="button" onClick={addAnotherPickup} style={{ ...smallLink, color: muted }}>
                + Another pickup{terminalName ? ` (${terminalName})` : ""}
              </button>
            )}
            {openTrip.status === "draft" && (
              confirmCancel ? (
                <div style={{ display: "flex", gap: 8, alignItems: "center", flex: 1 }}>
                  <span style={{ fontSize: 13, color: "#f87171", flex: 1 }}>Cancel this trip?</span>
                  <button type="button" onClick={doCancelTrip}
                    style={{ borderRadius: 8, border: "1px solid #f87171", background: "transparent", color: "#f87171", padding: "6px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                    Cancel Trip
                  </button>
                  <button type="button" onClick={() => setConfirmCancel(false)}
                    style={{ borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "transparent", color: "#fff", padding: "6px 12px", fontSize: 13, cursor: "pointer" }}>
                    Keep
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmCancel(true)} style={{ ...smallLink, color: muted }}>
                  Cancel trip
                </button>
              )
            )}
            <button type="button" onClick={() => router.push(`/planner/trips/${openTrip.trip_id}`)} style={{ ...smallLink, color: muted }}>
              PTD ›
            </button>
          </div>
        </div>
      ) : (
        <div style={{ ...card, marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: muted, textTransform: "uppercase", letterSpacing: 0.5 }}>No trip in progress</div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.75)", marginTop: 6 }}>Start a load when you have an order.</div>
        </div>
      )}

      {notice && (
        <div style={{ ...card, marginBottom: 14, borderColor: "rgba(74,222,128,0.5)", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 700 }}>{notice.text}</span>
          {notice.tripId && (
            <button type="button" onClick={() => router.push(`/planner/trips/${notice.tripId}`)} style={smallLink}>View PTD ›</button>
          )}
          <button type="button" onClick={() => setNotice(null)} style={{ ...smallLink, color: muted }}>✕</button>
        </div>
      )}

      {/* Next step */}
      <button
        type="button"
        onClick={onBigButton}
        style={{
          width: "100%", padding: "20px 0", borderRadius: 14, border: "none",
          background: "#fff", color: "#000", fontSize: 20, fontWeight: 800, cursor: "pointer",
        }}
      >
        {step.label}
      </button>
      {step.kind !== "start" && (
        <div style={{ textAlign: "center", fontSize: 13, color: muted, marginTop: 6 }}>{step.detail}</div>
      )}

      {/* Info */}
      <div style={{ ...card, marginTop: 16, padding: 0 }}>
        <InfoRow label="Equipment" value={equipmentLabel} onClick={() => shell.setEquipOpen(true)} />
        <InfoRow label="Terminal" value={pickupLabel ?? "Select a terminal"}
          onClick={() => (location.selectedCity ? shell.setTermOpen(true) : shell.setLocOpen(true))} />
        <InfoRow
          label="Expirations"
          value={expired > 0 ? `${expired} expired` : warning > 0 ? `${warning} expiring soon` : "All current"}
          valueColor={expired > 0 ? "#f87171" : warning > 0 ? "#fbbf24" : undefined}
          onClick={() => shell.setExpModalOpen(true)}
          last={!(pendingCount > 0 || failed.length > 0)}
        />
        {(pendingCount > 0 || failed.length > 0) && (
          <InfoRow
            label="Sync"
            value={failed.length > 0 ? `${failed.length} change${failed.length === 1 ? "" : "s"} couldn't save` : `${pendingCount} waiting for signal`}
            valueColor={failed.length > 0 ? "#f87171" : muted}
            onClick={() => void syncNow()}
            last
          />
        )}
      </div>

      {/* Tools */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16 }}>
        <Tile label="Planner" onClick={() => router.push("/planner")} />
        <Tile label="Equipment" onClick={() => shell.setEquipOpen(true)} />
        <Tile label="Trips & PTDs" onClick={() => router.push("/planner/trips")} />
        <Tile label="Delivery Locations" onClick={() => router.push("/planner/locations")} />
        {canCards && <Tile label="Cards" onClick={() => router.push("/planner/cards")} />}
        <Tile label="Reports" onClick={() => router.push("/planner/reports")} />
      </div>

      <StartLoadSheet
        open={sheetOpen}
        editing={editing}
        initial={initialValues}
        pickupLabel={editing && children?.pickup?.load_id ? children.pickup.name ?? pickupLabel : pickupLabel}
        onChangePickup={() => (location.selectedCity ? shell.setTermOpen(true) : shell.setLocOpen(true))}
        planLabel="Set in the Planner when you load"
        equipmentLabel={equipmentLabel}
        locations={locations}
        busy={busy}
        error={error}
        onClose={() => setSheetOpen(false)}
        onSubmit={submit}
      />

      {loadedPickup && snap && (
        <LoadedSheet
          open={loadedOpen}
          pickup={loadedPickup}
          compLoads={snap.compLoads.filter((c) => c.pickup_id === loadedPickup.pickup_id && c.disposition !== "cancelled")}
          orders={children?.orders ?? []}
          settings={settings}
          reasons={reasons.filter((r) => r.kind === "loading" && r.is_active)}
          needsOdometer={pickupNeedsOdometer(snap.pickups, loadedPickup.pickup_id)}
          productName={productName}
          signature={signature.svg}
          onSaveSignature={signature.save}
          onSubmit={onLoadedSubmit}
          onClose={() => setLoadedOpen(false)}
        />
      )}

      {finishDeliveryRow && snap && store && (
        <FinishDeliverySheet
          open={finishOpen}
          title={`Finish · ${deliveryName(finishDeliveryRow)}`}
          delivery={finishDeliveryRow}
          compartments={compartmentsForDelivery(snap.compLoads, snap.deliveries, finishDeliveryRow.delivery_id)}
          savedTanks={store.list("trip_delivery_tanks", (t) => t.delivery_id === finishDeliveryRow.delivery_id)}
          locationTanks={finishDeliveryRow.location_id ? locList.tanks.filter((t) => t.location_id === finishDeliveryRow.location_id) : []}
          settings={settings}
          reasons={reasons.filter((r) => r.kind === "delivery" && r.is_active)}
          isLast={plannedCount <= 1}
          beginMiles={openTrip?.begin_miles ?? null}
          productName={productName}
          signature={signature.svg}
          onSaveSignature={signature.save}
          onSplit={(ids) => setPicker({ mode: "split", ids, from: finishDeliveryRow.delivery_id })}
          onSubmit={(v) => void onFinishSubmit(v)}
          onClose={() => setFinishOpen(false)}
        />
      )}

      <LocationPicker
        open={!!picker}
        title={picker?.mode === "reroute" ? "Change delivery" : picker?.mode === "split" ? "Send to another delivery" : "Add delivery"}
        origin={origin}
        locations={locations}
        onToggleStar={(id, star) => void locList.toggleStar(id, star).catch(() => {})}
        onPick={onPick}
        onClose={() => setPicker(null)}
        onManage={() => { setPicker(null); router.push("/planner/locations"); }}
      />
    </div>
  );
}

function InfoRow({ label, value, valueColor, onClick, last }: {
  label: string; value: string; valueColor?: string; onClick: () => void; last?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "13px 14px",
        border: "none", borderBottom: last ? "none" : "1px solid rgba(255,255,255,0.06)",
        background: "transparent", color: "#fff", cursor: "pointer", textAlign: "left",
      }}
    >
      <span style={{ fontSize: 13, color: muted, width: 92, flexShrink: 0 }}>{label}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: valueColor ?? "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {value}
      </span>
      <span style={{ color: "rgba(255,255,255,0.35)" }}>›</span>
    </button>
  );
}

function Tile({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ ...card, color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", textAlign: "left", padding: "18px 14px" }}
    >
      {label}
    </button>
  );
}
