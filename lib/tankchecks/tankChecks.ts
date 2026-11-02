// lib/tankchecks/tankChecks.ts
//
// Meter tickets, the rules only: validating a tank check, turning checks and drop readings into one list per
// store and tank, the report's columns, and the comparison to a live tank feed (kept for when a feed exists).
// Pure, no React, no Supabase.

import type { ShellColumn, ShellFilter } from "../reports/reportShell.ts";

export type Unit = "gallons" | "inches";
export type CheckEntry = { tank: string; value: string; unit: Unit; water: string };

const num = (s: string): number | null => { const t = s.replace(/[,\s]/g, ""); if (t === "") return null; const n = Number(t); return Number.isFinite(n) ? n : null; };
export const toNumber = num;

/** Why a tank check can't be saved yet, or null. Blank tanks are skipped; at least one tank needs a reading. */
export function checkProblem(entries: CheckEntry[]): string | null {
  const filled = entries.filter((e) => e.value.trim() !== "");
  if (filled.length === 0) return "Enter a reading for at least one tank.";
  for (const e of filled) {
    const n = num(e.value);
    if (n == null || n < 0) return `Tank ${e.tank}: the reading isn't a number.`;
    if (e.water.trim() !== "" && (num(e.water) == null || (num(e.water) as number) < 0)) return `Tank ${e.tank}: water isn't a number.`;
  }
  return null;
}

/** Tank names for a new tank typed in: trimmed, no repeats within the check. */
export const tankNameProblem = (name: string, existing: string[]): string | null => {
  const t = name.trim();
  if (!t) return "Enter the tank number.";
  return existing.some((x) => x.trim().toLowerCase() === t.toLowerCase()) ? "That tank is already listed." : null;
};

export type ReadingRow = {
  key: string;
  at: string;
  locationId: string | null;
  store: string;
  tank: string;
  productName: string;
  reading: number | null;
  unit: Unit;
  water: number | null;
  kind: "check" | "drop";
  driverId: string;
  hasPhoto: boolean;
};

export type CheckIn = { check_id: string; user_id: string; location_id: string | null; location_name: string | null; read_at: string; photo_paths: string[]; delivery_id: string | null };
export type CheckReadingIn = { check_id: string; tank_number: string; product_id: string | null; reading: number | null; reading_unit: Unit; water_inches: number | null };
export type DropTankIn = { delivery_id: string; tank_number: string; product_id: string | null; after_reading: number | null; water_reading: number | null; reading_unit: Unit | null };
export type DropIn = { delivery_id: string; location_id: string | null; store: string; at: string; driverId: string };

export function readingRows(o: {
  checks: CheckIn[]; checkReadings: CheckReadingIn[]; drops: DropIn[]; dropTanks: DropTankIn[]; productName: (id: string | null) => string; storeName?: (id: string | null) => string | null;
}): ReadingRow[] {
  const out: ReadingRow[] = [];
  const ticketFor = new Set(o.checks.filter((c) => c.delivery_id && c.photo_paths.length > 0).map((c) => c.delivery_id as string));
  const byCheck = new Map(o.checks.map((c) => [c.check_id, c]));
  for (const r of o.checkReadings) {
    const c = byCheck.get(r.check_id);
    if (!c || r.reading == null) continue;
    out.push({ key: `c|${r.check_id}|${r.tank_number}`, at: c.read_at, locationId: c.location_id, store: c.location_name ?? o.storeName?.(c.location_id) ?? "Store", tank: r.tank_number, productName: o.productName(r.product_id), reading: r.reading, unit: r.reading_unit, water: r.water_inches, kind: "check", driverId: c.user_id, hasPhoto: c.photo_paths.length > 0 });
  }
  const dropOf = new Map(o.drops.map((d) => [d.delivery_id, d]));
  for (const t of o.dropTanks) {
    const d = dropOf.get(t.delivery_id);
    if (!d || t.after_reading == null) continue;
    out.push({ key: `d|${t.delivery_id}|${t.tank_number}`, at: d.at, locationId: d.location_id, store: d.store, tank: t.tank_number, productName: o.productName(t.product_id), reading: t.after_reading, unit: t.reading_unit ?? "gallons", water: t.water_reading, kind: "drop", driverId: d.driverId, hasPhoto: ticketFor.has(t.delivery_id) });
  }
  // By store, then tank (numeric), newest first.
  return out.sort((a, b) => a.store.localeCompare(b.store) || a.tank.localeCompare(b.tank, undefined, { numeric: true }) || b.at.localeCompare(a.at));
}

/** The newest reading of each tank at each store (what a dispatcher wants first). */
export function latestPerTank(rows: ReadingRow[]): ReadingRow[] {
  const seen = new Set<string>();
  const out: ReadingRow[] = [];
  for (const r of [...rows].sort((a, b) => b.at.localeCompare(a.at))) {
    const k = `${r.locationId ?? r.store}|${r.tank.toLowerCase()}`;
    if (seen.has(k)) continue;
    seen.add(k); out.push(r);
  }
  return out.sort((a, b) => a.store.localeCompare(b.store) || a.tank.localeCompare(b.tank, undefined, { numeric: true }));
}

const stamp = (iso: string) => { const d = new Date(iso); return Number.isFinite(d.getTime()) ? `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : ""; };
export const fmtReading = (r: Pick<ReadingRow, "reading" | "unit">) => (r.reading == null ? "" : r.unit === "inches" ? `${r.reading} in` : `${Math.round(r.reading).toLocaleString("en-US")} gal`);

export function readingColumns(nameOf: (id: string) => string): ShellColumn<ReadingRow>[] {
  return [
    { key: "at", label: "When", get: (r) => stamp(r.at), weight: 1 },
    { key: "store", label: "Store", get: (r) => r.store, weight: 1.4 },
    { key: "tank", label: "Tank", get: (r) => r.tank, weight: 0.6 },
    { key: "product", label: "Product", get: (r) => r.productName, weight: 1 },
    { key: "reading", label: "Reading", get: fmtReading, align: "r", weight: 1 },
    { key: "water", label: "Water", get: (r) => (r.water == null ? "" : `${r.water} in`), align: "r", weight: 0.7 },
    { key: "src", label: "From", get: (r) => (r.kind === "drop" ? "After drop" : "Tank check"), weight: 0.9 },
    { key: "driver", label: "Driver", get: (r) => nameOf(r.driverId), weight: 1 },
    { key: "photo", label: "Ticket", get: (r) => (r.hasPhoto ? "Photo" : ""), weight: 0.6 },
  ];
}
export function readingFilters(nameOf: (id: string) => string): ShellFilter<ReadingRow>[] {
  return [
    { id: "store", label: "Store", of: (r) => r.store },
    { id: "src", label: "From", of: (r) => r.kind, show: (v) => (v === "drop" ? "After drop" : "Tank check") },
    { id: "driver", label: "Driver", of: (r) => r.driverId, show: nameOf },
    { id: "product", label: "Product", of: (r) => r.productName },
  ];
}
export const readingSummary = (rows: ReadingRow[]) => [
  { label: "Readings", value: String(rows.length) },
  { label: "Stores", value: String(new Set(rows.map((r) => r.locationId ?? r.store)).size) },
];

/** Driver's reading against a live feed's figure (gallons only). `over` when the gap is past the company tolerance. */
export function feedVariance(reading: number | null, feed: number | null, toleranceGal: number): { diff: number; over: boolean } | null {
  if (reading == null || feed == null || !Number.isFinite(reading) || !Number.isFinite(feed)) return null;
  const diff = reading - feed;
  return { diff, over: Math.abs(diff) > Math.max(0, toleranceGal) };
}
