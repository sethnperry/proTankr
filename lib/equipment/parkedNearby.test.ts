import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCandidates, mapsUrl, latLonText, type ParkPin } from "./parkedNearby.ts";
import type { ComboLite } from "./lastEquipment.ts";

const ME = "me", PEDRO = "pedro";
const here = { lat: 26.7141, lon: -81.8156 };            // Loves 495, Fort Myers
const tampa = { lat: 27.95, lon: -82.46 };
const combo = (o: Partial<ComboLite>): ComboLite => ({ combo_id: "c", truck_id: null, trailer_id: null, claimed_by: null, active: true, ...o });
const pin = (kind: "truck" | "trailer", id: string, at: { lat: number; lon: number }, by = PEDRO): ParkPin =>
  ({ unit_kind: kind, unit_id: id, ...at, place_label: null, parked_by: by, parked_at: "2026-11-04T05:00:00Z" });

test("the example: Pedro parked 25185 with 3151 at Loves 495, my own 25184 is in Tampa", () => {
  const c = buildCandidates({
    pins: [pin("truck", "T185", here), pin("trailer", "R3151", here), pin("truck", "T184", tampa), pin("trailer", "R582", tampa)],
    activeCombos: [combo({ combo_id: "p1", truck_id: "T185", trailer_id: "R3151" }), combo({ combo_id: "p2", truck_id: "T184", trailer_id: "R582" })],
    me: ME, myPos: here, last: { truckId: "T184", trailerId: "R582" },
  });
  assert.deepEqual(c.map((x) => [x.truckId, x.trailerId, x.isLast]), [["T185", "R3151", false], ["T184", "R582", true]]);
  assert.equal(c[0].comboId, "p1");
  assert.equal(c[0].pin?.parkedBy, PEDRO);
  assert.ok((c[0].distanceMi ?? 9) < 0.01);
  assert.equal(c[1].state.kind, "parked");
});
test("my last truck that is also right here is listed once, marked as mine", () => {
  const c = buildCandidates({
    pins: [pin("truck", "T184", here)], activeCombos: [combo({ truck_id: "T184", trailer_id: "R1" })],
    me: ME, myPos: here, last: { truckId: "T184", trailerId: "R1" },
  });
  assert.equal(c.length, 1);
  assert.equal(c[0].isLast, true);
});
test("several free pairs here: nearest first; far ones and held ones are left out", () => {
  const near = { lat: here.lat + 0.001, lon: here.lon };   // ~0.07 mi
  const edge = { lat: here.lat + 0.005, lon: here.lon };   // ~0.35 mi
  const far = { lat: here.lat + 0.05, lon: here.lon };     // ~3.5 mi
  const c = buildCandidates({
    pins: [pin("truck", "A", edge), pin("truck", "B", near), pin("truck", "C", far), pin("truck", "D", near)],
    activeCombos: [combo({ combo_id: "ca", truck_id: "A", trailer_id: "a" }), combo({ combo_id: "cb", truck_id: "B", trailer_id: "b" }),
      combo({ combo_id: "cc", truck_id: "C", trailer_id: "c" }), combo({ combo_id: "cd", truck_id: "D", trailer_id: "d", claimed_by: PEDRO })],
    me: ME, myPos: here, last: null,
  });
  assert.deepEqual(c.map((x) => x.truckId), ["B", "A"]);
});
test("a truck parked on its own, with no pairing, is offered as a truck-only choice", () => {
  const c = buildCandidates({ pins: [pin("truck", "T9", here)], activeCombos: [], me: ME, myPos: here, last: null });
  assert.deepEqual(c.map((x) => [x.truckId, x.trailerId, x.comboId, x.touchesActive]), [["T9", null, null, false]]);
});
test("no phone position: only my last truck is offered", () => {
  const c = buildCandidates({
    pins: [pin("truck", "T185", here)], activeCombos: [combo({ truck_id: "T185", trailer_id: "R1" })],
    me: ME, myPos: null, last: { truckId: "T184", trailerId: null },
  });
  assert.deepEqual(c.map((x) => x.truckId), ["T184"]);
});
test("my last truck held by someone else shows as in use; touching an active pairing means a force coupling", () => {
  const c = buildCandidates({
    pins: [], activeCombos: [combo({ truck_id: "T184", trailer_id: "R1", claimed_by: PEDRO })],
    me: ME, myPos: here, last: { truckId: "T184", trailerId: "R1" },
  });
  assert.equal(c[0].state.kind, "in_use");
  assert.equal(c[0].touchesActive, true);
});
test("the map link and the coordinates text", () => {
  assert.equal(mapsUrl(26.7141685, -81.8155746), "https://www.google.com/maps?q=26.714168,-81.815575");
  assert.equal(latLonText(26.7141685, -81.8155746), "26.7142, -81.8156");
});
