import { test } from "node:test";
import assert from "node:assert/strict";
import { compactSteps, summarizeQualification, type QualStep } from "./qualification.ts";

const step = (kind: QualStep["kind"], state: QualStep["state"], label = kind): QualStep => ({ kind, state, label });

test("summary counts steps and training loads separately", () => {
  const s = summarizeQualification([
    step("letter", "done"), step("video", "done"), step("orientation", "next"),
    step("training_load", "done"), step("training_load", "pending"), step("check_load", "pending"),
  ]);
  assert.equal(s.done, 3);
  assert.equal(s.total, 6);
  assert.equal(s.loadsDone, 1);
  assert.equal(s.loadsTotal, 2);
  assert.equal(s.next?.kind, "orientation");
  assert.equal(s.complete, false);
  assert.equal(summarizeQualification([step("letter", "done")]).complete, true);
  assert.equal(summarizeQualification([]).complete, false);
});

test("compactSteps folds leading done steps but never open ones", () => {
  const steps = [
    step("letter", "done"), step("video", "done"), step("orientation", "done"),
    ...Array.from({ length: 6 }, () => step("training_load", "done")),
    step("training_load", "next"), step("training_load", "pending"), step("check_load", "pending"),
  ];
  const c = compactSteps(steps, 8);
  assert.ok(c.folded > 0);
  assert.equal(c.folded + c.steps.length, steps.length);
  assert.equal(c.steps.filter((s) => s.state !== "done").length, 3);
  assert.ok(c.steps.length <= 8);
  assert.deepEqual(compactSteps(steps.slice(0, 4), 8), { folded: 0, steps: steps.slice(0, 4) });
});
