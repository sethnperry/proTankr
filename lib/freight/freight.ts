// lib/freight/freight.ts
//
// Freight loads and the LTS route preset, the rules only: when a load can begin, what finishing needs, miles loaded
// and empty, the LTS totals, the manager's report and the recap lines. Pure; no pay math anywhere.

import type { ShellColumn, ShellFilter } from "../reports/reportShell.ts";

export type TrailerKind = "van" | "flatbed" | "lowboy" | "other";
export const TRAILER_KINDS: { value: TrailerKind; label: string }[] = [
  { value: "van", label: "Van" }, { value: "flatbed", label: "Flatbed" }, { value: "lowboy", label: "Lowboy" }, { value: "other", label: "Other" },
];
export const kindLabel = (k: string | null | undefined) => TRAILER_KINDS.find((t) => t.value === k)?.label ?? "";

export type Load = {
  freight_id: string; driver_id: string; truck_id: string | null; trailer_kind: TrailerKind | null; trailer_label: string | null;
  preset: "standard" | "lts"; reference: string | null; customer: string | null; origin_text: string | null; destination_text: string | null; route_number: string | null;
  status: "open" | "delivered" | "cancelled"; begin_odometer: number | null; begun_at: string; end_odometer: number | null; delivered_at: string | null;
  empty_end_odometer: number | null; empty_ended_at: string | null; manifest_paths: string[]; manifest_signature: string | null;
};
export type Stop = { stop_id: string; freight_id: string; seq: number; name: string; casings: number; totes: number };

const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN);
const num = (s: string): number | null => { const t = s.replace(/[,\s]/g, ""); if (!t) return null; const n = Number(t); return Number.isFinite(n) ? n : null; };
export const toNumber = num;

/** The one open freight load on a truck, if any. */
export const openOnTruck = (loads: Load[], truckId: string | null): Load | null => (truckId ? loads.find((l) => l.status === "open" && l.truck_id === truckId) ?? null : null);

export type BeginForm = { preset: "standard" | "lts"; truckId: string | null; odometer: string; reference: string; routeNumber: string; trailerKind: TrailerKind | null; hasCoupledTrailer: boolean };
/** Why a load can't begin yet, or null. */
export function beginProblem(f: BeginForm, loads: Load[]): string | null {
  if (!f.truckId) return "Pick the truck first.";
  if (openOnTruck(loads, f.truckId)) return "This truck already has an open freight load. Finish it first.";
  if (f.odometer.trim() !== "" && (num(f.odometer) == null || (num(f.odometer) as number) < 0)) return "The odometer isn't a number.";
  if (!f.hasCoupledTrailer && !f.trailerKind) return "Pick the kind of trailer: van, flatbed or lowboy.";
  if (f.preset === "lts" && !f.routeNumber.trim()) return "Enter the route number.";
  if (f.preset === "standard" && !f.reference.trim()) return "Enter the load or reference number.";
  return null;
}

export type DeliverForm = { endOdometer: string; stops: { name: string; casings: string; totes: string }[]; manifestPhotos: number; signed: boolean };
/** Why a load can't be marked delivered yet, or null. */
export function deliverProblem(load: Pick<Load, "preset" | "begin_odometer">, f: DeliverForm): string | null {
  const end = num(f.endOdometer);
  if (f.endOdometer.trim() !== "") {
    if (end == null || end < 0) return "The ending odometer isn't a number.";
    if (load.begin_odometer != null && end < load.begin_odometer) return "The ending odometer is lower than where the load began.";
  }
  if (load.preset === "lts") {
    const filled = f.stops.filter((s) => s.name.trim() !== "");
    if (filled.length === 0) return "Add at least one stop.";
    for (const s of filled) {
      for (const [label, v] of [["casings", s.casings], ["totes", s.totes]] as const) {
        const n = num(v);
        if (v.trim() !== "" && (n == null || n < 0 || !Number.isInteger(n))) return `${s.name}: ${label} has to be a whole number.`;
      }
    }
    if (f.manifestPhotos === 0) return "Photograph the signed manifest.";
    if (!f.signed) return "The receiver needs to sign the manifest.";
  }
  return null;
}

/** Miles with product (begin to end), or null when either odometer is missing. */
export const loadedMiles = (l: Pick<Load, "begin_odometer" | "end_odometer">): number | null =>
  l.begin_odometer != null && l.end_odometer != null && l.end_odometer >= l.begin_odometer ? l.end_odometer - l.begin_odometer : null;
/** Empty miles after Delivered, until the next load or the driver ended it. */
export const emptyMiles = (l: Pick<Load, "end_odometer" | "empty_end_odometer">): number | null =>
  l.end_odometer != null && l.empty_end_odometer != null && l.empty_end_odometer >= l.end_odometer ? l.empty_end_odometer - l.end_odometer : null;
/** Minutes empty (delivered to the empty end, or to now while still empty). */
export function emptyMinutes(l: Pick<Load, "status" | "delivered_at" | "empty_ended_at">, now: number): number | null {
  if (l.status !== "delivered") return null;
  const a = ms(l.delivered_at), b = l.empty_ended_at ? ms(l.empty_ended_at) : now;
  return Number.isFinite(a) && Number.isFinite(b) && b >= a ? Math.round((b - a) / 60_000) : null;
}
/** Delivered and not yet ended: the truck is empty right now. */
export const isEmptyNow = (l: Pick<Load, "status" | "empty_ended_at">) => l.status === "delivered" && !l.empty_ended_at;

