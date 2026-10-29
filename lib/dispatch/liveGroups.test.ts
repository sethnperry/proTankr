import test from "node:test";
import assert from "node:assert/strict";
import { classifyLive, filterLive, liveChipCounts } from "./liveGroups.ts";

const NOW = Date.parse("2026-10-30T18:00:00Z");
const mk = (o: any): any => ({ trip: { trip_id: o.id, status: o.status ?? "loading", started_at: "2026-10-30T15:00:00Z" }, driverName: o.driver ?? "A", truckName: "1", trailerName: "2", orderNumbers: ["77"],
  pickups: o.pickups ?? [], deliveries: o.deliveries ?? [], compLoads: o.compLoads ?? [] });
const pk = (o: any) => ({ seq: 1, name: "Buckey North", city: "Tampa", state: "FL", arrived_at: null, left_at: null, outcome: null, ...o });
const dl = (o: any) => ({ seq: 1, location_id: null, one_off_name: "Loves 495", arrived_at: null, left_at: null, status: "planned", ...o });

test("classifies where each load is", () => {
  const rows = classifyLive([
    mk({ id: "a", pickups: [pk({})], deliveries: [dl({})] }),                                           // heading to the rack
    mk({ id: "b", pickups: [pk({ arrived_at: "2026-10-30T16:30:00Z" })], deliveries: [dl({})] }),       // at the rack 90 min: delayed
    mk({ id: "c", status: "in_transit", pickups: [pk({ arrived_at: "x", left_at: "2026-10-30T17:00:00Z" })], deliveries: [dl({})], compLoads: [{ disposition: "loaded" }] }), // to the store
    mk({ id: "d", status: "delivering", pickups: [pk({ arrived_at: "x", left_at: "y" })], deliveries: [dl({ arrived_at: "2026-10-30T17:50:00Z" })] }), // unloading 10 min
  ], new Map(), NOW, { loading: 30, delivery: 30 });
  assert.deepEqual(rows.map((r) => [r.tripId, r.kind, r.delayed]), [["a", "to_rack", false], ["b", "loading", true], ["c", "to_drop", false], ["d", "unloading", false]]);
  assert.deepEqual(liveChipCounts(rows), { enRoute: 2, onSite: 2, delayed: 1 });
  assert.equal(filterLive(rows, "north").length, 2);
  assert.equal(filterLive(rows, "77").length, 4);
  assert.equal(filterLive(rows, "zzz").length, 0);
});

test("a delay that has ended and is moving again counts as delayed, with a new ETA", () => {
  const trip = mk({ id: "r", status: "in_transit", pickups: [pk({ arrived_at: "2026-10-30T15:30:00Z", left_at: "2026-10-30T17:00:00Z" })], deliveries: [dl({ location_id: "L1" })], compLoads: [{ disposition: "loaded" }] });
  trip.trip.truck_id = "T1";
  const rows = classifyLive([trip], new Map(), NOW, { loading: 30, delivery: 30 }, (q) => (q.truckId === "T1" && q.kind === "to_drop" ? NOW + 40 * 60000 : null));
  assert.equal(rows[0].recovered, true);
  assert.equal(rows[0].delayMin, 90);
  assert.equal(rows[0].etaMs, NOW + 40 * 60000);
  assert.equal(liveChipCounts(rows).delayed, 1);
  // A quick stop is not a delay.
  const quick = mk({ id: "q", status: "in_transit", pickups: [pk({ arrived_at: "2026-10-30T16:50:00Z", left_at: "2026-10-30T17:00:00Z" })], deliveries: [dl({})], compLoads: [{ disposition: "loaded" }] });
  assert.equal(classifyLive([quick], new Map(), NOW, { loading: 30, delivery: 30 })[0].recovered, undefined);
});
