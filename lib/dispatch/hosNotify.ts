// lib/dispatch/hosNotify.ts
//
// Which low-hours alerts are NEW since last time: a driver newly under 2 h on a
// clock, or one who got worse (orange -> red). A driver stays quiet until they
// recover (drop off the list), so a clock hovering near the line doesn't
// re-announce. Pure.

import type { HosAlert } from "./hosAlerts.ts";

export type KnownHos = Record<string, "orange" | "red">;

export function diffHosAlerts(known: KnownHos, alerts: HosAlert[]): { fresh: HosAlert[]; next: KnownHos } {
  const next: KnownHos = {};
  const fresh: HosAlert[] = [];
  for (const a of alerts) {
    next[a.userId] = a.level;
    const was = known[a.userId];
    if (!was || (was === "orange" && a.level === "red")) fresh.push(a);
  }
  return { fresh, next };
}

export function hosNotificationBody(fresh: HosAlert[]): { title: string; body: string } {
  if (fresh.length === 1) {
    const a = fresh[0];
    return { title: `${a.driverName} is low on hours`, body: `${a.text}${a.truckName ? ` · Truck ${a.truckName}` : ""}` };
  }
  return { title: `${fresh.length} drivers are low on hours`, body: fresh.map((a) => a.driverName).join(", ") };
}
