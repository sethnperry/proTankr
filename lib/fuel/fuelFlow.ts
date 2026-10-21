// lib/fuel/fuelFlow.ts
//
// The steps of a fuel stop, as pure functions over the purchase row:
// tap Fuel (start time) → pick a payment method → pump running (or didn't
// work: the try and its pump number are kept) → finish fueling (end time) →
// details (receipt, store, gallons) → complete.

import type { FuelAttempt, FuelProducts, FuelPurchase, PayKind } from "./types";

export function newFuelStop(args: {
  id: string; companyId: string; driverId: string; truckId: string | null; trailerId: string | null;
  tripId: string | null; now: string; lastPump?: string | null;
}): FuelPurchase {
  return {
    id: args.id, company_id: args.companyId, driver_id: args.driverId,
    truck_id: args.truckId, trailer_id: args.trailerId, trip_id: args.tripId,
    status: "fueling", started_at: args.now, pumping_at: null, finished_at: null, completed_at: null,
    odometer: null, products: null, pay_kind: null, method_id: null, pump_number: args.lastPump ?? null,
    attempts: [], diesel_gallons: null, def_gallons: null, filled_to_full: null,
    store_name: null, store_number: null, address: null, city: null, state: null, lat: null, lon: null, notes: null,
  };
}

export type PumpEntry = {
  payKind: PayKind;
  methodId: string | null;
  label: string;
  pumpNumber: string;
  odometer: string;
  products: FuelProducts;
};

const num = (s: string): number | null => {
  const n = Number(String(s).replace(/[,$]/g, ""));
  return s.trim() !== "" && Number.isFinite(n) ? n : null;
};

// The method didn't work. Keeps the try with the pump number at that moment.
export function recordFailedTry(p: FuelPurchase, e: PumpEntry, now: string): FuelPurchase {
  const attempt: FuelAttempt = {
    pay_kind: e.payKind, method_id: e.methodId, label: e.label,
    pump_number: e.pumpNumber.trim() || null, at: now,
  };
  return {
    ...p,
    attempts: [...(p.attempts ?? []), attempt],
    pump_number: e.pumpNumber.trim() || p.pump_number,
    odometer: num(e.odometer) ?? p.odometer,
    products: e.products,
    status: "fueling",
    pumping_at: null,
  };
}

// RFID / company account: Finished Fueling ends the stop. Odometer, gallons
// (for MPG) and the time; price comes from the fuel network.
export function finishQuick(
  p: FuelPurchase,
  e: { payKind: PayKind; methodId: string | null; odometer: string; gallons: string; filledToFull: boolean; pos?: { lat: number; lon: number } | null; city?: string; state?: string },
  now: string,
): FuelPurchase {
  return {
    ...p,
    // Where it happened, for IFTA: keep what's there, else the place worked out from the truck or phone.
    city: p.city ?? (e.city?.trim() || null),
    state: p.state ?? (e.state?.trim().toUpperCase() || null),
    status: "complete",
    pay_kind: e.payKind,
    method_id: e.methodId,
    odometer: num(e.odometer) ?? p.odometer,
    diesel_gallons: num(e.gallons),
    filled_to_full: e.filledToFull,
    lat: e.pos?.lat ?? p.lat,
    lon: e.pos?.lon ?? p.lon,
    products: null,
    finished_at: now,
    completed_at: now,
  };
}

// RFID / company account: the pump is down. Keeps where, which pump and what
// was wrong, then the driver picks another method.
export function recordPumpDown(
  p: FuelPurchase,
  e: { payKind: PayKind; methodId: string | null; label: string; pumpNumber: string; issue: string; storeName: string; storeNumber?: string; city: string; state: string; pos?: { lat: number; lon: number } | null },
  now: string,
): FuelPurchase {
  const t = (s: string) => s.trim() || null;
  const attempt: FuelAttempt = {
    pay_kind: e.payKind, method_id: e.methodId, label: e.label, pump_number: t(e.pumpNumber), at: now,
    issue: t(e.issue), store_name: t(e.storeName), city: t(e.city), state: t(e.state)?.toUpperCase() ?? null,
  };
  return {
    ...p,
    attempts: [...(p.attempts ?? []), attempt],
    pump_number: t(e.pumpNumber) ?? p.pump_number,
    store_name: p.store_name ?? attempt.store_name ?? null,
    store_number: p.store_number ?? t(e.storeNumber ?? ""),
    lat: p.lat ?? e.pos?.lat ?? null,
    lon: p.lon ?? e.pos?.lon ?? null,
    city: p.city ?? attempt.city ?? null,
    state: p.state ?? attempt.state ?? null,
    status: "fueling",
    pumping_at: null,
  };
}

