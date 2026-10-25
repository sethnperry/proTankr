import { fetchTruckShipments } from "@/lib/telematics/useTruckReading";
import { shipmentsForPickup, type GeoShipment } from "@/lib/telematics/shipmentMatch";
import { readGeoDeparture } from "@/lib/telematics/geoDepartures";
import { useCalculatorShell } from "../CalculatorShellContext";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLoadWorkflow } from "./useLoadWorkflow";
import { reportDelayIssue } from "./useTerminalOutageReports";
import { isTerminalIssueCode, issueChoiceValue } from "@/lib/trips/terminalIssues";
import { useTripStore } from "@/lib/trips/useTripStore";
import { newId as newTripId } from "@/lib/trips/tripStore";
import { useDriverSignature, useTripSettings } from "@/lib/trips/useTripData";
import { useSuppliers } from "@/lib/trips/useSuppliers";
import { bolConflicts } from "@/lib/trips/refCheck";
import { confirmLoaded, pickupNeedsOdometer, tripSnapshot, updateLoadedCompartments, type LoadedCompartmentEdit, type StepTimes } from "@/lib/trips/tripFlow";
import type { TripCompartmentLoadRow, TripPickupRow, TripRow } from "@/lib/trips/types";
import type { LoadingTripMode, TripLoadExtras } from "../modals/LoadingModal";
import { openTripForDriver } from "@/lib/trips/tripLogic";
import { useSupplierPicks } from "@/lib/suppliers/useSupplierPicks";
import { resolvePicks } from "@/lib/suppliers/picks";
import { markSuppliersLoaded } from "@/lib/suppliers/useTerminalSuppliers";

type Args = {
  shell: ReturnType<typeof useCalculatorShell>;
  active: boolean;
  effectiveUserId: string | null | undefined;
  loadWorkflow: ReturnType<typeof useLoadWorkflow>;
  tripStoreHook: ReturnType<typeof useTripStore>;
  supplierPicks: ReturnType<typeof useSupplierPicks>;
  plannedProductIds: Set<string>;
  compPlan: Record<number, any>;
  leaveTo: (href: string, label: string) => void;
};

