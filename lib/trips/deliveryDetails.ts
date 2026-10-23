// lib/trips/deliveryDetails.ts
//
// What the driver notes after a drop, back in the truck: additives put in,
// issues at the drop, the odometer at the stop. Saved as one
// "delivery_details" trip event (no schema change; trip_events.payload is
// jsonb). Bio blend is per compartment and goes on
// trip_compartment_loads.bio_blend.

import type { TripEventRow } from "./types.ts";

export const DELIVERY_DETAILS_EVENT = "delivery_details";

export const ADDITIVES = [
  { code: "biocide", label: "Biocide" },
  { code: "antimicrobial", label: "Anti-microbial" },
  { code: "antigel", label: "Anti-gel / antifreeze" },
  { code: "conductivity", label: "Conductivity" },
  { code: "other", label: "Other" },
] as const;

export const DELIVERY_ISSUES = [
  { code: "vapor", label: "Vapor recovery" },
  { code: "leak", label: "Leak" },
  { code: "gasket", label: "Gasket" },
  { code: "hose", label: "Hose condition" },
  { code: "spill", label: "Spill" },
  { code: "overfill", label: "Overfill alarm" },
  { code: "other", label: "Other" },
] as const;

export const BIO_BLENDS = ["B5", "B10", "B20"] as const;

export type DeliveryDetails = {
  odometer: number | null;
  additives: string[];
  additiveNote: string | null;
  issues: string[];
  issueNote: string | null;
  // A compartment poured into more than one tank: where and how much.
  splits?: { comp: number; tank: string; gallons: number }[];
};

const ADDITIVE_LABEL: Record<string, string> = Object.fromEntries(ADDITIVES.map((a) => [a.code, a.label]));
const ISSUE_LABEL: Record<string, string> = Object.fromEntries(DELIVERY_ISSUES.map((a) => [a.code, a.label]));

export const additiveLabel = (c: string) => ADDITIVE_LABEL[c] ?? c;
export const issueLabel = (c: string) => ISSUE_LABEL[c] ?? c;

export function hasDetails(d: DeliveryDetails): boolean {
  return d.odometer != null || d.additives.length > 0 || !!d.additiveNote || d.issues.length > 0 || !!d.issueNote || (d.splits?.length ?? 0) > 0;
}

// The newest details event for one delivery.
export function deliveryDetailsFor(events: TripEventRow[], deliveryId: string): DeliveryDetails | null {
  const e = events
    .filter((x) => x.event_type === DELIVERY_DETAILS_EVENT && x.delivery_id === deliveryId)
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))[0];
  if (!e) return null;
  const p = (e.payload ?? {}) as Record<string, unknown>;
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const odo = p.odometer == null ? null : Number(p.odometer);
  return {
    odometer: Number.isFinite(odo) ? odo : null,
    additives: list(p.additives),
    additiveNote: text(p.additive_note),
    issues: list(p.issues),
    issueNote: text(p.issue_note),
    splits: Array.isArray(p.splits)
      ? (p.splits as any[]).map((x) => ({ comp: Number(x?.comp), tank: String(x?.tank ?? ""), gallons: Number(x?.gallons) }))
          .filter((x) => Number.isFinite(x.comp) && x.tank && Number.isFinite(x.gallons))
      : [],
  };
}

export function detailsPayload(d: DeliveryDetails): Record<string, unknown> {
  return {
    odometer: d.odometer,
    additives: d.additives,
    additive_note: d.additiveNote,
    issues: d.issues,
    issue_note: d.issueNote,
    splits: d.splits ?? [],
  };
}

// Diesel-type products are the ones bio gets blended into.
export function isDieselLike(name: string): boolean {
  return /diesel|ulsd|\bd2\b|\bb\d{1,3}\b|biodiesel|dyed|off.?road/i.test(name);
}

// "12:05" under an hour, "1:02:05" past it.
export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`;
}

// "6.2 hrs ago", "40 min ago", "3 days ago".
export function fmtAgo(fromIso: string | null, now: number): string | null {
  if (!fromIso) return null;
  const t = Date.parse(fromIso);
  if (!Number.isFinite(t)) return null;
  const min = (now - t) / 60000;
  if (min < 0) return null;
  if (min < 60) return `${Math.round(min)} min ago`;
  const hrs = min / 60;
  if (hrs < 48) return `${hrs < 10 ? hrs.toFixed(1) : Math.round(hrs)} hrs ago`;
  return `${Math.round(hrs / 24)} days ago`;
}

// Gallons a tank sold per hour since the last drop: last drop's after reading
// down to this drop's before reading. Gallons only; null if it doesn't make sense.
export function soldPerHour(lastAfter: number | null, lastAt: string | null, before: number | null, beforeAt: string | null): number | null {
  if (lastAfter == null || before == null || !lastAt || !beforeAt) return null;
  const hrs = (Date.parse(beforeAt) - Date.parse(lastAt)) / 3_600_000;
  if (!Number.isFinite(hrs) || hrs < 0.5) return null;
  const sold = lastAfter - before;
  if (sold < 0) return null;
  return sold / hrs;
}
