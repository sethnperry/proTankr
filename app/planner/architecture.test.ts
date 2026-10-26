// Guards the Planner's shape (see docs/planner-architecture.md). If one of these fails,
// the fix is to move code to the right layer, not to raise the limit.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const lines = (rel: string) => read(rel).replace(/\n$/, "").split("\n").length;
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

// ── Size ratchet ──────────────────────────────────────────────────────────────
// A file in modals/, components/ or hooks/ stays under MAX lines. Files already over
// are listed with their current size as a ceiling: they may shrink, never grow. Split
// the next one you touch (see "Big modals" in docs/planner-architecture.md) and delete
// its entry here.
const MAX = 450;
const GRANDFATHERED: Record<string, number> = {
  "modals/DecoupleModal.tsx": 885,
  "modals/RecordHistoryModal.tsx": 819,
  "modals/MyLoadsModal.tsx": 786,
  "components/SoloOnboarding.tsx": 741,
  "modals/ServiceTypeManager.tsx": 677,
  "modals/ScaleHistoryModal.tsx": 531,
  "modals/EditTerminalModal.tsx": 518,
  "modals/MyTerminalsModal.tsx": 457,
  "hooks/useLocation.ts": 494,
  "components/StartLoadSheet.tsx": 461,
};

test("planner files stay under the size limit (or shrink toward it)", () => {
  for (const dir of ["modals", "components", "hooks"]) {
    for (const f of files(dir, /\.tsx?$/)) {
      const rel = `${dir}/${f}`;
      const limit = GRANDFATHERED[rel] ?? MAX;
      assert.ok(lines(rel) <= limit, `${rel} is ${lines(rel)} lines (limit ${limit}): split it`);
    }
  }
});

test("split modals stay split", () => {
  for (const [shell, max] of [["LoadingModal.tsx", 60], ["SoloEquipmentModal.tsx", 60], ["BinderModal.tsx", 250]] as const) {
    assert.ok(lines(`modals/${shell}`) <= max, `modals/${shell} must stay a thin shell (<= ${max} lines)`);
  }
  for (const dir of ["modals/loading", "modals/solo", "modals/binder"]) {
    for (const f of files(dir, /\.tsx?$/)) {
      assert.ok(lines(`${dir}/${f}`) <= 400, `${dir}/${f} is over 400 lines: split it`);
    }
  }
});
