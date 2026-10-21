// lib/equipment/trackList.ts
//
// The Track picker's list: active pairings first (a truck and its trailer on one row, numerically
// by truck so the connector line runs straight across), then the loose trucks, then the loose
// trailers. The Region / Local Area / Away filter works the same as the equipment modal's. Pure.

export type TrackUnit = {
  id: string; name: string; kind: "truck" | "trailer";
  region: string | null; localArea: string | null; currentRegion: string | null; currentLocalArea: string | null;
  statusCode: string | null; statusNotes: string | null; subStatus: string | null;
  statusLocation: string | null; statusUpdatedAt: string | null;
};
export type TrackCombo = { comboId: string; truckId: string; trailerId: string };
export type TrackFilter = { region: string | null; localArea: string | null; awayOnly?: boolean };

export const naturalCompare = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
const isAway = (u: TrackUnit) =>
  (!!u.currentRegion && norm(u.currentRegion) !== norm(u.region)) || (!!u.currentLocalArea && norm(u.currentLocalArea) !== norm(u.localArea));

export function unitMatchesFilter(u: TrackUnit, f: TrackFilter): boolean {
  return (!f.region || u.region === f.region || u.currentRegion === f.region)
    && (!f.localArea || u.localArea === f.localArea || u.currentLocalArea === f.localArea)
    && (!f.awayOnly || isAway(u));
}

export type TrackRows = {
  combos: { comboId: string; truck: TrackUnit; trailer: TrackUnit }[];
  trucks: TrackUnit[];
  trailers: TrackUnit[];
};

export function buildTrackRows(trucks: TrackUnit[], trailers: TrackUnit[], combos: TrackCombo[], filter: TrackFilter, query: string): TrackRows {
  const q = query.trim().toLowerCase();
  const byTruck = new Map(trucks.map((t) => [t.id, t]));
  const byTrailer = new Map(trailers.map((t) => [t.id, t]));
  const inCombo = new Set<string>();
  const rows: TrackRows["combos"] = [];
  for (const c of combos) {
    const truck = byTruck.get(c.truckId), trailer = byTrailer.get(c.trailerId);
    if (!truck || !trailer) continue;
    inCombo.add(truck.id); inCombo.add(trailer.id);
    const matchQ = !q || truck.name.toLowerCase().includes(q) || trailer.name.toLowerCase().includes(q);
    if (matchQ && (unitMatchesFilter(truck, filter) || unitMatchesFilter(trailer, filter))) rows.push({ comboId: c.comboId, truck, trailer });
  }
  rows.sort((a, b) => naturalCompare(a.truck.name, b.truck.name));
  const loose = (list: TrackUnit[]) => list
    .filter((u) => !inCombo.has(u.id) && (!q || u.name.toLowerCase().includes(q)) && unitMatchesFilter(u, filter))
    .sort((a, b) => naturalCompare(a.name, b.name));
  return { combos: rows, trucks: loose(trucks), trailers: loose(trailers) };
}
