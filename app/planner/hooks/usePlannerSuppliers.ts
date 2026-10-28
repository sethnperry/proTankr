"use client";
// app/planner/hooks/usePlannerSuppliers.ts
//
// The Planner's supplier wiring: the products the supplier card lists, the
// picks resolved against them, when the picker opens (once loading begins),
// carrying a trip's supplier to each rack, and logging a supplier switch.
// Lifted out of PlannerHost unchanged.

import { useCalculatorShell } from "../CalculatorShellContext";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { useLoadWorkflow } from "./useLoadWorkflow";
import { productColorFor } from "../utils/productColor";
import { useTripStore } from "@/lib/trips/useTripStore";
import { newId as newTripId } from "@/lib/trips/tripStore";
import type { TripPickupRow, TripRow } from "@/lib/trips/types";
import { openTripForDriver } from "@/lib/trips/tripLogic";
import type { PanelProduct, SupplierSwitchEvent } from "../components/supplier/SupplierPanel";
import { useSupplierPicks } from "@/lib/suppliers/useSupplierPicks";
import { resolvePicks, readPicks, groupPicks, type SupplierPick } from "@/lib/suppliers/picks";
import { getTripSupplier, setTripSupplier, tripSupplierPicks } from "@/lib/trips/tripSupplier";

type Args = {
  shell: ReturnType<typeof useCalculatorShell>;
  effectiveUserId: string | null | undefined;
  loadWorkflow: ReturnType<typeof useLoadWorkflow>;
  tripStoreHook: ReturnType<typeof useTripStore>;
  tripStoreObj: ReturnType<typeof useTripStore>["store"];
  tripPickup: TripPickupRow | null;
  tripWaitingPickup: TripPickupRow | null;
  supplierPicks: ReturnType<typeof useSupplierPicks>;
  resolvedSupplierPicksRef: MutableRefObject<{ product_id: string; supplier_id: string | null; name: string }[]>;
  plannedProductIds: Set<string>;
  productCodeById: Record<string, string>;
  productNameById: Map<string, string>;
  productHexCodeById: Record<string, string>;
};

