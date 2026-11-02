import { test } from "node:test";
import assert from "node:assert/strict";
import { documentColumns, documentPayload, documentProblem, downTimePayload, rowType, rowTypeLabel, type DocumentRow } from "./documents.ts";
import { toCsv } from "../reports/reportShell.ts";

test("a document needs a known type; Other needs words", () => {
  assert.match(documentProblem("", "")!, /kind/);
  assert.equal(documentProblem("bol", ""), null);
  assert.match(documentProblem("other", "  ")!, /what/);
  assert.equal(documentProblem("other", "Permit letter"), null);
});

test("payloads count the photos; down time carries nothing else", () => {
  assert.deepEqual(documentPayload("receipt", " tolls ", { captureId: "c", paths: ["a"] }), { doc_type: "receipt", note: "tolls", capture_id: "c", photo_count: 1 });
  assert.deepEqual(downTimePayload({ captureId: "d", paths: ["a", "b"] }), { capture_id: "d", photo_count: 2 });
});

test("the list shows documents by type and down time as its own type", () => {
  const rows: DocumentRow[] = [
    { event_id: "1", user_id: "u", event_type: "document_drop", occurred_at: "2026-11-03T10:00:00Z", payload: { doc_type: "bol", photo_count: 2 } },
    { event_id: "2", user_id: "u", event_type: "down_time", occurred_at: "2026-11-03T11:00:00Z", payload: { photo_count: 1 } },
  ];
  assert.equal(rowType(rows[1]), "down_time");
  assert.equal(rowTypeLabel("down_time"), "Down time");
  const lines = toCsv(documentColumns(() => "Seth"), rows).split("\r\n");
  assert.ok(lines[1].includes("Seth,Bill of lading"));
  assert.ok(lines[2].includes("Seth,Down time"));
});
