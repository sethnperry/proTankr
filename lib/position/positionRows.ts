// Pure helpers for equipment_positions rows (no browser or Supabase imports, so they can be tested).

export type LiveDot = { lat: number; lon: number; speedMph: number | null; at: string | null; trailerId?: string | null };

export type UnitPosition = { kind: "truck" | "trailer"; unitId: string; lat: number; lon: number; odometer: number | null; cause: string | null; capturedAt: string; capturedBy: string | null };

export type PositionRow = { unit_kind: string; unit_id: string; lat: number; lon: number; odometer: number | null; cause: string | null; captured_at: string; captured_by: string | null };

export function rowsToPositions(rows: PositionRow[]): UnitPosition[] {
  return rows.filter((r) => (r.unit_kind === "truck" || r.unit_kind === "trailer") && Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lon)))
    .map((r) => ({ kind: r.unit_kind as "truck" | "trailer", unitId: r.unit_id, lat: Number(r.lat), lon: Number(r.lon), odometer: r.odometer != null ? Number(r.odometer) : null, cause: r.cause, capturedAt: r.captured_at, capturedBy: r.captured_by }));
}
/** The Dispatch board's live-dot shape. A capture has no speed. */
export const toLivePos = (p: UnitPosition): LiveDot => ({ lat: p.lat, lon: p.lon, speedMph: null, at: p.capturedAt });

