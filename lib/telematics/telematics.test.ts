import test from "node:test";
import assert from "node:assert/strict";
import { matchVehicles } from "./match.ts";
import { geotabProvider } from "./geotab.ts";
import { encryptSecret, decryptSecret } from "./crypto.ts";

test("match: VIN first, then unit number, leftovers listed", () => {
  const r = matchVehicles(
    [{ id: "b1", name: "Truck 25184", vin: "1XKYD49X0LJ123456" }, { id: "b2", name: "25-512", vin: null }, { id: "b3", name: "99", vin: null }],
    [{ truck_id: "t1", truck_name: "25184-A", vin_number: "1xkyd49x0lj123456" }, { truck_id: "t2", truck_name: "25512", vin_number: null }, { truck_id: "t3", truck_name: "77" }],
  );
  assert.deepEqual(r.pairs.map((p) => [p.vehicle.id, p.truck.truck_id, p.by]), [["b1", "t1", "vin"], ["b2", "t2", "name"]]);
  assert.deepEqual(r.unmatchedVehicles.map((v) => v.id), ["b3"]);
  assert.deepEqual(r.unmatchedTrucks.map((t) => t.truck_id), ["t3"]);
});

test("match: an ambiguous unit number is not guessed", () => {
  const r = matchVehicles([{ id: "b", name: "12", vin: null }], [{ truck_id: "a", truck_name: "12" }, { truck_id: "b2", truck_name: "1-2" }]);
  assert.equal(r.pairs.length, 0);
});

test("geotab: lists devices and reads odometer + position", async () => {
  const calls: any[] = [];
  const f = (async (url: string, init: any) => {
    const body = JSON.parse(init.body);
    calls.push({ url, method: body.method, type: body.params?.typeName });
    const ok = (result: unknown) => ({ ok: true, json: async () => ({ result }) });
    if (body.method === "Authenticate") return ok({ path: "my5.geotab.com", credentials: { database: "d", sessionId: "s", userName: "u" } });
    if (body.params.typeName === "Device") return ok([{ id: "b1", name: "25184", vehicleIdentificationNumber: "abc" }]);
    if (body.params.typeName === "DeviceStatusInfo") return ok([{ latitude: 27.9, longitude: -82.4, speed: 100, dateTime: "2026-10-23T10:00:00Z" }]);
    if (body.params.search.diagnosticSearch.id === "DiagnosticEngineHoursAdjustmentId") return ok([{ data: 7203600, dateTime: "2026-10-23T09:30:00Z" }]);
    if (body.params.search.diagnosticSearch.id === "DiagnosticFuelLevelId") return ok([{ data: 61.24, dateTime: "2026-10-23T09:30:00Z" }]);
    if (body.params.search.diagnosticSearch.id === "DiagnosticOdometerAdjustmentId") return ok([]);
    return ok([{ data: 160934.4, dateTime: "2026-10-23T09:00:00Z" }]);
  }) as any;
  const p = geotabProvider({ database: "db-test", userName: "u", password: "p" }, f);
  assert.deepEqual(await p.listVehicles(), [{ id: "b1", name: "25184", vin: "ABC", plate: null, plateState: null }]);
  const r = await p.reading("b1");
  assert.equal(r.odometerMi, 100);
  assert.equal(r.lat, 27.9);
  assert.equal(r.speedMph, 62);
  assert.equal(r.fuelLevelPct, 61.2);
  assert.equal(r.engineHours, 2001);
  assert.ok(calls.some((c) => c.url === "https://my5.geotab.com/apiv1" && c.type === "StatusData"));
});

test("secrets round-trip and a wrong key fails", () => {
  process.env.TELEMATICS_ENC_KEY = "k1";
  const blob = encryptSecret("hunter2");
  assert.equal(decryptSecret(blob), "hunter2");
  process.env.TELEMATICS_ENC_KEY = "k2";
  assert.throws(() => decryptSecret(blob));
});

import { fractionAlong, pointAlong, liveLine } from "./progress.ts";

test("progress: fraction along a leg, clamped, unknown without coordinates", () => {
  const a = { lat: 27, lon: -82 }, b = { lat: 28, lon: -82 };
  const mid = fractionAlong(a, { lat: 27.5, lon: -82 }, b)!;
  assert.ok(Math.abs(mid - 0.5) < 0.02);
  assert.equal(fractionAlong(a, a, b), 0.03);
  assert.equal(fractionAlong(null, a, b), null);
});

