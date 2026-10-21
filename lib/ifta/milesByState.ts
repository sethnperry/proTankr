// lib/ifta/milesByState.ts
//
// Miles driven in each state from a truck's GPS trail, scaled to the odometer.
// The states come from US Census boundaries at 1:10 million (us-atlas), so a
// state line can be off by a mile or so: good for a working IFTA figure, not a
// certified one. Points outside the 50 states and the Canadian provinces count under "OUT".
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

function shapeOf(code: string, geometry: any): Shape {
  const polys: Ring[][] = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  for (const p of polys) for (const [x, y] of p[0]) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  return { code, polys, bbox: [minX, minY, maxX, maxY] };
}

/** Builds a point -> state-code lookup from the us-atlas `states-10m` topology.
 * With `canada` (GeoJSON features carrying a province `code`), provinces are
 * found too. The 50 states are checked first, so where the two boundary sets
 * overlap along the border the US wins. */
export function makeStateOf(topology: any, canada?: any): StateOf {
  const fc: any = feature(topology, topology.objects.states);
  const shapes: Shape[] = [];
  for (const f of fc.features) {
    const code = stateCode(f.properties?.name);
    if (code) shapes.push(shapeOf(code, f.geometry));
  }
  const nUS = shapes.length;
  for (const f of canada?.features ?? []) if (f.properties?.code) shapes.push(shapeOf(f.properties.code, f.geometry));
  // The Canadian boundaries are coarse along the coast (harbours fall just outside), so a point
  // that is in no polygon but within a few miles of a province still counts as that province.
  const coastal = (lat: number, lon: number): string | null => {
    let best: { code: string; d: number } | null = null;
    const kx = 69.17 * Math.cos((lat * Math.PI) / 180), ky = 69.17;
    for (let i = nUS; i < shapes.length; i++) {
      const s = shapes[i];
      const [a, b, c, d] = s.bbox;
      if (lon < a - 0.15 || lon > c + 0.15 || lat < b - 0.15 || lat > d + 0.15) continue;
      for (const poly of s.polys) {
        const r = poly[0];
        for (let j = 1; j < r.length; j++) {
          const [x1, y1] = r[j - 1], [x2, y2] = r[j];
          const dx = (x2 - x1) * kx, dy = (y2 - y1) * ky, px = (lon - x1) * kx, py = (lat - y1) * ky;
          const L = dx * dx + dy * dy;
          const t = L === 0 ? 0 : Math.max(0, Math.min(1, (px * dx + py * dy) / L));
          const dist = Math.hypot(px - t * dx, py - t * dy);
          if (!best || dist < best.d) best = { code: s.code, d: dist };
        }
      }
    }
    return best && best.d <= 6 ? best.code : null;
  };
  return (lat, lon) => {
    for (const s of shapes) {
      const [a, b, c, d] = s.bbox;
      if (lon < a || lon > c || lat < b || lat > d) continue;
      for (const poly of s.polys) {
        if (inRing(lon, lat, poly[0]) && !poly.slice(1).some((h) => inRing(lon, lat, h))) return s.code;
      }
    }
    return coastal(lat, lon);
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
