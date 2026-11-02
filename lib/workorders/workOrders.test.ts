import test from "node:test";
import assert from "node:assert/strict";
import { createTripStore, type Sender } from "../trips/tripStore.ts";
import { createWorkOrder, isOpenWorkOrder, startingStatus } from "./workOrders.ts";
import { INSERT_ONLY } from "../trips/types.ts";

test("a pump down, an inspection and a repair request each make one work order", async () => {
  const store = createTripStore({ storageKey: "k" });
  const a = createWorkOrder(store, { companyId: "c", reportedBy: "u", subject: "Pump 7 down", source: "pump_down", truckId: "t" });
  const b = createWorkOrder(store, { companyId: "c", reportedBy: "u", subject: "Brake chamber", source: "failed_inspection", trailerId: "tr" });
  const c = createWorkOrder(store, { companyId: "c", reportedBy: "u", subject: "Hose", source: "repair_request" });
  assert.equal(store.list("work_orders").length, 3);
  assert.deepEqual([a.status, b.status, c.status], ["open", "open", "awaiting_approval"]);
  const seen: string[] = [];
  const send = (async (table, rows, opts) => { seen.push(`${table}:${rows.length}:${opts.insertOnly}`); return { ok: true }; }) as Sender;
  await store.drain(send);
  assert.deepEqual(seen, ["work_orders:3:true"]);
  assert.ok(INSERT_ONLY.has("work_orders"));
});

test("a retry with the same id is still one work order", () => {
  const store = createTripStore({ storageKey: "k" });
  createWorkOrder(store, { id: "fixed", companyId: "c", reportedBy: "u", subject: "Tire", source: "other" });
  createWorkOrder(store, { id: "fixed", companyId: "c", reportedBy: "u", subject: "Tire", source: "other" });
  assert.equal(store.list("work_orders").length, 1);
});

test("a blank subject is refused; closed statuses are not open", () => {
  const store = createTripStore({ storageKey: "k" });
  assert.throws(() => createWorkOrder(store, { companyId: "c", reportedBy: "u", subject: "  ", source: "other" }));
  assert.equal(isOpenWorkOrder("awaiting_approval"), true);
  assert.equal(isOpenWorkOrder("denied"), false);
  assert.equal(startingStatus("pump_down"), "open");
});
