import test from "node:test";
import assert from "node:assert/strict";
import { buildTrackRows, type TrackUnit } from "./trackList.ts";

const u = (id: string, name: string, kind: "truck" | "trailer", o: Partial<TrackUnit> = {}): TrackUnit => ({
  id, name, kind, region: "SE", localArea: null, currentRegion: null, currentLocalArea: null,
  statusCode: null, statusNotes: null, subStatus: null, statusLocation: null, statusUpdatedAt: null, ...o,
});

test("buildTrackRows: pairings first by truck number, loose trucks then trailers, all natural order", () => {
  const trucks = [u("t10", "10", "truck"), u("t2", "2", "truck"), u("t3", "3", "truck")];
  const trailers = [u("r9", "9", "trailer"), u("r1", "1", "trailer"), u("r5", "5", "trailer")];
  const r = buildTrackRows(trucks, trailers, [{ comboId: "c1", truckId: "t10", trailerId: "r9" }, { comboId: "c2", truckId: "t2", trailerId: "r1" }], { region: null, localArea: null }, "");
  assert.deepEqual(r.combos.map((c) => c.truck.name), ["2", "10"]);
  assert.deepEqual(r.trucks.map((t) => t.name), ["3"]);
  assert.deepEqual(r.trailers.map((t) => t.name), ["5"]);
});

test("buildTrackRows: query matches either unit of a pairing; filter uses home or current region", () => {
  const trucks = [u("t1", "100", "truck"), u("t2", "200", "truck", { region: "NW", currentRegion: "SE" })];
  const trailers = [u("r1", "370", "trailer")];
  const combos = [{ comboId: "c1", truckId: "t1", trailerId: "r1" }];
  assert.equal(buildTrackRows(trucks, trailers, combos, { region: null, localArea: null }, "370").combos.length, 1);
  assert.equal(buildTrackRows(trucks, trailers, combos, { region: null, localArea: null }, "999").combos.length, 0);
  assert.deepEqual(buildTrackRows(trucks, trailers, combos, { region: "SE", localArea: null }, "").trucks.map((t) => t.name), ["200"]); // borrowed in
  assert.deepEqual(buildTrackRows(trucks, trailers, [], { region: null, localArea: null, awayOnly: true }, "").trucks.map((t) => t.name), ["200"]);
});
