// lib/trips/ptd.ts
//
// The Product Transfer Document (docs/trip-workflow-design.md §13), built
// from a trip's rows. Pure: the page supplies names and renders.

import { ptdCode } from "./code39.ts";
import { delayMinutes, parkRecords } from "./tripFlow.ts";
import { editedNetFlag } from "./netGallons.ts";
import { billingTime } from "./billingTime.ts";
import { terminalIssueLabel } from "./terminalIssues.ts";
import { tripMiles, truckChanges } from "./truckChange.ts";
import type {
  TripCompartmentLoadRow,
  TripDeliveryRow,
  TripDeliveryTankRow,
  TripEventRow,
  TripOrderRow,
  TripPickupRow,
  TripRow,
} from "./types.ts";

export type PtdNames = {
  product: (id: string | null) => string;
  delivery: (d: TripDeliveryRow) => string;
  driver: (id: string | null) => string;
  delayReason: (id: string | null) => string | null;
  validated?: ReadonlySet<string>;
};

export type PtdInput = {
  trip: TripRow;
  orders: TripOrderRow[];
  pickups: TripPickupRow[];
  deliveries: TripDeliveryRow[];
  compLoads: TripCompartmentLoadRow[];
  tanks: TripDeliveryTankRow[];
  events: TripEventRow[];
};

export type PtdStop = {
  name: string;
  arrivedAt: string | null;
  beginAt: string | null;
  leftAt: string | null;
  delayMinutes: number | null;
  delayReason: string | null;
  delayNote: string | null;
};

const num = (x: unknown): number | null => {
  if (x == null || x === "") return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};
const sum = (xs: (number | null)[]) => xs.reduce<number>((a, b) => a + (b ?? 0), 0);