test("progress: point along a polyline by length", () => {
  const [x, y] = pointAlong([[0, 0], [10, 0], [10, 10]], 0.75);
  assert.deepEqual([x, y], [10, 5]);
});

test("progress: live line, stale and moving", () => {
  const now = new Date("2026-10-23T12:00:00Z");
  const fresh = liveLine({ lat: 27, lon: -82, speedMph: 58, at: "2026-10-23T11:58:00Z" }, "Citgo", { lat: 28, lon: -82 }, now);
  assert.equal(fresh.stale, false);
  assert.match(fresh.text, /58 mph · \d+ mi to Citgo · 2 min ago/);
  assert.deepEqual(liveLine({ lat: 27, lon: -82, speedMph: 0, at: "2026-10-23T09:00:00Z" }, null, null, now), { text: "last seen 3 h ago", stale: true });
});

import { fenceFor, inside, plausiblePoint, stepWatch, NEW_WATCH } from "./geofence.ts";

test("geofence: learned center is the median and tight; catalog fallback is wide", () => {
  const pts = [{ lat: 27.90, lon: -82.40 }, { lat: 27.9004, lon: -82.4004 }, { lat: 27.95, lon: -82.5 }];
  const f = fenceFor(pts, { lat: 27.0, lon: -82.0 })!;
  assert.equal(f.learned, true);
  assert.ok(Math.abs(f.center.lat - 27.9004) < 1e-6);
  assert.ok(inside({ lat: 27.9002, lon: -82.4002 }, f));
  assert.ok(!inside({ lat: 27.92, lon: -82.4 }, f));
  const w = fenceFor([pts[0]], { lat: 27.0, lon: -82.0 })!;
  assert.equal(w.learned, false);
  assert.equal(fenceFor([], null), null);
});

test("geofence: a point far from the catalog isn't learned", () => {
  assert.equal(plausiblePoint({ lat: 28.5, lon: -82 }, { lat: 27.9, lon: -82.4 }), false);
  assert.equal(plausiblePoint({ lat: 27.91, lon: -82.4 }, { lat: 27.9, lon: -82.4 }), true);
  assert.equal(plausiblePoint({ lat: 1, lon: 1 }, null), true);
});

test("geofence: confirmed only after staying inside and stopped; moving resets", () => {
  let w = stepWatch(NEW_WATCH, { inside: true, speedMph: 2, nowMs: 1000 });
  assert.equal(w.confirmedAtMs, null);
  w = stepWatch(w, { inside: true, speedMph: 0, nowMs: 61_000 });
  assert.equal(w.confirmedAtMs, 1000);
  assert.deepEqual(stepWatch(w, { inside: true, speedMph: 30, nowMs: 90_000 }), NEW_WATCH);
  assert.deepEqual(stepWatch(w, { inside: false, speedMph: 0, nowMs: 90_000 }), NEW_WATCH);
});

import { durationMinutes } from "./geotab.ts";
import { matchDrivers } from "./matchDrivers.ts";

test("hos: durations read as ticks, ms, seconds or a time string", () => {
  assert.equal(Math.round(durationMinutes(11 * 3600 * 1e7)!), 660);
  assert.equal(Math.round(durationMinutes(11 * 3600 * 1000)!), 660);
  assert.equal(Math.round(durationMinutes(11 * 3600)!), 660);
  assert.equal(Math.round(durationMinutes("08:30:00")!), 510);
  assert.equal(Math.round(durationMinutes("1.02:00:00")!), 1560);
  assert.equal(durationMinutes(null), null);
  assert.equal(durationMinutes("junk"), null);
});

