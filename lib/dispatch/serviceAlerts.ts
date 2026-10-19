// lib/dispatch/serviceAlerts.ts
//
// Dispatch Dashboard, PLAN mode: service coming due on every active unit,
// reusing lib/equipment/unitAlerts.ts (the same math as the Truck/Trailer
// squares on the Driver Dashboard). Pure: takes rows already fetched.

import { unitAlerts, type OdometerPoint, type ServiceRecordInput, type ServiceTypeInput } from "../equipment/unitAlerts.ts";
import type { PlanAlert } from "./planAlerts.ts";

export type ServiceInputs = {
  trucks: Map<string, string>;   // active units only
  trailers: Map<string, string>;
  types: ServiceTypeInput[];
  records: (ServiceRecordInput & { truck_id: string | null; trailer_id: string | null })[];
  trips: { truck_id: string | null; begin_miles: number | null; end_miles: number | null; created_at: string; completed_at: string | null }[];
};

function plusDays(todayIso: string, n: number): string {
  const [y, m, d] = todayIso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function serviceAlerts(input: ServiceInputs, nowMs: number = Date.now()): PlanAlert[] {
  const todayIso = new Date(nowMs).toISOString().slice(0, 10);
  const out: PlanAlert[] = [];
  const run = (unit: "truck" | "trailer", id: string, name: string) => {
    const records = input.records.filter((r) => (unit === "truck" ? r.truck_id : r.trailer_id) === id);
    const odometer: OdometerPoint[] = [];
    if (unit === "truck") {
      for (const t of input.trips) {
        if (t.truck_id !== id) continue;
        if (t.begin_miles != null) odometer.push({ miles: Number(t.begin_miles), at: t.created_at });
        if (t.end_miles != null) odometer.push({ miles: Number(t.end_miles), at: t.completed_at ?? t.created_at });
      }
    }
    const s = unitAlerts({ unit, permits: [], types: input.types, records, odometer, todayIso, nowMs });
    s.alerts.filter((a) => a.kind === "service").forEach((a, i) => {
      out.push({
        key: `s:${unit}:${id}:${i}`, kind: "service",
        subject: `${unit === "truck" ? "Truck" : "Trailer"} ${name}`, subjectId: id, isEquipment: true,
        label: `${a.name} service`, iso: plusDays(todayIso, a.days), days: a.days, state: a.state,
      });
    });
  };
  for (const [id, name] of input.trucks) run("truck", id, name);
  for (const [id, name] of input.trailers) run("trailer", id, name);
  return out;
}
