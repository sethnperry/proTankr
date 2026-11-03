// lib/trips/deadheadReport.ts
//
// Billable empty time per period, as a report: one row per eligible deadhead segment across trips, with what the
// admin decided, ready for the shared report shell. Pure.

import type { ShellColumn, ShellFilter } from "../reports/reportShell.ts";
import { KIND_LABEL, fmtMin, tripSegments, type DhKind, type DhSegment, type Flags } from "./deadhead.ts";
import type { EmptyMoveRow, TripDeliveryRow, TripPickupRow, TripRow } from "./types.ts";
import { moveMinutes } from "../moves/emptyMoves.ts";

export type DeadheadRow = {
  key: string;            // tripId|segmentKey
  tripId: string;         // empty for a stand-alone empty move
  moveId?: string;        // set for a stand-alone empty move (its billable call lives on the move itself)
  segmentKey: string;
  driverId: string;
  date: string;
  kind: DhKind;
  from: string;
  to: string;
  minutes: number;
  billable: boolean | null; // null = not reviewed
};

export function deadheadRows(
  trips: TripRow[], pickups: TripPickupRow[], deliveries: TripDeliveryRow[], flags: Record<string, Flags>,
  deliveryPlace: (d: TripDeliveryRow) => { name: string; city: string | null; state: string | null },
): DeadheadRow[] {
  const out: DeadheadRow[] = [];
  for (const t of trips) {
    const segs: DhSegment[] = tripSegments(t, pickups.filter((p) => p.trip_id === t.trip_id), deliveries.filter((d) => d.trip_id === t.trip_id), deliveryPlace);
    for (const s of segs) {
      if (!s.eligible || s.minutes == null) continue;
      const f = flags[t.trip_id]?.[s.key];
      out.push({ key: `${t.trip_id}|${s.key}`, tripId: t.trip_id, segmentKey: s.key, driverId: t.driver_id, date: s.startedAt ?? t.started_at ?? "", kind: s.kind, from: s.from, to: s.to, minutes: s.minutes, billable: f === undefined ? null : f });
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

/** Finished stand-alone empty moves (the truck empty between trips) as report rows. A cancelled one carries no time. */
export function emptyMoveRows(moves: EmptyMoveRow[], placeName: (id: string | null, text: string | null) => string): DeadheadRow[] {
  const out: DeadheadRow[] = [];
  for (const m of moves) {
    if (!m.ended_at || m.notes === "Cancelled") continue;
    const minutes = moveMinutes(m);
    if (minutes <= 0) continue;
    out.push({ key: `move|${m.move_id}`, tripId: "", moveId: m.move_id, segmentKey: "move", driverId: m.driver_id, date: m.started_at, kind: "move", from: placeName(m.from_place_id, m.from_text), to: placeName(m.to_place_id, m.to_text), minutes, billable: m.billable ?? null });
  }
  return out;
}

const day = (iso: string) => { const d = new Date(iso); return Number.isFinite(d.getTime()) ? `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}` : ""; };
export const billableLabel = (b: boolean | null) => (b === true ? "Billable" : b === false ? "Not billable" : "Not reviewed");

export function deadheadColumns(nameOf: (id: string) => string): ShellColumn<DeadheadRow>[] {
  return [
    { key: "date", label: "Date", get: (r) => day(r.date), weight: 0.8 },
    { key: "driver", label: "Driver", get: (r) => nameOf(r.driverId), weight: 1.1 },
    { key: "leg", label: "Leg", get: (r) => `${r.from} → ${r.to}`, weight: 2 },
    { key: "kind", label: "Kind", get: (r) => KIND_LABEL[r.kind], weight: 1 },
    { key: "minutes", label: "Time", get: (r) => fmtMin(r.minutes), align: "r", weight: 0.7 },
    { key: "billable", label: "Billing", get: (r) => billableLabel(r.billable), weight: 1 },
  ];
}

export function deadheadFilters(nameOf: (id: string) => string): ShellFilter<DeadheadRow>[] {
  return [
    { id: "billing", label: "Billing", of: (r) => (r.billable === null ? "none" : r.billable ? "yes" : "no"), show: (v) => (v === "yes" ? "Billable" : v === "no" ? "Not billable" : "Not reviewed") },
    { id: "driver", label: "Driver", of: (r) => r.driverId, show: nameOf },
    { id: "kind", label: "Kind", of: (r) => r.kind, show: (v) => KIND_LABEL[v as DhKind] ?? v },
  ];
}

export function deadheadSummary(rows: DeadheadRow[]): { label: string; value: string }[] {
  const sum = (f: (r: DeadheadRow) => boolean) => rows.filter(f).reduce((t, r) => t + r.minutes, 0);
  return [
    { label: "Billable", value: fmtMin(sum((r) => r.billable === true)) },
    { label: "Not billable", value: fmtMin(sum((r) => r.billable === false)) },
    { label: "Not reviewed", value: fmtMin(sum((r) => r.billable === null)) },
  ];
}
