import test from "node:test";
import assert from "node:assert/strict";
import { DELAY_EVENT, DELAY_REASONS, delayEventPayload, delayReasonLabel, dropDelayMinutes, legForStep, loggedDelays, type RunningDelay } from "./delays.ts";
import type { TripEventRow } from "./types.ts";

const running: RunningDelay = { tripId: "t", leg: "at_drop", code: "blocked_access", note: null, startedAt: "2026-10-23T12:00:00.000Z", pickupId: null, deliveryId: "d1" };

test("a finished delay becomes an event payload with its minutes", () => {
  const p = delayEventPayload(running, "2026-10-23T12:14:40.000Z");
  assert.equal(p.minutes, 15);
  assert.equal(p.label, "Blocked access to the delivery area");
});

test("both drop lists carry the shared 'blocked access' reason; rack lists differ", () => {
  assert.ok(DELAY_REASONS.to_drop.some((r) => r.code === "blocked_access"));
  assert.ok(DELAY_REASONS.at_drop.some((r) => r.code === "blocked_access"));
  assert.ok(!DELAY_REASONS.to_rack.some((r) => r.code === "blocked_access"));
  assert.ok(DELAY_REASONS.at_rack.some((r) => r.code === "long_line"));
});

test("labels: other uses the note, unknown codes pass through", () => {
  assert.equal(delayReasonLabel("other", " Fire truck "), "Fire truck");
  assert.equal(delayReasonLabel("traffic"), "Traffic");
  assert.equal(delayReasonLabel("zzz"), "zzz");
});

test("legs by step", () => {
  assert.equal(legForStep("arrive_delivery"), "to_drop");
  assert.equal(legForStep("finish_delivery"), "at_drop");
  assert.equal(legForStep("arrive_pickup"), "to_rack");
  assert.equal(legForStep("start"), null);
});

test("minutes already explained at one drop count only that delivery's at-drop delays", () => {
  const ev = (delivery_id: string | null, leg: string, minutes: number, at: string): TripEventRow => ({
    event_id: at, trip_id: "t", event_type: DELAY_EVENT, occurred_at: at, actor_id: "u", pickup_id: null, delivery_id, payload: { leg, code: "traffic", minutes },
  });
  const delays = loggedDelays([
    ev("d1", "at_drop", 12, "2026-10-23T12:00:00Z"),
    ev("d1", "at_drop", 5, "2026-10-23T12:30:00Z"),
    ev("d1", "to_drop", 40, "2026-10-23T10:00:00Z"),
    ev("d2", "at_drop", 99, "2026-10-23T13:00:00Z"),
  ]);
  assert.equal(dropDelayMinutes(delays, "d1"), 17);
});

import { delayIssueCode } from "./delays.ts";
test("rack delay reasons map to terminal warnings", () => {
  assert.equal(delayIssueCode("long_line"), "long_line");
  assert.equal(delayIssueCode("rack_down"), "terminal_issue");
  assert.equal(delayIssueCode("gauging"), null);
});
