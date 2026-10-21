import test from "node:test";
import assert from "node:assert/strict";
import { summarizeTruckTrip } from "./truckTrip.ts";

const now = Date.UTC(2026, 9, 21, 18, 0);
const trip: any = { trip_id: "t1", status: "in_transit", started_at: "2026-10-21T14:00:00Z" };
const base = (over: any = {}) => ({
  trip,
  pickups: [{ pickup_id: "p1", seq: 1, terminal_id: "T1", name: "Marathon", city: "Tampa", left_at: "2026-10-21T16:00:00Z", arrived_at: "2026-10-21T15:00:00Z", load_id: "l1", begin_at: "2026-10-21T15:10:00Z" }],
  deliveries: [
    { delivery_id: "d1", seq: 1, location_id: "L1", status: "planned", arrived_at: null },
    { delivery_id: "d2", seq: 2, location_id: "L2", status: "planned", arrived_at: null },
  ],
  compLoads: [
    { compartment_load_id: "c1", comp_number: 1, product_id: "p-a", disposition: "loaded", gross_gallons: 3000 },
    { compartment_load_id: "c2", comp_number: 2, product_id: "p-b", disposition: "loaded", gross_gallons: 4000 },
    { compartment_load_id: "c3", comp_number: 3, product_id: "p-c", disposition: "delivered", gross_gallons: 100 },
  ],
  locations: new Map([["L1", { name: "Loves #708", city: "Bushnell", state: "FL" }], ["L2", { name: "Loves #9", city: "Ocala", state: "FL" }]]),
  terminalLL: () => ({ lat: 27.9, lon: -82.4 }),
  locationLL: (id: string) => (id === "L1" ? { lat: 28.6, lon: -82.1 } : { lat: 29.2, lon: -82.1 }),
  pos: { lat: 28.0, lon: -82.3 },
  nowMs: now,
  ...over,
} as any);

test("summarizeTruckTrip: next stop, last stop, and what's aboard (largest compartment number first)", () => {
  const s = summarizeTruckTrip(base());
  assert.match(s.status, /En route to/);
  assert.equal(s.next!.label, "Loves #708");
  assert.ok(s.next!.miles! > 30 && s.next!.miles! < 60);
  assert.ok(s.next!.etaMs! > now);
  assert.equal(s.last!.label, "Loves #9");
  assert.ok(s.last!.etaMs > s.next!.etaMs! + 45 * 60000); // includes the drop at the first stop
  assert.deepEqual(s.products.map((p) => p.comp), [2, 1]); // delivered compartments aren't aboard
});

test("summarizeTruckTrip: single stop has no separate last; no position gives no times; dispatched not begun", () => {
  const one = summarizeTruckTrip(base({ deliveries: [base().deliveries[0]] }));
  assert.equal(one.last, null);
  const nopos = summarizeTruckTrip(base({ pos: null }));
  assert.equal(nopos.next!.etaMs, null);
  const d = summarizeTruckTrip(base({ trip: { ...trip, status: "dispatched" } }));
  assert.equal(d.status, "Dispatched, not begun");
  assert.equal(d.next!.label, "Loves #708");
});
