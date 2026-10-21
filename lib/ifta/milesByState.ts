// lib/ifta/milesByState.ts
//
// Miles driven in each state from a truck's GPS trail, scaled to the odometer.
// The states come from US Census boundaries at 1:10 million (us-atlas), so a
// state line can be off by a mile or so: good for a working IFTA figure, not a
// certified one. Points outside the 50 states count under "OUT".
// Pure: the boundary data is passed in.

import { feature } from "topojson-client";
import { airMiles, type LatLon } from "../trips/deliveryLocations.ts";
import { stateCode } from "../geo/usStates.ts";

type Ring = [number, number][]; // [lon, lat]
type Shape = { code: string; polys: Ring[][]; bbox: [number, number, number, number] };

export type StateOf = (lat: number, lon: number) => string | null;

function inRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Builds a point -> state-code lookup from the us-atlas `states-10m` topology. */
export function makeStateOf(topology: any): StateOf {
  const fc: any = feature(topology, topology.objects.states);
  const shapes: Shape[] = [];
  for (const f of fc.features) {
    const code = stateCode(f.properties?.name);
    if (!code) continue;
    const polys: Ring[][] = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    let minX = 180, minY = 90, maxX = -180, maxY = -90;
    for (const p of polys) for (const [x, y] of p[0]) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    shapes.push({ code, polys, bbox: [minX, minY, maxX, maxY] });
  }
  return (lat, lon) => {
    for (const s of shapes) {
      const [a, b, c, d] = s.bbox;
      if (lon < a || lon > c || lat < b || lat > d) continue;
      for (const poly of s.polys) {
        if (inRing(lon, lat, poly[0]) && !poly.slice(1).some((h) => inRing(lon, lat, h))) return s.code;
      }
    }
    return null;
  };
}

export type TrailPoint = { lat: number; lon: number; at: string };

/** Straight-line miles between consecutive points, each credited to the state
 * the segment starts in. Segments that imply an impossible speed (a GPS jump)
 * are dropped. */
export function milesByState(points: TrailPoint[], stateOf: StateOf): Record<string, number> {
  const out: Record<string, number> = {};
  const pts = [...points].sort((a, b) => a.at.localeCompare(b.at));
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const miles = airMiles({ lat: a.lat, lon: a.lon } as LatLon, { lat: b.lat, lon: b.lon } as LatLon);
    const hours = (Date.parse(b.at) - Date.parse(a.at)) / 3600000;
    if (hours > 0 && miles / hours > 120) continue;
    if (miles < 0.005) continue;
    const st = stateOf(a.lat, a.lon) ?? "OUT";
    out[st] = (out[st] ?? 0) + miles;
  }
  return out;
}

/** Straight-line GPS miles run a little short of the road (curves between
 * points), so scale the split to the odometer's true total when the two agree
 * to within 25%. Otherwise keep the GPS figures. */
export function scaleToOdometer(byState: Record<string, number>, odometerMiles: number | null): Record<string, number> {
  const gps = Object.values(byState).reduce((s, x) => s + x, 0);
  if (odometerMiles == null || !Number.isFinite(odometerMiles) || odometerMiles <= 0 || gps <= 0) return byState;
  const k = odometerMiles / gps;
  if (k < 0.75 || k > 1.25) return byState;
  return Object.fromEntries(Object.entries(byState).map(([s, m]) => [s, m * k]));
}