// Card or cash: Finished Fueling stamps the end time and goes to the details
// (receipt, store, gallons, amounts). No separate "pump running" step.
export function finishToDetails(p: FuelPurchase, e: { payKind: PayKind; methodId: string | null; odometer: string; products: FuelProducts }, now: string): FuelPurchase {
  return {
    ...p,
    status: "details",
    pay_kind: e.payKind,
    method_id: e.methodId,
    odometer: num(e.odometer) ?? p.odometer,
    products: e.products,
    pumping_at: null,
    finished_at: now,
  };
}

export function startPumping(p: FuelPurchase, e: PumpEntry, now: string): FuelPurchase {
  return {
    ...p,
    status: "pumping",
    pumping_at: now,
    pay_kind: e.payKind,
    method_id: e.methodId,
    pump_number: e.pumpNumber.trim() || null,
    odometer: num(e.odometer),
    products: e.products,
  };
}

export function finishFueling(p: FuelPurchase, now: string): FuelPurchase {
  return { ...p, status: "details", finished_at: p.finished_at ?? now };
}

export type FuelDetails = {
  dieselGallons: string;
  filledToFull: boolean;
  storeName: string;
  storeNumber: string;
  city: string;
  state: string;
  notes: string;
  hasReceipt: boolean;
  // Where the store is (picked store's position, or the phone's for a new one).
  pos?: { lat: number; lon: number } | null;
};

// What still has to be filled in before the stop can be completed.
export function missingForComplete(p: FuelPurchase, d: FuelDetails, requireReceipt: boolean, total?: string): string[] {
  const out: string[] = [];
  if (!p.pay_kind) out.push("How it was paid");
  if (num(d.dieselGallons) == null) out.push("Diesel gallons");
  if (total != null && num(total) == null) out.push("Total cost");
  if (!d.storeName.trim()) out.push("Store");
  if (requireReceipt && !d.hasReceipt) out.push("Receipt photo");
  return out;
}

export function completeStop(p: FuelPurchase, d: FuelDetails, now: string): FuelPurchase {
  return {
    ...p,
    status: "complete",
    completed_at: now,
    finished_at: p.finished_at ?? now,
    diesel_gallons: num(d.dieselGallons),
    def_gallons: null,
    lat: d.pos?.lat ?? p.lat,
    lon: d.pos?.lon ?? p.lon,
    filled_to_full: d.filledToFull,
    store_name: d.storeName.trim() || null,
    store_number: d.storeNumber.trim() || null,
    city: d.city.trim() || null,
    state: d.state.trim().toUpperCase() || null,
    notes: d.notes.trim() || null,
  };
}

// The money side: gallons and the total cost. Price per gallon is worked out
// from them (total ÷ gallons) for the history, never typed.
export function paymentAmounts(args: { dieselGallons: string; total: string }) {
  const g = num(args.dieselGallons);
  const total = num(args.total);
  const ppg = g && total != null ? Math.round((total / g) * 1000) / 1000 : null;
  return { diesel_amount: null, def_amount: null, total_amount: total, price_per_gallon: ppg };
}

// Which receipt rule applies: company cards and out-of-pocket each have their
// own (both default to required). RFID / company account never ask.
export function receiptRequired(kind: PayKind | null, s: { require_receipt_company_card?: boolean; require_receipt_personal?: boolean } | null): boolean {
  if (kind === "fuel_card") return s?.require_receipt_company_card ?? true;
  if (kind === "personal_card" || kind === "cash") return s?.require_receipt_personal ?? true;
  return false;
}

// Methods tried and failed on this stop, for marking the grid.
export function failedKeys(p: FuelPurchase): Set<string> {
  return new Set((p.attempts ?? []).map((a) => a.method_id ?? a.pay_kind));
}

// Fill-to-fill MPG for one truck. A full fill closes a window: miles since the
// previous full fill, over all diesel bought after it (partial fills included).
// Returns MPG keyed by the closing stop's id; average over all windows too.
export function fillToFillMpg(stops: { id: string; started_at: string; odometer: number | null; diesel_gallons: number | null; filled_to_full: boolean | null }[]) {
  const sorted = [...stops].filter((s) => s.odometer != null).sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at));
  const byId: Record<string, number> = {};
  let lastFull: (typeof sorted)[number] | null = null;
  let gallons = 0;
  let miles = 0;
  let totalGal = 0;
  for (const s of sorted) {
    if (lastFull) gallons += Number(s.diesel_gallons ?? 0);
    if (s.filled_to_full) {
      if (lastFull && gallons > 0) {
        const m = Number(s.odometer) - Number(lastFull.odometer);
        if (m > 0) {
          byId[s.id] = Math.round((m / gallons) * 100) / 100;
          miles += m;
          totalGal += gallons;
        }
      }
      lastFull = s;
      gallons = 0;
    }
  }
  return { byId, average: totalGal > 0 ? Math.round((miles / totalGal) * 100) / 100 : null };
}
