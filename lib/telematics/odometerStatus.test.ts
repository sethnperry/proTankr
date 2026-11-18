import test from "node:test";
import assert from "node:assert/strict";
import { odometerStatus, type OdometerReading as TruckReading } from "./odometerStatus.ts";

const now = Date.parse("2026-11-18T20:00:00Z");
const r = (o: Partial<TruckReading> = {}): TruckReading => ({ odometerMi: 329828, at: "2026-11-18T19:55:00Z", ...o });

test("a current odometer reading is ok", () => assert.equal(odometerStatus(r(), false, now), "ok"));
test("no tracker linked is nothing to warn about", () => assert.equal(odometerStatus(null, false, now), "none"));
test("a failing provider warns", () => assert.equal(odometerStatus(null, true, now), "warn"));
test("linked but no odometer value warns", () => assert.equal(odometerStatus(r({ odometerMi: null }), false, now), "warn"));
test("a device that isn't communicating warns", () => assert.equal(odometerStatus(r({ communicating: false }), false, now), "warn"));
test("a reading more than 12 hours old warns", () => assert.equal(odometerStatus(r({ at: "2026-11-18T06:00:00Z" }), false, now), "warn"));
