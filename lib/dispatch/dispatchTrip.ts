// lib/dispatch/dispatchTrip.ts
//
// What a dispatcher's "Dispatch" writes for each planned load: a trip in the
// 'dispatched' status for the driver, with its order number, pickup terminal
// (and supplier), delivery, planned start and planned equipment. The driver
// begins it from their dashboard, which turns it into a normal trip. Pure.
//
// With a compartment plan (`groups`), each product group carries its own order
// and supplier: one trip order per distinct number (the first is primary) and
// the pickup's planned_comps records order and supplier per compartment.
import { distinctOrders, plannedCompsFor, type PlanGroup } from "./compPlan.ts";

export type DispatchLeg = {
  terminalId: string;
  terminalName: string;
  city: string | null;
  state: string | null;
  locationId: string;
  deliveryType: "drop" | "pump_off";
  supplierId: string | null;
  orderNumber: string;
  startMs: number;
  endMs: number;
  truckId: string | null;   // the equipment the driver holds now
  trailerId: string | null;
  warnings: string[];       // what the dispatcher saw and went ahead with
  groups?: PlanGroup[];     // compartment plan, one entry per product
};

export type DispatchRows = {
  trip: Record<string, unknown>;
  orders: Record<string, unknown>[];
  pickups: Record<string, unknown>[];
  deliveries: Record<string, unknown>[];
  events: Record<string, unknown>[];
};

export function buildDispatchedTrip(
  i: { companyId: string; dispatcherId: string; driverId: string; leg: DispatchLeg; seq: number },
  opts: { now: Date; newId: () => string },
): DispatchRows {
  const nowIso = opts.now.toISOString();
  const tripId = opts.newId();
  const pickupId = opts.newId();
  const l = i.leg;
  const groups = l.groups?.length ? l.groups : null;
  const numbers = groups ? distinctOrders(groups) : (l.orderNumber.trim() ? [l.orderNumber.trim()] : []);
  const orderRows = (numbers.length ? numbers : [""]).map((n, i) => ({
    order_id: opts.newId(), trip_id: tripId, order_number: n || null, is_primary: i === 0, client_updated_at: nowIso,
  }));
  const idFor = (n: string) => orderRows.find((o) => (o.order_number ?? "").toLowerCase() === n.toLowerCase())?.order_id ?? null;
  const planned = groups ? plannedCompsFor(groups, idFor) : null;
  const pickupSupplier = groups ? (groups.find((g) => g.supplierId)?.supplierId ?? l.supplierId) : l.supplierId;
  return {
    trip: {
      trip_id: tripId, company_id: i.companyId, driver_id: i.driverId, created_by: i.dispatcherId,
      status: "dispatched", entered_late: false,
      // The truck and trailer are set when the driver begins; these are the plan.
      truck_id: null, trailer_id: null,
      dispatched_by: i.dispatcherId, planned_start_at: new Date(l.startMs).toISOString(),
      planned_truck_id: l.truckId, planned_trailer_id: l.trailerId, dispatch_seq: i.seq,
      client_updated_at: nowIso,
    },
    orders: orderRows,
    pickups: [{
      pickup_id: pickupId, trip_id: tripId, seq: 1, pickup_type: "terminal", terminal_id: l.terminalId,
      name: l.terminalName, city: l.city, state: l.state, supplier_id: pickupSupplier, ...(planned?.length ? { planned_comps: planned } : {}), client_updated_at: nowIso,
    }],
    deliveries: [{
      delivery_id: opts.newId(), trip_id: tripId, seq: 1, location_id: l.locationId, delivery_type: l.deliveryType,
      status: "planned", client_updated_at: nowIso,
    }],
    events: [{
      event_id: opts.newId(), trip_id: tripId, event_type: "dispatched", occurred_at: nowIso, actor_id: i.dispatcherId,
      pickup_id: pickupId, delivery_id: null,
      payload: { seq: i.seq, planned_start_at: new Date(l.startMs).toISOString(), planned_end_at: new Date(l.endMs).toISOString(), warnings: l.warnings },
    }],
  };
}

/** Dispatched trips for a driver in the order to run them. */
export function runOrder<T extends { dispatch_seq?: number | null; planned_start_at?: string | null }>(trips: T[]): T[] {
  return [...trips].sort((a, b) =>
    (a.planned_start_at ?? "").localeCompare(b.planned_start_at ?? "") || (a.dispatch_seq ?? 0) - (b.dispatch_seq ?? 0));
}

/** Swapping two not-begun loads trades their start times and sequence, so
 *  each keeps its own details and only the run order changes. */
export function swapRunOrder(
  a: { trip_id: string; planned_start_at?: string | null; dispatch_seq?: number | null },
  b: { trip_id: string; planned_start_at?: string | null; dispatch_seq?: number | null },
): [{ trip_id: string; planned_start_at: string | null; dispatch_seq: number | null }, { trip_id: string; planned_start_at: string | null; dispatch_seq: number | null }] {
  let seqA = b.dispatch_seq ?? null;
  const seqB = a.dispatch_seq ?? null;
  // Same time and same sequence would not move anything.
  if ((a.planned_start_at ?? null) === (b.planned_start_at ?? null) && seqA === seqB) seqA = (seqA ?? 0) - 1;
  return [
    { trip_id: a.trip_id, planned_start_at: b.planned_start_at ?? null, dispatch_seq: seqA },
    { trip_id: b.trip_id, planned_start_at: a.planned_start_at ?? null, dispatch_seq: seqB },
  ];
}