test("drivers: employee number, then login email, then full name; ambiguous is left", () => {
  const members = [
    { user_id: "u1", email: "a@x.com", display_name: "Ann Lee", employee_number: "E7" },
    { user_id: "u2", email: "bob@x.com", display_name: "Bob Ray", employee_number: null },
    { user_id: "u3", email: "c@x.com", display_name: "Cy Dunn", employee_number: null },
    { user_id: "u4", email: "d@x.com", display_name: "Cy Dunn", employee_number: null },
  ];
  const r = matchDrivers([
    { id: "g1", name: "ann.l", firstName: "A", lastName: "L", employeeNo: "e-7" },
    { id: "g2", name: "BOB@x.com", firstName: null, lastName: null, employeeNo: null },
    { id: "g3", name: "cdunn", firstName: "Cy", lastName: "Dunn", employeeNo: null },
    { id: "g4", name: "zed", firstName: "Zed", lastName: "Q", employeeNo: null },
  ], members);
  assert.deepEqual(r.pairs.map((p) => [p.driver.id, p.member.user_id, p.by]), [["g1", "u1", "employee"], ["g2", "u2", "email"]]);
  assert.deepEqual(r.unmatchedDrivers.map((d) => d.id), ["g3", "g4"]);
});

import { hosText } from "./progress.ts";
test("hosText: hours left, status, and color by the tightest clock", () => {
  const r = hosText({ driveLeftMin: 390, dutyLeftMin: 540, status: "ON", at: "2026-10-23T12:00:00Z" }, Date.parse("2026-10-23T12:02:00Z"));
  assert.equal(r.text, "6.5 h drive · 9.0 h window · On duty");
  assert.equal(hosText({ driveLeftMin: 30, dutyLeftMin: 540, status: null, at: "2026-10-23T12:00:00Z" }, Date.parse("2026-10-23T12:00:00Z")).color, "#f87171");
});

import { remainingDriveMin } from "./progress.ts";
test("remainingDriveMin: sums the legs, skips unknown stops", () => {
  const a = { lat: 27, lon: -82 }, b = { lat: 28, lon: -82 }, c = { lat: 29, lon: -82 };
  const two = remainingDriveMin(a, [b, c]);
  assert.ok(Math.abs(two - remainingDriveMin(a, [b, null, c])) < 1e-9);
  assert.ok(two > remainingDriveMin(a, [b]));
  assert.equal(remainingDriveMin(a, []), 0);
});

test("geotab: lists trailers and finds the one hooked to each vehicle now", async () => {
  const f = (async (_u: string, init: any) => {
    const b = JSON.parse(init.body);
    const ok = (result: unknown) => ({ ok: true, json: async () => ({ result }) });
    if (b.method === "Authenticate") return ok({ path: "my5.geotab.com", credentials: { database: "d", sessionId: "s2", userName: "u" } });
    if (b.params.typeName === "Trailer") return ok([{ id: "tr1", name: "3151" }, { id: "tr2", name: "3149" }]);
    return ok([
      { device: { id: "v1" }, trailer: { id: "tr1" }, activeFrom: "2026-10-01T00:00:00Z", activeTo: "4000-01-01T00:00:00Z" },
      { device: { id: "v1" }, trailer: { id: "tr2" }, activeFrom: "2026-09-01T00:00:00Z", activeTo: "2026-09-20T00:00:00Z" }, // ended
      { device: { id: "v2" }, trailer: { id: "tr2" }, activeFrom: "2026-10-05T00:00:00Z" },
    ]);
  }) as any;
  const p = geotabProvider({ database: "db-trailers", userName: "u", password: "p" }, f);
  assert.deepEqual(await p.listTrailers(), [{ id: "tr1", name: "3151", comment: null }, { id: "tr2", name: "3149", comment: null }]);
  const m = await p.attachedTrailers();
  assert.equal(m.get("v1"), "tr1");
  assert.equal(m.get("v2"), "tr2");
  const all = await p.attachedAll();
  assert.deepEqual(all.get("v1"), ["tr1"]); // the ended attachment isn't included
  assert.deepEqual(all.get("v2"), ["tr2"]);
});

