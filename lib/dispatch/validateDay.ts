// lib/dispatch/validateDay.ts
//
// Plan validation: a driver's ordered trips for the day, chained start to end,
// checked for friction. Nothing blocks; every finding is a flag with a tier:
//   decide  needs a decision (no access, not enough hours, over the shift limit,
//           trailer cert missing, allocation exceeded, driver on a call-out)
//   heads   worth a look (gauging wait, crowded rack or drop, credential or
//           access expiring, estimates)
// Checks that came back clean are listed by name so the report can say
// "9 checks passed" and nothing else. Pure; the page supplies the lookups.
import { forecastLoad, settingsForTerminal, type Forecast, type HistTrip, type TimelineSettings } from "./forecast.ts";
import { accessAt } from "./planLoad.ts";
import { EXP_SOON_DAYS, EXP_WARN_DAYS } from "../expiry.ts";
import type { LatLon } from "../trips/deliveryLocations.ts";

export type DayTrip = {
  id: string;
  /** Product plan, one entry per compartment, highest compartment first. */
  comps?: (string | null)[] | null;
  terminalId: string;
  locationId: string;
  /** Later drops on this load, each with the compartments delivered there. */
  extra?: { locationId: string; comps: number[] }[] | null;
  supplierId: string | null;
  orderNumber: string;
  shipper: string;
  customer: string;
};

export type TermInfo = {
  name: string; tz: string | null; ll: LatLon | null; renewalDays: number | null;
  gauging_cutoff?: string | null; gauging_minutes?: number | null;
};
export type Others = { name: string; etaMs: number }[];

export type DayContext = {
  startMs: number;
  dutyStartMs?: number;      // start of the driver's day (earlier dispatched loads count)
  driveSoFarMin?: number;    // driving already planned earlier in the day
  startFrom: LatLon | null;
  terminals: Map<string, TermInfo>;
  locations: Map<string, { name: string; ll: LatLon | null }>;
  history: HistTrip[];
  driverId: string;
  settings: TimelineSettings;
  hos: { driveLeftMin: number | null; dutyLeftMin: number | null; asOfMs: number } | null;
  nowMs?: number;
  access: { terminal_id: string; carded_on: string | null }[];
  todayIso: string;
  trailerCertBad: (terminalId: string) => boolean;
  allocWarning: (t: DayTrip, loadStartMs: number) => string | null;
  supplierWarning: (t: DayTrip) => string | null;
  othersAtDrop: (locationId: string) => Others;
  othersAtTerminal: (terminalId: string) => Others;
  credentials: { label: string; days: number }[]; // driver's credentials expiring within the horizon
  calloutText: string | null;
  restText: string | null; // "their 10 hour reset completes 6:10 AM", when the first start is before it
};

export type FixKind = "meet" | "terminal" | "ignore";
export type Issue = { id: string; tripId: string | null; tier: "decide" | "heads"; kind: string; text: string; fixes: FixKind[] };
export type TripResult = {
  trip: DayTrip; startMs: number; arriveTerminalMs: number; loadStartMs: number; forecast: Forecast; terminalName: string; locationName: string; tz: string | null;
};
export type DayReport = { trips: TripResult[]; endMs: number; shiftHours: number; driveMinutes: number; issues: Issue[]; passed: string[] };

const NEAR_MS = 60 * 60000;
const fmt = (ms: number, tz: string | null) => new Intl.DateTimeFormat("en-US", { timeZone: tz || undefined, hour: "numeric", minute: "2-digit" }).format(new Date(ms));

