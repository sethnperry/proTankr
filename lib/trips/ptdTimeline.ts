// lib/trips/ptdTimeline.ts
//
// The last page of the PTD: every timestamp on the trip told in order. The
// record page carries no times; they all live here.

import type { Ptd } from "./ptd.ts";

export type TimelineKind = "trip" | "pickup" | "delivery" | "delay" | "note";
export type TimelineEntry = { at: string; kind: TimelineKind; text: string; detail?: string | null };

const mins = (n: number | null | undefined) => (n == null ? "" : n >= 60 ? `${Math.floor(n / 60)} h ${n % 60} min` : `${n} min`);

export function buildTimeline(ptd: Ptd): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  const add = (at: string | null | undefined, kind: TimelineKind, text: string, detail?: string | null) => {
    if (at && Number.isFinite(Date.parse(at))) out.push({ at, kind, text, detail: detail ?? null });
  };

  add(ptd.startedAt, "trip", "Trip begun", ptd.beginMiles != null ? `Begin miles ${ptd.beginMiles.toLocaleString("en-US")}` : null);

  for (const p of ptd.pickups) {
    add(p.arrivedAt, "pickup", `Arrived at ${p.name}`);
    if (p.beginAt) {
      const wait = p.delayMinutes != null && p.delayMinutes > 0 ? `Waited ${mins(p.delayMinutes)}${p.delayReason ? `: ${p.delayReason}` : ""}` : null;
      add(p.beginAt, "pickup", p.noLoad ? "Began loading" : "Began loading", wait);
    }
    for (const w of p.supplierSwitches) add(w.at, "pickup", `Supplier switched ${w.from} → ${w.to}`, `${w.reason}${w.note ? ` (${w.note})` : ""}`);
    if (p.noLoad) add(p.leftAt, "pickup", `Left ${p.name}, couldn't load`, p.noLoadReason);
    else add(p.leftAt, "pickup", `Departed ${p.name}`);
  }
  for (const s of ptd.loadingSigs) add(s.at, "pickup", `${s.name} signed as loading driver`, "Signed electronically");

  for (const d of ptd.delays) {
    add(d.startedAt, "delay", `Delay · ${d.label}`, `${mins(d.minutes)}${d.note ? ` · ${d.note}` : ""} (ended ${new Date(d.endedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })})`);
  }

  for (const p of ptd.parks) {
    add(p.parkedAt, "trip", "Trailer parked preloaded", [p.where ? `At ${p.where}` : null, p.note].filter(Boolean).join(" · ") || null);
    add(p.resumedAt, "trip", "Trip resumed");
  }
  for (const c of ptd.truckChanges) {
    add(c.at, "trip", `Truck changed ${c.fromName ?? "?"} → ${c.toName ?? "?"}`,
      c.fromOdometer != null || c.toOdometer != null ? `Miles ${c.fromOdometer?.toLocaleString("en-US") ?? "?"} → ${c.toOdometer?.toLocaleString("en-US") ?? "?"}` : null);
  }
  for (const e of ptd.trailerEvents) add(e.at, "trip", e.type === "hook" ? "Trailer hooked" : "Trailer dropped", [e.trailerName, e.place].filter(Boolean).join(" · ") || null);

  for (const d of ptd.deliveries) {
    const pump = d.deliveryType === "pump_off";
    add(d.arrivedAt, "delivery", `Arrived at ${d.name}`);
    add(d.beginAt, "delivery", pump ? "Began pumping" : "Began delivering",
      d.delayMinutes != null && d.delayMinutes > 0 ? `Waited ${mins(d.delayMinutes)}${d.delayReason ? `: ${d.delayReason}` : ""}` : null);
    add(d.driverSignedAt, "delivery", `${d.driver ?? "Driver"} signed as delivering driver`, "Signed electronically");
    add(d.leftAt, "delivery", `Departed ${d.name}`);
  }

  if (ptd.cancellation) add(ptd.cancellation.at, "trip", "Load cancelled", ptd.cancellation.reasons.join(" → ") || null);
  add(ptd.completedAt, "trip", "Trip complete", ptd.endMiles != null ? `End miles ${ptd.endMiles.toLocaleString("en-US")}` : null);

  return out.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}
