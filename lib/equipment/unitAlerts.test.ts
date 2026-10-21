import { test } from "node:test";
import assert from "node:assert/strict";
import { unitAlerts, milesPerDay, DEFAULT_MILES_PER_DAY } from "./unitAlerts.ts";

const today = "2026-10-14";
const now = Date.parse("2026-10-14T12:00:00Z");
const type = (id: string, kind: "miles" | "duration" | "hours", every: number, applies: "truck" | "trailer" | "both" = "truck") =>
  ({ service_type_id: id, name: id, interval_kind: kind, interval_value: every, applies_to: applies, is_active: true });

test("miles per day uses the truck's own trips once there's a week of them", () => {
  assert.equal(milesPerDay([{ miles: 1000, at: "2026-10-12T00:00:00Z" }, { miles: 3000, at: "2026-10-14T00:00:00Z" }], now).rate, DEFAULT_MILES_PER_DAY);
  const r = milesPerDay([{ miles: 1000, at: "2026-10-04T00:00:00Z" }, { miles: 8000, at: "2026-10-14T00:00:00Z" }], now);
  assert.equal(r.measured, true);
  assert.equal(r.rate, 700);
});

test("latest record per type wins; miles turn into days; permits counted", () => {
  const s = unitAlerts({
    unit: "truck",
    permits: [{ name: "Registration", expiration_date: "2026-10-20" }, { name: "IFTA", expiration_date: "2027-06-01" }],
    types: [type("Dry", "miles", 65000), type("Wet", "miles", 65000), type("Greasing", "hours", 500, "both")],
    records: [
      { service_type_id: "Dry", date: "2026-05-05", reading_value: 226086, created_at: "a" },
      { service_type_id: "Dry", date: "2026-09-13", reading_value: 293248, created_at: "b" },
      { service_type_id: "Wet", date: "2026-07-05", reading_value: 261442, created_at: "c" },
    ],
    odometer: [{ miles: 310541, at: "2026-10-14T00:00:00Z" }],
    todayIso: today, nowMs: now,
  });
  // Wet due at 326,442: 15,901 mi at 500/day = 31 days -> not yet. Dry due 358,248 -> not yet.
  assert.equal(s.count, 1);
  assert.equal(s.alerts[0].name, "Registration");
  assert.equal(s.worst, "expiring");
});

test("overdue miles and dated trailer service are red/yellow; trailer ignores miles", () => {
  const truck = unitAlerts({
    unit: "truck", permits: [], types: [type("Dry", "miles", 65000)],
    records: [{ service_type_id: "Dry", date: "2026-05-05", reading_value: 226086, created_at: "a" }],
    odometer: [{ miles: 310541, at: "2026-10-14T00:00:00Z" }], todayIso: today, nowMs: now,
  });
  assert.equal(truck.worst, "expired");
  assert.match(truck.alerts[0].detail, /Overdue by 19,455 mi/);
  const trailer = unitAlerts({
    unit: "trailer", permits: [], types: [type("Inspect", "duration", 90, "trailer"), type("Dry", "miles", 65000, "both")],
    records: [
      { service_type_id: "Inspect", date: "2026-07-25", reading_value: null, created_at: "a" },
      { service_type_id: "Dry", date: "2026-01-01", reading_value: 1, created_at: "b" },
    ],
    todayIso: today, nowMs: now,
  });
  assert.equal(trailer.count, 1);
  assert.equal(trailer.worst, "soon");
});

test("service by engine hours counts from the live hour meter, and waits for it", () => {
  const types = [{ service_type_id: "h", name: "Oil", interval_kind: "hours" as const, interval_value: 500, applies_to: "truck" as const, is_active: true }];
  const records = [{ service_type_id: "h", date: "2026-09-01", reading_value: 3000, created_at: "2026-09-01T00:00:00Z" }];
  const none = unitAlerts({ unit: "truck", permits: [], types, records, todayIso: "2026-10-23" });
  assert.equal(none.alerts.length, 0); // no live hour meter: nothing current to count from
  const soon = unitAlerts({ unit: "truck", permits: [], types, records, engineHours: 3490, todayIso: "2026-10-23" });
  assert.equal(soon.alerts.length, 1);
  assert.match(soon.alerts[0].detail, /Due in 10 h/);
  const over = unitAlerts({ unit: "truck", permits: [], types, records, engineHours: 3520, todayIso: "2026-10-23" });
  assert.equal(over.alerts[0].state, "expired");
  assert.match(over.alerts[0].detail, /Overdue by 20 h/);
  // a trailer never counts hours
  assert.equal(unitAlerts({ unit: "trailer", permits: [], types: [{ ...types[0], applies_to: "both" as const }], records, engineHours: 3520, todayIso: "2026-10-23" }).alerts.length, 0);
});
