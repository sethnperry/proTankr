// lib/equipment/parkedPins.ts — turns equipment_parks rows into map pins. A truck and its trailer parked together
// share one spot, so units within ~15 m are drawn as one pin ("25184 / 3151").

export type ParkRow = {
  unit_kind: "truck" | "trailer"; unit_id: string; lat: number; lon: number;
  place_label: string | null; parked_by: string | null; parked_at: string;
};
export type PinUnit = { kind: "truck" | "trailer"; id: string; name: string };
export type MapPin = {
  key: string; lat: number; lon: number; label: string; units: PinUnit[];
  placeLabel: string | null; parkedBy: string | null; parkedAt: string; title: string;
};

const GROUP_M = 15;
const dist = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const dy = (a.lat - b.lat) * 111_320;
  const dx = (a.lon - b.lon) * 111_320 * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
  return Math.hypot(dx, dy);
};

export function buildPins(rows: ParkRow[], names: Map<string, string>, keep: (kind: "truck" | "trailer", id: string) => boolean = () => true): MapPin[] {
  const pins: MapPin[] = [];
  for (const r of rows) {
    if (!keep(r.unit_kind, r.unit_id) || !Number.isFinite(r.lat) || !Number.isFinite(r.lon)) continue;
    const unit: PinUnit = { kind: r.unit_kind, id: r.unit_id, name: names.get(`${r.unit_kind}:${r.unit_id}`) ?? "?" };
    const hit = pins.find((p) => dist(p, r) <= GROUP_M);
    if (hit) {
      hit.units.push(unit);
      if (Date.parse(r.parked_at) > Date.parse(hit.parkedAt)) hit.parkedAt = r.parked_at;
      hit.placeLabel = hit.placeLabel ?? r.place_label;
      hit.parkedBy = hit.parkedBy ?? r.parked_by;
    } else {
      pins.push({ key: `${r.lat.toFixed(5)},${r.lon.toFixed(5)}`, lat: r.lat, lon: r.lon, label: "", units: [unit], placeLabel: r.place_label, parkedBy: r.parked_by, parkedAt: r.parked_at, title: "" });
    }
  }
  for (const p of pins) {
    p.units.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, undefined, { numeric: true }) : a.kind === "truck" ? -1 : 1));
    p.label = p.units.map((u) => u.name).join(" / ");
    p.title = p.label;
  }
  return pins.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
}
