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

import { paperLogPayload, paperLogProblem } from "./paperLog.ts";

test("paper log: a reason is required, 'Other' needs words, defaults aren't stored as ids", () => {
  assert.match(paperLogProblem(null)!, /why/i);
  assert.match(paperLogProblem({ reasonId: null, label: "Other", category: "other", note: " " })!, /why/i);
  assert.equal(paperLogProblem({ reasonId: "default-0", label: "ELD or tablet not working", category: null, note: null }), null);
  const p = paperLogPayload({ reasonId: "default-0", label: "ELD or tablet not working", category: null, note: null }, { captureId: "c1", paths: ["a", "b"] });
  assert.deepEqual(p, { reason: "ELD or tablet not working", reason_id: null, category: null, note: null, capture_id: "c1", photo_count: 2 });
});

import { paperLogColumns, type PaperLogRow } from "./paperLog.ts";
import { toCsv } from "../reports/reportShell.ts";

test("paper log list reads reason and note with the driver's name", () => {
  const rows: PaperLogRow[] = [{ event_id: "e", user_id: "u", occurred_at: "2026-11-03T10:00:00Z", payload: { reason: "Other", note: "Tablet cracked", photo_count: 3 } }];
  const lines = toCsv(paperLogColumns(() => "Seth"), rows).split("\r\n");
  assert.equal(lines[0], "Date,Driver,Reason,Pages");
  assert.ok(lines[1].includes("Seth,Other · Tablet cracked,3"));
});
