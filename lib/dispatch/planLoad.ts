// lib/dispatch/planLoad.ts
//
// Dispatch Dashboard, planning a load: pick the drop location and the drivers
// who deliver there are ranked by how OFTEN they have (not how recently); pick
// the terminal and the list narrows to drivers with usable access there. Pure.

import { daysUntilIso, expiryStateForDays, type ExpiryState } from "../expiry.ts";
import type { PlanAlert } from "./planAlerts.ts";

export type RosterPerson = { user_id: string; display_name: string; region: string | null };
export type PastDelivery = { driver_id: string; finished_at: string | null };
export type AccessRow = { user_id: string; terminal_id: string; carded_on: string | null };

// "none" = never carded, or access timed out 30+ days ago.
export type AccessState = ExpiryState | "none";

export type PlanDriver = {
  userId: string;
  name: string;
  region: string | null;
  count: number;           // completed deliveries at the chosen location
  lastIso: string | null;  // newest of them, only used to break ties
  access: { state: AccessState; days: number | null } | null; // null = no terminal chosen yet
  busy: string | null;     // "On a load", "Parked", ...
};

export type PlanLoadResult = {
  ready: PlanDriver[];       // can load at the terminal (or no terminal chosen)
  notCarded: PlanDriver[];   // delivered here before, but no usable access at the terminal
  focusIds: Set<string>;     // the drivers the expirations should narrow to
};

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function accessAt(carded_on: string | null | undefined, renewalDays: number | null | undefined, todayIso?: string): { state: AccessState; days: number | null } {
  if (!carded_on) return { state: "none", days: null };
  const days = daysUntilIso(addDays(carded_on, renewalDays ?? 90), todayIso);
  const state = expiryStateForDays(days, { access: true });
  if (state === "inactive" || state === "not_set") return { state: "none", days };
  return { state, days };
}

const usable = (s: AccessState) => s === "valid" || s === "soon" || s === "expiring";

export function rankDrivers(input: {
  roster: RosterPerson[];
  deliveries: PastDelivery[];
  access?: AccessRow[];
  terminalId?: string | null;
  renewalDays?: number | null;
  busy?: Map<string, string>;
  todayIso?: string;
}): PlanLoadResult {
  const counts = new Map<string, { n: number; last: string | null }>();
  for (const d of input.deliveries) {
    if (!d.driver_id) continue;
    const c = counts.get(d.driver_id) ?? { n: 0, last: null };
    c.n++;
    if (d.finished_at && (!c.last || d.finished_at > c.last)) c.last = d.finished_at;
    counts.set(d.driver_id, c);
  }
  const cardedOn = new Map<string, string | null>();
  for (const a of input.access ?? []) if (input.terminalId && String(a.terminal_id) === input.terminalId) cardedOn.set(a.user_id, a.carded_on);

  const rows: PlanDriver[] = input.roster.map((m) => {
    const c = counts.get(m.user_id);
    return {
      userId: m.user_id, name: m.display_name, region: m.region,
      count: c?.n ?? 0, lastIso: c?.last ?? null,
      access: input.terminalId ? accessAt(cardedOn.get(m.user_id), input.renewalDays, input.todayIso) : null,
      busy: input.busy?.get(m.user_id) ?? null,
    };
  });
  // Most frequent first; recency only breaks a tie.
  rows.sort((a, b) => b.count - a.count || (b.lastIso ?? "").localeCompare(a.lastIso ?? "") || a.name.localeCompare(b.name));

  const ready = rows.filter((r) => !r.access || usable(r.access.state));
  const notCarded = rows.filter((r) => r.access && !usable(r.access.state) && r.count > 0);
  const known = ready.filter((r) => r.count > 0);
  // Narrow to people who have delivered here; if nobody has, nobody is ruled out.
  const focusIds = new Set((known.length ? known : ready).map((r) => r.userId));
  return { ready, notCarded, focusIds };
}

// The expirations tile follows the drivers being considered. Equipment alerts
// are dropped while a shortlist is active (equipment comes in a later step).
export function focusAlerts(alerts: PlanAlert[], focusIds: Set<string> | null): PlanAlert[] {
  if (!focusIds) return alerts;
  return alerts.filter((a) => !a.isEquipment && focusIds.has(a.subjectId));
}
