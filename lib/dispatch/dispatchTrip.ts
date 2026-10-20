// lib/dispatch/dispatchTrip.ts
//
// What a dispatcher's "Dispatch" writes for each planned load: a trip in the
// 'dispatched' status for the driver, with its order number, pickup terminal
// (and supplier), delivery, planned start and planned equipment. The driver
// begins it from their dashboard, which turns it into a normal trip. Pure.

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
  const order = l.orderNumber.trim();
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
    orders: [{ order_id: opts.newId(), trip_id: tripId, order_number: order || null, is_primary: true, client_updated_at: nowIso }],
    pickups: [{
      pickup_id: pickupId, trip_id: tripId, seq: 1, pickup_type: "terminal", terminal_id: l.terminalId,
      name: l.terminalName, city: l.city, state: l.state, supplier_id: l.supplierId, client_updated_at: nowIso,
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
