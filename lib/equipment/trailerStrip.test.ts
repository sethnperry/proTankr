import test from "node:test";
import assert from "node:assert/strict";
import { stripSegments, residueStands } from "./trailerStrip.ts";

test("loaded, residue and empty compartments", () => {
  const s = stripSegments([{ comp: 2, size: 3000 }, { comp: 1, size: 2000 }, { comp: 3, size: 4000 }], { 1: "#eab308" }, { 3: "#fff" });
  assert.deepEqual(s.map((x) => [x.comp, x.kind]), [[1, "loaded"], [2, "empty"], [3, "residue"]]);
  assert.equal(s[0].color, "#eab308");
});
test("unknown sizes draw equal segments", () => {
  const s = stripSegments([{ comp: 1, size: null }, { comp: 2, size: null }], {}, {});
  assert.equal(s[0].size, s[1].size);
});
test("a wash after the last load clears residue", () => {
  assert.equal(residueStands("2026-10-01T00:00:00Z", "2026-10-02T00:00:00Z"), false);
  assert.equal(residueStands("2026-10-02T00:00:00Z", "2026-10-01T00:00:00Z"), true);
  assert.equal(residueStands("2026-10-02T00:00:00Z", null), true);
  assert.equal(residueStands(null, null), false);
});