test("geotab: trailer hooks and drops in a window, open attachments aren't drops, with a position", async () => {
  const f = (async (_u: string, init: any) => {
    const b = JSON.parse(init.body);
    const ok = (result: unknown) => ({ ok: true, json: async () => ({ result }) });
    if (b.method === "Authenticate") return ok({ path: "my5.geotab.com", credentials: { database: "d", sessionId: "s3", userName: "u" } });
    if (b.params.typeName === "LogRecord") return ok([{ latitude: 27.95, longitude: -82.45 }]);
    return ok([
      { trailer: { id: "tr1" }, activeFrom: "2026-10-01T09:00:00Z", activeTo: "2026-10-01T11:00:00Z" },
      { trailer: { id: "tr2" }, activeFrom: "2026-10-01T11:05:00Z", activeTo: "4000-01-01T00:00:00Z" },
      { trailer: { id: "tr0" }, activeFrom: "2026-09-28T00:00:00Z", activeTo: "2026-09-30T00:00:00Z" }, // wholly before the window
    ]);
  }) as any;
  const p = geotabProvider({ database: "db-events", userName: "u", password: "p" }, f);
  const ev = await p.trailerEvents("v1", "2026-10-01T00:00:00Z", "2026-10-01T23:00:00Z");
  assert.deepEqual(ev.map((e) => [e.type, e.trailerProviderId, e.lat]), [["hook", "tr1", 27.95], ["drop", "tr1", 27.95], ["hook", "tr2", 27.95]]);
});

import { stepExit, NEW_EXIT } from "./geofence.ts";
test("geofence: departure confirms after leaving the fence and moving, resets if it comes back", () => {
  let w = stepExit(NEW_EXIT, { inside: false, speedMph: 25, nowMs: 1000 });
  assert.equal(w.confirmedAtMs, null);
  w = stepExit(w, { inside: false, speedMph: 40, nowMs: 61_000 });
  assert.equal(w.confirmedAtMs, 1000);
  assert.deepEqual(stepExit(stepExit(NEW_EXIT, { inside: false, speedMph: 20, nowMs: 1000 }), { inside: true, speedMph: 0, nowMs: 30_000 }), NEW_EXIT);
  assert.equal(stepExit(NEW_EXIT, { inside: false, speedMph: 0, nowMs: 1000 }).outsideSinceMs, null); // parked just outside: not a departure
});

import { clockHM, clockColor } from "./progress.ts";
test("driver clocks: h:mm and color by minutes left", () => {
  assert.equal(clockHM(390), "6:30");
  assert.equal(clockHM(5), "0:05");
  assert.equal(clockHM(-4), "0:00");
  assert.equal(clockHM(null), "—");
  assert.equal(clockColor(30), "#f87171");
  assert.equal(clockColor(100), "#fb923c");
  assert.equal(clockColor(300), "#fff");
});

import { tripHosCheck } from "./progress.ts";
test("tripHosCheck: bad when the clocks can't cover the trip, warn when tight, null when fine", () => {
  assert.equal(tripHosCheck({ driveLeftMin: 120, dutyLeftMin: 600, remainingDriveMin: 200, stopMin: 60 })?.level, "bad");
  assert.equal(tripHosCheck({ driveLeftMin: 600, dutyLeftMin: 200, remainingDriveMin: 100, stopMin: 150 })?.level, "bad");
  assert.equal(tripHosCheck({ driveLeftMin: 220, dutyLeftMin: 900, remainingDriveMin: 200, stopMin: 60 })?.level, "warn");
  assert.equal(tripHosCheck({ driveLeftMin: 600, dutyLeftMin: 900, remainingDriveMin: 200, stopMin: 60 }), null);
  assert.equal(tripHosCheck({ driveLeftMin: null, dutyLeftMin: null, remainingDriveMin: 200, stopMin: 60 }), null);
});

import { shouldNotifyHosTrip } from "./hosTripNotify.ts";
test("hosTripNotify: baseline is silent; new tight/bad notify once; worsening notifies again", () => {
  assert.equal(shouldNotifyHosTrip(null, "bad"), false);
  assert.equal(shouldNotifyHosTrip("ok", "warn"), true);
  assert.equal(shouldNotifyHosTrip("warn", "warn"), false);
  assert.equal(shouldNotifyHosTrip("warn", "bad"), true);
  assert.equal(shouldNotifyHosTrip("bad", "bad"), false);
  assert.equal(shouldNotifyHosTrip("bad", "warn"), false);
  assert.equal(shouldNotifyHosTrip("bad", "ok"), false);
  assert.equal(shouldNotifyHosTrip("ok", "bad"), true);
});

