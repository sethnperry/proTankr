import test from "node:test";
import assert from "node:assert/strict";
import { beginProblem, closeEmptyOnBegin, deliverProblem, emptyMiles, emptyMinutes, freightRows, isEmptyNow, loadedMiles, ltsTotals, openOnTruck, recapLines, type Load } from "./freight.ts";

const L = (o: Partial<Load> = {}): Load => ({ freight_id: "f1", driver_id: "d1", truck_id: "t1", trailer_kind: "van", trailer_label: null, preset: "standard", reference: "R1", customer: null, origin_text: null, destination_text: null, route_number: null,
  status: "open", begin_odometer: 1000, begun_at: "2026-11-02T10:00:00Z", end_odometer: null, delivered_at: null, empty_end_odometer: null, empty_ended_at: null, manifest_paths: [], manifest_signature: null, ...o });
const F = { preset: "standard" as const, truckId: "t1", odometer: "1000", reference: "R1", routeNumber: "", trailerKind: "van" as const, hasCoupledTrailer: false };

test("only one open load per truck", () => {
  assert.match(beginProblem(F, [L()]) ?? "", /already has an open/);
  assert.equal(beginProblem(F, [L({ status: "delivered" })]), null);
  assert.equal(openOnTruck([L()], "t2"), null);
});

test("begin needs the truck, a trailer kind when none is coupled, and the preset's number", () => {
  assert.match(beginProblem({ ...F, truckId: null }, []) ?? "", /truck/);
  assert.match(beginProblem({ ...F, trailerKind: null }, []) ?? "", /trailer/);
  assert.equal(beginProblem({ ...F, trailerKind: null, hasCoupledTrailer: true }, []), null);
  assert.match(beginProblem({ ...F, preset: "lts", routeNumber: "" }, []) ?? "", /route number/);
  assert.match(beginProblem({ ...F, reference: "" }, []) ?? "", /reference/);
  assert.match(beginProblem({ ...F, odometer: "abc" }, []) ?? "", /odometer/);
});

test("delivering checks the odometer, and LTS needs stops, a manifest photo and a signature", () => {
  const std = { endOdometer: "1200", stops: [], manifestPhotos: 0, signed: false };
  assert.equal(deliverProblem(L(), std), null);
  assert.match(deliverProblem(L(), { ...std, endOdometer: "900" }) ?? "", /lower/);
  const lts = L({ preset: "lts" });
  assert.match(deliverProblem(lts, std) ?? "", /at least one stop/);
  const stops = [{ name: "Store 1", casings: "4", totes: "2" }];
  assert.match(deliverProblem(lts, { ...std, stops }) ?? "", /manifest/);
  assert.match(deliverProblem(lts, { ...std, stops, manifestPhotos: 1 }) ?? "", /sign/);
  assert.equal(deliverProblem(lts, { ...std, stops, manifestPhotos: 1, signed: true }), null);
  assert.match(deliverProblem(lts, { ...std, stops: [{ name: "S", casings: "1.5", totes: "" }], manifestPhotos: 1, signed: true }) ?? "", /whole number/);
});

test("loaded and empty miles", () => {
  const d = L({ status: "delivered", end_odometer: 1300, delivered_at: "2026-11-02T20:00:00Z", empty_end_odometer: 1360, empty_ended_at: "2026-11-02T23:00:00Z" });
  assert.equal(loadedMiles(d), 300);
  assert.equal(emptyMiles(d), 60);
  assert.equal(emptyMinutes(d, 0), 180);
  assert.equal(loadedMiles(L()), null);
});

test("starting the next load ends the empty stretch at its odometer; an open or already-ended one isn't touched", () => {
  const prev = L({ status: "delivered", end_odometer: 1300, delivered_at: "2026-11-02T20:00:00Z" });
  assert.equal(isEmptyNow(prev), true);
  assert.deepEqual(closeEmptyOnBegin(prev, "2026-11-03T08:00:00Z", 1350), { empty_ended_at: "2026-11-03T08:00:00Z", empty_end_odometer: 1350 });
  assert.equal(closeEmptyOnBegin(L(), "x", 1), null);
  assert.equal(closeEmptyOnBegin({ ...prev, empty_ended_at: "z" }, "x", 1), null);
});

test("LTS totals and the recap", () => {
  assert.deepEqual(ltsTotals([{ casings: 4, totes: 2 }, { casings: 6, totes: 0 }]), { stops: 2, casings: 10, totes: 2 });
  const loads = [L(), L({ freight_id: "f2", status: "delivered", end_odometer: 1200, delivered_at: "2026-11-02T20:00:00Z", preset: "lts", route_number: "42" })];
  const rows = freightRows(loads, [{ stop_id: "s", freight_id: "f2", seq: 0, name: "A", casings: 5, totes: 3 }], () => "Sam", () => "T1");
  const lines = recapLines(rows, Date.parse("2026-11-03T00:00:00Z"), 7);
  assert.match(lines[0], /1 on the road, 1 empty, 1 delivered/);
  assert.ok(lines.some((x) => /LTS route 42.*5 casings, 3 totes/.test(x)));
});
