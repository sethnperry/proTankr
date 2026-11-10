import test from "node:test";
import assert from "node:assert/strict";
import { ullage } from "./ullage.ts";

test("room is counted at 100% and 90% of capacity", () => {
  const u = ullage([{ capacity: 10000, volume: 4000 }, { capacity: 8000, volume: 2000 }], 9000);
  assert.deepEqual([u.room100, u.room90], [12000, 10200]);
  assert.equal(u.fit, "fits");
});
test("a load that fits only past 90% is tight; past 100% is no, and by how much", () => {
  const tanks = [{ capacity: 10000, volume: 4000 }];
  assert.equal(ullage(tanks, 5800).fit, "tight");   // room90 5000, room100 6000
  const no = ullage(tanks, 6500);
  assert.deepEqual([no.fit, no.shortBy], ["no", 500]);
});
test("a tank over its 90% line adds no room and never subtracts any", () => {
  const u = ullage([{ capacity: 10000, volume: 9500 }, { capacity: 10000, volume: 0 }], 100);
  assert.deepEqual([u.room100, u.room90], [10500, 9000]);
});
test("tanks without a capacity or a volume are left out and counted", () => {
  const u = ullage([{ capacity: null, volume: 100 }, { capacity: 5000, volume: null }], 1000);
  assert.deepEqual([u.counted, u.missing, u.fit], [0, 2, null]);
});
