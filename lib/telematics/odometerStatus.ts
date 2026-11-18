// lib/telematics/odometerStatus.ts
// Whether the tracker's miles can be trusted right now. Pure.

export type OdometerReading = { odometerMi: number | null; communicating?: boolean | null; at: string | null };

const STALE_ODOMETER_MS = 12 * 3600_000;

/**
 * Whether the tracker's miles can be trusted right now. "ok" = a current odometer reading; "warn" = the tracker is linked
 * but isn't giving usable miles (provider failing, no odometer value, device not communicating, or the reading is old);
 * "none" = no tracker for this truck (nothing to warn about).
 */
export function odometerStatus(reading: OdometerReading | null, failed: boolean, nowMs = Date.now()): "ok" | "warn" | "none" {
  if (failed) return "warn";
  if (!reading) return "none";
  if (reading.odometerMi == null) return "warn";
  if (reading.communicating === false) return "warn";
  const at = reading.at ? Date.parse(reading.at) : NaN;
  if (Number.isFinite(at) && nowMs - at > STALE_ODOMETER_MS) return "warn";
  return "ok";
}
