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
    if (body.params.search.diagnosticSearch.id === "DiagnosticOdometerAdjustmentId") return ok([]);
    return ok([{ data: 160934.4, dateTime: "2026-10-23T09:00:00Z" }]);
  }) as any;
  const p = geotabProvider({ database: "db-test", userName: "u", password: "p" }, f);
  assert.deepEqual(await p.listVehicles(), [{ id: "b1", name: "25184", vin: "ABC" }]);
  const r = await p.reading("b1");
  assert.equal(r.odometerMi, 100);
  assert.equal(r.lat, 27.9);
  assert.equal(r.speedMph, 62);
  assert.ok(calls.some((c) => c.url === "https://my5.geotab.com/apiv1" && c.type === "StatusData"));
});

test("secrets round-trip and a wrong key fails", () => {
  process.env.TELEMATICS_ENC_KEY = "k1";
  const blob = encryptSecret("hunter2");
  assert.equal(decryptSecret(blob), "hunter2");
  process.env.TELEMATICS_ENC_KEY = "k2";
  assert.throws(() => decryptSecret(blob));
});