export function useTripLoading(a: Args) {
  const { shell, active, effectiveUserId, loadWorkflow, tripStoreHook, supplierPicks, plannedProductIds, compPlan, leaveTo } = a;
  const { equipment } = shell;
  // ── Trip mode for the Loaded flow ─────────────────────────────────────────
  // When this load is attached to a trip pickup, Plan Review's Loaded steps
  // also take BOL, supplier and net per compartment, then times and the
  // loading driver's signature, and the report's next step is Arrived at
  // Delivery. No trip -> the Planner works exactly as before.
  const tripStoreObj = tripStoreHook.store;
  const { settings: tripSettings, reasons: tripReasons } = useTripSettings(shell.companyId || null);
  const tripSignature = useDriverSignature(effectiveUserId || null);
  const { suppliers: tripSuppliers, addSupplier: addTripSupplier } = useSuppliers(tripStoreObj, tripStoreHook.state, shell.companyId || null, effectiveUserId || null);
  const tripLoadId = loadWorkflow.reportLoadId ?? loadWorkflow.activeLoadId ?? null;
  const tripPickup = useMemo(() => {
    if (!tripLoadId) return null;
    const pickups = Object.values(tripStoreHook.state.rows.trip_pickups ?? {}) as TripPickupRow[];
    const pk = pickups.find((p) => p.load_id === tripLoadId);
    if (!pk) return null;
    const trip = (tripStoreHook.state.rows.trips ?? {})[pk.trip_id] as TripRow | undefined;
    if (!trip || trip.status === "complete" || trip.status === "cancelled") return null;
    return pk;
  }, [tripLoadId, tripStoreHook.state]);

  // The open trip's next pickup that isn't loaded or left yet. Loading can't
  // begin until the driver has arrived there.
  const tripWaitingPickup = useMemo<TripPickupRow | null>(() => {
    if (!effectiveUserId) return null;
    const trip = openTripForDriver(Object.values(tripStoreHook.state.rows.trips ?? {}) as TripRow[], effectiveUserId);
    if (!trip || (trip.status !== "draft" && trip.status !== "loading" && trip.status !== "in_transit")) return null;
    return (Object.values(tripStoreHook.state.rows.trip_pickups ?? {}) as TripPickupRow[])
      .filter((p) => p.trip_id === trip.trip_id && !p.load_id && !p.left_at)
      .sort((a, b) => a.seq - b.seq)[0] ?? null;
  }, [effectiveUserId, tripStoreHook.state]);
  const tripNeedsArrive = !!tripWaitingPickup && !tripWaitingPickup.arrived_at;
  // Before the driver has arrived, the rack isn't known; it's asked on Arrive.
  useEffect(() => {
    if (!active) return; // other screens (the dashboard) manage this themselves
    shell.setDeferRackPick(tripNeedsArrive);
    return () => shell.setDeferRackPick(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripNeedsArrive, active]);

  // Shipment numbers (BOLs) the driver entered in the telematics app on this truck since arriving. The
  // driver enters it before opening ProTankr, so it's asked for ONCE, when Finish Loading starts (never
  // polled), through a company-wide cache on the server. A slow or failed answer just means no suggestion.
  const [geoShips, setGeoShips] = useState<GeoShipment[]>([]);
  const geoPickupId = tripPickup?.pickup_id ?? null;
  const geoArrived = tripPickup?.arrived_at ?? null;
  const geoTruckId = useMemo(() => {
    const t = tripPickup ? (Object.values(tripStoreHook.state.rows.trips ?? {}) as TripRow[]).find((x) => x.trip_id === tripPickup.trip_id) : null;
    return t?.truck_id ?? shell.equipment.selectedCombo?.truck_id ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoPickupId, shell.equipment.selectedCombo?.truck_id]);
  useEffect(() => { setGeoShips([]); }, [geoPickupId]);
  const loadGeoShips = useCallback(() => {
    if (!geoPickupId || !geoArrived || !geoTruckId) return;
    void fetchTruckShipments(geoTruckId, new Date(Date.parse(geoArrived) - 3600000).toISOString()).then(setGeoShips);
  }, [geoPickupId, geoArrived, geoTruckId]);

  const tripModeForLoading = useMemo<LoadingTripMode | null>(() => {
    if (!tripPickup || !tripStoreObj || !shell.companyId) return null;
    const comps = (Object.values(tripStoreHook.state.rows.trip_compartment_loads ?? {}) as TripCompartmentLoadRow[])
      .filter((c) => c.pickup_id === tripPickup.pickup_id && c.disposition !== "cancelled");
    const compDefaults: LoadingTripMode["compDefaults"] = {};
    const compPicks = resolvePicks(supplierPicks.picks, [...plannedProductIds]);
    for (const c of comps) {
      const picked = !c.supplier && c.product_id ? compPicks.find((p) => p.product_id === c.product_id) : null;
      compDefaults[c.comp_number] = {
        bol: c.bol_number,
        supplier: c.supplier ?? picked?.name ?? null,
        supplierId: (c as any).supplier_id ?? picked?.supplier_id ?? null,
        net: c.net_gallons,
        netTouched: c.net_gallons != null && c.net_calculated_gallons != null && c.net_gallons !== c.net_calculated_gallons,
      };
    }
    // Compartments with no trip row yet still default to the rack's pick, so
    // Finish Loading doesn't ask for a supplier already chosen.
    for (const [k, v] of Object.entries(compPlan)) {
      const n = Number(k);
      if (compDefaults[n] || !v || v.empty || !v.productId) continue;
      const picked = compPicks.find((p) => p.product_id === String(v.productId));
      if (picked) compDefaults[n] = { bol: null, supplier: picked.name, supplierId: picked.supplier_id, net: null, netTouched: false };
    }
    const snap = tripSnapshot(tripStoreObj, tripPickup.trip_id);
    const allComps = Object.values(tripStoreHook.state.rows.trip_compartment_loads ?? {}) as TripCompartmentLoadRow[];
    const trips = Object.values(tripStoreHook.state.rows.trips ?? {}) as TripRow[];
    const mine = new Set(comps.map((c) => c.compartment_load_id));
    const usedElsewhere = allComps.filter((c) => !mine.has(c.compartment_load_id) && c.bol_number).map((c) => String(c.bol_number));
    const geotabBols = shipmentsForPickup(geoShips, { arrivedAt: tripPickup.arrived_at, leftAt: tripPickup.left_at }, Date.now(), usedElsewhere).map((s) => s.documentNumber);
    return {
      pickupName: null,
      geotabBols,
      settings: tripSettings,
      reasons: tripReasons.filter((r) => r.kind === "loading" && r.is_active),
      arrivedAt: tripPickup.arrived_at,
      departedAt: readGeoDeparture(tripPickup.pickup_id),
      beganAt: tripPickup.begin_at,
      existingTimes: tripPickup.left_at ? { arrivedAt: tripPickup.arrived_at, beginAt: tripPickup.begin_at, leftAt: tripPickup.left_at } as StepTimes : null,
      existingDelayReasonId: tripPickup.delay_code && isTerminalIssueCode(tripPickup.delay_code)
        ? issueChoiceValue(tripPickup.delay_code) : tripPickup.delay_reason_id,
      existingDelayNote: tripPickup.delay_note,
      needsOdometer: pickupNeedsOdometer(snap.pickups, tripPickup.pickup_id),
      existingOdometer: tripPickup.odometer,
      suppliers: tripSuppliers,
      onAddSupplier: addTripSupplier,
      checkBols: (values) => bolConflicts(trips, allComps, shell.companyId!, values, mine),
      signature: tripSignature.svg,
      onSaveSignature: tripSignature.save,
      compDefaults,
      onArrivedAtDelivery: () => {
        leaveTo("/planner/home?arrive=1", "Opening dashboard…");
        loadWorkflow.closeLoadReport();
      },
      onBackToDashboard: () => leaveTo("/planner/home", "Opening dashboard…"),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripPickup, tripStoreObj, tripStoreHook.state, shell.companyId, tripSettings, tripReasons, tripSuppliers, addTripSupplier, tripSignature.svg, tripSignature.save, supplierPicks.picks, plannedProductIds, compPlan, geoShips]);

  // Runs right after recordLoadCompleted wrote gross/temp/API for this load.
  const recordTripLoaded = useCallback((extras: TripLoadExtras | undefined, editOnly: boolean) => {
    if (!extras || !tripStoreObj || !tripPickup || !effectiveUserId || !shell.companyId) return;
    const pickup = (tripStoreObj.list("trip_pickups", (p) => p.pickup_id === tripPickup.pickup_id)[0]) ?? tripPickup;
    const comps = tripStoreObj.list("trip_compartment_loads", (c) => c.pickup_id === pickup.pickup_id && c.disposition !== "cancelled");
    if (editOnly) {
      updateLoadedCompartments(tripStoreObj, comps.map((c) => {
        const x = extras.byComp[c.comp_number];
        return {
          compartment_load_id: c.compartment_load_id,
          bol_number: x ? x.bol : c.bol_number,
          supplier: x ? x.supplier : c.supplier,
          supplier_id: x ? x.supplierId : ((c as any).supplier_id ?? null),
          net_gallons: x ? x.net : c.net_gallons,
        };
      }));
    } else if (extras.times) {
      const edits: LoadedCompartmentEdit[] = comps.map((c) => {
        const x = extras.byComp[c.comp_number];
        return {
          compartment_load_id: c.compartment_load_id,
          comp_number: c.comp_number,
          product_id: c.product_id,
          order_id: c.order_id,
          bol_number: x?.bol ?? c.bol_number,
          supplier: x?.supplier ?? c.supplier,
          supplier_id: x ? x.supplierId : ((c as any).supplier_id ?? null),
          gross_gallons: c.gross_gallons,
          net_gallons: x?.net ?? c.net_gallons,
          net_calculated_gallons: c.net_calculated_gallons,
          temp_f: c.temp_f,
          api: c.api,
        };
      });
      confirmLoaded(tripStoreObj, {
        userId: effectiveUserId,
        companyId: shell.companyId,
        trailerId: equipment.selectedCombo?.trailer_id ?? equipment.currentTrailerId ?? null,
        pickup,
        times: extras.times,
        delayReasonId: extras.delayReasonId ?? null,
        delayNote: extras.delayNote ?? null,
        odometer: extras.odometer ?? null,
        compartments: edits,
        signed: !!extras.signed,
        now: new Date(),
        newId: newTripId,
      });
      const bolSupplierIds = edits.map((c) => c.supplier_id).filter((x): x is string => !!x);
      if (bolSupplierIds.length && pickup.terminal_id) {
        void markSuppliersLoaded(shell.companyId, String(pickup.terminal_id), bolSupplierIds, effectiveUserId);
      }
      void reportDelayIssue({
        delayChoice: extras.delayReasonId ?? null,
        terminalId: pickup.terminal_id, rackId: pickup.rack_id,
        productIds: edits.map((c) => c.product_id).filter((x): x is string => !!x),
        companyId: shell.companyId, userId: effectiveUserId,
        truckLabel: equipment.truckNameById[equipment.selectedCombo?.truck_id ?? ""] ?? "",
      });
    }
    void tripStoreHook.syncNow();
    // Finished loading on a trip: back to the Driver Dashboard (the report
    // is a link on the trip card there).
    if (!editOnly && extras.times) {
      leaveTo("/planner/home", "Opening dashboard…");
      loadWorkflow.closeLoadReport();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripStoreObj, tripPickup, effectiveUserId, shell.companyId, equipment.selectedCombo, equipment.currentTrailerId]);


  return {
    tripStoreObj, tripSuppliers, addTripSupplier, loadGeoShips,
    tripPickup, tripWaitingPickup, tripNeedsArrive, tripModeForLoading, recordTripLoaded,
  };
}
