// lib/trips/refs.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  conflicts, findSupplier, normalizeRef, repeatedRefs, searchSuppliers, similarLocations,
  usedBolNumbers, usedOrderNumbers,
} from "./refs.ts";
import type { SupplierRow, TripCompartmentLoadRow, TripOrderRow, TripRow } from "./types.ts";

const trip = (id: string, status: TripRow["status"] = "draft") => ({ trip_id: id, status } as TripRow);
const order = (trip_id: string, order_number: string) => ({ order_id: trip_id + order_number, trip_id, order_number } as TripOrderRow);
const comp = (id: string, trip_id: string, bol: string | null, disposition: TripCompartmentLoadRow["disposition"] = "loaded") =>
  ({ compartment_load_id: id, trip_id, bol_number: bol, disposition } as TripCompartmentLoadRow);

test("normalizeRef ignores case, spaces and dashes", () => {
  assert.equal(normalizeRef(" bol 123-45 "), "BOL12345");
  assert.equal(normalizeRef(null), "");
});

test("repeatedRefs finds a number typed twice in one list", () => {
  assert.deepEqual(repeatedRefs(["A1", "b2", "a 1", ""]), ["A1"]);
  assert.deepEqual(repeatedRefs(["A1", "B2"]), []);
});

test("order numbers on another live trip count; cancelled and the edited trip don't", () => {
  const trips = [trip("t1"), trip("t2", "cancelled"), trip("t3", "complete")];
  const orders = [order("t1", "100"), order("t2", "200"), order("t3", "300")];
  const used = usedOrderNumbers(trips, orders, null);
  assert.deepEqual([...used].sort(), ["100", "300"]);
  assert.deepEqual(conflicts(["100", "200", "300 "], used), ["100", "300"]);
  assert.deepEqual([...usedOrderNumbers(trips, orders, "t1")], ["300"]);
});

test("BOL numbers: other compartments count, the ones being edited and cancelled ones don't", () => {
  const trips = [trip("t1"), trip("t2", "cancelled")];
  const loads = [comp("c1", "t1", "B-1"), comp("c2", "t1", "B2", "cancelled"), comp("c3", "t2", "B3"), comp("c4", "t1", "B4")];
  const used = usedBolNumbers(trips, loads, new Set(["c4"]));
  assert.deepEqual([...used], ["B1"]);
});

test("suppliers match by name, ignoring case and spaces", () => {
  const s = [
    { supplier_id: "1", name: "Citgo Tampa", is_active: true },
    { supplier_id: "2", name: "Marathon", is_active: false },
  ] as SupplierRow[];
  assert.equal(findSupplier(s, " citgo   TAMPA ")?.supplier_id, "1");
  assert.equal(findSupplier(s, "Citgo"), null);
  assert.deepEqual(searchSuppliers(s, "").map((x) => x.supplier_id), ["1"]);
});

test("similarLocations catches the same store typed differently", () => {
  const existing = [
    { location_id: "a", name: "Loves", location_number: "495", address: "100 Main St", city: "Ft Myers", state: "FL" },
    { location_id: "b", name: "Wawa", location_number: "12", address: null, city: "Tampa", state: "FL" },
  ];
  const draft = (o: Partial<typeof existing[0]>) => ({ name: "", location_number: null, address: null, city: null, state: null, ...o });
  assert.deepEqual(similarLocations(existing, draft({ name: "loves", location_number: "495" })).map((l) => l.location_id), ["a"]);
  assert.deepEqual(similarLocations(existing, draft({ name: "Loves Travel Stop", location_number: "495" })).map((l) => l.location_id), ["a"]);
  assert.deepEqual(similarLocations(existing, draft({ name: "Other", address: "100 main st", city: "ft myers" })).map((l) => l.location_id), ["a"]);
  assert.deepEqual(similarLocations(existing, draft({ name: "Loves", location_number: "496" })).map((l) => l.location_id), []);
  assert.deepEqual(similarLocations(existing, draft({ name: "loves", location_number: "495" }), "a"), []);
});

import { sameStore } from "./refs.ts";
test("the same store (name + number + state) is caught, however it is typed", () => {
  const ex = [{ location_id: "a", name: "Loves", location_number: "708", city: "Bushnell", state: "FL", address: null, is_active: true }];
  assert.equal(sameStore(ex as any, { name: "Love's", location_number: "#708", city: "Bushnell", state: "fl", address: null } as any).length, 1);
  assert.equal(sameStore(ex as any, { name: "Loves", location_number: "709", city: "Bushnell", state: "FL", address: null } as any).length, 0);
  assert.equal(sameStore(ex as any, { name: "Loves", location_number: "708", city: "x", state: "GA", address: null } as any).length, 0);
  assert.equal(sameStore(ex as any, { name: "Loves", location_number: "708", city: "x", state: "FL", address: null } as any, "a").length, 0);
});
