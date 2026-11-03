// lib/trips/deadhead.ts
//
// Deadhead: time the truck spent empty between cities, made explicit so it can be billed (or not). A trip has up
// to three kinds of empty segment: the run to the first rack, each hop from a rack where the driver couldn't load
// to the next one, and the run back after the last delivery. Whether a segment is billable is an admin's call,
// stored per segment and kept off the PTD proper (it is internal). Pure: no Supabase.

export type DhStop = { name: string; city: string | null; state: string | null; arrivedAt: string | null; leftAt: string | null; noLoad?: boolean };
export type DhKind = "to_rack" | "rack_hop" | "return" | "move";
export type DhSegment = {
  key: string;
  kind: DhKind;
  from: string;
  to: string;
  minutes: number | null;
  startedAt: string | null;
  /** Between two different cities (or one is unknown): worth reviewing for billing. */
  eligible: boolean;
};

export const KIND_LABEL: Record<DhKind, string> = { to_rack: "To the rack", rack_hop: "Rack to rack", return: "Back after delivery", move: "Empty move" };

const place = (s: { name?: string; city: string | null; state: string | null }) => [s.city, s.state].filter(Boolean).join(", ") || s.name || "—";
const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN);
const mins = (a: string | null | undefined, b: string | null | undefined): number | null => {
  const x = ms(a), y = ms(b);
  return Number.isFinite(x) && Number.isFinite(y) && y >= x ? Math.round((y - x) / 60_000) : null;
};
const norm = (s: string | null) => (s ?? "").trim().toLowerCase();
const sameCity = (a: { city: string | null; state: string | null }, b: { city: string | null; state: string | null }) =>
  !!a.city && !!b.city && norm(a.city) === norm(b.city) && norm(a.state) === norm(b.state);

export function deadheadSegments(o: {
  startedAt: string | null;
  start: { city: string | null; state: string | null };
  racks: DhStop[];
  deliveries: DhStop[];
  completedAt: string | null;
}): DhSegment[] {
  const out: DhSegment[] = [];
  const racks = o.racks;

  if (racks[0]) {
    out.push({ key: "to_rack", kind: "to_rack", from: place({ city: o.start.city, state: o.start.state, name: "Start" }), to: place(racks[0]), minutes: mins(o.startedAt, racks[0].arrivedAt), startedAt: o.startedAt, eligible: !sameCity(o.start, racks[0]) });
  }
  racks.forEach((r, i) => {
    const next = racks[i + 1];
    if (r.noLoad && next) out.push({ key: `rack_hop:${i}`, kind: "rack_hop", from: place(r), to: place(next), minutes: mins(r.leftAt, next.arrivedAt), startedAt: r.leftAt, eligible: !sameCity(r, next) });
  });
  const last = [...o.deliveries].reverse().find((d) => d.leftAt);
  if (last && o.completedAt) {
    const m = mins(last.leftAt, o.completedAt);
    if (m != null && m > 5) out.push({ key: "return", kind: "return", from: place(last), to: "Back", minutes: m, startedAt: last.leftAt, eligible: true });
  }
  return out.filter((s) => s.minutes != null);
}

export type Flags = Record<string, boolean | undefined>; // segment key → billable (undefined = not reviewed yet)

export type DhTotals = { billable: number; notBillable: number; unreviewed: number };
export function totals(segments: DhSegment[], flags: Flags): DhTotals {
  const t: DhTotals = { billable: 0, notBillable: 0, unreviewed: 0 };
  for (const s of segments) {
    if (!s.eligible) continue;
    const m = s.minutes ?? 0;
    const f = flags[s.key];
    if (f === true) t.billable += m; else if (f === false) t.notBillable += m; else t.unreviewed += m;
  }
  return t;
}

export const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`);

// ── From a trip's rows ──────────────────────────────────────────────────────────────────────────────────────
import type { TripDeliveryRow, TripPickupRow, TripRow } from "./types.ts";

/** The segments for one trip. `deliveryPlace` resolves a delivery's city and state (saved locations carry them). */
export function tripSegments(trip: TripRow, pickups: TripPickupRow[], deliveries: TripDeliveryRow[], deliveryPlace: (d: TripDeliveryRow) => { name: string; city: string | null; state: string | null }): DhSegment[] {
  const racks: DhStop[] = [...pickups].sort((a, b) => a.seq - b.seq).map((p) => ({ name: p.name ?? "Rack", city: p.city, state: p.state, arrivedAt: p.arrived_at, leftAt: p.left_at, noLoad: p.outcome === "no_load" }));
  const drops: DhStop[] = [...deliveries].filter((d) => d.status !== "cancelled").sort((a, b) => a.seq - b.seq).map((d) => ({ ...deliveryPlace(d), arrivedAt: d.arrived_at, leftAt: d.left_at }));
  return deadheadSegments({ startedAt: trip.started_at, start: { city: trip.start_city ?? null, state: trip.start_state ?? null }, racks, deliveries: drops, completedAt: trip.completed_at });
}
