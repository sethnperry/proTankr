// lib/trips/deliveryLocations.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { browseLocations, browseOptions, destinationRegion, airMiles, byNumberThenName, defaultLocationCity, filterLocations, locationCities, locationsInCity, type DeliveryLocation } from "./deliveryLocations.ts";

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

function mk(id: string, over: Partial<DeliveryLocation> = {}): DeliveryLocation {
  return {
    location_id: id, name: id, location_number: null, address: null, city: "Tampa", state: "FL",
    lat: null, lon: null, delivery_type: "drop", notes: null, starred: false, ...over,
  };
}

test("locationsInCity: starred first, each by store number (numeric) then name", () => {
  const ls = [
    mk("a", { name: "Loves", location_number: "10" }),
    mk("b", { name: "Wawa", location_number: "9", starred: true }),
    mk("c", { name: "Zed", starred: true }),
    mk("d", { name: "Abc", location_number: "100", starred: true }),
    mk("e", { name: "Other city", city: "Orlando" }),
    mk("f", { name: "Alpha" }),
  ];
  const { starred, others } = locationsInCity(ls, "tampa|FL");
  assert.deepEqual(starred.map((l) => l.location_id), ["b", "d", "c"]);
  assert.deepEqual(others.map((l) => l.location_id), ["a", "f"]);
  assert.ok(byNumberThenName(ls[1], ls[0]) < 0); // "9" before "10"
});

test("locationCities groups and counts, no-city last; default city follows the selection", () => {
  const ls = [mk("a"), mk("b", { city: "orlando " }), mk("c", { city: null }), mk("d")];
  const cities = locationCities(ls);
  assert.deepEqual(cities.map((c) => [c.city, c.count]), [["orlando", 1], ["Tampa", 2], ["", 1]]);
  assert.equal(defaultLocationCity(ls, { selectedId: "b" }), "orlando|FL");
  assert.equal(defaultLocationCity([], {}), null);
});

test("destinationRegion: own, then same city, then same state", () => {
  const L = (id: string, city: string, state: string, region: string | null): DeliveryLocation => ({
    location_id: id, name: id, location_number: null, address: null, city, state, lat: null, lon: null, delivery_type: "drop", notes: null, starred: false, region,
  });
  const all = [L("a", "Seattle", "WA", "West"), L("b", "Tacoma", "WA", "West"), L("c", "Spokane", "WA", "East"), L("d", "Seattle", "WA", null), L("e", "Miami", "FL", null)];
  assert.equal(destinationRegion(all[0], all), "West");
  assert.equal(destinationRegion(all[3], all), "West"); // same city
  assert.equal(destinationRegion(L("f", "Olympia", "WA", null), all), "West"); // state majority
  assert.equal(destinationRegion(all[4], all), null);
});

test("browseLocations: favorites lead regardless of filter; search ignores filters", () => {
  const mk = (id: string, o: Partial<DeliveryLocation>): DeliveryLocation => ({ location_id: id, name: id, location_number: null, address: null, city: "Tampa", state: "FL", lat: null, lon: null, delivery_type: "drop", notes: null, starred: false, ...o });
  const locs = [mk("a", { region: "North", starred: true }), mk("b", { region: "South" }), mk("c", { region: "South", local_area: "Miami" }), mk("d", { region: "North" })];
  const r = browseLocations(locs, { region: "South", area: "", cityKey: "", query: "" });
  assert.deepEqual(r.starred.map((l) => l.location_id), ["a"]);
  assert.deepEqual(r.others.map((l) => l.location_id), ["b", "c"]);
  assert.deepEqual(browseLocations(locs, { region: "South", area: "Miami", cityKey: "", query: "" }).others.map((l) => l.location_id), ["c"]);
  assert.deepEqual(browseLocations(locs, { region: "South", area: "", cityKey: "", query: "d" }).others.map((l) => l.location_id), ["d"]);
  assert.deepEqual(browseOptions(locs, { region: "South", area: "" }).areas, ["Miami"]);
});
