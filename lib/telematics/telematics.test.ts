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
    if (body.params.search.diagnosticSearch.id === "DiagnosticFuelLevelId") return ok([{ data: 61.24, dateTime: "2026-10-23T09:30:00Z" }]);
    if (body.params.search.diagnosticSearch.id === "DiagnosticOdometerAdjustmentId") return ok([]);
    return ok([{ data: 160934.4, dateTime: "2026-10-23T09:00:00Z" }]);
  }) as any;
  const p = geotabProvider({ database: "db-test", userName: "u", password: "p" }, f);
  assert.deepEqual(await p.listVehicles(), [{ id: "b1", name: "25184", vin: "ABC" }]);
  const r = await p.reading("b1");
  assert.equal(r.odometerMi, 100);
  assert.equal(r.lat, 27.9);
  assert.equal(r.speedMph, 62);
  assert.equal(r.fuelLevelPct, 61.2);
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
  assert.deepEqual(await p.listTrailers(), [{ id: "tr1", name: "3151" }, { id: "tr2", name: "3149" }]);
  const m = await p.attachedTrailers();
  assert.equal(m.get("v1"), "tr1");
  assert.equal(m.get("v2"), "tr2");
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
