import test from "node:test";
import assert from "node:assert/strict";
import { bolGroups, bolRef, normBol, pagesByBol, parseBolRef, unscanned } from "./bols.ts";

const c = (o: any) => ({ compartment_load_id: String(o.comp_number), trip_id: "t", pickup_id: "p1", order_id: null, delivery_id: null, product_id: "d2", supplier: null, bol_number: null, disposition: "loaded", ...o });
const pickups = [{ pickup_id: "p1", name: "Marathon" }, { pickup_id: "p2", name: "Citgo" }] as any;

test("a split load gives one group per BOL number, with its supplier, products and terminal", () => {
  const g = bolGroups([
    c({ comp_number: 1, bol_number: "759277", supplier: "Marathon Contract", product_id: "d2" }),
    c({ comp_number: 2, bol_number: " 759277 ", supplier: "Marathon Contract", product_id: "d2" }),
    c({ comp_number: 3, bol_number: "ab-12", supplier: "Atlas", product_id: "87", pickup_id: "p2" }),
    c({ comp_number: 4, bol_number: null, product_id: "93" }),
    c({ comp_number: 5, bol_number: "ZZZ", disposition: "cancelled" }),
  ] as any, pickups, (id) => (id === "d2" ? "ULSD" : id === "87" ? "Regular" : "Premium"));
  assert.deepEqual(g.map((x) => [x.bol, x.supplier, x.products, x.comps, x.pickup]), [
    ["759277", "Marathon Contract", ["ULSD"], [1, 2], "Marathon"],
    ["AB-12", "Atlas", ["Regular"], [3], "Citgo"],
    [null, null, ["Premium"], [4], "Marathon"],
  ]);
});

test("scans are kept per BOL number and the missing ones are named", () => {
  assert.equal(parseBolRef(bolRef("759277")), "759277");
  assert.equal(parseBolRef("trip"), null);
  assert.equal(normBol("  a1 "), "A1");
  const pages = pagesByBol([{ ref_type: "bol:759277", file_paths: ["a", "b"] }, { ref_type: "bol:759277", file_paths: ["c"] }, { ref_type: "tank_ticket", file_paths: ["x"] }]);
  assert.deepEqual(pages, { "759277": 3 });
  const g = bolGroups([c({ comp_number: 1, bol_number: "759277" }), c({ comp_number: 2, bol_number: "ZZ9" })] as any, pickups, () => "ULSD");
  assert.deepEqual(unscanned(g, pages).map((x) => x.bol), ["ZZ9"]);
});

test("finishing: only the last delivery cares; required blocks, otherwise one reminder", async () => {
  const { bolFinishPolicy } = await import("./bols.ts");
  assert.equal(bolFinishPolicy({ isLast: false, required: true, missing: 2, warned: false }), "ok");
  assert.equal(bolFinishPolicy({ isLast: true, required: true, missing: 0, warned: false }), "ok");
  assert.equal(bolFinishPolicy({ isLast: true, required: true, missing: 1, warned: true }), "block");
  assert.equal(bolFinishPolicy({ isLast: true, required: false, missing: 1, warned: false }), "warn");
  assert.equal(bolFinishPolicy({ isLast: true, required: false, missing: 1, warned: true }), "ok");
});
