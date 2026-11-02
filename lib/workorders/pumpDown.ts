// lib/workorders/pumpDown.ts
//
// A pump that is down becomes one work order. Pure: builds the subject and detail from the fuel stop and the
// attempt that was just recorded. `sourceRef` is the fuel stop, so the list can link back to it.

import type { FuelAttempt, FuelPurchase } from "../fuel/types.ts";

export type PumpDownWorkOrder = { subject: string; sourceRef: string; truckId: string | null; detail: Record<string, unknown> };

export function pumpDownWorkOrder(p: FuelPurchase, a: FuelAttempt): PumpDownWorkOrder {
  const where = [p.store_name, p.store_number ? `#${p.store_number}` : null].filter(Boolean).join(" ");
  const place = [a.city ?? p.city, (a.state ?? p.state)?.toUpperCase()].filter(Boolean).join(", ");
  const pump = a.pump_number ?? p.pump_number;
  const subject = [`${pump ? `Pump ${pump}` : "Pump"} down`, where || null, place || null].filter(Boolean).join(" · ");
  return {
    subject,
    sourceRef: p.id,
    truckId: p.truck_id ?? null,
    detail: { issue: a.issue, pay_kind: a.pay_kind, method: a.label, pump_number: pump, store_name: p.store_name, store_number: p.store_number, city: a.city ?? p.city, state: a.state ?? p.state, at: a.at },
  };
}
