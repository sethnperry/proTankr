import { test } from "node:test";
import assert from "node:assert/strict";
import { newFuelStop, recordFailedTry, startPumping, finishFueling, missingForComplete, completeStop, paymentAmounts, failedKeys, fillToFillMpg } from "./fuelFlow.ts";

const base = () => newFuelStop({ id: "f1", companyId: "c", driverId: "d", truckId: "t", trailerId: null, tripId: null, now: "2026-10-15T10:00:00Z" });
const entry = (over: object = {}) => ({ payKind: "rfid" as const, methodId: "m1", label: "QuickQ", pumpNumber: "7", odometer: "310,600", products: "diesel_def" as const, ...over });

test("failed try keeps the pump number at that moment, then pumping on another method", () => {
  let p = recordFailedTry(base(), entry(), "2026-10-15T10:02:00Z");
  assert.equal(p.attempts.length, 1);
  assert.equal(p.attempts[0].pump_number, "7");
  assert.equal(p.odometer, 310600);
  assert.equal(p.status, "fueling");
  assert.ok(failedKeys(p).has("m1"));
  p = startPumping(p, entry({ payKind: "company_account", methodId: "m2", label: "Account", pumpNumber: "8" }), "2026-10-15T10:04:00Z");
  assert.equal(p.status, "pumping");
  assert.equal(p.pump_number, "8");
  assert.equal(p.method_id, "m2");
  p = finishFueling(p, "2026-10-15T10:20:00Z");
  assert.equal(p.status, "details");
  assert.equal(p.finished_at, "2026-10-15T10:20:00Z");
});

test("complete needs gallons, store, and a receipt if required (no DEF gallons)", () => {
  const p = startPumping(base(), entry(), "2026-10-15T10:01:00Z");
  const d = { dieselGallons: "", filledToFull: true, storeName: "", storeNumber: "", city: "", state: "", notes: "", hasReceipt: false };
  assert.deepEqual(missingForComplete(p, d, true), ["Diesel gallons", "Store", "Receipt photo"]);
  const ok = { ...d, dieselGallons: "120.5", storeName: "Love's", state: "fl" };
  assert.deepEqual(missingForComplete(p, ok, true), ["Receipt photo"]);
  const done = completeStop(p, ok, "2026-10-15T10:30:00Z");
  assert.equal(done.status, "complete");
  assert.equal(done.diesel_gallons, 120.5);
  assert.equal(done.state, "FL");
});

test("payment amounts: total from parts, price per gallon from diesel amount", () => {
  assert.deepEqual(paymentAmounts({ dieselGallons: "100", dieselAmount: "389.90", defAmount: "20", total: "", pricePerGallon: "" }),
    { diesel_amount: 389.9, def_amount: 20, total_amount: 409.9, price_per_gallon: 3.899 });
});

test("fill-to-fill MPG counts partial fills in the window", () => {
  const { byId, average } = fillToFillMpg([
    { id: "a", started_at: "2026-10-01T00:00:00Z", odometer: 1000, diesel_gallons: 100, filled_to_full: true },
    { id: "b", started_at: "2026-10-02T00:00:00Z", odometer: 1300, diesel_gallons: 50, filled_to_full: false },
    { id: "c", started_at: "2026-10-03T00:00:00Z", odometer: 1600, diesel_gallons: 50, filled_to_full: true },
  ]);
  assert.equal(byId.c, 6);
  assert.equal(byId.b, undefined);
  assert.equal(average, 6);
});

test("RFID: pump down keeps location, pump and issue; finished fueling needs only odometer", async () => {
  const { recordPumpDown, finishQuick } = await import("./fuelFlow.ts");
  let p = recordPumpDown(base(), { payKind: "rfid", methodId: "m1", label: "QuickQ", pumpNumber: "12", issue: "Won't authorize", storeName: "Love's", city: "Ocala", state: "fl" }, "2026-10-15T10:02:00Z");
  assert.equal(p.status, "fueling");
  assert.deepEqual([p.attempts[0].pump_number, p.attempts[0].issue, p.attempts[0].state], ["12", "Won't authorize", "FL"]);
  assert.equal(p.store_name, "Love's");
  p = finishQuick(p, { payKind: "company_account", methodId: "m2", odometer: "310,700", gallons: "142.3", filledToFull: true, pos: { lat: 29.1, lon: -82.1 } }, "2026-10-15T10:15:00Z");
  assert.equal(p.status, "complete");
  assert.equal(p.odometer, 310700);
  assert.equal(p.finished_at, "2026-10-15T10:15:00Z");
  assert.equal(p.diesel_gallons, 142.3);
  assert.equal(p.filled_to_full, true);
  assert.equal(p.lat, 29.1);
});
