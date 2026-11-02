import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWorkOrderList } from "./workOrderList.ts";
import type { WorkOrderListRow } from "./workOrderList.ts";

const row = (id: string, status: any, at: string): WorkOrderListRow => ({ work_order_id: id, company_id: "c", truck_id: "t", trailer_id: null, subject: id, source: "pump_down", status, source_ref: null, detail: {}, reported_by: "u", created_at: at });

test("open work orders first, newest first; closed only when asked", () => {
  const rows = [row("a", "done", "2026-11-03"), row("b", "open", "2026-11-01"), row("c", "planned", "2026-11-02")];
  const l = buildWorkOrderList(rows, { showClosed: false, unitName: () => "Truck 1" });
  assert.deepEqual(l.items.map((i) => i.id), ["c", "b"]);
  assert.equal(l.openCount, 2);
  const all = buildWorkOrderList(rows, { showClosed: true, unitName: () => null });
  assert.deepEqual(all.items.map((i) => i.id), ["c", "b", "a"]);
});
