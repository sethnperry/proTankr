import test from "node:test";
import assert from "node:assert/strict";
import { offDutyAsk, beginTripShift, dutyChip, telematicsLive } from "./dutyStatus.ts";

const now = Date.parse("2026-11-11T12:00:00Z");
const hos = (status: string, at = "2026-11-11T11:58:00Z") => ({ status, statusSince: "2026-11-11T09:00:00Z", at });

test("live reading shows the status; stale or missing shows nothing", () => {
  assert.deepEqual(dutyChip(hos("D"), now), { text: "Driving", on: true, since: "2026-11-11T09:00:00Z" });
  assert.equal(dutyChip(hos("OFF"), now)?.on, false);
  assert.equal(dutyChip(hos("D", "2026-11-11T11:00:00Z"), now), null);
  assert.equal(telematicsLive(null, now), false);
});
test("begin trip asks only when telematics is missing or not on duty", () => {
  assert.deepEqual(beginTripShift(hos("ON"), now), { ask: false });
  assert.equal(beginTripShift(hos("OFF"), now).ask, true);
  assert.equal(beginTripShift(null, now).ask, true);
});

test("off duty asks at once when live, shift open and not dismissed", () => {
  const off = (since: string) => ({ status: "OFF", statusSince: since, at: "2026-11-11T11:58:00Z" });
  const base = { nowMs: now, shiftOpen: true, dismissedSince: null };
  assert.equal(offDutyAsk({ ...base, hos: off("2026-11-11T11:55:00Z") })?.minutes, 5);
  assert.equal(offDutyAsk({ ...base, hos: off("2026-11-11T11:00:00Z") })?.minutes, 60);
  assert.equal(offDutyAsk({ ...base, shiftOpen: false, hos: off("2026-11-11T11:00:00Z") }), null);
  assert.equal(offDutyAsk({ ...base, dismissedSince: "2026-11-11T11:00:00Z", hos: off("2026-11-11T11:00:00Z") }), null);
  assert.equal(offDutyAsk({ ...base, hos: hos("ON") }), null);
});
