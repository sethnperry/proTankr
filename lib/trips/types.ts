// lib/trips/types.ts
//
// Row shapes for the trip workflow tables
// (supabase/migrations/20261010000000_trip_workflow_phase1.sql).
// Design: docs/trip-workflow-design.md.
//
// Every synced row carries a phone-generated id and client_updated_at, the
// device's own edit time. The server keeps the newest client edit per row
// (trip_sync_write), so a late-arriving stale write can't clobber a newer one.

export type TripStatus = "dispatched" | "draft" | "loading" | "in_transit" | "delivering" | "parked" | "complete" | "cancelled";
export type ParkFor = "slip_seat" | "layover";
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
  start_city?: string | null;
  start_state?: string | null;
  end_miles: number | null;
  entered_late: boolean;
  notes: string | null;
  started_at: string | null;
  completed_at: string | null;
  // Park Preloaded (set while status = 'parked'; cleared on resume).
  parked_at?: string | null;
  parked_by?: string | null;
  parked_for?: ParkFor | null;
  parked_where?: string | null;
  parked_region?: string | null; // the region it's parked in, for dispatch's region filter
  parked_note?: string | null;
  // Dispatch told the driver to park this load (20261030000000). Cleared when it is parked or the request is withdrawn.
  park_requested_at?: string | null;
  park_requested_by?: string | null;
  // Another driver took over a parked load (20261030010000): when, and who parked it.
  handoff_at?: string | null;
  handoff_from?: string | null;
  // Cancel a load (20261013000000). Reasons in the order picked.
  cancel_reasons?: string[] | null;
  cancel_note?: string | null;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  cancel_returned_to?: string | null;
  driver_hidden?: boolean;
  // Dispatched by a dispatcher (20261020000000); the driver begins it.
  dispatched_by?: string | null;
  planned_start_at?: string | null;
  planned_end_at?: string | null;
  planned_drive_min?: number | null;
  planned_truck_id?: string | null;
  planned_trailer_id?: string | null;
  dispatch_seq?: number | null;
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
  // Rack hopping (20261012010000). Optional: older local rows lack them.
  outcome?: "loaded" | "no_load" | null;
  no_load_reason?: string | null; // a TerminalIssueCode, or "other"
  no_load_note?: string | null;
  delay_code?: string | null; // a TerminalIssueCode picked as the delay reason
  // A second pickup on a partly loaded trailer (20261014000000): the empty
  // compartments it fills and with what. Null = an ordinary pickup.
  planned_comps?: { comp_number: number; product_id: string; order_id?: string | null; supplier_id?: string | null; splash?: Splash }[] | null;
  // The supplier dispatch picked (20261020030000).
  supplier_id?: string | null;
  // The order this pickup loads under (20261014010000). Null = primary order.
  order_id?: string | null;
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
  // Minutes over the drop estimate the driver said had no reason (20261033000000).
  unaccounted_delay_min?: number | null;
};

export type TripDeliveryTankRow = Synced & {
  delivery_tank_id: string;
  delivery_id: string;
  tank_number: string;
  product_id: string | null;
  before_reading: number | null;
  after_reading: number | null;
  water_reading: number | null; // always inches
  // Before/after are tank-monitor gallons, or inches when the tank was stuck.
  // Optional: rows written before 20261012000000 have no value locally.
  reading_unit?: "gallons" | "inches";
  receipt_photo_path: string | null;
};

export type SupplierRow = Synced & {
  supplier_id: string;
  company_id: string;
  name: string;
  is_active: boolean;
  created_by: string | null;
};

/** A compartment loaded on top of what is already in it: the first product's share (percent), its gallons aboard, and the gallons to load on top. */
export type Splash = { pct: number; aboard: number; add: number };

