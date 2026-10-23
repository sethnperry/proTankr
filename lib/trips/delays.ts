// lib/trips/delays.ts
//
// The Delay button on the Driver Dashboard. A driver taps it when something is
// holding the truck up, picks a reason (the list depends on which leg of the
// trip they are on), and the clock runs until they tap it again or tap Arrive.
// Each delay is saved as one "delay_logged" trip event, so the delivery screen
// can subtract it before asking about leftover time.
//
// The running delay lives on the phone (it has no end yet); only a finished
// one is written to the trip.

import { terminalIssueLabel } from "./terminalIssues.ts";
import type { TripEventRow } from "./types.ts";

export type DelayLeg = "to_rack" | "at_rack" | "to_drop" | "at_drop";

export const DELAY_EVENT = "delay_logged";

export const LEG_LABEL: Record<DelayLeg, string> = {
  to_rack: "Driving to the rack",
  at_rack: "At the rack",
  to_drop: "Driving to the drop",
  at_drop: "At the drop",
};

export type DelayReasonOption = { code: string; label: string };

const BLOCKED: DelayReasonOption = { code: "blocked_access", label: "Blocked access to the delivery area" };
const ROAD: DelayReasonOption[] = [
  { code: "traffic", label: "Traffic" },
  { code: "accident", label: "Accident ahead" },
  { code: "road_closed", label: "Road closed / detour" },
  { code: "weather", label: "Weather" },
  { code: "breakdown", label: "Truck problem" },
  { code: "dispatch_wait", label: "Waiting on dispatch" },
  { code: "train", label: "Train / bridge" },
];

export const DELAY_REASONS: Record<DelayLeg, DelayReasonOption[]> = {
  to_rack: [...ROAD],
  at_rack: [
    { code: "long_line", label: "Long line" },
    { code: "terminal_issue", label: "Terminal issue" },
    { code: "gauging", label: "Gauging / terminal closed" },
    { code: "order_problem", label: "Order or paperwork problem" },
    { code: "breakdown", label: "Truck problem" },
  ],
  to_drop: [...ROAD, BLOCKED],
  at_drop: [
    BLOCKED,
    { code: "store_closed", label: "Store closed / no one to receive" },
    { code: "tanks_not_ready", label: "Tanks full or not ready" },
    { code: "customer_wait", label: "Customer asked me to wait" },
    { code: "store_equipment", label: "Equipment problem at the store" },
    { code: "vapor_issue", label: "Vapor recovery or hose problem" },
    { code: "breakdown", label: "Truck problem" },
  ],
};

export const OTHER_CODE = "other";

export function delayReasonLabel(code: string | null | undefined, note?: string | null): string {
  if (!code) return note?.trim() || "Delay";
  if (code === OTHER_CODE) return note?.trim() || "Other";
  const fromTerminal = terminalIssueLabel(code);
  if (fromTerminal) return fromTerminal;
  for (const leg of Object.keys(DELAY_REASONS) as DelayLeg[]) {
    const hit = DELAY_REASONS[leg].find((r) => r.code === code);
    if (hit) return hit.label;
  }
  return code;
}

// Which leg the driver is on, from the next trip step. Null when no delay
// makes sense there (no trip, between stops, loaded and waiting to pick a drop).
export function legForStep(kind: string): DelayLeg | null {
  switch (kind) {
    case "arrive_pickup": return "to_rack";
    case "planner":
    case "loaded": return "at_rack";
    case "arrive_delivery": return "to_drop";
    case "finish_delivery": return "at_drop";
    default: return null;
  }
}

export type RunningDelay = {
  tripId: string;
  leg: DelayLeg;
  code: string;
  note: string | null;
  startedAt: string;
  // The pickup or delivery the delay belongs to.
  pickupId: string | null;
  deliveryId: string | null;
};

const key = (userId: string) => `proTankr:u:${userId}:delay`;

export function readRunningDelay(userId: string): RunningDelay | null {
  try {
    const raw = localStorage.getItem(key(userId));
    return raw ? (JSON.parse(raw) as RunningDelay) : null;
  } catch {
    return null;
  }
}
export function writeRunningDelay(userId: string, d: RunningDelay | null) {
  try {
    if (d) localStorage.setItem(key(userId), JSON.stringify(d));
    else localStorage.removeItem(key(userId));
  } catch {
    /* private mode: the delay just won't survive a reload */
  }
}

export type LoggedDelay = {
  leg: DelayLeg;
  code: string;
  label: string;
  note: string | null;
  minutes: number;
  startedAt: string;
  endedAt: string;
  pickupId: string | null;
  deliveryId: string | null;
};

export function delayEventPayload(d: RunningDelay, endedAtIso: string) {
  const minutes = Math.max(0, Math.round((Date.parse(endedAtIso) - Date.parse(d.startedAt)) / 60000));
  return {
    leg: d.leg,
    code: d.code,
    label: delayReasonLabel(d.code, d.note),
    note: d.note,
    minutes,
    started_at: d.startedAt,
    ended_at: endedAtIso,
  };
}

export function loggedDelays(events: TripEventRow[]): LoggedDelay[] {
  return events
    .filter((e) => e.event_type === DELAY_EVENT)
    .map((e) => {
      const p = (e.payload ?? {}) as Record<string, unknown>;
      const minutes = Number(p.minutes);
      return {
        leg: String(p.leg) as DelayLeg,
        code: String(p.code ?? ""),
        label: typeof p.label === "string" && p.label ? p.label : delayReasonLabel(String(p.code ?? ""), null),
        note: typeof p.note === "string" && p.note ? p.note : null,
        minutes: Number.isFinite(minutes) ? minutes : 0,
        startedAt: String(p.started_at ?? e.occurred_at),
        endedAt: String(p.ended_at ?? e.occurred_at),
        pickupId: e.pickup_id ?? null,
        deliveryId: e.delivery_id ?? null,
      };
    })
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

// Minutes already explained at one delivery's drop.
export function dropDelayMinutes(delays: LoggedDelay[], deliveryId: string): number {
  return delays.filter((d) => d.deliveryId === deliveryId && d.leg === "at_drop").reduce((t, d) => t + d.minutes, 0);
}
