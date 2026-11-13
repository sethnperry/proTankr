import test from "node:test";
import assert from "node:assert/strict";
import { permitTypeForSlug, slugForPermit, type PermitTypeLite } from "./permitLink.ts";

const types: PermitTypeLite[] = [
  { permit_type_id: "r", name: "Registration", applies_to: "both" },
  { permit_type_id: "ai", name: "Annual Inspection", applies_to: "both" },
  { permit_type_id: "v", name: "V — External Visual", applies_to: "trailer" },
  { permit_type_id: "k", name: "K — Leakage Test", applies_to: "trailer" },
  { permit_type_id: "ifta", name: "IFTA Permit + Decals", applies_to: "truck" },
  { permit_type_id: "cert", name: "Marathon certification", applies_to: "trailer", terminal_id: "t1" },
];

test("an old category finds its Binder permit type, and back", () => {
  assert.equal(permitTypeForSlug(types, "trailer", "trailer_registration")?.permit_type_id, "r");
  assert.equal(permitTypeForSlug(types, "truck", "registration")?.permit_type_id, "r");
  assert.equal(permitTypeForSlug(types, "trailer", "tank_v")?.permit_type_id, "v");
  assert.equal(permitTypeForSlug(types, "truck", "ifta")?.permit_type_id, "ifta");
  assert.equal(permitTypeForSlug(types, "trailer", "ifta"), null, "a trailer has no IFTA");
  assert.equal(permitTypeForSlug(types, "trailer", "other"), null);
  assert.equal(slugForPermit("trailer", "Registration"), "trailer_registration");
  assert.equal(slugForPermit("trailer", "K — Leakage Test"), "tank_k");
  assert.equal(slugForPermit("trailer", "Marathon certification"), null);
});