test("vin decode: tidy make, year and model; junk becomes null", async () => {
  const { parseVinRow } = await import("./vinDecode.ts");
  assert.deepEqual(parseVinRow({ ModelYear: "2021", Make: "FREIGHTLINER", Model: "Cascadia" }), { year: 2021, make: "Freightliner", model: "Cascadia" });
  assert.deepEqual(parseVinRow({ ModelYear: "", Make: "", Model: "" }), { year: null, make: null, model: null });
});

test("groups: paths skip Geotab's built-in top groups; units count under each path", async () => {
  const { summarizeGroups } = await import("./groups.ts");
  const groups = [
    { id: "GroupCompanyId", name: "Company Group", parentId: null },
    { id: "g1", name: "Southeast", parentId: "GroupCompanyId" },
    { id: "g2", name: "Tampa", parentId: "g1" },
  ];
  const rows = summarizeGroups(groups, [{ name: "25184", groupIds: ["g2"] }, { name: "99", groupIds: ["GroupCompanyId"] }], [{ name: "3151" }]);
  assert.deepEqual(rows.map((r) => [r.path, r.trucks.length, r.trailers.length]), [["Southeast › Tampa", 1, 0], ["Whole company", 1, 1]]);
});

test("unit sync: new gets everything ticked; existing follows fill / overwrite", async () => {
  const { truckPatch, parseOpts, regionFor } = await import("./unitSync.ts");
  const o = parseOpts({ fields: { region: true }, existing: "fill", regionGroup: "Gemini Region 502", regionName: "502" });
  const geo = { vin: "1XKYD49X0LJ123456", plate: "ABC123" };
  const info = { year: 2021, make: "Freightliner", model: "Cascadia" };
  assert.equal(regionFor(["Gemini Region 502"], o), "502");
  assert.equal(regionFor(["Whole company"], o), null);
  assert.deepEqual(truckPatch(null, geo, info, "502", o), { vin_number: geo.vin, plate_number: "ABC123", make: "Freightliner", model: "Cascadia", year: 2021, region: "502" });
  const ours = { truck_id: "t", truck_name: "1", vin_number: null, plate_number: "OLD", make: null, model: "X", year: null, region: null };
  assert.deepEqual(truckPatch(ours, geo, info, "502", o), { vin_number: geo.vin, make: "Freightliner", year: 2021, region: "502" });
  const ow = parseOpts({ existing: "overwrite" });
  assert.equal((truckPatch(ours, geo, info, null, ow) as any).plate_number, "ABC123");
});

test("dedupe: retired dropped, one per name, most complete then newest wins", async () => {
  const { importableVehicles, isRetired } = await import("./dedupe.ts");
  const now = Date.parse("2026-10-22T00:00:00Z");
  assert.equal(isRetired({ activeTo: "2025-01-01T00:00:00Z" }, now), true);
  assert.equal(isRetired({ activeTo: "2050-01-01T00:00:00Z" }, now), false);
  assert.equal(isRetired({}, now), false);
  const v = (id: string, name: string, extra: object) => ({ id, name, vin: null, ...extra });
  const out = importableVehicles([
    v("a", "100", { activeFrom: "2020-01-01T00:00:00Z" }),
    v("b", "100", { vin: "1XKYD49X0LJ123456", activeFrom: "2019-01-01T00:00:00Z" }),
    v("c", "100", { vin: "1XKYD49X0LJ123456", activeFrom: "2022-01-01T00:00:00Z" }),
    v("d", "200", { activeTo: "2024-01-01T00:00:00Z" }),
    v("e", "300", {}),
  ] as any, now);
  assert.deepEqual(out.map((x) => x.id), ["c", "e"]);
});

