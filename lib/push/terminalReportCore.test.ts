import test from "node:test";
import assert from "node:assert/strict";
import { planReportPushes, reportPushText } from "./terminalReportCore.ts";

const rep = (o: object) => ({ reportId: "r1", terminalId: "T", type: "out_of_product", productId: "P", supplierName: null, companyId: "A", reporterUserId: "x", ...o });
const truck = (o: object) => ({ userId: "u1", companyId: "A", terminalId: "T", products: ["P"], ...o });

test("a product report reaches only trucks going for that product", () => {
  assert.equal(planReportPushes([rep({})], [truck({})]).length, 1);
  assert.equal(planReportPushes([rep({})], [truck({ products: ["Q"] })]).length, 0);
  assert.equal(planReportPushes([rep({})], [truck({ products: [] })]).length, 0);
});
test("terminal-wide reports reach everyone headed there, not the reporter or other racks", () => {
  assert.equal(planReportPushes([rep({ type: "long_line", productId: null })], [truck({ products: [] })]).length, 1);
  assert.equal(planReportPushes([rep({ type: "long_line", productId: null })], [truck({ userId: "x" })]).length, 0);
  assert.equal(planReportPushes([rep({ type: "long_line", productId: null })], [truck({ terminalId: "Z" })]).length, 0);
});
test("allocation stays inside the reporting company", () => {
  assert.equal(planReportPushes([rep({ type: "out_of_allocation" })], [truck({ companyId: "B" })]).length, 0);
  assert.equal(planReportPushes([rep({ type: "out_of_allocation" })], [truck({})]).length, 1);
});
test("text", () => {
  assert.equal(reportPushText(rep({}) as never, "ULSD"), "Out of ULSD");
  assert.equal(reportPushText(rep({ type: "out_of_allocation", supplierName: "Citgo" }) as never, "ULSD"), "No allocation · Citgo (ULSD)");
});
