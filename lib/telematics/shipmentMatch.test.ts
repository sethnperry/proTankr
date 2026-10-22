import test from "node:test";
import assert from "node:assert/strict";
import { shipmentsForPickup, bolAgreement } from "./shipmentMatch.ts";

// Real loads on truck 25184 (UTC): arrived/left at the rack, and when Geotab logged the shipment.
const ship = (n: string, start: string) => ({ documentNumber: n, start });
const all = [
  ship("583375", "2026-10-11T21:59:00Z"), ship("155170103", "2026-10-12T03:25:00Z"),
  ship("752889", "2026-10-12T22:34:00Z"), ship("583478", "2026-10-13T04:21:00Z"), ship("753115", "2026-10-13T23:57:00Z"),
];
const cases: [string, string, string, string][] = [
  ["583375", "2026-10-11T21:22:04Z", "2026-10-11T21:57:17Z", "583375"],
  ["155170103", "2026-10-12T03:00:01Z", "2026-10-12T03:24:25Z", "155170103"],
  ["752889", "2026-10-12T22:00:08Z", "2026-10-12T22:33:56Z", "752889"],
  ["583478", "2026-10-13T03:52:06Z", "2026-10-13T04:20:04Z", "583478"],
  ["753115", "2026-10-13T23:34:09Z", "2026-10-13T23:59:57Z", "753115"], // logged 2 minutes BEFORE we recorded leaving
];
for (const [name, arrivedAt, leftAt, want] of cases) {
  test(`real load ${name} matches exactly its own shipment`, () => {
    const m = shipmentsForPickup(all, { arrivedAt, leftAt }, Date.parse(leftAt));
    assert.deepEqual(m.map((s) => s.documentNumber), [want]);
  });
}

test("still at the rack: window runs to now", () => {
  const m = shipmentsForPickup(all, { arrivedAt: "2026-10-12T22:00:08Z", leftAt: null }, Date.parse("2026-10-12T22:40:00Z"));
  assert.deepEqual(m.map((s) => s.documentNumber), ["752889"]);
  assert.equal(shipmentsForPickup(all, { arrivedAt: "2026-10-12T22:00:08Z", leftAt: null }, Date.parse("2026-10-12T22:10:00Z")).length, 0);
});

test("numbers already on another load are dropped; no arrival means no match", () => {
  const m = shipmentsForPickup(all, { arrivedAt: "2026-10-12T22:00:08Z", leftAt: "2026-10-12T22:33:56Z" }, 0, ["752889"]);
  assert.equal(m.length, 0);
  assert.equal(shipmentsForPickup(all, { arrivedAt: null, leftAt: null }, Date.now()).length, 0);
});

test("two shipments in one stop come back oldest first", () => {
  const two = [ship("B", "2026-10-12T22:30:00Z"), ship("A", "2026-10-12T22:20:00Z"), ship("A", "2026-10-12T22:21:00Z")];
  const m = shipmentsForPickup(two, { arrivedAt: "2026-10-12T22:00:00Z", leftAt: "2026-10-12T22:33:00Z" }, 0);
  assert.deepEqual(m.map((s) => s.documentNumber), ["A", "B"]);
});

test("agreement with what the driver typed", () => {
  assert.equal(bolAgreement("752889", ["752889"]), "same");
  assert.equal(bolAgreement(" 752889 ", ["999"]), "different");
  assert.equal(bolAgreement("", ["999"]), "unknown");
  assert.equal(bolAgreement("1", []), "unknown");
});
