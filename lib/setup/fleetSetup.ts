// lib/setup/fleetSetup.ts
//
// The admin's side of driver setup: turn the company_setup_status rows into the same SetupSummary a driver
// sees, so the roster counter and the driver's own counter always agree. Pure.

import { computeSetup, type Confirmations, type SetupFacts, type SetupSummary } from "./driverSetup.ts";

export type FleetCompany = { is_solo?: boolean | null; regions_defined?: boolean; fuel_program?: boolean; telematics?: boolean };
export type FleetMember = {
  user_id: string; role: string; display_name: string | null; employee_number: string | null; region: string | null; local_area: string | null;
  license_number: string | null; license_expiry: string | null; medical_expiry: string | null; schedule_days: number | string;
  has_truck: boolean; has_trailer: boolean; plans_saved: number | string; terminals_starred: number | string; locations_starred: number | string;
  has_fuel_pin: boolean; push_on: boolean; hours_linked: boolean; per_diem_home: boolean; vault_set: boolean;
  confirmations: Record<string, string | null> | null;
};
export type FleetPayload = FleetCompany & { members: FleetMember[] | null };

const n = (v: number | string | null | undefined) => Number(v ?? 0) || 0;

export function factsFromMember(m: FleetMember, c: FleetCompany): SetupFacts {
  return {
    tier: c.is_solo === false ? "fleet" : "solo",
    profile: { displayName: m.display_name, employeeNumber: m.employee_number, region: m.region, localArea: m.local_area },
    regionsDefined: !!c.regions_defined,
    license: { number: m.license_number, expiry: m.license_expiry },
    medical: { expiry: m.medical_expiry },
    scheduleDays: n(m.schedule_days),
    hasTruck: !!m.has_truck, hasTrailer: !!m.has_trailer,
    plansSaved: n(m.plans_saved), terminalsStarred: n(m.terminals_starred), locationsStarred: n(m.locations_starred),
    fuelProgram: !!c.fuel_program, hasFuelPin: !!m.has_fuel_pin,
    // The admin can't know what a driver's phone supports; count it so an unfinished one shows as open.
    pushSupported: true, pushOn: !!m.push_on,
    telematicsConnected: !!c.telematics, hoursLinked: !!m.hours_linked,
    hasPerDiemHome: !!m.per_diem_home, vaultSet: !!m.vault_set,
  };
}

export type FleetRow = { userId: string; name: string; role: string; summary: SetupSummary };

/** One summary per driver and lead, in the order given (the database sorts by name). */
export function summarizeFleet(p: FleetPayload | null | undefined): FleetRow[] {
  if (!p) return [];
  return (p.members ?? []).map((m) => ({
    userId: m.user_id,
    name: (m.display_name ?? "").trim() || "Unnamed driver",
    role: m.role,
    summary: computeSetup(factsFromMember(m, p), (m.confirmations ?? {}) as Confirmations),
  }));
}

/** What the admin reads on a step row (the driver's wording talks to the driver). */
export function adminDetail(status: string, detail: string): string {
  if (status === "confirm") return "Set up, waiting for the driver to confirm";
  if (status === "needs") return detail.replace(/^Needed: /, "Missing: ");
  return detail;
}
