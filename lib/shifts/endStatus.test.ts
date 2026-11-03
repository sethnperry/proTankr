import test from "node:test";
import assert from "node:assert/strict";
import { endStatusOptions, statusSetThisShift } from "./endStatus.ts";

test("a sleeper gets In use, Deadline and Readyline; a day cab skips In use", () => {
  assert.deepEqual(endStatusOptions({ sleeper: true, loaded: false }).map((o) => o.value), ["in_use", "deadline", "readyline"]);
  assert.deepEqual(endStatusOptions({ sleeper: false, loaded: false }).map((o) => o.value), ["deadline", "readyline"]);
});

test("with product aboard, Park preloaded replaces Readyline", () => {
  assert.deepEqual(endStatusOptions({ sleeper: true, loaded: true }).map((o) => o.value), ["in_use", "deadline", "park_preloaded"]);
  assert.deepEqual(endStatusOptions({ sleeper: false, loaded: true }).map((o) => o.value), ["deadline", "park_preloaded"]);
});

test("a status set after the shift began is left alone; an older one is asked about", () => {
  assert.equal(statusSetThisShift("2026-11-03T14:00:00Z", "2026-11-03T10:00:00Z"), true);
  assert.equal(statusSetThisShift("2026-11-03T09:00:00Z", "2026-11-03T10:00:00Z"), false);
  assert.equal(statusSetThisShift(null, "2026-11-03T10:00:00Z"), false);
  assert.equal(statusSetThisShift("2026-11-03T14:00:00Z", null), false);
});
