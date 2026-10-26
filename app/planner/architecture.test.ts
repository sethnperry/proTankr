// Guards the Planner's shape (see docs/planner-architecture.md). If one of these fails,
// the fix is to move code to the right layer, not to raise the limit.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const lines = (rel: string) => read(rel).split("\n").length;
const files = (dir: string, ext: RegExp) => readdirSync(join(root, dir)).filter((f) => ext.test(f));

test("PlannerHost only builds the model and mounts things", () => {
  assert.ok(lines("PlannerHost.tsx") <= 60, "PlannerHost.tsx must stay under 60 lines");
  const src = read("PlannerHost.tsx");
  assert.ok(!/use(State|Effect|Memo|Callback|Ref)\(/.test(src), "no React state or effects in the host");
});

test("model layers stay small, free of JSX, and do not import components", () => {
  for (const f of files("model", /\.ts$/)) {
    const rel = `model/${f}`;
    assert.ok(lines(rel) <= 300, `${rel} is over 300 lines: split the layer`);
    const src = read(rel);
    assert.ok(!/<\/|\/>/.test(src.replace(/\/\/.*$/gm, "")), `${rel} must not contain JSX`);
    const bad = src.split("\n").filter((l) => /from "\.\.\/(components|flows)\//.test(l) && !l.startsWith("import type"));
    assert.deepEqual(bad, [], `${rel} must only import types from components or flows`);
  }
});

test("flows take no props and read the model", () => {
  for (const f of files("flows", /\.tsx$/)) {
    const src = read(`flows/${f}`);
    assert.ok(/export default function \w+\(\)/.test(src), `flows/${f} must be a zero-prop component`);
    assert.ok(src.includes("usePlanner()"), `flows/${f} must read usePlanner()`);
  }
});

test("the context type comes from the model", () => {
  assert.ok(read("PlannerContext.tsx").includes("ReturnType") || read("PlannerContext.tsx").includes("PlannerModel"));
});
