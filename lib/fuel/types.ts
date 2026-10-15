// lib/fuel/types.ts
//
// Fuel stops (supabase/migrations/20261015000000_fuel_purchases.sql).

export type MethodKind = "rfid" | "company_account" | "fuel_card";
export type PayKind = MethodKind | "personal_card" | "cash";
export type FuelProducts = "diesel" | "diesel_def";
export type FuelStatus = "fueling" | "pumping" | "details" | "complete";

export type FuelSettings = {
  company_id: string;
  require_receipt: boolean;
  def_enabled: boolean;
  guide_path: string | null;
  guide_name: string | null;
  guide_mime: string | null;
};

export const DEFAULT_FUEL_SETTINGS: Omit<FuelSettings, "company_id"> = {
  require_receipt: false,
  def_enabled: true,
  guide_path: null,
  guide_name: null,
  guide_mime: null,
};

export type FuelMethod = {
  id: string;
  company_id: string;
  kind: MethodKind;
  name: string;
  account_number: string | null;
  card_last4: string | null;
  steps: string[];
  guide_path: string | null;
  guide_name: string | null;
  guide_mime: string | null;
  sort: number;
  is_active: boolean;
};

// One failed try at the pump, kept on the fuel stop.
export type FuelAttempt = {
  pay_kind: PayKind;
  method_id: string | null;
  label: string;
  pump_number: string | null;
  at: string;
};

export type FuelPurchase = {
  id: string;
  company_id: string;
  driver_id: string;
  truck_id: string | null;
  trailer_id: string | null;
  trip_id: string | null;
  status: FuelStatus;
  started_at: string;
  pumping_at: string | null;
  finished_at: string | null;
  completed_at: string | null;
  odometer: number | null;
  products: FuelProducts | null;
  pay_kind: PayKind | null;
  method_id: string | null;
  pump_number: string | null;
  attempts: FuelAttempt[];
  diesel_gallons: number | null;
  def_gallons: number | null;
  filled_to_full: boolean | null;
  store_name: string | null;
  store_number: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  lat: number | null;
  lon: number | null;
  notes: string | null;
};

export type FuelPayment = {
  purchase_id: string;
  company_id: string;
  driver_id: string;
  is_personal: boolean;
  price_per_gallon: number | null;
  diesel_amount: number | null;
  def_amount: number | null;
  total_amount: number | null;
  vault_entry_id: string | null;
  receipt_path: string | null;
};

export const KIND_LABEL: Record<PayKind, string> = {
  rfid: "RFID",
  company_account: "Company account",
  fuel_card: "Fuel card",
  personal_card: "My card",
  cash: "Cash",
};

export const isPersonal = (k: PayKind | null | undefined) => k === "personal_card" || k === "cash";

export const GUIDE_BUCKET = "equipment-docs";
export const RECEIPT_BUCKET = "fuel-receipts";

export function guidePath(companyId: string, fileName: string): string {
  const safe = fileName.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80);
  return `${companyId}/fuel_guides/${crypto.randomUUID()}-${safe}`;
}

export function receiptPath(companyId: string, userId: string, personal: boolean, fileName: string): string {
  const ext = (fileName.match(/\.[A-Za-z0-9]{1,5}$/)?.[0] ?? ".jpg").toLowerCase();
  return `${companyId}/${userId}/${personal ? "personal" : "company"}/${crypto.randomUUID()}${ext}`;
}

// Whole minutes between two times, or null.
export function minutesBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const ms = Date.parse(b) - Date.parse(a);
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 60000)) : null;
}
