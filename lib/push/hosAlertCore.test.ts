import test from "node:test";
import assert from "node:assert/strict";
import { planHosAlerts, type DriverCase } from "./hosAlertCore.ts";

const NOW = Date.parse("2026-10-23T12:00:00Z");
const base: DriverCase = {
  userId: "u1", name: "Seth", truckName: "25184",
  hos: { driveLeftMin: 600, dutyLeftMin: 800, at: "2026-10-23T11:58:00Z" },
  pos: { lat: 27.0, lon: -82.0, at: "2026-10-23T11:59:00Z" },
  racksLeft: [], dropsLeft: [{ lat: 28.0, lon: -82.0 }], prevTrip: null, prevLow: null,
};

test("push: nothing when the clocks are fine", () => {
  const r = planHosAlerts([base], NOW);
  assert.equal(r.notifications.length, 0);
  assert.deepEqual(r.state, [{ userId: "u1", trip: "ok", low: "none" }]);
});

test("push: low clocks go to dispatch once; red re-notifies; same level stays quiet", () => {
  const low = { ...base, hos: { ...base.hos!, driveLeftMin: 90 } };
  let r = planHosAlerts([low], NOW);
  assert.deepEqual(r.notifications.filter((n) => n.to === "staff").map((n) => n.title), ["Seth is low on hours"]);
  assert.equal(planHosAlerts([{ ...low, prevLow: "orange" }], NOW).notifications.filter((n) => n.to === "staff").length, 0);
  const red = { ...base, hos: { ...base.hos!, driveLeftMin: 30 }, prevLow: "orange" as const };
  assert.equal(planHosAlerts([red], NOW).notifications.filter((n) => n.to === "staff").length, 1);
});

test("push: the driver is told when the trip won't fit, once", () => {
  const tight = { ...base, hos: { ...base.hos!, driveLeftMin: 90 }, dropsLeft: [{ lat: 30.0, lon: -82.0 }] }; // ~200+ mi to go
  const r = planHosAlerts([tight], NOW);
  const d = r.notifications.find((n) => n.to === "driver");
  assert.ok(d && /won't cover/.test(d.title));
  assert.equal(r.state[0].trip, "bad");
  assert.equal(planHosAlerts([{ ...tight, prevTrip: "bad" }], NOW).notifications.some((n) => n.to === "driver"), false);
});

test("push: stale clocks or position change nothing", () => {
  assert.equal(planHosAlerts([{ ...base, hos: { ...base.hos!, at: "2026-10-23T11:00:00Z" } }], NOW).state.length, 0);
  const noPos = planHosAlerts([{ ...base, pos: null, prevTrip: "warn" }], NOW);
  assert.equal(noPos.state[0].trip, "warn"); // kept
});
