import { test } from "node:test";
import assert from "node:assert/strict";
import { findConflicts, liveCounts, type ActiveReport, type FleetTripLite } from "./conflicts.ts";

const f = (id: string, over: any = {}): FleetTripLite => ({
  driverName: `D${id}`, truckName: `T${id}`, pickups: [],
  ...over,
  trip: { trip_id: id, driver_id: `u${id}`, status: "loading", ...(over.trip ?? {}) },
} as FleetTripLite);
const pk = (over: any = {}) => ({ pickup_id: "p", seq: 1, terminal_id: "T1", arrived_at: null, left_at: null, outcome: null, load_id: null, ...over });
const rep = (over: Partial<ActiveReport> = {}): ActiveReport => ({
  reportId: "r1", terminalId: "T1", type: "out_of_product", productId: "D2", supplierName: null, createdAt: "2026-10-19T10:00:00Z", ...over,
});

test("product out: hits trucks going for that product, maybe for unknown plans, skips others", () => {
  const trips = [
    f("a", { pickups: [pk({ planned_comps: [{ comp_number: 1, product_id: "D2" }] })] }),
    f("b", { pickups: [pk({ arrived_at: "x" })] }),                                  // plan unknown
    f("c", { pickups: [pk({ load_id: "L1" })] }),                                     // planned load says 87 only
    f("d", { pickups: [pk({ left_at: "x" })] }),                                       // already left
    f("e", { pickups: [pk({ terminal_id: "T2" })] }),                                  // elsewhere
    f("p", { trip: { status: "parked" }, pickups: [pk()] }),                          // parked
  ];
  const c = findConflicts(trips, [rep()], new Map([["L1", ["87"]]]));
  assert.equal(c.length, 1);
  assert.equal(c[0].severity, "hit");
  assert.deepEqual(c[0].trucks.map((t) => [t.tripId, t.severity]), [["a", "hit"], ["b", "maybe"]]);
});

test("terminal-wide and allocation reports hit every truck headed there; no trucks = no conflict", () => {
  const trips = [f("a", { pickups: [pk({ planned_comps: [{ comp_number: 1, product_id: "87" }] })] })];
  assert.equal(findConflicts(trips, [rep({ type: "long_line", productId: null })])[0].trucks[0].severity, "hit");
  assert.equal(findConflicts(trips, [rep({ type: "out_of_allocation", productId: null, supplierName: "Atlas" })])[0].severity, "hit");
  assert.equal(findConflicts(trips, [rep({ type: "out_of_allocation", productId: "D2" })]).length, 0);
  assert.equal(findConflicts([], [rep()]).length, 0);
});

test("rack-hopped pickups don't count; worst terminal first", () => {
  const trips = [
    f("a", { pickups: [pk({ outcome: "no_load", left_at: "x" }), pk({ pickup_id: "q", seq: 2, terminal_id: "T2" })] }),
    f("b", { pickups: [pk()] }),
  ];
  const c = findConflicts(trips, [rep(), rep({ reportId: "r2", terminalId: "T2", type: "terminal_issue", productId: null })]);
  assert.deepEqual(c.map((x) => [x.terminalId, x.severity]), [["T2", "hit"], ["T1", "maybe"]]);
});

test("live counts", () => {
  const trips = [
    { ...f("a", { pickups: [pk({ arrived_at: "x" })] }), loadedComps: 0 },
    { ...f("b", { pickups: [pk()] }), loadedComps: 0 },
    { ...f("c", { pickups: [pk({ left_at: "x" })] }), loadedComps: 2 },
    { ...f("d", { trip: { status: "parked" } }), loadedComps: 2 },
  ];
  assert.deepEqual(liveCounts(trips), { atRack: 1, enRouteToRack: 1, loadedRolling: 1, parked: 1 });
});