export type TripCompartmentLoadRow = Synced & {
  compartment_load_id: string;
  trip_id: string;
  pickup_id: string | null;
  order_id: string | null;
  delivery_id: string | null;
  comp_number: number;
  product_id: string | null;
  supplier: string | null;
  supplier_id?: string | null;
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

// A shift-level event (start shift, end shift, call-out, document drop ...): the same shape as a trip event
// without a trip, plus whose shift it is and where the entry came from. Append-only on the server.
export type ShiftSource = "geotab" | "app" | "manual";
export type ShiftEventRow = {
  event_id: string;
  company_id: string;
  user_id: string;
  event_type: string;
  occurred_at: string;
  actor_id: string;
  payload: Record<string, unknown>;
  source: ShiftSource;
};

// A work order: something on a unit that needs doing (a pump down, a failed inspection, a repair request). The
// phone creates it once; staff change its status on the server, so it is insert-only in the offline store.
export type WorkOrderSource = "pump_down" | "failed_inspection" | "repair_request" | "other";
export type WorkOrderStatus = "open" | "awaiting_approval" | "approved" | "denied" | "planned" | "done" | "cancelled";
export type WorkOrderRow = {
  work_order_id: string;
  company_id: string;
  truck_id: string | null;
  trailer_id: string | null;
  subject: string;
  source: WorkOrderSource;
  status: WorkOrderStatus;
  source_ref: string | null;
  detail: Record<string, unknown>;
  reported_by: string;
};

// A driver's inspection of one truck or trailer. Insert-only in the offline store; an admin's review happens on
// the server (see lib/maintenance).
export type InspectionCondition = "good" | "fair" | "replace_soon";
export type UnitInspectionRow = {
  inspection_id: string;
  company_id: string;
  unit_kind: "truck" | "trailer";
  truck_id: string | null;
  trailer_id: string | null;
  driver_id: string;
  campaign_id: string | null;
  items: { key: string; label: string; condition: InspectionCondition; note: string | null }[];
  overall: InspectionCondition;
  notes: string | null;
  capture_id: string | null;
  review_status: "none" | "pending";
};

// A day a driver claims per diem (away from home base). Keyed by driver and day, so claiming the same day twice is
// one row; status 'withdrawn' takes it back. Only the driver writes their own days.
export type PerDiemDayRow = Synced & {
  user_id: string;
  day: string; // YYYY-MM-DD, the driver's local day
  company_id: string;
  city: string;
  state: string;
  source: "geotab" | "app" | "manual";
  status: "claimed" | "withdrawn";
  note: string | null;
};

// A call-out of a shift. The driver (or a dispatcher for them) writes it; status 'withdrawn' takes it back. The
// server marks which emails went (`notified`), so the phone never writes that column.
export type CalloutRow = Synced & {
  callout_id: string;
  company_id: string;
  user_id: string;
  shift_date: string;
  shift_start_at: string;
  reason: string;
  reason_id: string | null;
  category: string | null;
  note: string | null;
  division: string | null;
  region: string | null;
  local_area: string | null;
  status: "active" | "withdrawn";
  created_by: string;
  updated_by: string | null;
  withdrawn_by: string | null;
  withdrawn_at: string | null;
};

// Time a driver spends on terminal or transload work, with a timer: ended_at is null while it runs.
export type TerminalWorkRow = Synced & {
  work_id: string;
  company_id: string;
  user_id: string;
  activity: "rail_transload" | "vessel_transload" | "marshaling" | "truck_to_tank" | "loading_for_others" | "yard_work" | "training";
  terminal_id: string | null;
  terminal_name: string | null;
  product_id: string | null;
  started_at: string;
  ended_at: string | null;
  note: string | null;
  billable: boolean;
  source: "geotab" | "app" | "manual";
};

// A driver's Spotted Lanternfly attestation for one county a trip entered. Keyed by trip, state and county, so
// attesting twice is one record; the three checks are the cab exterior, frame rails and tool box, and the trailer.
export type TankCheckRow = Synced & {
  check_id: string; company_id: string; user_id: string;
  location_id: string | null; location_name: string | null; truck_id: string | null;
  delivery_id: string | null; read_at: string; photo_paths: string[]; note: string | null;
  source: "geotab" | "app" | "manual";
};
export type TankCheckReadingRow = Synced & {
  check_id: string; tank_number: string; product_id: string | null;
  reading: number | null; reading_unit: "gallons" | "inches"; water_inches: number | null;
};

export type FreightLoadRow = Synced & {
  freight_id: string; company_id: string; driver_id: string;
  truck_id: string | null; trailer_id: string | null;
  trailer_kind: "van" | "flatbed" | "lowboy" | "other" | null; trailer_label: string | null;
  preset: "standard" | "lts"; reference: string | null; customer: string | null;
  origin_text: string | null; destination_text: string | null; route_number: string | null;
  status: "open" | "delivered" | "cancelled";
  begin_odometer: number | null; begun_at: string; end_odometer: number | null; delivered_at: string | null;
  empty_end_odometer: number | null; empty_ended_at: string | null;
  manifest_paths: string[]; manifest_signature: string | null; notes: string | null;
  source: "geotab" | "app" | "manual";
};
export type FreightStopRow = Synced & { stop_id: string; freight_id: string; seq: number; name: string; casings: number; totes: number; note: string | null };

export type EmptyMoveRow = Synced & {
  move_id: string; company_id: string; driver_id: string; truck_id: string | null; trailer_id: string | null;
  kind: "bobtail" | "empty_return" | "reposition";
  from_place_id: string | null; from_text: string | null; to_place_id: string | null; to_text: string | null;
  started_at: string; ended_at: string | null; begin_miles: number | null; end_miles: number | null;
  billable: boolean | null; notes: string | null; source: "app" | "geotab" | "manual";
};

export type SlfAttestationRow = Synced & {
  trip_id: string;
  state: string;
  county: string;
  company_id: string;
  user_id: string;
  cab_exterior: boolean;
  frame_tool_box: boolean;
  trailer: boolean;
  attested_at: string;
  source: "geotab" | "app" | "manual";
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
  suppliers: SupplierRow;
  trips: TripRow;
  trip_orders: TripOrderRow;
  trip_pickups: TripPickupRow;
  trip_deliveries: TripDeliveryRow;
  trip_delivery_tanks: TripDeliveryTankRow;
  trip_compartment_loads: TripCompartmentLoadRow;
  trip_events: TripEventRow;
  shift_events: ShiftEventRow;
  work_orders: WorkOrderRow;
  unit_inspections: UnitInspectionRow;
  per_diem_days: PerDiemDayRow;
  callouts: CalloutRow;
  terminal_work: TerminalWorkRow;
  slf_attestations: SlfAttestationRow;
  tank_checks: TankCheckRow;
  freight_loads: FreightLoadRow;
  freight_stops: FreightStopRow;
  empty_moves: EmptyMoveRow;
  tank_check_readings: TankCheckReadingRow;
  compartment_readiness: CompartmentReadinessRow;
};

export type TripTable = keyof TripTableRows;

// Primary key column(s) per table, also the upsert onConflict target.
export const TABLE_KEYS: { [T in TripTable]: readonly (keyof TripTableRows[T] & string)[] } = {
  suppliers: ["supplier_id"],
  trips: ["trip_id"],
  trip_orders: ["order_id"],
  trip_pickups: ["pickup_id"],
  trip_deliveries: ["delivery_id"],
  trip_delivery_tanks: ["delivery_tank_id"],
  trip_compartment_loads: ["compartment_load_id"],
  trip_events: ["event_id"],
  shift_events: ["event_id"],
  work_orders: ["work_order_id"],
  unit_inspections: ["inspection_id"],
  per_diem_days: ["user_id", "day"],
  callouts: ["callout_id"],
  terminal_work: ["work_id"],
  slf_attestations: ["trip_id", "state", "county"],
  tank_checks: ["check_id"],
  freight_loads: ["freight_id"],
  freight_stops: ["stop_id"],
  empty_moves: ["move_id"],
  tank_check_readings: ["check_id", "tank_number"],
  compartment_readiness: ["trailer_id", "comp_number"],
};

// Parents before children, so a queue drained in this order never trips a
// foreign key on a row whose parent is still waiting.
export const SYNC_ORDER: readonly TripTable[] = [
  "suppliers",
  "trips",
  "trip_orders",
  "trip_pickups",
  "trip_deliveries",
  "trip_delivery_tanks",
  "trip_compartment_loads",
  "trip_events",
  "shift_events",
  "work_orders",
  "unit_inspections",
  "per_diem_days",
  "callouts",
  "terminal_work",
  "slf_attestations",
  "tank_checks",
  "freight_loads",
  "freight_stops",
  "empty_moves",
  "tank_check_readings",
  "compartment_readiness",
];

// Tables the server only ever inserts into (no update policy).
export const INSERT_ONLY: ReadonlySet<TripTable> = new Set<TripTable>(["trip_events", "shift_events", "work_orders", "unit_inspections", "slf_attestations", "tank_checks", "tank_check_readings"]);

export function rowKey<T extends TripTable>(table: T, row: TripTableRows[T]): string {
  const r = row as Record<string, unknown>;
  return TABLE_KEYS[table].map((k) => String(r[k])).join("|");
}
