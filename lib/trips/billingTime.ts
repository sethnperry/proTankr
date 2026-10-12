// lib/trips/billingTime.ts
//
// Billable time on a trip, for the PTD: travel between stops, time at each
// rack (including racks where the driver couldn't load, and why), the whole
// stretch spent trying to get loaded, then the same for deliveries.
// Travel starts at the Start Load tap. Pure.

import { terminalIssueLabel } from "./terminalIssues.ts";

export type TimedStop = {
  kind: "rack" | "delivery";
  name: string;
  arrivedAt: string | null;
  beginAt: string | null;
  leftAt: string | null;
  noLoad?: boolean;
  noLoadReason?: string | null; // TerminalIssueCode or "other"
  noLoadNote?: string | null;
  delayReason?: string | null;
};

export type TimeRow =
  | { type: "travel"; to: string; minutes: number | null }
  | {
      type: "stop";
      kind: "rack" | "delivery";
      name: string;
      onSite: number | null; // arrived → left
      waited: number | null; // arrived → began
      working: number | null; // began → left
      noLoad: boolean;
      reason: string | null; // why the time ran long, or why there was no load
    };

export type BillingTime = {
  rows: TimeRow[];
  travelToRack: number | null; // Start Load → first rack
  loadingSpan: number | null; // first rack arrival → leaving the rack that loaded (all hops)
  racksTried: number;
  travelToDelivery: number | null; // leaving the loaded rack → first delivery
  atDeliveries: number | null; // sum of time on site at deliveries
  totalTravel: number | null;
  total: number | null; // Start Load → leaving the last stop
};

const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN);
function mins(a: string | null | undefined, b: string | null | undefined): number | null {
  const x = ms(a), y = ms(b);
  if (!Number.isFinite(x) || !Number.isFinite(y) || y < x) return null;
  return Math.round((y - x) / 60_000);
}
function add(a: number | null, b: number | null): number | null {
  if (a == null) return b;
  if (b == null) return a;
  return a + b;
}

export function billingTime(startedAt: string | null, racks: TimedStop[], deliveries: TimedStop[]): BillingTime {
  const stops = [...racks, ...deliveries];
  const rows: TimeRow[] = [];
  let prevLeft: string | null = startedAt;
  let totalTravel: number | null = null;
  for (const s of stops) {
    const travel = mins(prevLeft, s.arrivedAt);
    rows.push({ type: "travel", to: s.name, minutes: travel });
    totalTravel = add(totalTravel, travel);
    const reason = s.noLoad
      ? (terminalIssueLabel(s.noLoadReason) ?? (s.noLoadNote || "Other")) + (s.noLoadNote && terminalIssueLabel(s.noLoadReason) ? ` (${s.noLoadNote})` : "")
      : s.delayReason ?? null;
    rows.push({
      type: "stop",
      kind: s.kind,
      name: s.name,
      onSite: mins(s.arrivedAt, s.leftAt),
      waited: s.noLoad ? null : mins(s.arrivedAt, s.beginAt),
      working: s.noLoad ? null : mins(s.beginAt, s.leftAt),
      noLoad: !!s.noLoad,
      reason,
    });
    if (s.leftAt) prevLeft = s.leftAt;
  }

  const loadedRack = [...racks].reverse().find((r) => !r.noLoad && r.leftAt) ?? null;
  const firstRack = racks[0] ?? null;
  const firstDelivery = deliveries[0] ?? null;
  let atDeliveries: number | null = null;
  for (const d of deliveries) atDeliveries = add(atDeliveries, mins(d.arrivedAt, d.leftAt));
  const lastLeft = [...stops].reverse().find((s) => s.leftAt)?.leftAt ?? null;

  return {
    rows,
    travelToRack: firstRack ? mins(startedAt, firstRack.arrivedAt) : null,
    loadingSpan: firstRack && loadedRack ? mins(firstRack.arrivedAt, loadedRack.leftAt) : null,
    racksTried: racks.length,
    travelToDelivery: loadedRack && firstDelivery ? mins(loadedRack.leftAt, firstDelivery.arrivedAt) : null,
    atDeliveries,
    totalTravel,
    total: mins(startedAt, lastLeft),
  };
}

export function fmtMinutes(m: number | null): string {
  if (m == null) return "—";
  const h = Math.floor(m / 60), r = m % 60;
  return h ? `${h}h ${String(r).padStart(2, "0")}m` : `${r}m`;
}
