// lib/telematics/progress.ts
//
// Turns a truck's live position into where its dot sits on a trip's route and
// a short status line. Pure.

import { airMiles, type LatLon } from "../trips/deliveryLocations.ts";

export type LivePos = { lat: number; lon: number; speedMph: number | null; at: string | null; trailerId?: string | null };

/** How far along prev -> next the truck is (0..1), by straight-line distance.
 * Null when we can't tell (a stop has no coordinates). */
export function fractionAlong(prev: LatLon | null, truck: LatLon, next: LatLon | null): number | null {
  if (!prev || !next) return null;
  const a = airMiles(prev, truck), b = airMiles(truck, next);
  if (a + b < 0.05) return 1;
  return Math.max(0.03, Math.min(0.97, a / (a + b)));
}

/** A point `t` (0..1) of the way along a polyline, by length. */
export function pointAlong(pts: [number, number][], t: number): [number, number] {
  const lens = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
  const total = lens.reduce((s, x) => s + x, 0) || 1;
  let want = Math.max(0, Math.min(1, t)) * total;
  for (let i = 0; i < lens.length; i++) {
    if (want <= lens[i] || i === lens.length - 1) {
      const k = lens[i] ? want / lens[i] : 0;
      return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k];
    }
    want -= lens[i];
  }
  return pts[pts.length - 1];
}

export const STALE_MIN = 15;

/** "58 mph · 42 mi to Citgo · 2 min ago", or "last seen 3 h ago" when old. */
export function liveLine(p: LivePos, nextName: string | null, nextLL: LatLon | null, now: Date): { text: string; stale: boolean } {
  const ageMin = p.at ? Math.max(0, Math.round((now.getTime() - Date.parse(p.at)) / 60000)) : null;
  const ago = ageMin == null ? "" : ageMin < 1 ? "just now" : ageMin < 60 ? `${ageMin} min ago` : `${Math.round(ageMin / 60)} h ago`;
  const stale = ageMin != null && ageMin > STALE_MIN;
  if (stale) return { text: `last seen ${ago}`, stale };
  const parts: string[] = [];
  parts.push(p.speedMph != null && p.speedMph >= 3 ? `${p.speedMph} mph` : "stopped");
  if (nextLL && nextName) parts.push(`${Math.round(airMiles({ lat: p.lat, lon: p.lon }, nextLL))} mi to ${nextName}`);
  if (ago) parts.push(ago);
  return { text: parts.join(" · "), stale };
}

/** The polyline's vertices that come before the point `t` of the way along it. */
export function pointsUpTo(pts: [number, number][], t: number): [number, number][] {
  const lens = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
  const total = lens.reduce((s, x) => s + x, 0) || 1;
  const want = Math.max(0, Math.min(1, t)) * total;
  const out: [number, number][] = [pts[0]];
  let run = 0;
  for (let i = 0; i < lens.length; i++) {
    if (run + lens[i] >= want) break;
    run += lens[i];
    out.push(pts[i + 1]);
  }
  return out;
}

const STATUS_LABEL: Record<string, string> = { D: "Driving", ON: "On duty", OFF: "Off duty", SB: "Sleeper", PC: "Personal conveyance", YM: "Yard move" };

/** "6.5 h drive · 9.0 h window · On duty", colored by how little is left. */
const OFF_CODES = new Set(["OFF", "SB", "PC"]);
export const RESET_MIN = 600; // the 10-hour off-duty reset

/** How long a driver has been off duty and when the 10-hour reset completes. Null unless they're off duty with a known start. */
export function resetInfo(h: { status: string | null; offSince?: string | null }, nowMs: number = Date.now()): { offMin: number; resetInMin: number; resetAtMs: number } | null {
  if (!h.status || !OFF_CODES.has(h.status) || !h.offSince) return null;
  const since = Date.parse(h.offSince);
  if (!Number.isFinite(since)) return null;
  const offMin = Math.max(0, (nowMs - since) / 60000);
  return { offMin, resetInMin: Math.max(0, RESET_MIN - offMin), resetAtMs: since + RESET_MIN * 60000 };
}

