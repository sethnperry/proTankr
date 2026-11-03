import { test } from "node:test";
import assert from "node:assert/strict";
import { factsFromMember, summarizeFleet, adminDetail, type FleetMember, type FleetPayload } from "./fleetSetup.ts";

const john: FleetMember = {
  user_id: "u1", role: "driver", display_name: "Jonathan Green", employee_number: null, region: "Southeast", local_area: "Tampa ",
  license_number: null, license_expiry: null, medical_expiry: null, schedule_days: 0, has_truck: true, has_trailer: true,
  plans_saved: "2", terminals_starred: 9, locations_starred: 0, has_fuel_pin: false, push_on: false, hours_linked: false,
  per_diem_home: false, vault_set: false, confirmations: {},
};
const company = { is_solo: false, regions_defined: true, fuel_program: true, telematics: true };

test("numbers that arrive as strings are read as numbers", () => {
  const f = factsFromMember(john, company);
  assert.equal(f.plansSaved, 2);
  assert.equal(f.tier, "fleet");
});

test("John's row: required steps missing are flagged, equipment waits for his confirm", () => {
  const [row] = summarizeFleet({ ...company, members: [john] } as FleetPayload);
  const st = (id: string) => row.summary.steps.find((s) => s.id === id)!;
  assert.equal(st("you").status, "needs");            // no employee number
  assert.equal(st("license").status, "needs");
  assert.equal(st("equipment").status, "confirm");
  assert.equal(st("plans").status, "done");
  assert.equal(st("terminals").status, "done");
  assert.equal(row.summary.requiredLeft, 3);
});

test("no members, or a missing payload, gives an empty list", () => {
  assert.deepEqual(summarizeFleet(null), []);
  assert.deepEqual(summarizeFleet({ ...company, members: null }), []);
});

test("an unnamed driver still gets a row; admin wording", () => {
  const [row] = summarizeFleet({ ...company, members: [{ ...john, display_name: "  " }] });
  assert.equal(row.name, "Unnamed driver");
  assert.equal(adminDetail("confirm", "x"), "Set up, waiting for the driver to confirm");
  assert.equal(adminDetail("needs", "Needed: region"), "Missing: region");
  assert.equal(adminDetail("done", "Done"), "Done");
});
