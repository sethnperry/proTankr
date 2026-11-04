import { test } from "node:test";
import assert from "node:assert/strict";
import { equipmentState, lastFromTrips, resolveLast, type ComboLite } from "./lastEquipment.ts";

const ME = "me", JOHN = "john";
const eq = { truckId: "T1", trailerId: "R1" };
const combo = (o: Partial<ComboLite>): ComboLite => ({ truck_id: null, trailer_id: null, claimed_by: null, active: true, ...o });

test("nothing coupled: parked", () => {
  assert.deepEqual(equipmentState(eq, [], ME), { kind: "parked", holderId: null });
  // an active pairing with nobody claiming it is not "in use"
  assert.equal(equipmentState(eq, [combo({ truck_id: "T1", trailer_id: "R1", claimed_by: null })], ME).kind, "parked");
});
test("another driver holds the truck, or just the trailer: in use, by them", () => {
  assert.deepEqual(equipmentState(eq, [combo({ truck_id: "T1", trailer_id: "R9", claimed_by: JOHN })], ME), { kind: "in_use", holderId: JOHN });
  assert.deepEqual(equipmentState(eq, [combo({ truck_id: "T9", trailer_id: "R1", claimed_by: JOHN })], ME), { kind: "in_use", holderId: JOHN });
});
test("I already hold it", () => {
  assert.equal(equipmentState(eq, [combo({ truck_id: "T1", trailer_id: "R1", claimed_by: ME })], ME).kind, "mine");
});
test("an inactive pairing doesn't count, and an unrelated one neither", () => {
  assert.equal(equipmentState(eq, [combo({ truck_id: "T1", trailer_id: "R1", claimed_by: JOHN, active: false })], ME).kind, "parked");
  assert.equal(equipmentState(eq, [combo({ truck_id: "T8", trailer_id: "R8", claimed_by: JOHN })], ME).kind, "parked");
});
test("a truck-only last use (bobtail) only looks at the truck", () => {
  assert.equal(equipmentState({ truckId: "T1", trailerId: null }, [combo({ truck_id: "T5", trailer_id: "R1", claimed_by: JOHN })], ME).kind, "parked");
});
test("the trailer offered is whatever is coupled to the truck now, else the one remembered", () => {
  assert.deepEqual(resolveLast({ truckId: "T1", trailerId: "R1" }, null, [combo({ truck_id: "T1", trailer_id: "R2", claimed_by: JOHN })]), { truckId: "T1", trailerId: "R2" });
  assert.deepEqual(resolveLast({ truckId: "T1", trailerId: "R1" }, null, []), { truckId: "T1", trailerId: "R1" });
});
test("no memory: fall back to the last trip; nothing at all: null", () => {
  const trips = lastFromTrips([
    { truck_id: "A", trailer_id: "a", started_at: "2026-10-01T00:00:00Z", driver_id: ME },
    { truck_id: "B", trailer_id: null, started_at: "2026-11-02T00:00:00Z", driver_id: ME },
    { truck_id: "C", trailer_id: "c", started_at: "2026-11-03T00:00:00Z", driver_id: JOHN },
  ], ME);
  assert.deepEqual(trips, { truckId: "B", trailerId: null });
  assert.deepEqual(resolveLast(null, trips, []), { truckId: "B", trailerId: null });
  assert.equal(resolveLast(null, null, []), null);
  assert.equal(lastFromTrips([], ME), null);
});
