// lib/trips/deliveryLocations.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { airMiles, filterLocations, type DeliveryLocation } from "./deliveryLocations.ts";

const base = (o: Partial<DeliveryLocation>): DeliveryLocation => ({
  location_id: o.name ?? "x", name: "x", location_number: null, address: null, city: null, state: null,
  lat: null, lon: null, delivery_type: "drop", notes: null, starred: false, ...o,
});

const tampa = { lat: 27.9506, lon: -82.4572 };
const orlando = { lat: 28.5384, lon: -81.3789 };
const miami = { lat: 25.7617, lon: -80.1918 };

test("air miles, Tampa to Orlando is about 78", () => {
  const m = airMiles(tampa, orlando);
  assert.ok(m > 75 && m < 82, String(m));
});

test("near me keeps the radius plus starred; sorted starred then nearest", () => {
  const locs = [
    base({ name: "Miami Store", ...miami }),
    base({ name: "Orlando Store", city: "Orlando", ...orlando }),
    base({ name: "Tampa Store", location_number: "495", ...tampa }),
    base({ name: "Starred Miami", ...miami, starred: true }),
    base({ name: "No Coords" }),
  ];
  const near = filterLocations(locs, { origin: tampa, nearMe: true, query: "" }).map((l) => l.name);
  assert.deepEqual(near, ["Starred Miami", "Tampa Store", "Orlando Store"]);
  const all = filterLocations(locs, { origin: tampa, nearMe: false, query: "" });
  assert.equal(all.length, 5);
  assert.equal(all[all.length - 1].name, "No Coords");
});

test("search by number, name or city", () => {
  const locs = [base({ name: "Tampa Store", location_number: "495" }), base({ name: "Other", city: "Orlando" })];
  assert.deepEqual(filterLocations(locs, { origin: null, nearMe: true, query: "495" }).map((l) => l.name), ["Tampa Store"]);
  assert.deepEqual(filterLocations(locs, { origin: null, nearMe: true, query: "orl" }).map((l) => l.name), ["Other"]);
});

test("no origin: near me shows everything", () => {
  const locs = [base({ name: "A" }), base({ name: "B", ...miami })];
  assert.equal(filterLocations(locs, { origin: null, nearMe: true, query: "" }).length, 2);
});
