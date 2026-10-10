// lib/trips/types.ts
//
// Row shapes for the trip workflow tables
// (supabase/migrations/20261010000000_trip_workflow_phase1.sql).
// Design: docs/trip-workflow-design.md.
//
// Every synced row carries a phone-generated id and client_updated_at, the
// device's own edit time. The server keeps the newest client edit per row
// (trip_sync_write), so a late-arriving stale write can't clobber a newer one.

export type TripStatus = "draft" | "loading" | "in_transit" | "delivering" | "complete" | "cancelled";
export type DeliveryType = "drop" | "pump_off";
export type PickupType = "terminal" | "railcar" | "transload" | "other";
export type CompartmentDisposition = "loaded" | "delivered" | "retained" | "cancelled";
export type ReadinessStatus = "cleaned_and_purged" | "preloaded" | "residue" | "retained";

type Synced = { client_updated_at?: string | null };

export type TripRow = Synced & {
  trip_id: string;
  company_id: string;
  truck_id: string | null;
  trailer_id: string | null;
  driver_id: string;
  created_by: string;
  status: TripStatus;
  shipper: string | null;
  customer: string | null;
  begin_miles: number | null;
  end_miles: number | null;
  entered_late: boolean;
  notes: string | null;
  started_at: string | null;
  completed_at: string | null;
};

export type TripOrderRow = Synced & {
  order_id: string;
  trip_id: string;
  order_number: string | null;
  shipper: string | null;
  customer: string | null;
  is_primary: boolean;
};

export type TripPickupRow = Synced & {
  pickup_id: string;
  trip_id: string;
  seq: number;
  pickup_type: PickupType;
  terminal_id: string | null;
  rack_id: string | null;
  name: string | null;
  city: string | null;
  state: string | null;
  odometer: number | null;
  arrived_at: string | null;
  begin_at: string | null;
  left_at: string | null;
  delay_reason_id: string | null;
  delay_note: string | null;
  load_id: string | null;
};

export type TripDeliveryRow = Synced & {
  delivery_id: string;
  trip_id: string;
  seq: number;
  location_id: string | null;
  one_off_name: string | null;
  one_off_address: string | null;
  delivery_type: DeliveryType;
  status: "planned" | "complete" | "cancelled";
  arrived_at: string | null;
  begin_at: string | null;
  left_at: string | null;
  delay_reason_id: string | null;
  delay_note: string | null;
  delivering_driver_id: string | null;
  driver_signed_at: string | null;
  consignee_name: string | null;
  consignee_signature: string | null;
};

export type TripDeliveryTankRow = Synced & {
  delivery_tank_id: string;
  delivery_id: string;
  tank_number: string;
  product_id: string | null;
  before_reading: number | null;
  after_reading: number | null;
  water_reading: number | null;
  receipt_photo_path: string | null;
};

export type TripCompartmentLoadRow = Synced & {
  compartment_load_id: string;
  trip_id: string;
  pickup_id: string | null;
  order_id: string | null;
  delivery_id: string | null;
  comp_number: number;
  product_id: string | null;
  supplier: string | null;
  bol_number: string | null;
  gross_gallons: number | null;
  net_gallons: number | null;
  net_calculated_gallons: number | null;
  temp_f: number | null;
  api: number | null;
  tank_number: string | null;
  disposition: CompartmentDisposition;
  winterized: boolean | null;
  additive_amount: string | null;
  bio_blend: string | null;
  loading_driver_id: string | null;
};

// Append-only on the server: never updated, only inserted once.
export type TripEventRow = {
  event_id: string;
  trip_id: string;
  event_type: string;
  occurred_at: string;
  actor_id: string;
  pickup_id: string | null;
  delivery_id: string | null;
  payload: Record<string, unknown>;
};

export type CompartmentReadinessRow = Synced & {
  trailer_id: string;
  comp_number: number;
  company_id: string;
  status: ReadinessStatus;
  last_product_id: string | null;
  compartment_load_id: string | null;
  updated_by: string | null;
};

export type TripTableRows = {
  trips: TripRow;
  trip_orders: TripOrderRow;
  trip_pickups: TripPickupRow;
  trip_deliveries: TripDeliveryRow;
  trip_delivery_tanks: TripDeliveryTankRow;
  trip_compartment_loads: TripCompartmentLoadRow;
  trip_events: TripEventRow;
  compartment_readiness: CompartmentReadinessRow;
};

export type TripTable = keyof TripTableRows;

// Primary key column(s) per table, also the upsert onConflict target.
export const TABLE_KEYS: { [T in TripTable]: readonly (keyof TripTableRows[T] & string)[] } = {
  trips: ["trip_id"],
  trip_orders: ["order_id"],
  trip_pickups: ["pickup_id"],
  trip_deliveries: ["delivery_id"],
  trip_delivery_tanks: ["delivery_tank_id"],
  trip_compartment_loads: ["compartment_load_id"],
  trip_events: ["event_id"],
  compartment_readiness: ["trailer_id", "comp_number"],
};

// Parents before children, so a queue drained in this order never trips a
// foreign key on a row whose parent is still waiting.
export const SYNC_ORDER: readonly TripTable[] = [
  "trips",
  "trip_orders",
  "trip_pickups",
  "trip_deliveries",
  "trip_delivery_tanks",
  "trip_compartment_loads",
  "trip_events",
  "compartment_readiness",
];

// Tables the server only ever inserts into (no update policy).
export const INSERT_ONLY: ReadonlySet<TripTable> = new Set<TripTable>(["trip_events"]);

export function rowKey<T extends TripTable>(table: T, row: TripTableRows[T]): string {
  const r = row as Record<string, unknown>;
  return TABLE_KEYS[table].map((k) => String(r[k])).join("|");
}
