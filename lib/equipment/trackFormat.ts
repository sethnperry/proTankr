// lib/equipment/trackFormat.ts — small text helpers for the Track screens.

export function mapsUrl(lat: number, lon: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lon.toFixed(6)}`;
}

/** 0-359 degrees as a compass point: 45 -> "NE". */
export function compass(deg: number | null | undefined): string | null {
  if (deg == null || !Number.isFinite(deg)) return null;
  return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

export const clockOf = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export function ageText(iso: string | null | undefined, nowMs: number = Date.now()): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return "time unknown";
  const min = Math.max(0, Math.round((nowMs - t) / 60000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h} h ${min % 60} min ago` : `${Math.floor(h / 24)} d ago`;
}