export function hosText(h: { driveLeftMin: number | null; dutyLeftMin: number | null; status: string | null; at: string; statusSince?: string | null; offSince?: string | null }, nowMs: number = Date.now()): { text: string; color: string } {
  const hrs = (m: number) => `${(Math.max(0, m) / 60).toFixed(1)} h`;
  const parts: string[] = [];
  if (h.driveLeftMin != null) parts.push(`${hrs(h.driveLeftMin)} drive`);
  if (h.dutyLeftMin != null) parts.push(`${hrs(h.dutyLeftMin)} window`);
  if (h.status) {
    const name = STATUS_LABEL[h.status] ?? h.status;
    const rs = resetInfo(h, nowMs);
    const sinceMin = h.statusSince && Number.isFinite(Date.parse(h.statusSince)) ? Math.max(0, (nowMs - Date.parse(h.statusSince)) / 60000) : null;
    if (rs) {
      parts.push(`${name} ${hrs(rs.offMin)}`);
      parts.push(rs.resetInMin > 0 ? `10 h reset in ${hrs(rs.resetInMin)}` : "10 h reset done");
    } else parts.push(sinceMin != null ? `${name} ${hrs(sinceMin)}` : name);
  }
  const least = Math.min(h.driveLeftMin ?? Infinity, h.dutyLeftMin ?? Infinity);
  const ageMin = Math.round((nowMs - Date.parse(h.at)) / 60000);
  if (ageMin > 10) parts.push(`${ageMin} min old`);
  return { text: parts.join(" · "), color: least < 60 ? "#f87171" : least < 120 ? "#fb923c" : "rgba(255,255,255,0.5)" };
}

/** Rough driving time left to run the remaining stops in order, from the truck's
 * position: straight-line miles x 1.25 at 45 mph. Stops without coordinates are
 * skipped, so it can only under-count. */
export function remainingDriveMin(from: LatLon, stops: (LatLon | null)[]): number {
  let at = from, miles = 0;
  for (const s of stops) {
    if (!s) continue;
    miles += airMiles(at, s) * 1.25;
    at = s;
  }
  return (miles / 45) * 60;
}

export const STATUS_NAME: Record<string, string> = STATUS_LABEL;

/** "6:30" from minutes left (for the driver's own clock cells). */
export function clockHM(min: number | null): string {
  if (min == null || !Number.isFinite(min)) return "—";
  const m = Math.max(0, Math.round(min));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

/** Color for one clock by minutes left: red under 1 h, orange under 2 h. */
export function clockColor(min: number | null): string {
  if (min == null) return "rgba(255,255,255,0.5)";
  return min < 60 ? "#f87171" : min < 120 ? "#fb923c" : "#fff";
}

export const LOAD_STOP_MIN = 60; // time at a rack still to load at
export const DROP_STOP_MIN = 45; // time at a delivery

/** Will the driver's clocks cover the rest of the trip? Driving left vs the
 * driving still to do, and the 14-hour window vs driving plus time at the
 * stops. `stopMin` is the on-duty time at the stops ahead. Both estimates
 * only count stops with known coordinates, so they can under-count; the text
 * says "about". Null when it is fine. */
export function tripHosCheck(o: { driveLeftMin: number | null; dutyLeftMin: number | null; remainingDriveMin: number; stopMin: number }): { level: "warn" | "bad"; text: string } | null {
  const h = (m: number) => `${(Math.max(0, m) / 60).toFixed(1)} h`;
  const needWindow = o.remainingDriveMin + o.stopMin;
  if (o.driveLeftMin != null && o.remainingDriveMin > o.driveLeftMin) {
    return { level: "bad", text: `The rest of this trip needs about ${h(o.remainingDriveMin)} of driving and you have ${h(o.driveLeftMin)} left. Plan a break or a place to park.` };
  }
  if (o.dutyLeftMin != null && needWindow > o.dutyLeftMin) {
    return { level: "bad", text: `Finishing this trip takes about ${h(needWindow)} including stops and your window has ${h(o.dutyLeftMin)} left.` };
  }
  if (o.driveLeftMin != null && o.driveLeftMin - o.remainingDriveMin < 30) {
    return { level: "warn", text: `Tight: about ${h(o.driveLeftMin - o.remainingDriveMin)} of driving to spare. Trip needs about ${h(o.remainingDriveMin)}, you have ${h(o.driveLeftMin)}.` };
  }
  if (o.dutyLeftMin != null && o.dutyLeftMin - needWindow < 30) {
    return { level: "warn", text: `Tight: about ${h(o.dutyLeftMin - needWindow)} to spare in your window. Trip needs about ${h(o.remainingDriveMin)} driving + ${h(o.stopMin)} at stops, window has ${h(o.dutyLeftMin)}.` };
  }
  return null;
}
