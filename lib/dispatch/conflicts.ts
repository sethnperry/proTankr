// lib/dispatch/conflicts.ts
//
// Dispatch Dashboard, LIVE mode. A conflict is an active terminal report
// at a rack where company trucks are still headed (pickup not yet left).
// Pure: takes the fleet's live trips, the active reports at those
// terminals, and which products each truck is going for. Returns one
// conflict per terminal, worst first.

import { activePickup } from "../trips/tripFlow.ts";
import type { TripPickupRow, TripRow } from "../trips/types.ts";

export type ReportType = "out_of_product" | "out_of_allocation" | "long_line" | "terminal_issue";

export type ActiveReport = {
  reportId: string;
  terminalId: string;
  type: ReportType;
  productId: string | null;
  supplierName: string | null;
  createdAt: string;
  reporterId?: string | null;
  truckLabel?: string | null; // the reporter's truck, as saved with the report
  expiresAtMs?: number | null; // after this the report no longer counts
};

export type FleetTripLite = {
  trip: TripRow;
  pickups: TripPickupRow[];
  driverName: string | null;
  truckName: string | null;
};

// Severity: "hit" = the report names a product the truck is going for, or
// it's terminal-wide / company allocation. "maybe" = an out-of-product
// report where we don't know what the truck is loading.
export type Severity = "hit" | "maybe";

export type AffectedTruck = {
  tripId: string;
  driverName: string | null;
  truckName: string | null;
  arrived: boolean;
  etaMs?: number | null; // when it gets to the rack, if on the way and its position is known
  severity: Severity;
  // The reports that touch this truck.
  reportIds: string[];
};

export type Conflict = {
  terminalId: string;
  reports: ActiveReport[];
  trucks: AffectedTruck[];
  severity: Severity;
  newestAt: string;
};

const TERMINAL_WIDE: ReportType[] = ["long_line", "terminal_issue"];

// Products a truck is headed to load: the pickup's planned compartments,
// else what its planned load lists (passed in by pickup id). Empty = unknown.
export function productsForPickup(p: TripPickupRow, plannedByLoad: Map<string, string[]>): string[] {
  const fromComps = (p.planned_comps ?? []).map((c) => c.product_id).filter((x): x is string => !!x);
  if (fromComps.length) return [...new Set(fromComps)];
  return p.load_id ? plannedByLoad.get(p.load_id) ?? [] : [];
}

function touches(r: ActiveReport, products: string[]): Severity | null {
  if (TERMINAL_WIDE.includes(r.type)) return "hit";
  // Allocation reports are company-only already (RLS); a supplier cutoff
  // usually hits every load from that supplier, so treat it as a hit when
  // the product matches or is unknown.
  if (r.type === "out_of_allocation") {
    if (!r.productId || products.length === 0) return "hit";
    return products.includes(r.productId) ? "hit" : null;
  }
  // Out of product
  if (products.length === 0) return "maybe";
  return r.productId && products.includes(r.productId) ? "hit" : null;
}

export function findConflicts(
  trips: FleetTripLite[],
  reports: ActiveReport[],
  plannedByLoad: Map<string, string[]> = new Map(),
  etaFor?: (tripId: string) => number | null,
): Conflict[] {
  const byTerminal = new Map<string, ActiveReport[]>();
  for (const r of reports) {
    const list = byTerminal.get(r.terminalId) ?? [];
    list.push(r);
    byTerminal.set(r.terminalId, list);
  }
  const out: Conflict[] = [];
  for (const [terminalId, reps] of byTerminal) {
    const trucks: AffectedTruck[] = [];
    for (const f of trips) {
      if (f.trip.status === "parked") continue;
      const p = activePickup(f.pickups.filter((x) => x.outcome !== "no_load"));
      if (!p || String(p.terminal_id ?? "") !== terminalId) continue;
      const products = productsForPickup(p, plannedByLoad);
      let sev: Severity | null = null;
      const ids: string[] = [];
      const eta = p.arrived_at ? null : etaFor?.(f.trip.trip_id) ?? null;
      for (const r of reps) {
        // A truck that gets there after the report runs out is not held up by it.
        if (eta != null && r.expiresAtMs != null && eta >= r.expiresAtMs) continue;
        const s = touches(r, products);
        if (!s) continue;
        ids.push(r.reportId);
        if (s === "hit" || !sev) sev = s;
      }
      if (!sev) continue;
      trucks.push({ tripId: f.trip.trip_id, driverName: f.driverName, truckName: f.truckName, arrived: !!p.arrived_at, etaMs: eta, severity: sev, reportIds: ids });
    }
    if (trucks.length === 0) continue;
    trucks.sort((a, b) => Number(a.severity !== "hit") - Number(b.severity !== "hit") || Number(b.arrived) - Number(a.arrived));
    out.push({
      terminalId,
      reports: reps.filter((r) => trucks.some((t) => t.reportIds.includes(r.reportId))).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      trucks,
      severity: trucks.some((t) => t.severity === "hit") ? "hit" : "maybe",
      newestAt: reps.reduce((m, r) => (r.createdAt > m ? r.createdAt : m), ""),
    });
  }
  return out.sort((a, b) =>
    Number(a.severity !== "hit") - Number(b.severity !== "hit") || b.trucks.length - a.trucks.length || b.newestAt.localeCompare(a.newestAt));
}

// Live counts for the squares.
export type LiveCounts = { atRack: number; enRouteToRack: number; loadedRolling: number; parked: number };

export function liveCounts(trips: (FleetTripLite & { loadedComps: number })[]): LiveCounts {
  let atRack = 0, enRouteToRack = 0, loadedRolling = 0, parked = 0;
  for (const f of trips) {
    if (f.trip.status === "parked") { parked++; continue; }
    const p = activePickup(f.pickups.filter((x) => x.outcome !== "no_load"));
    if (p && !p.left_at) { if (p.arrived_at) atRack++; else enRouteToRack++; continue; }
    if (f.loadedComps > 0) loadedRolling++;
  }
  return { atRack, enRouteToRack, loadedRolling, parked };
}
