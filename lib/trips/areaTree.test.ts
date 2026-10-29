import test from "node:test";
import assert from "node:assert/strict";
import { areaLabel, cityOptions, countyOptions, inArea, NO_COUNTY, stateOptions } from "./areaTree.ts";

const L = (city: string, state: string, county: string | null): any => ({ location_id: city + state, name: "x", city, state, county, is_active: true });
const ls = [L("Tampa", "FL", "Hillsborough County"), L("Plant City", "FL", "Hillsborough County"), L("Naples", "FL", "Collier County"), L("Newark", "NJ", null)];

test("states, counties and cities narrow with counts", () => {
  assert.deepEqual(stateOptions(ls).map((o) => [o.value, o.count]), [["FL", 3], ["NJ", 1]]);
  assert.deepEqual(countyOptions(ls, "FL").map((o) => [o.value, o.count]), [["Collier County", 1], ["Hillsborough County", 2]]);
  assert.deepEqual(countyOptions(ls, "NJ").map((o) => o.value), [NO_COUNTY]);
  assert.deepEqual(cityOptions(ls, "FL", "Hillsborough County").map((o) => o.value), ["Plant City", "Tampa"]);
});
test("inArea and the label", () => {
  assert.equal(inArea(ls, { state: "FL", county: "Hillsborough County", city: "" }).length, 2);
  assert.equal(inArea(ls, { state: "NJ", county: NO_COUNTY, city: "" }).length, 1);
  assert.equal(inArea(ls, { state: "", county: "", city: "" }).length, 4);
  assert.equal(areaLabel({ state: "FL", county: "Hillsborough County", city: "Tampa" }), "Tampa, FL");
  assert.equal(areaLabel({ state: "", county: "", city: "" }), "all locations");
});
