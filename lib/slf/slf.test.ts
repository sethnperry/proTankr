import { test } from "node:test";
import assert from "node:assert/strict";
import { attestProblem, complianceColumns, complianceRows, complianceSummary, countyKey, normCounty, parseCounties, status, zoneCountiesEntered, zoneKeys, type TripStop } from "./slf.ts";
import { toCsv } from "../reports/reportShell.ts";

const zone = zoneKeys([{ state: "PA", county: "Berks" }, { state: "pa", county: "Lehigh County" }]);
const stop = (name: string, county: string | null, at: string | null, state = "PA"): TripStop => ({ kind: "delivery", name, state, county, arrivedAt: at });

test("county names match however they're written", () => {
  assert.equal(normCounty(" Berks County "), "berks");
  assert.equal(normCounty("St. Johns"), "st. johns");
  assert.equal(countyKey("pa", "BERKS county"), countyKey("PA", "Berks"));
  assert.deepEqual(parseCounties("Berks, Lehigh County;Northampton\nBerks"), ["Berks", "Lehigh", "Northampton"]);
});

test("a trip enters a zone county once, only where it arrived, in order", () => {
  const stops = [stop("Store 2", "Lehigh County", "2026-11-03T12:00:00Z"), stop("Store 1", "Berks", "2026-11-03T10:00:00Z"), stop("Store 3", "Berks County", "2026-11-03T14:00:00Z"), stop("Planned", "Berks", null), stop("Elsewhere", "Orange", "2026-11-03T11:00:00Z", "FL")];
  const e = zoneCountiesEntered(stops, zone);
  assert.deepEqual(e.map((x) => [x.county, x.firstStop]), [["Berks", "Store 1"], ["Lehigh County", "Store 2"]]);
  assert.deepEqual(zoneCountiesEntered([stop("x", "Berks", "2026-11-03T10:00:00Z", "NJ")], zone), []);
});

test("attested and missing", () => {
  const e = zoneCountiesEntered([stop("a", "Berks", "2026-11-03T10:00:00Z"), stop("b", "Lehigh", "2026-11-03T11:00:00Z")], zone);
  const s = status(e, [{ state: "PA", county: "berks county" }]);
  assert.deepEqual(s.attested.map((x) => x.county), ["Berks"]);
  assert.deepEqual(s.missing.map((x) => x.county), ["Lehigh"]);
  assert.match(attestProblem({ cab: true, frame: false, trailer: true })!, /all three/);
  assert.equal(attestProblem({ cab: true, frame: true, trailer: true }), null);
});

test("compliance report flags in-zone trips with no attestation, missing first", () => {
  const trips = [{ trip_id: "T1", driver_id: "d", started_at: "2026-11-03T08:00:00Z" }, { trip_id: "T2", driver_id: "d", started_at: "2026-11-02T08:00:00Z" }];
  const stops = new Map([["T1", [stop("Store 1", "Berks", "2026-11-03T10:00:00Z")]], ["T2", [stop("Store 9", "Lehigh", "2026-11-02T10:00:00Z")]]]);
  const rows = complianceRows(trips, stops, zone, [{ trip_id: "T1", state: "PA", county: "Berks", company_id: "c", user_id: "d", cab_exterior: true, frame_tool_box: true, trailer: true, attested_at: "2026-11-03T10:30:00Z", source: "app" }]);
  assert.deepEqual(rows.map((r) => [r.tripId, r.attested]), [["T2", false], ["T1", true]]);
  assert.deepEqual(complianceSummary(rows), [{ label: "In-zone counties", value: "2" }, { label: "Missing", value: "1" }]);
  assert.ok(toCsv(complianceColumns(() => "Seth"), rows).includes("MISSING"));
});
