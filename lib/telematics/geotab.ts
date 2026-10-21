// lib/telematics/geotab.ts
//
// Geotab (MyGeotab API, JSON-RPC). Authenticate once per database/user, then
// call the server Authenticate hands back. Sessions are cached briefly.
// `fetchImpl` is injectable so this is tested without a network.

import { TelematicsAuthError, type HosAvailability, type ProviderDriver, type ProviderVehicle, type TelematicsProvider, type VehicleReading } from "./types.ts";

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

/** Geotab durations arrive as ticks (100 ns), milliseconds, seconds or an
 * "[d.]hh:mm:ss" string depending on the field and API version, so read all of
 * them. Returns minutes. */
export function durationMinutes(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "string" && /^\d+(\.\d+)?$/.test(v) === false) {
    const m = /^(?:(\d+)\.)?(\d+):(\d{2}):(\d{2})/.exec(v.trim());
    if (!m) return null;
    return Number(m[1] ?? 0) * 1440 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 60;
  }
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  if (n >= 1e10) return n / 1e7 / 60; // ticks
  if (n >= 1e6) return n / 60000;     // milliseconds
  return n / 60;                      // seconds
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

  // Combined fuel level, percent. Null when the truck doesn't report it.
  const fuelLevel = async (id: string): Promise<number | null> => {
    const from = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
    const rows: any[] = await call("Get", { typeName: "StatusData", search: { deviceSearch: { id }, diagnosticSearch: { id: "DiagnosticFuelLevelId" }, fromDate: from } });
    const last = (rows ?? []).filter((r) => Number.isFinite(Number(r?.data))).sort((a, b) => String(a.dateTime).localeCompare(String(b.dateTime))).pop();
    if (!last) return null;
    return Math.max(0, Math.min(100, Math.round(Number(last.data) * 10) / 10));
  };

  return {
    async listVehicles(): Promise<ProviderVehicle[]> {
      const rows: any[] = await call("Get", { typeName: "Device" });
      return (rows ?? [])
        .filter((d) => d?.id && d.name)
        .map((d) => ({ id: String(d.id), name: String(d.name), vin: d.vehicleIdentificationNumber ? String(d.vehicleIdentificationNumber).toUpperCase() : null }));
    },

    async listDrivers(): Promise<ProviderDriver[]> {
      const rows: any[] = await call("Get", { typeName: "User" });
      return (rows ?? [])
        .filter((u) => u?.id && u.isDriver !== false && u.name)
        .map((u) => ({ id: String(u.id), name: String(u.name), firstName: u.firstName ? String(u.firstName) : null, lastName: u.lastName ? String(u.lastName) : null, employeeNo: u.employeeNo ? String(u.employeeNo) : null }));
    },

    async hos(id: string): Promise<HosAvailability | null> {
      const [avail, logs] = await Promise.all([
        call("Get", { typeName: "DutyStatusAvailability", search: { userSearch: { id } } }) as Promise<any[]>,
        call("Get", { typeName: "DutyStatusLog", search: { userSearch: { id }, fromDate: new Date(Date.now() - 36 * 3600 * 1000).toISOString() } }).catch(() => []) as Promise<any[]>,
      ]);
      const a = (avail ?? [])[0];
      if (!a) return null;
      const last = (logs ?? []).filter((l) => l?.dateTime && l.status).sort((x, y) => String(x.dateTime).localeCompare(String(y.dateTime))).pop();
      return {
        driveLeftMin: durationMinutes(a.driving), dutyLeftMin: durationMinutes(a.duty), cycleLeftMin: durationMinutes(a.cycle),
        status: last?.status ? String(last.status) : null, at: new Date().toISOString(),
      };
    },

    async positions(): Promise<Map<string, VehicleReading>> {
      const rows: any[] = await call("Get", { typeName: "DeviceStatusInfo" });
      const out = new Map<string, VehicleReading>();
      for (const s of rows ?? []) {
        const id = s?.device?.id;
        if (!id) continue;
        const kmh = Number(s.speed);
        out.set(String(id), {
          odometerMi: null,
          lat: Number.isFinite(Number(s.latitude)) ? Number(s.latitude) : null,
          lon: Number.isFinite(Number(s.longitude)) ? Number(s.longitude) : null,
          speedMph: Number.isFinite(kmh) ? Math.round(kmh * 0.621371) : null,
          at: s.dateTime ? String(s.dateTime) : null,
        });
      }
      return out;
    },

    async reading(id: string): Promise<VehicleReading> {
      const [info, odo, fuel] = await Promise.all([
        call("Get", { typeName: "DeviceStatusInfo", search: { deviceSearch: { id } } }) as Promise<any[]>,
        odometer(id).catch(() => null),
        fuelLevel(id).catch(() => null),
      ]);
      const s = (info ?? [])[0];
      const kmh = Number(s?.speed);
      return {
        odometerMi: odo,
        fuelLevelPct: fuel,
        lat: Number.isFinite(Number(s?.latitude)) ? Number(s.latitude) : null,
        lon: Number.isFinite(Number(s?.longitude)) ? Number(s.longitude) : null,
        speedMph: Number.isFinite(kmh) ? Math.round(kmh * 0.621371) : null,
        at: s?.dateTime ? String(s.dateTime) : null,
      };
    },
  };
}