test("geotab: shipping documents (BOL numbers) still on a vehicle, newest first, no repeats", async () => {
  const f = (async (_u: string, init: any) => {
    const b = JSON.parse(init.body);
    const ok = (result: unknown) => ({ ok: true, json: async () => ({ result }) });
    if (b.method === "Authenticate") return ok({ path: "my5.geotab.com", credentials: { database: "d", sessionId: "s3", userName: "u" } });
    return ok([
      { documentNumber: "754929", shipperName: "Citgo", commodity: "ULSD", activeFrom: "2026-10-22T10:00:00Z", activeTo: "4000-01-01T00:00:00Z" },
      { documentNumber: "754809", activeFrom: "2026-10-22T09:00:00Z" },
      { documentNumber: "754929", activeFrom: "2026-10-22T08:00:00Z" },            // repeat
      { documentNumber: "111", activeFrom: "2026-10-20T08:00:00Z", activeTo: "2026-10-20T12:00:00Z" }, // ended
      { documentNumber: " ", activeFrom: "2026-10-22T11:00:00Z" },
    ]);
  }) as any;
  const p = geotabProvider({ database: "db-ship", userName: "u", password: "p" }, f);
  const s = await p.activeShipments("v1");
  assert.deepEqual(s.map((x) => x.documentNumber), ["754929", "754809"]);
  assert.equal(s[0].shipperName, "Citgo");
});

test("geotab: a driver's last vehicle ignores other drivers' rows even if the filter was ignored; falls back to trips", async () => {
  const mk = (changes: any[], trips: any[]) => (async (_u: string, init: any) => {
    const b = JSON.parse(init.body);
    const ok = (result: unknown) => ({ ok: true, json: async () => ({ result }) });
    if (b.method === "Authenticate") return ok({ path: "my5.geotab.com", credentials: { database: "d", sessionId: "s4", userName: "u" } });
    return ok(b.params.typeName === "DriverChange" ? changes : trips);
  }) as any;
  const changes = [
    { device: { id: "vA" }, driver: { id: "d1" }, dateTime: "2026-10-22T10:00:00Z" },
    { device: { id: "vB" }, driver: { id: "d2" }, dateTime: "2026-10-22T11:00:00Z" }, // newer, but someone else
  ];
  const p = geotabProvider({ database: "db-last1", userName: "u", password: "p" }, mk(changes, []));
  assert.deepEqual(await p.lastVehicleOf("d1"), { vehicleId: "vA", at: "2026-10-22T10:00:00Z" });
  const p2 = geotabProvider({ database: "db-last2", userName: "u", password: "p" }, mk([], [{ device: { id: "vC" }, driver: { id: "d3" }, start: "2026-10-22T08:00:00Z", stop: "2026-10-22T09:00:00Z" }, { device: { id: "vD" }, driver: { id: "d9" }, stop: "2026-10-22T09:30:00Z" }]));
  assert.deepEqual(await p2.lastVehicleOf("d3"), { vehicleId: "vC", at: "2026-10-22T09:00:00Z" });
  assert.equal(await p2.lastVehicleOf("nobody"), null);
});

test("geotab: a vehicle parked for weeks still reports where it last logged", async () => {
  const old = new Date(Date.now() - 12 * 86400000).toISOString();
  const f = (async (_u: string, init: any) => {
    const b = JSON.parse(init.body);
    const ok = (result: unknown) => ({ ok: true, json: async () => ({ result }) });
    if (b.method === "Authenticate") return ok({ path: "my5.geotab.com", credentials: { database: "d", sessionId: "s5", userName: "u" } });
    const t = b.params.typeName;
    if (t === "DeviceStatusInfo") return ok([{ device: { id: "v1" }, speed: 0 }]); // no fix
    if (t === "LogRecord") {
      const to = Date.parse(b.params.search.toDate ?? new Date().toISOString());
      return ok(Date.now() - to > 86400000 ? [{ latitude: 27.92, longitude: -82.4, dateTime: old }] : []); // only the older window has one
    }
    return ok([]);
  }) as any;
  const p = geotabProvider({ database: "db-parked", userName: "u", password: "p" }, f);
  const r = await p.reading("v1");
  assert.equal(r.lat, 27.92);
  assert.equal(r.lon, -82.4);
  assert.equal(r.at, old);
});

import { driverOf } from "./geotab.ts";
test("geotab: a status record's driver is signed in unless it is only the last one", () => {
  assert.deepEqual(driverOf({ driver: { id: "b1" }, isHistoricLastDriver: false }), { current: "b1", historic: null });
  assert.deepEqual(driverOf({ driver: { id: "b1" }, isHistoricLastDriver: true }), { current: null, historic: "b1" });
  assert.deepEqual(driverOf({ driver: { id: "UnknownDriverId" } }), { current: null, historic: null });
  assert.deepEqual(driverOf({}), { current: null, historic: null });
});
