import test from "node:test";
import assert from "node:assert/strict";
import { buildWave, clock, dayRows, type DayLabels, type DayTrip } from "./driverDayWave.ts";

const T = (h: number, m = 0) => new Date(Date.UTC(2026, 10, 14, h, m)).toISOString();
const ms = (iso: string) => Date.parse(iso);
const labels: DayLabels = {
  startLabel: "Ft.Myers",
  terminal: (p) => ({ code: String(p.name ?? "T"), city: "Tampa" }),
  delivery: (d) => ({ label: `Loves ${d.delivery_id}`, city: "Tampa" }),
};
const trip = (id: string, started: string, pk: [string, string, string | null], dl: [string, string | null], status = "complete"): DayTrip => ({
  trip: { trip_id: id, started_at: started, status, completed_at: dl[1] } as any,
  pickups: [{ pickup_id: `p${id}`, seq: 1, name: pk[0], arrived_at: pk[1], left_at: pk[2], outcome: "loaded" } as any],
  deliveries: [{ delivery_id: `d${id}`, seq: 1, status: dl[1] ? "complete" : "planned", arrived_at: dl[0], left_at: dl[1] } as any],
  compLoads: [{ comp_number: 1, product_id: "d2", gross_gallons: 7890, disposition: "delivered" } as any],
  delays: [],
});

test("terminals alternate peak then trough; deliveries sit on the center", () => {
  const wave = buildWave({
    shiftStartMs: ms(T(15)), nowMs: ms(T(22)), labels,
    trips: [trip("1", T(15, 5), ["MA", T(16), T(16, 40)], [T(18), T(18, 30)]), trip("2", T(18, 40), ["CI", T(19, 30), T(20)], [T(21), T(21, 30)])],
  });
  const lv = wave.nodes.map((n) => n.level);
  assert.deepEqual(lv, [0, 1, 0, -1, 0]);
  const xs = wave.nodes.map((n) => n.x);
  assert.deepEqual([...xs].sort((a, b) => a - b), xs); // left to right in order
  assert.ok(wave.segs.every((s) => s.x1 >= s.x0));
  assert.ok(wave.segs.some((s) => s.kind === "hold")); // flat clips for loading and delivering
});

test("an open trip projects its rest and puts the truck on the curve", () => {
  const t1 = trip("1", T(15, 5), ["MA", T(16), T(16, 40)], [T(18), null], "delivering");
  t1.deliveries[0].arrived_at = null;
  const wave = buildWave({ shiftStartMs: ms(T(15)), nowMs: ms(T(17)), labels, trips: [t1] });
  assert.ok(wave.segs.some((s) => s.projected));
  assert.ok(wave.truck && wave.truck.moving);
});

test("report rows and the clock label", () => {
  const rows = dayRows({ trips: [trip("1", T(15, 5), ["MA", T(16), T(16, 40)], [T(18), T(20, 20)])], nowMs: ms(T(22)), labels, productCode: () => "D2", startLabel: "Ft.Myers" });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].gallons, 7890);
  assert.equal(rows[0].from, "Ft.Myers");
  assert.ok(rows[0].hours > 5);
  assert.match(clock(ms(T(15))), /\d:\d{2}[ap]/);
});
