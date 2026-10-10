// lib/trips/refs.ts
//
// Duplicate checks for the numbers and names a driver enters on a trip:
// order numbers, BOL numbers, suppliers and delivery locations. Pure, so the
// rules are tested without a phone or a database.

import type { SupplierRow, TripCompartmentLoadRow, TripOrderRow, TripRow } from "./types.ts";

// An order or BOL number as compared: case, spaces and dashes don't count, so
// "bol 123-45" and "BOL12345" are the same number.
export function normalizeRef(s: string | null | undefined): string {
  return (s ?? "").toUpperCase().replace(/[\s\-_./]+/g, "");
}

// A name as compared: case and extra spaces don't count.
export function normalizeName(s: string | null | undefined): string {
  return (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

// A name as saved: trimmed, single spaces.
export function cleanName(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

// Numbers entered more than once in the same list (e.g. two order rows with
// the same number). Returns the values as the driver typed them.
export function repeatedRefs(values: (string | null | undefined)[]): string[] {
  const seen = new Map<string, string>();
  const out: string[] = [];
  for (const v of values) {
    const n = normalizeRef(v);
    if (!n) continue;
    if (seen.has(n)) {
      if (!out.some((o) => normalizeRef(o) === n)) out.push(seen.get(n)!);
    } else seen.set(n, String(v).trim());
  }
  return out;
}

// Order numbers already used on another live trip this phone knows about.
// A cancelled trip frees its numbers. `excludeTripId` is the trip being edited.
export function usedOrderNumbers(
  trips: TripRow[],
  orders: TripOrderRow[],
  excludeTripId: string | null,
): Set<string> {
  const live = new Set(trips.filter((t) => t.status !== "cancelled" && t.trip_id !== excludeTripId).map((t) => t.trip_id));
  const out = new Set<string>();
  for (const o of orders) {
    if (!live.has(o.trip_id)) continue;
    const n = normalizeRef(o.order_number);
    if (n) out.add(n);
  }
  return out;
}

// BOL numbers already used by another compartment load (any trip but a
// cancelled one). `excludeIds` are the compartment loads being edited now.
export function usedBolNumbers(
  trips: TripRow[],
  compLoads: TripCompartmentLoadRow[],
  excludeIds: Set<string>,
): Set<string> {
  const cancelled = new Set(trips.filter((t) => t.status === "cancelled").map((t) => t.trip_id));
  const out = new Set<string>();
  for (const c of compLoads) {
    if (excludeIds.has(c.compartment_load_id) || cancelled.has(c.trip_id) || c.disposition === "cancelled") continue;
    const n = normalizeRef(c.bol_number);
    if (n) out.add(n);
  }
  return out;
}

// The values (as typed) that are already in `used`.
export function conflicts(values: (string | null | undefined)[], used: Set<string>): string[] {
  const out: string[] = [];
  for (const v of values) {
    const n = normalizeRef(v);
    if (n && used.has(n) && !out.some((o) => normalizeRef(o) === n)) out.push(String(v).trim());
  }
  return out;
}

export function findSupplier(suppliers: SupplierRow[], name: string): SupplierRow | null {
  const n = normalizeName(name);
  if (!n) return null;
  return suppliers.find((s) => normalizeName(s.name) === n) ?? null;
}

// Suppliers matching a search, active first and alphabetical.
export function searchSuppliers(suppliers: SupplierRow[], query: string): SupplierRow[] {
  const q = normalizeName(query);
  return suppliers
    .filter((s) => s.is_active && (!q || normalizeName(s.name).includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export type LocationDraft = {
  name: string;
  location_number: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
};

type LocationLike = LocationDraft & { location_id: string; is_active?: boolean };

// Existing locations that look like the one being added: same name, same
// number in the same name, or same street address in the same city.
export function similarLocations<L extends LocationLike>(existing: L[], draft: LocationDraft, excludeId?: string | null): L[] {
  const name = normalizeName(draft.name);
  const num = normalizeRef(draft.location_number);
  const addr = normalizeName(draft.address);
  const city = normalizeName(draft.city);
  return existing.filter((l) => {
    if (l.location_id === excludeId || l.is_active === false) return false;
    const lName = normalizeName(l.name);
    if (name && lName === name && normalizeRef(l.location_number) === num) return true;
    if (num && normalizeRef(l.location_number) === num && name && (lName.includes(name) || name.includes(lName))) return true;
    if (addr && normalizeName(l.address) === addr && normalizeName(l.city) === city) return true;
    return false;
  });
}
