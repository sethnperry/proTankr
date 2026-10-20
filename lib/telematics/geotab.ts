// lib/telematics/geotab.ts
//
// Geotab (MyGeotab API, JSON-RPC). Authenticate once per database/user, then
// call the server Authenticate hands back. Sessions are cached briefly.
// `fetchImpl` is injectable so this is tested without a network.

import { TelematicsAuthError, type ProviderVehicle, type TelematicsProvider, type VehicleReading } from "./types.ts";

export type GeotabCreds = { database: string; userName: string; password: string };
type Fetch = typeof fetch;
type Session = { path: string; credentials: { database: string; sessionId: string; userName: string }; at: number };

const SESSION_MS = 10 * 60 * 1000;
const METERS_PER_MILE = 1609.344;
const sessions = new Map<string, Session>();

async function rpc(f: Fetch, host: string, method: string, params: unknown): Promise<any> {
  const res = await f(`https://${host}/apiv1`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method, params }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Geotab ${res.status}`);
  const json: any = await res.json();
  if (json?.error) {
    const name = String(json.error?.errors?.[0]?.name ?? json.error?.name ?? "");
    const msg = String(json.error?.message ?? "Geotab error");
    if (/InvalidUser|Incorrect login|DbUnavailable|Authenticat/i.test(name + msg)) throw new TelematicsAuthError(msg);
    throw new Error(msg);
  }
  return json?.result;
}

async function session(f: Fetch, c: GeotabCreds, fresh = false): Promise<Session> {
  const key = `${c.database}|${c.userName}`.toLowerCase();
  const hit = sessions.get(key);
  if (!fresh && hit && Date.now() - hit.at < SESSION_MS) return hit;
  const r = await rpc(f, "my.geotab.com", "Authenticate", { database: c.database, userName: c.userName, password: c.password });
  if (!r?.credentials?.sessionId) throw new TelematicsAuthError("Geotab sign-in failed.");
  const s: Session = { path: r.path && r.path !== "ThisServer" ? String(r.path) : "my.geotab.com", credentials: r.credentials, at: Date.now() };
  sessions.set(key, s);
  return s;
}

export function geotabProvider(c: GeotabCreds, f: Fetch = fetch): TelematicsProvider {
  // One retry with a fresh session if the cached one has expired.
  const call = async (method: string, params: Record<string, unknown>) => {
    let s = await session(f, c);
    try {
      return await rpc(f, s.path, method, { ...params, credentials: s.credentials });
    } catch (e) {
      if (!(e instanceof TelematicsAuthError)) throw e;
      s = await session(f, c, true);
      return rpc(f, s.path, method, { ...params, credentials: s.credentials });
    }
  };

  const odometer = async (id: string): Promise<number | null> => {
    const from = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    // The adjusted odometer is what MyGeotab shows; fall back to the engine's raw value.
    for (const diag of ["DiagnosticOdometerAdjustmentId", "DiagnosticOdometerId"]) {
      const rows: any[] = await call("Get", {
        typeName: "StatusData",
        search: { deviceSearch: { id }, diagnosticSearch: { id: diag }, fromDate: from },
      });
      const last = (rows ?? []).filter((r) => Number.isFinite(Number(r?.data))).sort((a, b) => String(a.dateTime).localeCompare(String(b.dateTime))).pop();
      if (last) return Math.round(Number(last.data) / METERS_PER_MILE);
    }
    return null;
  };

  return {
    async listVehicles(): Promise<ProviderVehicle[]> {
      const rows: any[] = await call("Get", { typeName: "Device" });
      return (rows ?? [])
        .filter((d) => d?.id && d.name)
        .map((d) => ({ id: String(d.id), name: String(d.name), vin: d.vehicleIdentificationNumber ? String(d.vehicleIdentificationNumber).toUpperCase() : null }));
    },

    async reading(id: string): Promise<VehicleReading> {
      const [info, odo] = await Promise.all([
        call("Get", { typeName: "DeviceStatusInfo", search: { deviceSearch: { id } } }) as Promise<any[]>,
        odometer(id).catch(() => null),
      ]);
      const s = (info ?? [])[0];
      const kmh = Number(s?.speed);
      return {
        odometerMi: odo,
        lat: Number.isFinite(Number(s?.latitude)) ? Number(s.latitude) : null,
        lon: Number.isFinite(Number(s?.longitude)) ? Number(s.longitude) : null,
        speedMph: Number.isFinite(kmh) ? Math.round(kmh * 0.621371) : null,
        at: s?.dateTime ? String(s.dateTime) : null,
      };
    },
  };
}
