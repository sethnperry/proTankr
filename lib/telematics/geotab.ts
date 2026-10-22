// lib/telematics/geotab.ts
//
// Geotab (MyGeotab API, JSON-RPC). Authenticate once per database/user, then
// call the server Authenticate hands back. Sessions are cached briefly.
// `fetchImpl` is injectable so this is tested without a network.

import { TelematicsAuthError, type HosAvailability, type ProviderDriver, type ProviderGroup, type ProviderShipment, type ProviderTrailer, type ProviderVehicle, type TrailerEvent, type TelematicsProvider, type VehicleReading } from "./types.ts";
import { dutyFromLogs } from "./dutyLogs.ts";

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
/** Who a DeviceStatusInfo record says is in the vehicle: signed in now, or only the last driver. */
export function driverOf(s: any): { current: string | null; historic: string | null } {
  const raw = s?.driver?.id ?? s?.currentDriver?.id;
  if (!raw || /^unknown/i.test(String(raw))) return { current: null, historic: null };
  return s?.isHistoricLastDriver === true ? { current: null, historic: String(raw) } : { current: String(raw), historic: null };
}

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

const groupIdsOf = (d: any): { groupIds?: string[] } => {
  const ids = (Array.isArray(d?.groups) ? d.groups : []).map((g: any) => g?.id).filter(Boolean).map(String);
  return ids.length ? { groupIds: ids } : {};
};

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

  // Engine hours (the hour meter), from seconds. The adjusted value is what MyGeotab shows.
  const engineHours = async (id: string): Promise<number | null> => {
    const from = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    for (const diag of ["DiagnosticEngineHoursAdjustmentId", "DiagnosticEngineHoursId"]) {
      const rows: any[] = await call("Get", { typeName: "StatusData", search: { deviceSearch: { id }, diagnosticSearch: { id: diag }, fromDate: from } });
      const last = (rows ?? []).filter((r) => Number.isFinite(Number(r?.data))).sort((a, b) => String(a.dateTime).localeCompare(String(b.dateTime))).pop();
      if (last) return Math.round((Number(last.data) / 3600) * 10) / 10;
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
        .map((d) => ({ id: String(d.id), name: String(d.name), vin: d.vehicleIdentificationNumber ? String(d.vehicleIdentificationNumber).toUpperCase() : null,
          plate: d.licensePlate ? String(d.licensePlate).toUpperCase() : null, plateState: d.licenseState ? String(d.licenseState).toUpperCase() : null,
          ...groupIdsOf(d), ...(d.activeFrom ? { activeFrom: String(d.activeFrom) } : {}), ...(d.activeTo ? { activeTo: String(d.activeTo) } : {}) }));
    },

    async engineHours(id: string): Promise<number | null> { return engineHours(id); },

    async trail(id: string, fromIso: string, toIso: string) {
      const out: { lat: number; lon: number; at: string }[] = [];
      let from = fromIso;
      for (let page = 0; page < 8; page++) {
        const rows: any[] = await call("Get", { typeName: "LogRecord", search: { deviceSearch: { id }, fromDate: from, toDate: toIso }, resultsLimit: 50000 });
        const good = (rows ?? []).filter((r) => Number.isFinite(Number(r?.latitude)) && Number.isFinite(Number(r?.longitude)) && r.dateTime);
        for (const r of good) out.push({ lat: Number(r.latitude), lon: Number(r.longitude), at: String(r.dateTime) });
        if ((rows ?? []).length < 50000) break;
        const last = good.map((r) => String(r.dateTime)).sort().pop();
        if (!last) break;
        from = new Date(Date.parse(last) + 1).toISOString();
      }
      return out.sort((a, b) => a.at.localeCompare(b.at));
    },

    async odometerSpan(id: string, fromIso: string, toIso: string) {
      for (const diag of ["DiagnosticOdometerAdjustmentId", "DiagnosticOdometerId"]) {
        const rows: any[] = await call("Get", { typeName: "StatusData", search: { deviceSearch: { id }, diagnosticSearch: { id: diag }, fromDate: fromIso, toDate: toIso } });
        const v = (rows ?? []).filter((r) => Number.isFinite(Number(r?.data))).sort((a, b) => String(a.dateTime).localeCompare(String(b.dateTime)));
        if (v.length >= 2) return { firstMi: Number(v[0].data) / METERS_PER_MILE, lastMi: Number(v[v.length - 1].data) / METERS_PER_MILE };
      }
      return null;
    },

    async listGroups(): Promise<ProviderGroup[]> {
      const rows: any[] = await call("Get", { typeName: "Group" });
      return (rows ?? []).filter((g) => g?.id).map((g) => ({ id: String(g.id), name: g.name ? String(g.name) : String(g.id), parentId: g.parent?.id ? String(g.parent.id) : null }));
    },

    async listTrailers(): Promise<ProviderTrailer[]> {
      const rows: any[] = await call("Get", { typeName: "Trailer" });
      return (rows ?? []).filter((t) => t?.id && t.name).map((t) => ({ id: String(t.id), name: String(t.name), comment: t.comment ? String(t.comment) : null, ...groupIdsOf(t) }));
    },

    async trailerEvents(id: string, fromIso: string, toIso: string): Promise<TrailerEvent[]> {
      const rows: any[] = await call("Get", { typeName: "TrailerAttachment", search: { deviceSearch: { id }, activeFrom: fromIso, activeTo: toIso } });
      const lo = Date.parse(fromIso), hi = Date.parse(toIso), now = Date.now();
      const raw: { type: "hook" | "drop"; at: string; trailer: string }[] = [];
      for (const a of rows ?? []) {
        const tr = a?.trailer?.id;
        if (!tr) continue;
        const from = a.activeFrom ? Date.parse(a.activeFrom) : NaN;
        const to = a.activeTo ? Date.parse(a.activeTo) : NaN;
        if (Number.isFinite(from) && from >= lo && from <= hi) raw.push({ type: "hook", at: new Date(from).toISOString(), trailer: String(tr) });
        // An end in the future (Geotab's "open" year-4000 date) is not a drop yet.
        if (Number.isFinite(to) && to >= lo && to <= hi && to <= now) raw.push({ type: "drop", at: new Date(to).toISOString(), trailer: String(tr) });
      }
      raw.sort((x, y) => x.at.localeCompare(y.at));
      const out: TrailerEvent[] = [];
      for (const e of raw.slice(0, 12)) {
        let lat: number | null = null, lon: number | null = null;
        try {
          const t = Date.parse(e.at);
          const recs: any[] = await call("Get", { typeName: "LogRecord", search: { deviceSearch: { id }, fromDate: new Date(t - 5 * 60000).toISOString(), toDate: new Date(t + 5 * 60000).toISOString() }, resultsLimit: 1 });
          if (recs?.[0] && Number.isFinite(Number(recs[0].latitude))) { lat = Number(recs[0].latitude); lon = Number(recs[0].longitude); }
        } catch { /* the event still counts without a position */ }
        out.push({ type: e.type, at: e.at, trailerProviderId: e.trailer, lat, lon });
      }
      return out;
    },

    async attachedTrailers(): Promise<Map<string, string>> {
      const now = new Date().toISOString();
      const rows: any[] = await call("Get", { typeName: "TrailerAttachment", search: { activeFrom: now, activeTo: now } });
      const out = new Map<string, { trailer: string; from: string }>();
      for (const a of rows ?? []) {
        const dev = a?.device?.id, tr = a?.trailer?.id;
        if (!dev || !tr) continue;
        // Still attached: no end, or an end in the future (Geotab uses year 4000 for "open").
        if (a.activeTo && Date.parse(a.activeTo) <= Date.now()) continue;
        const from = String(a.activeFrom ?? a.dateTime ?? "");
        const prev = out.get(String(dev));
        if (!prev || from > prev.from) out.set(String(dev), { trailer: String(tr), from });
      }
      return new Map([...out].map(([k, v]) => [k, v.trailer]));
    },

    async listDrivers(): Promise<ProviderDriver[]> {
      const rows: any[] = await call("Get", { typeName: "User" });
      return (rows ?? [])
        .filter((u) => u?.id && u.isDriver !== false && u.name)
        .map((u) => ({ id: String(u.id), name: String(u.name), firstName: u.firstName ? String(u.firstName) : null, lastName: u.lastName ? String(u.lastName) : null, employeeNo: u.employeeNo ? String(u.employeeNo) : null }));
    },

    async attachedAll(): Promise<Map<string, string[]>> {
      const now = new Date().toISOString();
      const rows: any[] = await call("Get", { typeName: "TrailerAttachment", search: { activeFrom: now, activeTo: now } });
      const out = new Map<string, Set<string>>();
      for (const a of rows ?? []) {
        const dev = a?.device?.id, tr = a?.trailer?.id;
        if (!dev || !tr) continue;
        if (a.activeTo && Date.parse(a.activeTo) <= Date.now()) continue;
        (out.get(String(dev)) ?? out.set(String(dev), new Set()).get(String(dev))!).add(String(tr));
      }
      return new Map([...out].map(([k, v]) => [k, [...v]]));
    },

    async activeShipments(vehicleId: string): Promise<ProviderShipment[]> {
      const from = new Date(Date.now() - 7 * 86400000).toISOString();
      const rows: any[] = await call("Get", { typeName: "ShipmentLog", search: { deviceSearch: { id: vehicleId }, fromDate: from } });
      const seen = new Set<string>();
      const out: ProviderShipment[] = [];
      for (const r of (rows ?? []).sort((a, b) => String(b.activeFrom ?? b.dateTime ?? "").localeCompare(String(a.activeFrom ?? a.dateTime ?? "")))) {
        const doc = r?.documentNumber ? String(r.documentNumber).trim() : "";
        if (!doc || seen.has(doc)) continue;
        // Still on the truck: no end, or an end in the future (Geotab uses year 4000 for "open").
        if (r.activeTo && Date.parse(r.activeTo) <= Date.now()) continue;
        seen.add(doc);
        out.push({ documentNumber: doc, shipperName: r.shipperName ? String(r.shipperName) : null, commodity: r.commodity ? String(r.commodity) : null, activeFrom: r.activeFrom ? String(r.activeFrom) : r.dateTime ? String(r.dateTime) : null });
      }
      return out;
    },

    async lastDriverOf(vehicleId: string): Promise<{ driverId: string; at: string } | null> {
      const from = new Date(Date.now() - 7 * 86400000).toISOString();
      const rows: any[] = await call("Get", { typeName: "DriverChange", search: { deviceSearch: { id: vehicleId }, fromDate: from } });
      const last = (rows ?? []).filter((r) => r?.driver?.id && !/^unknown/i.test(String(r.driver.id)) && r.dateTime && (!r.device?.id || String(r.device.id) === vehicleId)).sort((a, b) => String(a.dateTime).localeCompare(String(b.dateTime))).pop();
      return last ? { driverId: String(last.driver.id), at: String(last.dateTime) } : null;
    },

    async currentDrivers(): Promise<Map<string, string>> {
      const rows: any[] = await call("Get", { typeName: "DeviceStatusInfo" });
      const out = new Map<string, string>();
      for (const s of rows ?? []) {
        const dev = s?.device?.id, d = driverOf(s).current;
        if (dev && d) out.set(String(dev), d);
      }
      return out;
    },

    async fleetStatus() {
      const rows: any[] = await call("Get", { typeName: "DeviceStatusInfo" });
      const positions = new Map<string, VehicleReading>();
      const current = new Map<string, string>();
      const historic = new Map<string, string>();
      for (const s of rows ?? []) {
        const id = s?.device?.id;
        if (!id) continue;
        const kmh = Number(s.speed);
        positions.set(String(id), {
          odometerMi: null,
          lat: Number.isFinite(Number(s.latitude)) ? Number(s.latitude) : null,
          lon: Number.isFinite(Number(s.longitude)) ? Number(s.longitude) : null,
          speedMph: Number.isFinite(kmh) ? Math.round(kmh * 0.621371) : null,
          at: s.dateTime ? String(s.dateTime) : null,
        });
        const d = driverOf(s);
        if (d.current) current.set(String(id), d.current);
        if (d.historic) historic.set(String(id), d.historic);
      }
      return { positions, current, historic };
    },

    async historicDrivers(): Promise<Map<string, string>> {
      const rows: any[] = await call("Get", { typeName: "DeviceStatusInfo" });
      const out = new Map<string, string>();
      for (const s of rows ?? []) {
        const dev = s?.device?.id, d = driverOf(s).historic;
        if (dev && d) out.set(String(dev), d);
      }
      return out;
    },

    async lastVehicleOf(driverId: string): Promise<{ vehicleId: string; at: string } | null> {
      // The provider may ignore a driver filter it doesn't know, so every row is checked against the
      // driver here; otherwise anyone would get the fleet's most recent sign-in.
      const from = new Date(Date.now() - 30 * 86400000).toISOString();
      let rows: any[] | null = await call("Get", { typeName: "DriverChange", search: { driverSearch: { id: driverId }, fromDate: from }, resultsLimit: 5000 }).catch(() => null);
      if (!rows) rows = await call("Get", { typeName: "DriverChange", search: { fromDate: new Date(Date.now() - 3 * 86400000).toISOString() }, resultsLimit: 20000 }).catch(() => []);
      const last = (rows ?? []).filter((r) => r?.device?.id && String(r?.driver?.id ?? "") === driverId && r.dateTime).sort((a, b) => String(a.dateTime).localeCompare(String(b.dateTime))).pop();
      if (last) return { vehicleId: String(last.device.id), at: String(last.dateTime) };
      // A driver who drove without a sign-in record still has trips.
      const trips: any[] = await call("Get", { typeName: "Trip", search: { userSearch: { id: driverId }, fromDate: new Date(Date.now() - 14 * 86400000).toISOString() }, resultsLimit: 2000 }).catch(() => []);
      const lt = (trips ?? []).filter((t) => t?.device?.id && String(t?.driver?.id ?? "") === driverId && (t.stop || t.start)).sort((a, b) => String(a.stop ?? a.start).localeCompare(String(b.stop ?? b.start))).pop();
      if (lt) return { vehicleId: String(lt.device.id), at: String(lt.stop ?? lt.start) };
      // A driver on duty through the Drive app has duty-status logs, each tagged with the vehicle it was logged on.
      const logs: any[] = await call("Get", { typeName: "DutyStatusLog", search: { userSearch: { id: driverId }, fromDate: new Date(Date.now() - 4 * 86400000).toISOString() } }).catch(() => []);
      const ld = (logs ?? []).filter((l) => l?.device?.id && !/^no/i.test(String(l.device.id)) && l.dateTime).sort((a, b) => String(a.dateTime).localeCompare(String(b.dateTime))).pop();
      return ld ? { vehicleId: String(ld.device.id), at: String(ld.dateTime) } : null;
    },

    async hos(id: string): Promise<HosAvailability | null> {
      const [avail, logs] = await Promise.all([
        call("Get", { typeName: "DutyStatusAvailability", search: { userSearch: { id } } }) as Promise<any[]>,
        call("Get", { typeName: "DutyStatusLog", search: { userSearch: { id }, fromDate: new Date(Date.now() - 96 * 3600 * 1000).toISOString() } }).catch(() => []) as Promise<any[]>,
      ]);
      const a = (avail ?? [])[0];
      if (!a) return null;
      // Only real duty status changes (not ELD log-in/out); see dutyLogs.ts.
      const duty = dutyFromLogs(logs ?? []);
      return {
        driveLeftMin: durationMinutes(a.driving), dutyLeftMin: durationMinutes(a.duty), cycleLeftMin: durationMinutes(a.cycle),
        status: duty.status, statusSince: duty.since, offSince: duty.offSince, at: new Date().toISOString(),
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
      const [info, odo, fuel, hours] = await Promise.all([
        call("Get", { typeName: "DeviceStatusInfo", search: { deviceSearch: { id } } }) as Promise<any[]>,
        odometer(id).catch(() => null),
        fuelLevel(id).catch(() => null),
        engineHours(id).catch(() => null),
      ]);
      const s = (info ?? [])[0];
      const kmh = Number(s?.speed);
      // A parked vehicle's status record can lack a fix; its last log record still has one.
      let fix: { lat: number; lon: number; at: string } | null = null;
      if (!(Number.isFinite(Number(s?.latitude)) && Number.isFinite(Number(s?.longitude)))) {
        // Newest window first (3 days, then back to 30, then 180), so a truck parked for weeks still
        // shows where it last reported without reading a busy truck's whole history.
        const DAY = 86400000, now = Date.now();
        for (const [fromD, toD] of [[3, 0], [30, 3], [180, 30]]) {
          const logs: any[] = await call("Get", { typeName: "LogRecord", search: { deviceSearch: { id }, fromDate: new Date(now - fromD * DAY).toISOString(), toDate: new Date(now - toD * DAY).toISOString() }, resultsLimit: 5000 }).catch(() => []);
          const lr = (logs ?? []).filter((r) => Number.isFinite(Number(r?.latitude)) && Number.isFinite(Number(r?.longitude)) && r.dateTime).sort((x, y) => String(x.dateTime).localeCompare(String(y.dateTime))).pop();
          if (lr) { fix = { lat: Number(lr.latitude), lon: Number(lr.longitude), at: String(lr.dateTime) }; break; }
        }
      }
      return {
        odometerMi: odo,
        fuelLevelPct: fuel,
        engineHours: hours,
        lat: fix ? fix.lat : Number.isFinite(Number(s?.latitude)) ? Number(s.latitude) : null,
        lon: fix ? fix.lon : Number.isFinite(Number(s?.longitude)) ? Number(s.longitude) : null,
        speedMph: Number.isFinite(kmh) ? Math.round(kmh * 0.621371) : null,
        at: fix ? fix.at : s?.dateTime ? String(s.dateTime) : null,
        // The driver on a status record is `driver`. `isHistoricLastDriver` means nobody is signed in now and
        // this is just the last one, and "UnknownDriverId" means no driver at all.
        driverId: driverOf(s).current,
        lastDriverId: driverOf(s).historic,
        bearingDeg: Number.isFinite(Number(s?.bearing)) ? Math.round(Number(s.bearing)) : null,
        isDriving: typeof s?.isDriving === "boolean" ? s.isDriving : null,
      };
    },
  };
}
