import test from "node:test";
import assert from "node:assert/strict";
import { capsDifferOnly } from "./capsDiff.ts";

const plan = (c1: number | undefined, c3: number | undefined, p3 = "D2") => ({ 1: { empty: false, productId: "D2", capOverride: c1 }, 2: { empty: true, productId: "" }, 3: { empty: false, productId: p3, capOverride: c3 } });

test("same products, a cap changed: save it back", () => assert.equal(capsDifferOnly(plan(4300, undefined), plan(4300, 3800)), true));
test("same products, same caps: nothing to save", () => assert.equal(capsDifferOnly(plan(4300, 3800), plan(4300, 3800)), false));
test("a different product is a different plan: never overwrite", () => assert.equal(capsDifferOnly(plan(4300, 3800), plan(4300, 3800, "ULSD")), false));
