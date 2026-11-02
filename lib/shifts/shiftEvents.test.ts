import test from "node:test";
import assert from "node:assert/strict";
import { createTripStore, emptyState, type Sender } from "../trips/tripStore.ts";
import { recordShiftEvent } from "./shiftEvents.ts";
import { INSERT_ONLY, SYNC_ORDER, type TripTable } from "../trips/types.ts";

test("shift_events is a synced, insert-only table", () => {
  assert.ok(SYNC_ORDER.includes("shift_events"));
  assert.ok(INSERT_ONLY.has("shift_events"));
  assert.ok(emptyState().rows.shift_events);
});

test("a recorded event is queued with its source, and sent once", async () => {
  const store = createTripStore({ storageKey: "k" });
  const sent: { table: TripTable; insertOnly: boolean }[] = [];
  const send = (async (table, _rows, opts) => { sent.push({ table, insertOnly: opts.insertOnly }); return { ok: true }; }) as Sender;
  const e = recordShiftEvent(store, { companyId: "c", userId: "u", actorId: "u", type: "shift_start" });
  assert.equal(e.source, "app");
  assert.equal(store.list("shift_events").length, 1);
  await store.drain(send);
  assert.deepEqual(sent, [{ table: "shift_events", insertOnly: true }]);
  await store.drain(send);
  assert.equal(sent.length, 1);
  assert.equal(store.pendingCount(), 0);
});

test("a dispatcher's entry for a driver is manual", () => {
  const store = createTripStore({ storageKey: "k" });
  const e = recordShiftEvent(store, { companyId: "c", userId: "driver", actorId: "dispatcher", type: "shift_end" });
  assert.equal(e.source, "manual");
  assert.equal(e.user_id, "driver");
});
