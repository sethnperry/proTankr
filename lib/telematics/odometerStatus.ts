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

/** Shipment numbers entered in the telematics app on a truck since a time. Empty when there's no connection. */
export async function fetchTruckShipments(truckId: string | null, sinceIso: string): Promise<{ documentNumber: string; start: string | null; shipperName: string | null; commodity: string | null }[]> {
  if (!truckId) return [];
  // Never holds the driver up: gives up after 6 seconds and the app carries on without a suggestion.
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 6000);
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return [];
    const r = await fetch(`/api/telematics/shipments?truckId=${encodeURIComponent(truckId)}&since=${encodeURIComponent(sinceIso)}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: ctl.signal });
    if (!r.ok) return [];
    const j = await r.json();
    return j?.connected ? (j.shipments ?? []) : [];
  } catch { return []; } finally { clearTimeout(timer); }
}