export function validateDay(trips: DayTrip[], c: DayContext): DayReport {
  const results: TripResult[] = [];
  const issues: Issue[] = [];
  const failed = new Set<string>(); // check names that raised something
  const flag = (tripId: string | null, check: string, tier: Issue["tier"], kind: string, text: string, fixes: FixKind[] = ["ignore"]) => {
    failed.add(check);
    issues.push({ id: `${tripId ?? "day"}:${kind}:${issues.length}`, tripId, tier, kind, text, fixes });
  };
  const tag = (i: number) => (trips.length > 1 ? `Trip ${i + 1}: ` : "");

  if (c.calloutText) flag(null, "Call-outs", "decide", "callout", c.calloutText);
  if (c.restText) flag(null, "Rest", "decide", "rest", c.restText);

  let t = c.startMs;
  let from = c.startFrom;
  let drive = c.driveSoFarMin ?? 0;
  trips.forEach((trip, i) => {
    const term = c.terminals.get(trip.terminalId);
    const loc = c.locations.get(trip.locationId);
    if (!term || !loc) return;
    const f = forecastLoad({
      startMs: t, startFrom: from,
      terminal: { id: trip.terminalId, name: term.name, tz: term.tz, ll: term.ll },
      location: { id: trip.locationId, name: loc.name, ll: loc.ll },
      extraDrops: (trip.extra ?? []).flatMap((x) => { const l = c.locations.get(x.locationId); return l ? [{ id: x.locationId, name: l.name, ll: l.ll }] : []; }),
      history: c.history, settings: settingsForTerminal(c.settings, term),
      dutyStartMs: c.dutyStartMs ?? c.startMs, drivingMinSoFar: drive, hos: c.hos, nowMs: c.nowMs,
    });
    const toT = f.segments.find((s) => s.key === "to_terminal")!;
    const loading = f.segments.find((s) => s.key === "loading")!;
    const r: TripResult = { trip, startMs: t, arriveTerminalMs: toT.endMs, loadStartMs: loading.startMs, forecast: f, terminalName: term.name, locationName: loc.name, tz: term.tz };
    results.push(r);

    for (const fl of f.flags) {
      if (fl.kind === "estimate") continue;
      const decide = fl.severity === "bad" || fl.kind === "shift";
      flag(trip.id, fl.kind === "gauging" ? "Gauging" : fl.kind === "shift" ? "Shift length" : "Hours", decide ? "decide" : "heads", fl.kind, tag(i) + fl.text);
    }

    // Terminal access at the time the driver would load.
    const row = c.access.find((a) => String(a.terminal_id) === trip.terminalId);
    const loadIso = new Date(r.loadStartMs).toISOString().slice(0, 10);
    const acc = accessAt(row?.carded_on ?? null, term.renewalDays, loadIso);
    if (acc.state === "none" || acc.state === "expired") {
      flag(trip.id, "Access", "decide", "access",
        `${tag(i)}Not carded at ${term.name}${acc.state === "expired" ? " (access expired)" : ""}.`, ["meet", "terminal", "ignore"]);
    } else if (acc.state === "expiring" || acc.state === "soon") {
      flag(trip.id, "Access", "heads", "access_soon", `${tag(i)}Access at ${term.name} ${acc.days === 0 ? "expires today" : `expires in ${acc.days} day${acc.days === 1 ? "" : "s"}`}.`);
    }

    if (c.trailerCertBad(trip.terminalId)) flag(trip.id, "Trailer certificate", "decide", "cert", `${tag(i)}The driver's trailer has no current certification for ${term.name}.`);
    const sw = c.supplierWarning(trip);
    if (sw) flag(trip.id, "Supplier", "decide", "supplier", tag(i) + sw);
    const aw = c.allocWarning(trip, r.loadStartMs);
    if (aw) flag(trip.id, "Allocation", "decide", "alloc", tag(i) + aw);

    const atTerm = c.othersAtTerminal(trip.terminalId).filter((o) => Math.abs(o.etaMs - r.arriveTerminalMs) <= NEAR_MS);
    if (atTerm.length) flag(trip.id, "Rack crowding", "heads", "crowd",
      `${tag(i)}${atTerm.length} other load${atTerm.length === 1 ? "" : "s"} near ${term.name} within the hour (${atTerm.map((o) => `${o.name} ${fmt(o.etaMs, term.tz)}`).join(", ")}).`);
    const atDrop = c.othersAtDrop(trip.locationId).filter((o) => Math.abs(o.etaMs - f.endMs) <= 90 * 60000);
    if (atDrop.length) flag(trip.id, "Same drop", "heads", "drop",
      `${tag(i)}${atDrop.length} other load${atDrop.length === 1 ? "" : "s"} to ${loc.name} around the same time (${atDrop.map((o) => `${o.name} ${fmt(o.etaMs, term.tz)}`).join(", ")}).`);

    drive += f.driveMinutes;
    t = f.endMs;
    const lastX = (trip.extra ?? []).map((x) => c.locations.get(x.locationId)).filter(Boolean).pop();
    from = lastX ? lastX.ll : loc.ll;
  });

  for (const cr of c.credentials) {
    flag(null, "Credentials", cr.days < 0 || cr.days <= EXP_WARN_DAYS ? "decide" : "heads", "credential",
      `${cr.label} ${cr.days < 0 ? `expired ${-cr.days} day${cr.days === -1 ? "" : "s"} ago` : cr.days === 0 ? "expires today" : `expires in ${cr.days} day${cr.days === 1 ? "" : "s"}`}.`);
  }

  const checks = ["Call-outs", "Rest", "Hours", "Shift length", "Gauging", "Access", "Trailer certificate", "Supplier", "Allocation", "Rack crowding", "Same drop", "Credentials"];
  const endMs = results.length ? results[results.length - 1].forecast.endMs : c.startMs;
  return {
    trips: results, endMs, shiftHours: (endMs - (c.dutyStartMs ?? c.startMs)) / 3600000, driveMinutes: drive - (c.driveSoFarMin ?? 0),
    issues: issues.sort((a, b) => Number(a.tier === "heads") - Number(b.tier === "heads")),
    passed: results.length ? checks.filter((k) => !failed.has(k)) : [],
  };
}

export { EXP_SOON_DAYS };

// ── Meet another driver ─────────────────────────────────────────────────────
// A non-carded driver loads with a carded one. Whoever arrives first waits for
// the other, and the wait lands on their trip. Just a notice, no pairing.
export type MeetSide = { name: string; arriveMs: number; endMs: number; startMs: number };
export type MeetResult = { first: string; second: string; waitMin: number; sides: { name: string; arriveMs: number; waitMin: number; newEndMs: number; shiftHours: number }[] };

export function meetConsequence(a: MeetSide, b: MeetSide): MeetResult {
  const firstIsA = a.arriveMs <= b.arriveMs;
  const waitMin = Math.round(Math.abs(a.arriveMs - b.arriveMs) / 60000);
  const side = (s: MeetSide, waits: boolean) => {
    const w = waits ? waitMin : 0;
    const newEndMs = s.endMs + w * 60000;
    return { name: s.name, arriveMs: s.arriveMs, waitMin: w, newEndMs, shiftHours: (newEndMs - s.startMs) / 3600000 };
  };
  return { first: firstIsA ? a.name : b.name, second: firstIsA ? b.name : a.name, waitMin, sides: [side(a, firstIsA), side(b, !firstIsA)] };
}
