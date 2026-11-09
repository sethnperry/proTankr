// lib/trips/cardRows.ts
//
// The pickup and delivery lines of a trip card, as plain data. The driver's
// dashboard and the dispatcher's Plan board both draw the card from these rows,
// so the two cannot drift apart.
import type { TripDeliveryRow, TripPickupRow } from "./types";

export type CardRow = {
  key: string;
  label: string;
  /** done = green label, here = the driver is at it, tried = a rack that had no product. */
  tone: "idle" | "here" | "done" | "tried";
  place: string;
  name: string;
  /** Why a tried rack had no load. */
  reason?: string;
  placeBright: boolean;
  nameBright: boolean;
};

export function pickupRows(
  pickups: TripPickupRow[],
  o: { place: (p: TripPickupRow) => string; noLoadReason: (code: string | null | undefined) => string; currentId: string | null },
): CardRow[] {
  return [...pickups].sort((a, b) => a.seq - b.seq).map((p) => {
    if (p.outcome === "no_load") {
      return { key: p.pickup_id, label: "Tried", tone: "tried", place: o.place(p), name: p.name ?? "Not set", reason: o.noLoadReason(p.no_load_reason) || "Other", placeBright: false, nameBright: false };
    }
    const loaded = p.outcome === "loaded" || (!!p.left_at && !!p.load_id);
    const current = !loaded && o.currentId === p.pickup_id;
    return {
      key: p.pickup_id, label: loaded ? "Loaded" : p.arrived_at ? "Arrived" : "Pickup",
      tone: loaded ? "done" : p.arrived_at ? "here" : "idle",
      place: o.place(p), name: p.name ?? "Not set",
      placeBright: current && !p.arrived_at, nameBright: current && !!p.arrived_at,
    };
  });
}

export function deliveryRows(
  deliveries: TripDeliveryRow[],
  o: { place: (d: TripDeliveryRow) => string; name: (d: TripDeliveryRow) => string; headedId: string | null },
): CardRow[] {
  return deliveries.filter((d) => d.status !== "cancelled").sort((a, b) => a.seq - b.seq).map((d) => {
    const done = d.status === "complete";
    const current = !done && (o.headedId === d.delivery_id || !!d.arrived_at);
    return {
      key: d.delivery_id, label: done ? "Delivered" : d.arrived_at ? "Arrived" : "Delivery",
      tone: done ? "done" : d.arrived_at ? "here" : "idle",
      place: o.place(d), name: o.name(d),
      placeBright: current && !d.arrived_at, nameBright: current && !!d.arrived_at,
    };
  });
}
