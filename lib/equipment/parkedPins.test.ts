import test from "node:test";
import assert from "node:assert/strict";
import { buildPins, type ParkRow } from "./parkedPins.ts";

const row = (kind: "truck" | "trailer", id: string, lat: number, lon: number, at = "2026-11-04T10:00:00Z"): ParkRow =>
  ({ unit_kind: kind, unit_id: id, lat, lon, place_label: null, parked_by: null, parked_at: at });
const names = new Map([["truck:t1", "25184"], ["trailer:r1", "3151"], ["truck:t2", "25185"]]);

test("a truck and trailer parked together share one pin, truck first", () => {
  const pins = buildPins([row("trailer", "r1", 27.9, -82.4), row("truck", "t1", 27.90001, -82.40001)], names);
  assert.equal(pins.length, 1);
  assert.equal(pins[0].label, "25184 / 3151");
});
test("units far apart stay separate", () => {
  assert.equal(buildPins([row("truck", "t1", 27.9, -82.4), row("truck", "t2", 27.95, -82.4)], names).length, 2);
});
test("keep filter drops units, bad coordinates are ignored", () => {
  const pins = buildPins([row("truck", "t1", 27.9, -82.4), row("truck", "t2", NaN, -82.4)], names, (_k, id) => id === "t1");
  assert.equal(pins.length, 1);
});
test("pin shows the newest park time", () => {
  const p = buildPins([row("truck", "t1", 27.9, -82.4, "2026-11-01T00:00:00Z"), row("trailer", "r1", 27.9, -82.4, "2026-11-03T00:00:00Z")], names)[0];
  assert.equal(p.parkedAt, "2026-11-03T00:00:00Z");
});