/** The driver's empty stretch ends when the next load begins (at its odometer), if it hasn't already. */
export function closeEmptyOnBegin(prev: Load | null | undefined, begunAt: string, odometer: number | null): { empty_ended_at: string; empty_end_odometer: number | null } | null {
  if (!prev || !isEmptyNow(prev)) return null;
  return { empty_ended_at: begunAt, empty_end_odometer: odometer };
}

export const ltsTotals = (stops: { casings: number; totes: number }[]) => ({ stops: stops.length, casings: stops.reduce((t, s) => t + (s.casings || 0), 0), totes: stops.reduce((t, s) => t + (s.totes || 0), 0) });

// ── Manager's report ───────────────────────────────────────────────────────────────────────────────────────
export type FreightRow = { key: string; load: Load; driver: string; truck: string; stopCount: number; casings: number; totes: number };
export function freightRows(loads: Load[], stops: Stop[], driverName: (id: string) => string, truckName: (id: string | null) => string): FreightRow[] {
  return [...loads].filter((l) => l.status !== "cancelled").sort((a, b) => b.begun_at.localeCompare(a.begun_at)).map((l) => {
    const t = ltsTotals(stops.filter((s) => s.freight_id === l.freight_id));
    return { key: l.freight_id, load: l, driver: driverName(l.driver_id), truck: truckName(l.truck_id), stopCount: t.stops, casings: t.casings, totes: t.totes };
  });
}
const md = (iso: string | null) => { const d = iso ? new Date(iso) : null; return d && Number.isFinite(d.getTime()) ? `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}` : ""; };
export const statusText = (l: Load) => (l.status === "open" ? "On the road" : isEmptyNow(l) ? "Empty" : "Done");
export const freightColumns: ShellColumn<FreightRow>[] = [
  { key: "began", label: "Began", get: (r) => md(r.load.begun_at), weight: 0.8 },
  { key: "driver", label: "Driver", get: (r) => r.driver, weight: 1.1 },
  { key: "truck", label: "Truck", get: (r) => r.truck, weight: 0.8 },
  { key: "what", label: "Load", get: (r) => (r.load.preset === "lts" ? `LTS route ${r.load.route_number ?? ""}` : r.load.reference ?? ""), weight: 1.2 },
  { key: "trailer", label: "Trailer", get: (r) => [kindLabel(r.load.trailer_kind), r.load.trailer_label].filter(Boolean).join(" "), weight: 0.9 },
  { key: "status", label: "Status", get: (r) => statusText(r.load), weight: 0.8 },
  { key: "miles", label: "Loaded mi", get: (r) => loadedMiles(r.load) ?? "", align: "r", weight: 0.8 },
  { key: "empty", label: "Empty mi", get: (r) => emptyMiles(r.load) ?? "", align: "r", weight: 0.8 },
  { key: "cases", label: "Casings", get: (r) => (r.load.preset === "lts" ? r.casings : ""), align: "r", weight: 0.7 },
  { key: "totes", label: "Totes", get: (r) => (r.load.preset === "lts" ? r.totes : ""), align: "r", weight: 0.7 },
];
export const freightFilters: ShellFilter<FreightRow>[] = [
  { id: "driver", label: "Driver", of: (r) => r.driver },
  { id: "status", label: "Status", of: (r) => statusText(r.load) },
  { id: "preset", label: "Kind", of: (r) => r.load.preset, show: (v) => (v === "lts" ? "LTS route" : "Standard") },
];
export const freightSummary = (rows: FreightRow[]) => [
  { label: "Loads", value: String(rows.length) },
  { label: "Loaded miles", value: String(Math.round(rows.reduce((t, r) => t + (loadedMiles(r.load) ?? 0), 0)).toLocaleString("en-US")) },
  { label: "Empty miles", value: String(Math.round(rows.reduce((t, r) => t + (emptyMiles(r.load) ?? 0), 0)).toLocaleString("en-US")) },
];

/** The email recap's lines: what is out now, what finished in the last `days` days. */
export function recapLines(rows: FreightRow[], now: number, days: number): string[] {
  const since = now - days * 86400_000;
  const out: string[] = [];
  const open = rows.filter((r) => r.load.status === "open");
  const empty = rows.filter((r) => isEmptyNow(r.load));
  const done = rows.filter((r) => r.load.status === "delivered" && (ms(r.load.delivered_at) || 0) >= since);
  const name = (r: FreightRow) => (r.load.preset === "lts" ? `LTS route ${r.load.route_number ?? ""}` : r.load.reference ?? "load");
  out.push(`${open.length} on the road, ${empty.length} empty, ${done.length} delivered in the last ${days} days.`);
  for (const r of open) out.push(`On the road: ${r.driver}, ${r.truck}, ${name(r)} since ${md(r.load.begun_at)}`);
  for (const r of empty) out.push(`Empty: ${r.driver}, ${r.truck}, since ${md(r.load.delivered_at)}`);
  for (const r of done) {
    const m = loadedMiles(r.load);
    out.push(`Delivered ${md(r.load.delivered_at)}: ${r.driver}, ${r.truck}, ${name(r)}${m != null ? `, ${Math.round(m).toLocaleString("en-US")} mi` : ""}${r.load.preset === "lts" ? `, ${r.casings} casings, ${r.totes} totes` : ""}`);
  }
  return out;
}
