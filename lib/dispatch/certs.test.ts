import test from "node:test";
import assert from "node:assert/strict";
import { trailerCert, certBlocks } from "./certs.ts";

const T = "2026-10-20";
const types = [{ permit_type_id: "p1", name: "Marathon cert" }];

test("no cert type for the terminal = nothing required", () => {
  assert.equal(trailerCert([], [], "t1", T), null);
  assert.equal(certBlocks(null), false);
});

test("required but none on file", () => {
  const c = trailerCert(types, [{ trailer_id: "other", permit_type_id: "p1", expiration_date: "2027-01-01" }], "t1", T)!;
  assert.equal(c.kind, "missing");
  assert.equal(certBlocks(c), true);
});

test("current, expiring and expired", () => {
  const rec = (d: string) => [{ trailer_id: "t1", permit_type_id: "p1", expiration_date: d }];
  const ok = trailerCert(types, rec("2027-03-01"), "t1", T)!;
  assert.equal(ok.kind === "ok" && ok.state, "valid");
  assert.equal(certBlocks(ok), false);
  assert.equal((trailerCert(types, rec("2026-10-25"), "t1", T) as any).state, "expiring");
  const old = trailerCert(types, rec("2026-09-01"), "t1", T)!;
  assert.equal(certBlocks(old), true);
});

test("a record with no date doesn't count; the latest date wins", () => {
  const c = trailerCert(types, [
    { trailer_id: "t1", permit_type_id: "p1", expiration_date: null },
    { trailer_id: "t1", permit_type_id: "p1", expiration_date: "2026-01-01" },
    { trailer_id: "t1", permit_type_id: "p1", expiration_date: "2027-06-01" },
  ], "t1", T) as any;
  assert.equal(c.iso, "2027-06-01");
});
