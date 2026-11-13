// lib/shifts/trailStops.ts
//
// Turns a truck's GPS trail into the stops it made and the drives between them, so the end-of-shift catch-up can ask
// about the parts of the day the app never saw. Pure: no network, no clock.

export type TrailPt = { lat: number; lon: number; at: string };
export type Stop = { lat: number; lon: number; from: string; to: string; minutes: number };
export type Drive = { from: Stop; to: Stop; startAt: string; endAt: string; minutes: number; miles: number };

const R_MI = 3958.8;
export function miles(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R_MI * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * A stop is the truck staying within `radiusMi` of where it stopped for at least `minMinutes`. The first and last
 * positions always count as stops (where the window began and ended), however short.
 */
export function detectStops(points: TrailPt[], o: { radiusMi?: number; minMinutes?: number } = {}): Stop[] {
  const radius = o.radiusMi ?? 0.1, minMin = o.minMinutes ?? 5;
  const pts = [...points].sort((a, b) => a.at.localeCompare(b.at));
  if (pts.length === 0) return [];
  const mk = (cl: TrailPt[]): Stop => {
    const lat = cl.reduce((s, p) => s + p.lat, 0) / cl.length, lon = cl.reduce((s, p) => s + p.lon, 0) / cl.length;
    const from = cl[0].at, to = cl[cl.length - 1].at;
    return { lat, lon, from, to, minutes: Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 60_000)) };
  };
  const stops: Stop[] = [];
  let cl: TrailPt[] = [pts[0]];
  const close = (edge: boolean) => {
    const s = mk(cl);
    if (edge || s.minutes >= minMin) stops.push(s);
  };
  for (let i = 1; i < pts.length; i++) {
    if (miles(cl[0], pts[i]) <= radius) { cl.push(pts[i]); continue; }
    close(stops.length === 0);
    cl = [pts[i]];
  }
  close(true);
  // Merge neighbors at the same place (a long stop the trail split).
  const merged: Stop[] = [];
  for (const s of stops) {
    const prev = merged[merged.length - 1];
    if (prev && miles(prev, s) <= radius) merged[merged.length - 1] = { ...prev, to: s.to, minutes: Math.round((Date.parse(s.to) - Date.parse(prev.from)) / 60_000) };
    else merged.push(s);
  }
  return merged;
}

/** The drives between consecutive stops, with the distance along the trail. */
export function drivesBetween(points: TrailPt[], stops: Stop[]): Drive[] {
  const pts = [...points].sort((a, b) => a.at.localeCompare(b.at));
  const out: Drive[] = [];
  for (let i = 0; i + 1 < stops.length; i++) {
    const a = stops[i], b = stops[i + 1];
    const seg = pts.filter((p) => p.at >= a.to && p.at <= b.from);
    let mi = 0;
    const chain = [{ lat: a.lat, lon: a.lon }, ...seg, { lat: b.lat, lon: b.lon }];
    for (let k = 1; k < chain.length; k++) mi += miles(chain[k - 1], chain[k]);
    out.push({ from: a, to: b, startAt: a.to, endAt: b.from, minutes: Math.max(0, Math.round((Date.parse(b.from) - Date.parse(a.to)) / 60_000)), miles: Math.round(mi * 10) / 10 });
  }
  return out;
}