export function buildPtd(input: PtdInput, names: PtdNames) {
  const { trip } = input;
  const orderById = new Map(input.orders.map((o) => [o.order_id, o]));
  const primary = input.orders.find((o) => o.is_primary) ?? null;
  const orderNumbers = [
    ...(primary?.order_number ? [primary.order_number] : []),
    ...input.orders.filter((o) => !o.is_primary && o.order_number).map((o) => o.order_number!),
  ];
  const loads = input.compLoads
    .filter((c) => c.disposition !== "cancelled")
    .sort((a, b) => a.comp_number - b.comp_number);
  const orderNo = (id: string | null) => (id ? orderById.get(id)?.order_number ?? null : primary?.order_number ?? null);
  const deliveryById = new Map(input.deliveries.map((d) => [d.delivery_id, d]));

  const compartments = loads.map((c) => ({
    comp: c.comp_number,
    product: names.product(c.product_id),
    order: orderNo(c.order_id),
    bol: c.bol_number,
    supplier: c.supplier,
    gross: num(c.gross_gallons),
    net: num(c.net_gallons),
    temp: num(c.temp_f),
    api: num(c.api),
    tank: c.tank_number,
    delivery: c.delivery_id && deliveryById.get(c.delivery_id) ? names.delivery(deliveryById.get(c.delivery_id)!) : null,
    disposition: c.disposition,
    flag: editedNetFlag({
      productId: c.product_id, netGallons: num(c.net_gallons), calculatedGallons: num(c.net_calculated_gallons),
      validated: names.validated,
    }),
  }));

  // Per product line: product + BOL + supplier.
  const productLines = new Map<string, { product: string; bol: string | null; supplier: string | null; gross: number; net: number; flags: string[] }>();
  for (const c of compartments) {
    const key = `${c.product}|${c.bol ?? ""}|${c.supplier ?? ""}`;
    const line = productLines.get(key) ?? { product: c.product, bol: c.bol, supplier: c.supplier, gross: 0, net: 0, flags: [] };
    line.gross += c.gross ?? 0;
    line.net += c.net ?? 0;
    if (c.flag) line.flags.push(`C${c.comp}: ${c.flag}`);
    productLines.set(key, line);
  }

  // Billing rollup: net per product per order number (§2).
  const billing = new Map<string, { order: string | null; product: string; net: number }>();
  for (const c of compartments) {
    if (c.disposition === "retained") continue;
    const key = `${c.order ?? ""}|${c.product}`;
    const b = billing.get(key) ?? { order: c.order, product: c.product, net: 0 };
    b.net += c.net ?? 0;
    billing.set(key, b);
  }

  const stop = (s: TripPickupRow | TripDeliveryRow, name: string): PtdStop => ({
    name,
    arrivedAt: s.arrived_at,
    beginAt: s.begin_at,
    leftAt: s.left_at,
    delayMinutes: delayMinutes(s.arrived_at, s.begin_at),
    delayReason: ("delay_code" in s && terminalIssueLabel(s.delay_code)) || names.delayReason(s.delay_reason_id),
    delayNote: s.delay_note,
  });

  const pickups = [...input.pickups]
    .sort((a, b) => a.seq - b.seq)
    .filter((p) => p.left_at || loads.some((c) => c.pickup_id === p.pickup_id))
    .map((p) => ({
      pickupId: p.pickup_id,
      ...stop(p, [p.name, [p.city, p.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ") || "Pickup"),
      odometer: num(p.odometer),
      noLoad: p.outcome === "no_load",
      noLoadReason: p.outcome === "no_load"
        ? (terminalIssueLabel(p.no_load_reason) ?? (p.no_load_note || "Other")) + (p.no_load_note && terminalIssueLabel(p.no_load_reason) ? ` (${p.no_load_note})` : "")
        : null,
    }));

  // What went where at one delivery: each compartment to its tank, with that
  // tank's Veeder-Root before/after. Tanks read but not matched to a
  // compartment are listed after.
  const deliveryDrops = (d: TripDeliveryRow) => {
    const tanks = input.tanks
      .filter((t) => t.delivery_id === d.delivery_id)
      .sort((a, b) => a.tank_number.localeCompare(b.tank_number, undefined, { numeric: true }))
      .map((t) => ({
        tank: t.tank_number,
        product: t.product_id ? names.product(t.product_id) : null,
        before: num(t.before_reading),
        after: num(t.after_reading),
        water: num(t.water_reading),
        unit: t.reading_unit ?? "gallons",
      }));
    const here = compartments.filter((c) => loads.find((l) => l.comp_number === c.comp)?.delivery_id === d.delivery_id);
    const used = new Set<string>();
    const drops = here.map((c) => {
      const t = c.tank ? tanks.find((x) => x.tank === c.tank) ?? null : null;
      if (t) used.add(t.tank);
      return { comp: c.comp, product: c.product, net: c.net, tank: c.tank, before: t?.before ?? null, after: t?.after ?? null, water: t?.water ?? null, unit: t?.unit ?? "gallons" };
    });
    return { compartments: here.map((c) => c.comp), drops, tanks, otherTanks: tanks.filter((t) => !used.has(t.tank)) };
  };

  const deliveries = input.deliveries
    .filter((d) => d.status !== "cancelled")
    .sort((a, b) => a.seq - b.seq)
    .map((d) => ({
      ...stop(d, names.delivery(d)),
      deliveryType: d.delivery_type,
      timeLabel: d.delivery_type === "pump_off" ? "Pump Time" : "Delivery",
      status: d.status,
      driverId: d.delivering_driver_id,
      driver: d.delivering_driver_id ? names.driver(d.delivering_driver_id) : null,
      driverSignedAt: d.driver_signed_at,
      consigneeName: d.consignee_name,
      consigneeSignature: d.consignee_signature,
      ...deliveryDrops(d),
    }));

  // Loading drivers, with when they accepted (signature_accepted events).
  const loadingSigs = input.events
    .filter((e) => e.event_type === "signature_accepted" && (e.payload as any)?.role === "loading_driver")
    .map((e) => ({ driverId: e.actor_id, name: names.driver(e.actor_id), at: e.occurred_at, pickupId: e.pickup_id ?? null }));

  const time = billingTime(
    trip.started_at,
    pickups.map((p) => ({ kind: "rack" as const, name: p.name, arrivedAt: p.arrivedAt, beginAt: p.beginAt, leftAt: p.leftAt, noLoad: p.noLoad, noLoadReason: input.pickups.find((x) => x.pickup_id === p.pickupId)?.no_load_reason ?? null, noLoadNote: input.pickups.find((x) => x.pickup_id === p.pickupId)?.no_load_note ?? null, delayReason: p.delayReason ?? p.delayNote })),
    deliveries.map((d) => ({ kind: "delivery" as const, name: d.name, arrivedAt: d.arrivedAt, beginAt: d.beginAt, leftAt: d.leftAt, delayReason: d.delayReason ?? d.delayNote })),
  );

  const begin = num(trip.begin_miles), end = num(trip.end_miles);
  const changes = truckChanges(input.events);
  return {
    code: ptdCode(trip.trip_id),
    orderNumbers,
    shipper: trip.shipper,
    customer: trip.customer,
    date: trip.started_at ?? input.pickups[0]?.arrived_at ?? null,
    completedAt: trip.completed_at,
    status: trip.status,
    enteredLate: trip.entered_late,
    beginMiles: begin,
    endMiles: end,
    totalMiles: tripMiles(begin, end, changes),
    truckChanges: changes,
    parks: parkRecords(input.events),
    pickups,
    deliveries,
    compartments,
    products: [...productLines.values()],
    billing: [...billing.values()],
    totals: { gross: sum(compartments.map((c) => c.gross)), net: sum(compartments.map((c) => c.net)) },
    loadingSigs,
    time,
  };
}

export type Ptd = ReturnType<typeof buildPtd>;