export function usePlannerSuppliers(a: Args) {
  const {
    shell, effectiveUserId, loadWorkflow, tripStoreHook, tripStoreObj, tripPickup, tripWaitingPickup,
    supplierPicks, resolvedSupplierPicksRef, plannedProductIds, productCodeById, productNameById, productHexCodeById,
  } = a;
  const { location } = shell;
  const supplierPanelProducts = useMemo<PanelProduct[]>(() => [...plannedProductIds].map((pid) => ({
    id: pid,
    code: productCodeById[pid] || (productNameById.get(pid) ?? "Product"),
    color: productHexCodeById[pid] || productColorFor(productNameById.get(pid) ?? ""),
  })), [plannedProductIds, productCodeById, productNameById, productHexCodeById]);
  const resolvedSupplierPicks = useMemo(
    () => resolvePicks(supplierPicks.picks, supplierPanelProducts.map((p) => p.id)),
    [supplierPicks.picks, supplierPanelProducts],
  );
  resolvedSupplierPicksRef.current = resolvedSupplierPicks;
  const [supplierPromptToken, setSupplierPromptToken] = useState(0);
  const needsSupplierPick = supplierPicks.loaded && !supplierPicks.skipped && resolvedSupplierPicks.length === 0;
  // The supplier picked on Begin Trip is preset at every rack on the trip
  // (rack hops, a later visit). Reads storage directly so it never overwrites
  // a pick or a skip already saved for this terminal.
  const openTripIdForSupplier = useMemo(() => {
    if (!effectiveUserId) return null;
    const trip = openTripForDriver(Object.values(tripStoreHook.state.rows.trips ?? {}) as TripRow[], effectiveUserId);
    return trip && trip.status !== "complete" && trip.status !== "cancelled" ? trip.trip_id : null;
  }, [effectiveUserId, tripStoreHook.state]);
  // Which supplier is asked once loading begins (Plan Review), not while
  // planning: open the picker then if none is set yet. The token resets when
  // Plan Review closes so the next load asks fresh.
  useEffect(() => {
    if (!loadWorkflow.loadingOpen) { setSupplierPromptToken(0); return; }
    if (loadWorkflow.reportLines || !needsSupplierPick || !location.selectedTerminalId) return;
    setSupplierPromptToken((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadWorkflow.loadingOpen]);
  // Sourcing differs by terminal, so the trip's supplier belongs to the trip's first rack only.
  // Any other rack asks again.
  const tripFirstTerminal = useMemo(() => {
    if (!openTripIdForSupplier) return null;
    const pk = (Object.values(tripStoreHook.state.rows.trip_pickups ?? {}) as any[])
      .filter((p) => p.trip_id === openTripIdForSupplier)
      .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))[0];
    return pk?.terminal_id ? String(pk.terminal_id) : null;
  }, [openTripIdForSupplier, tripStoreHook.state]);
  // Changing terminals during Plan Review (a rack hop): ask for that terminal's sourcing.
  const lastTerminalRef = useRef<string | null>(null);
  useEffect(() => {
    const tid = location.selectedTerminalId ? String(location.selectedTerminalId) : null;
    const prev = lastTerminalRef.current;
    lastTerminalRef.current = tid;
    if (!prev || !tid || prev === tid) return;
    if (loadWorkflow.loadingOpen && !loadWorkflow.reportLines) setSupplierPromptToken((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.selectedTerminalId]);
  useEffect(() => {
    const tid = location.selectedTerminalId ? String(location.selectedTerminalId) : null;
    if (!openTripIdForSupplier || !tid || !effectiveUserId) return;
    if (tripFirstTerminal && tid !== tripFirstTerminal) return;
    if (readPicks(effectiveUserId, tid)) return;
    const ts = getTripSupplier(effectiveUserId, openTripIdForSupplier);
    if (ts) supplierPicks.setPicks(tripSupplierPicks(ts));
  }, [openTripIdForSupplier, location.selectedTerminalId, effectiveUserId, supplierPicks.picks, supplierPicks.setPicks]);
  // A change at the rack carries forward on the trip when it's one supplier.
  const onSupplierPicks = useCallback((next: SupplierPick[]) => {
    supplierPicks.setPicks(next);
    const groups = groupPicks(next);
    const here = location.selectedTerminalId ? String(location.selectedTerminalId) : null;
    if (openTripIdForSupplier && effectiveUserId && groups.length === 1 && (!tripFirstTerminal || here === tripFirstTerminal)) {
      setTripSupplier(effectiveUserId, openTripIdForSupplier, { supplier_id: groups[0].supplier_id, name: groups[0].name });
    }
  }, [supplierPicks.setPicks, openTripIdForSupplier, effectiveUserId, tripFirstTerminal, location.selectedTerminalId]);
  const onSupplierSwitched = useCallback((e: SupplierSwitchEvent) => {
    const pk = tripPickup ?? tripWaitingPickup;
    if (!pk || !tripStoreObj || !effectiveUserId) return;
    tripStoreObj.put("trip_events", {
      event_id: newTripId(), trip_id: pk.trip_id, event_type: "supplier_switch", occurred_at: new Date().toISOString(),
      actor_id: effectiveUserId, pickup_id: pk.pickup_id, delivery_id: null,
      payload: { from: e.from, to: e.to, reason: e.reason, note: e.note || null, product_ids: e.productIds },
    });
    void tripStoreHook.syncNow();
  }, [tripPickup, tripWaitingPickup, tripStoreObj, effectiveUserId, tripStoreHook]);

  return { supplierPanelProducts, resolvedSupplierPicks, supplierPromptToken, onSupplierPicks, onSupplierSwitched };
}
