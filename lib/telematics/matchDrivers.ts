// lib/telematics/matchDrivers.ts
//
// Pairs the provider's drivers with the company's members: employee number,
// then the sign-in name / email, then first + last name. Pure.

import type { ProviderDriver } from "./types.ts";

export type Member = { user_id: string; email: string | null; display_name: string | null; employee_number: string | null };
export type DriverPair = { driver: ProviderDriver; member: Member; by: "employee" | "email" | "name" };

const n = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

export function matchDrivers(drivers: ProviderDriver[], members: Member[]) {
  const pairs: DriverPair[] = [];
  const usedM = new Set<string>(), usedD = new Set<string>();
  const take = (d: ProviderDriver, m: Member, by: DriverPair["by"]) => { pairs.push({ driver: d, member: m, by }); usedD.add(d.id); usedM.add(m.user_id); };
  const free = (f: (m: Member) => boolean) => { const h = members.filter((m) => !usedM.has(m.user_id) && f(m)); return h.length === 1 ? h[0] : null; };

  for (const d of drivers) {
    const e = n(d.employeeNo);
    if (!e) continue;
    const m = free((x) => n(x.employee_number) === e);
    if (m) take(d, m, "employee");
  }
  for (const d of drivers) {
    if (usedD.has(d.id)) continue;
    const login = (d.name ?? "").toLowerCase().trim();
    if (!login.includes("@")) continue;
    const m = free((x) => (x.email ?? "").toLowerCase().trim() === login);
    if (m) take(d, m, "email");
  }
  for (const d of drivers) {
    if (usedD.has(d.id)) continue;
    const full = n(`${d.firstName ?? ""}${d.lastName ?? ""}`);
    if (!full) continue;
    const m = free((x) => n(x.display_name) === full);
    if (m) take(d, m, "name");
  }
  return {
    pairs,
    unmatchedDrivers: drivers.filter((d) => !usedD.has(d.id)),
    unmatchedMembers: members.filter((m) => !usedM.has(m.user_id)),
  };
}
