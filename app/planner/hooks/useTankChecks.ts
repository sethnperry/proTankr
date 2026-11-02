"use client";
// app/planner/hooks/useTankChecks.ts
//
// Writes meter tickets through the offline store: a standalone tank check (store, readings, optional ticket
// photo) and the ticket photo for a drop. Rules are in lib/tankchecks/tankChecks.ts.

import { useCallback } from "react";
import type { TripStore } from "@/lib/trips/tripStore";
import { toNumber, type CheckEntry } from "@/lib/tankchecks/tankChecks";

export function useTankChecks(o: { store: TripStore | null; syncNow: () => unknown; userId: string | null; companyId: string | null }) {
  const { store, syncNow, userId, companyId } = o;

  const saveCheck = useCallback((a: { locationId: string | null; locationName: string; truckId: string | null; entries: CheckEntry[]; productOf: (tank: string) => string | null; paths: string[]; note?: string | null }) => {
    if (!store || !userId || !companyId) return false;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    store.put("tank_checks", { check_id: id, company_id: companyId, user_id: userId, location_id: a.locationId, location_name: a.locationName, truck_id: a.truckId, delivery_id: null, read_at: now, photo_paths: a.paths, note: a.note?.trim() || null, source: "app" });
    for (const e of a.entries) {
      const n = toNumber(e.value);
      if (n == null) continue;
      store.put("tank_check_readings", { check_id: id, tank_number: e.tank.trim(), product_id: a.productOf(e.tank), reading: n, reading_unit: e.unit, water_inches: toNumber(e.water) });
    }
    void syncNow();
    return true;
  }, [store, syncNow, userId, companyId]);

  const saveTicket = useCallback((a: { deliveryId: string; locationId: string | null; locationName: string | null; truckId: string | null; paths: string[] }) => {
    if (!store || !userId || !companyId || a.paths.length === 0) return;
    store.put("tank_checks", { check_id: crypto.randomUUID(), company_id: companyId, user_id: userId, location_id: a.locationId, location_name: a.locationName, truck_id: a.truckId, delivery_id: a.deliveryId, read_at: new Date().toISOString(), photo_paths: a.paths, note: null, source: "app" });
    void syncNow();
  }, [store, syncNow, userId, companyId]);

  return { saveCheck, saveTicket };
}
