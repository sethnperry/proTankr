import { test } from "node:test";
import assert from "node:assert/strict";
import { deadheadSegments, totals, type DhStop } from "./deadhead.ts";

const rack = (name: string, city: string, arrived: string, left: string, noLoad = false): DhStop => ({ name, city, state: "FL", arrivedAt: arrived, leftAt: left, noLoad });

test("the run to the rack, each hop after a rack with no load, and the run back are the empty segments", () => {
  const segs = deadheadSegments({
    startedAt: "2026-11-03T08:00:00Z", start: { city: "Ocala", state: "FL" },
    racks: [rack("Marathon", "Tampa", "2026-11-03T10:00:00Z", "2026-11-03T10:40:00Z", true), rack("Kinder Morgan", "Tampa", "2026-11-03T10:50:00Z", "2026-11-03T11:30:00Z"), ],
    deliveries: [{ name: "Store 12", city: "Orlando", state: "FL", arrivedAt: "2026-11-03T13:00:00Z", leftAt: "2026-11-03T13:40:00Z" }],
    completedAt: "2026-11-03T14:40:00Z",
  });
  assert.deepEqual(segs.map((s) => [s.key, s.minutes, s.eligible]), [["to_rack", 120, true], ["rack_hop:0", 10, false], ["return", 60, true]]);
  assert.equal(segs[0].from, "Ocala, FL");
  assert.equal(segs[2].to, "Back");
});

test("a rack where the driver loaded makes no hop; a trip with nothing finished makes no return", () => {
  const segs = deadheadSegments({ startedAt: "2026-11-03T08:00:00Z", start: { city: "Tampa", state: "FL" }, racks: [rack("A", "Tampa", "2026-11-03T08:30:00Z", "2026-11-03T09:00:00Z")], deliveries: [], completedAt: null });
  assert.deepEqual(segs.map((s) => s.key), ["to_rack"]);
  assert.equal(segs[0].eligible, false, "same city start");
});

test("billable totals count only eligible segments, by what the admin decided", () => {
  const segs = deadheadSegments({
    startedAt: "2026-11-03T08:00:00Z", start: { city: "Ocala", state: "FL" },
    racks: [rack("Marathon", "Tampa", "2026-11-03T10:00:00Z", "2026-11-03T10:40:00Z", true), rack("KM", "Miami", "2026-11-03T13:40:00Z", "2026-11-03T14:00:00Z")],
    deliveries: [], completedAt: null,
  });
  assert.deepEqual(totals(segs, {}), { billable: 0, notBillable: 0, unreviewed: 120 + 180 });
  assert.deepEqual(totals(segs, { to_rack: true, "rack_hop:0": false }), { billable: 120, notBillable: 180, unreviewed: 0 });
});

import { deadheadRows, deadheadSummary, deadheadColumns } from "./deadheadReport.ts";
import { toCsv } from "../reports/reportShell.ts";

test("the period report lists eligible segments with the admin's decision and totals them", () => {
  const trip: any = { trip_id: "T1", driver_id: "d1", started_at: "2026-11-03T08:00:00Z", start_city: "Ocala", start_state: "FL", completed_at: "2026-11-03T14:00:00Z" };
  const pickups: any[] = [{ trip_id: "T1", seq: 1, name: "Marathon", city: "Tampa", state: "FL", arrived_at: "2026-11-03T10:00:00Z", left_at: "2026-11-03T10:30:00Z", outcome: "loaded" }];
  const rows = deadheadRows([trip], pickups, [], { T1: { to_rack: true } }, () => ({ name: "x", city: null, state: null }));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].billable, true);
  assert.deepEqual(deadheadSummary(rows), [{ label: "Billable", value: "2h 00m" }, { label: "Not billable", value: "0m" }, { label: "Not reviewed", value: "0m" }]);
  assert.ok(toCsv(deadheadColumns(() => "Seth"), rows).includes("Ocala, FL → Tampa, FL"));
});
