import { test } from "node:test";
import assert from "node:assert/strict";
import { rowsToPositions, toLivePos } from "./useEquipmentPositions.ts";

test("rows become positions; bad rows are dropped; a live dot has no speed", () => {
  const p = rowsToPositions([
    { unit_kind: "truck", unit_id: "t1", lat: 27.9 as any, lon: "-82.4" as any, odometer: "1200" as any, cause: "arrive", captured_at: "2026-11-26T10:00:00Z", captured_by: "u" },
    { unit_kind: "van", unit_id: "x", lat: 1, lon: 1, odometer: null, cause: null, captured_at: "2026-11-26T10:00:00Z", captured_by: null },
    { unit_kind: "trailer", unit_id: "r1", lat: "bad" as any, lon: 1, odometer: null, cause: null, captured_at: "2026-11-26T10:00:00Z", captured_by: null },
  ]);
  assert.equal(p.length, 1);
  assert.equal(p[0].lon, -82.4);
  assert.equal(p[0].odometer, 1200);
  assert.deepEqual(toLivePos(p[0]), { lat: 27.9, lon: -82.4, speedMph: null, at: "2026-11-26T10:00:00Z" });
});
