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
// Phase 2 covers Start Load and handing the driver to the Planner. The load
// itself is still begun/cancelled in the Planner, which attaches it to this
// trip (useLoadWorkflow -> linkLoadToOpenTrip). Arrived/Loaded/Delivery steps
// come in later phases.

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useCalculatorShell } from "../CalculatorShellContext";
import { canReachDestination } from "@/lib/ui/driver/navDestinations";
import { useTripStore } from "@/lib/trips/useTripStore";
import { newId } from "@/lib/trips/tripStore";
import { useDeliveryLocations, useTripHydration, locationLabel } from "@/lib/trips/useTripHydration";
import {
  applyStartLoad,
  buildStartLoad,
  cancelTrip,
  lastShipperCustomer,
  nextStep,
  openTripForDriver,
  truckBeginMiles,
  tripChildren,
  type StartLoadDelivery,
} from "@/lib/trips/tripLogic";
import type { TripRow } from "@/lib/trips/types";
import { StartLoadSheet, type StartLoadValues } from "../components/StartLoadSheet";

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

export default function HomePage() {
  const shell = useCalculatorShell();
  const router = useRouter();
  const { equipment, location, terminals, expirations } = shell;
  const userId = shell.effectiveUserId || null;
  const truckId = equipment.selectedCombo?.truck_id ?? equipment.currentTruckId ?? null;
  const trailerId = equipment.selectedCombo?.trailer_id ?? null;

  // Same audience as the driver Planner. Waits for role/super-admin/solo to
  // resolve, same as the Cards and Dispatch gates.
  useEffect(() => {
    if (shell.role == null || !shell.isSuperAdminResolved || shell.isSolo === null) return;
    if (!canReachDestination("home", shell.role, shell.isSuperAdmin, shell.isSolo)) {
      router.replace("/planner/dispatch");
    }
  }, [shell.role, shell.isSuperAdmin, shell.isSuperAdminResolved, shell.isSolo, router]);

  const { state, store, syncNow, pendingCount, failed } = useTripStore(userId);
  useTripHydration(store, userId, truckId);
  const locations = useDeliveryLocations(shell.companyId, userId);

  const trips = useMemo(() => Object.values(state.rows.trips ?? {}) as TripRow[], [state]);
  const openTrip = userId ? openTripForDriver(trips, userId) : null;
  const children = useMemo(
    () => (store && openTrip ? tripChildren(store, openTrip.trip_id) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, openTrip?.trip_id, state],
  );
  const step = nextStep(openTrip, children?.pickup ?? null);

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

  // ── Start Load prefills ────────────────────────────────────────────────────
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editing = !!openTrip;

  const initialValues = useMemo<StartLoadValues>(() => {
    if (openTrip && children) {
      return {
        orderNumber: children.primaryOrder?.order_number ?? "",
        extraOrderNumbers: children.extraOrders.map((o) => o.order_number ?? ""),
        shipper: openTrip.shipper ?? "",
        customer: openTrip.customer ?? "",
        deliveries: children.deliveries.length
          ? children.deliveries.map((d) => ({ locationId: d.location_id, oneOffName: d.one_off_name, deliveryType: d.delivery_type }))
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
  }, [openTrip, children, trips, userId, truckId, store, locations]);

  const submit = (v: StartLoadValues) => {
    if (!store || !userId || !shell.companyId) {
      setError("Still signing you in. Try again in a moment.");
      return;
    }
    const miles = v.beginMiles.trim() === "" ? null : Number(v.beginMiles);
    setBusy(true);
    setError(null);
    try {
      const rows = buildStartLoad(
        {
          companyId: shell.companyId,
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

  const onBigButton = () => {
    if (step.kind === "start") {
      setError(null);
      setSheetOpen(true);
    } else if (step.kind === "planner") {
      router.push("/planner");
    }
  };

  const expired = expirations.expiredCount ?? 0;
  const warning = expirations.warningCount ?? 0;
  const canCards = canReachDestination("cards", shell.role, shell.isSuperAdmin, shell.isSolo ?? false);

  const deliveryText = (children?.deliveries ?? [])
    .map((d) => {
      const loc = d.location_id ? locations.find((l) => l.location_id === d.location_id) : null;
      return loc ? locationLabel(loc) : d.one_off_name ?? "Delivery";
    })
    .join(" · ");

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "12px 16px 40px", color: "#fff" }}>
      {/* Trip */}
      {openTrip ? (
        <div style={{ ...card, marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: muted, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Current trip · {STATUS_LABEL[openTrip.status]}
            </div>
            <button type="button" onClick={() => { setError(null); setSheetOpen(true); }}
              style={{ border: "none", background: "transparent", color: "rgba(255,255,255,0.75)", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0 }}>
              Edit
            </button>
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
          <div style={{ fontSize: 14, marginTop: 10 }}>
            <span style={{ color: muted }}>Pickup </span>{children?.pickup?.name ?? "Not set"}
          </div>
          <div style={{ fontSize: 14, marginTop: 4 }}>
            <span style={{ color: muted }}>Delivery </span>{deliveryText || "Not set"}
          </div>
          {openTrip.status === "draft" && (
            <div style={{ marginTop: 12 }}>
              {confirmCancel ? (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
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
                <button type="button" onClick={() => setConfirmCancel(true)}
                  style={{ border: "none", background: "transparent", color: muted, fontSize: 13, cursor: "pointer", padding: 0 }}>
                  Cancel trip
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div style={{ ...card, marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: muted, textTransform: "uppercase", letterSpacing: 0.5 }}>No trip in progress</div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.75)", marginTop: 6 }}>Start a load when you have an order.</div>
        </div>
      )}

      {/* Next step */}
      <button
        type="button"
        onClick={onBigButton}
        disabled={step.kind === "later"}
        style={{
          width: "100%", padding: "20px 0", borderRadius: 14, border: "none",
          background: step.kind === "later" ? "rgba(255,255,255,0.15)" : "#fff",
          color: step.kind === "later" ? "rgba(255,255,255,0.7)" : "#000",
          fontSize: 20, fontWeight: 800, cursor: step.kind === "later" ? "default" : "pointer",
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
