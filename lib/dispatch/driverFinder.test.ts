import { test } from "node:test";
import assert from "node:assert/strict";
import { findDrivers, type FinderPerson } from "./driverFinder.ts";

const P = (userId: string, name: string, extra: Partial<FinderPerson> = {}): FinderPerson =>
  ({ userId, name, employeeNumber: null, localArea: null, region: null, ...extra });
const people = [
  P("a", "Ann Lee", { employeeNumber: "1042", region: "South FL", localArea: "Tampa" }),
  P("b", "Bob Ray", { region: "South FL", localArea: "Miami" }),
  P("c", "Cy Dunn", { region: "North", localArea: "Jax" }),
];
const base = { people, heldTruck: new Map<string, string>(), truckUsers: [] as { truckName: string; driverId: string }[] };

test("empty search shows nobody", () => assert.equal(findDrivers({ ...base, query: "  " }).length, 0));
test("matches name, employee number, local area, region", () => {
  assert.deepEqual(findDrivers({ ...base, query: "bob" }).map((m) => m.person.userId), ["b"]);
  assert.deepEqual(findDrivers({ ...base, query: "1042" }).map((m) => m.person.userId), ["a"]);
  assert.deepEqual(findDrivers({ ...base, query: "tampa" }).map((m) => m.person.userId), ["a"]);
  assert.deepEqual(findDrivers({ ...base, query: "south fl" }).map((m) => m.person.userId), ["a", "b"]);
});
test("truck number: holder first, then the last different driver", () => {
  const r = findDrivers({
    ...base, query: "25184", heldTruck: new Map([["b", "25184"]]),
    truckUsers: [{ truckName: "25184", driverId: "b" }, { truckName: "25184", driverId: "c" }, { truckName: "25184", driverId: "a" }],
  });
  assert.deepEqual(r.map((m) => [m.person.userId, m.why]), [["b", "In truck 25184"], ["c", "Last in truck 25184"]]);
});
