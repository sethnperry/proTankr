"use client";
// app/planner/hooks/useTripEquipment.ts
//
// Mid-trip equipment changes, shared by the Driver Dashboard and the Planner.
// - Tapping Equipment while product is on board (or a load is in progress)
//   warns first: the load stays with the trailer.
// - A loaded trailer now behind a different truck opens the truck-change
//   window: records the swap on the trip and shows the gross with the new
//   truck's tare (lib/trips/truckChange.ts).
// Render <TripEquipmentSheets {...sheets} /> (components/trip) once on the page.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useCalculatorShell } from "../CalculatorShellContext";
import { useProductsCatalog } from "@/lib/queries/useProductsCatalog";
import { newId } from "@/lib/trips/tripStore";
import type { useTripStore } from "@/lib/trips/useTripStore";
import { openTripForDriver } from "@/lib/trips/tripLogic";
import { onBoard, tripSnapshot } from "@/lib/trips/tripFlow";
import { grossWithTare, needsTruckChange, productLbsOnBoard, recordTruckChange } from "@/lib/trips/truckChange";
import type { TripRow } from "@/lib/trips/types";
import type { TruckChangeView } from "../components/trip/TruckChangeSheet";
import type { TripEquipmentSheetsProps } from "../components/trip/TripEquipmentSheets";

type StoreHook = Pick<ReturnType<typeof useTripStore>, "state" | "store" | "syncNow">;

export function useTripEquipment(storeHook: StoreHook, userId: string | null) {
  const shell = useCalculatorShell();
  const { equipment } = shell;
  const { data: products } = useProductsCatalog();
  const { state, store, syncNow } = storeHook;

  const truckId = equipment.selectedCombo?.truck_id ?? equipment.currentTruckId ?? null;
  const trailerId = equipment.selectedCombo?.trailer_id ?? equipment.currentTrailerId ?? null;

  const openTrip = useMemo(
    () => (userId ? openTripForDriver(Object.values(state.rows.trips ?? {}) as TripRow[], userId) : null),
    [state, userId],
  );
  const snap = useMemo(
    () => (store && openTrip ? tripSnapshot(store, openTrip.trip_id) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, openTrip?.trip_id, state],
  );

  const tripLoaded = !!snap && onBoard(snap.compLoads).length > 0;
  const tripHasLoad = !!openTrip && !!snap && (tripLoaded || snap.pickups.some((p) => !!p.load_id && !p.left_at));

  const unitName = (id: string | null | undefined, byId: Record<string, string> | undefined, curId: string | null, curName: string | null) =>
    id ? byId?.[id] ?? (id === curId ? curName : null) ?? null : null;
  const tripTrailerName = unitName(openTrip?.trailer_id ?? trailerId, equipment.trailerNameById, equipment.currentTrailerId, equipment.currentTrailerName);
  const tripTruckName = unitName(openTrip?.truck_id ?? truckId, equipment.truckNameById, equipment.currentTruckId, equipment.currentTruckName);

  // ── Warning before the picker ──────────────────────────────────────────────
  const [equipWarnOpen, setEquipWarnOpen] = useState(false);
  // No warning step: tapping Equipment opens the picker straight away.
  const openEquipment = () => shell.setEquipOpen(true);

  // ── Truck change ───────────────────────────────────────────────────────────
  const onBoardWeight = useMemo(() => {
    if (!snap) return null;
    const alpha = (id: string | null) => {
      const p = id ? products.find((x) => x.product_id === id) : null;
      return p?.alpha_per_f != null ? Number(p.alpha_per_f) : null;
    };
    return productLbsOnBoard(snap.compLoads, alpha);
  }, [snap, products]);
  const currentCombo = equipment.selectedCombo;
  const currentTarget = currentCombo?.target_weight != null ? Number(currentCombo.target_weight) : null;
  const currentGross = tripLoaded && onBoardWeight ? grossWithTare(currentCombo?.tare_lbs, onBoardWeight.lbs) : null;
  const truckChanged = needsTruckChange(openTrip, truckId, trailerId, tripLoaded);

  // The old truck's tare with this trailer; its combo is usually decoupled by
  // now, so it's read directly.
  const [oldTare, setOldTare] = useState<number | null>(null);
  useEffect(() => {
    setOldTare(null);
    const from = openTrip?.truck_id, trailer = openTrip?.trailer_id;
    if (!truckChanged || !from || !trailer) return;
    let alive = true;
    void supabase.from("equipment_combos").select("tare_lbs")
      .eq("truck_id", from).eq("trailer_id", trailer)
      .order("claimed_at", { ascending: false, nullsFirst: false }).limit(1)
      .then(({ data }) => { if (alive) setOldTare(data?.[0]?.tare_lbs != null ? Number(data[0].tare_lbs) : null); });
    return () => { alive = false; };
  }, [truckChanged, openTrip?.truck_id, openTrip?.trailer_id]);

  const [truckSheetDismissed, setTruckSheetDismissed] = useState<string | null>(null);
  const [truckBusy, setTruckBusy] = useState(false);
  const truckKey = truckChanged ? `${openTrip?.trip_id}:${truckId}` : null;
  const truckSheetOpen = !!truckKey && truckSheetDismissed !== truckKey && !shell.equipOpen;
  const truckView: TruckChangeView | null = truckChanged && onBoardWeight ? {
    fromName: tripTruckName,
    toName: truckId ? equipment.truckNameById?.[truckId] ?? equipment.currentTruckName ?? null : null,
    trailerName: tripTrailerName,
    productLbs: onBoardWeight.lbs,
    missing: onBoardWeight.missing,
    fromTare: oldTare,
    toTare: currentCombo?.tare_lbs != null ? Number(currentCombo.tare_lbs) : null,
    target: currentTarget,
    grossBefore: grossWithTare(oldTare, onBoardWeight.lbs),
    grossAfter: currentGross,
  } : null;
  const recordChange = (fromOdo: number | null, toOdo: number | null) => {
    if (!store || !userId || !openTrip || !truckId || !truckView) return;
    setTruckBusy(true);
    recordTruckChange(store, {
      trip: openTrip, actorId: userId, now: new Date(), newId,
      payload: {
        from_truck_id: openTrip.truck_id, to_truck_id: truckId,
        from_truck_name: truckView.fromName, to_truck_name: truckView.toName,
        trailer_id: openTrip.trailer_id,
        from_odometer: fromOdo, to_odometer: toOdo,
        from_tare_lbs: truckView.fromTare, to_tare_lbs: truckView.toTare,
        product_lbs: Math.round(truckView.productLbs),
        gross_before_lbs: truckView.grossBefore, gross_after_lbs: truckView.grossAfter,
      },
    });
    setTruckBusy(false);
    void syncNow();
  };

  const sheets: TripEquipmentSheetsProps = {
    warnOpen: equipWarnOpen,
    trailerName: tripTrailerName,
    truckName: tripTruckName,
    loaded: tripLoaded,
    onWarnContinue: () => { setEquipWarnOpen(false); shell.setEquipOpen(true); },
    onWarnClose: () => setEquipWarnOpen(false),
    truckOpen: truckSheetOpen,
    truckView,
    truckBusy,
    onRecord: recordChange,
    onTruckClose: () => setTruckSheetDismissed(truckKey),
  };

  return {
    tripLoaded,
    tripHasLoad,
    truckChanged,
    currentGross,
    currentTarget,
    openEquipment,
    reopenTruckChange: () => setTruckSheetDismissed(null),
    sheets,
  };
}
