import test from "node:test";
import assert from "node:assert/strict";
import { fuelStopsFor } from "./ptd.ts";

const row = (started_at: string, over: Record<string, unknown> = {}) => ({ started_at, finished_at: null, completed_at: null, status: "complete", store_name: "Love's", store_number: "495", city: "Tampa", state: "FL", diesel_gallons: "142.3", odometer: "123456", pay_kind: "rfid", ...over });

test("only fuel stops inside the trip are kept, oldest first, with place and gallons", () => {
  const rows = [row("2026-11-18T09:00:00Z"), row("2026-11-17T09:00:00Z"), row("2026-11-18T06:00:00Z", { store_name: null, store_number: null, city: null, state: null, status: "fueling" })];
  const out = fuelStopsFor(rows as never, "2026-11-18T05:00:00Z", "2026-11-18T12:00:00Z");
  assert.equal(out.length, 2);
  assert.equal(out[0].place, "Fuel stop");
  assert.equal(out[0].open, true);
  assert.equal(out[1].place, "Love's #495, Tampa FL");
  assert.equal(out[1].gallons, 142.3);
  assert.equal(out[1].odometer, 123456);
});
