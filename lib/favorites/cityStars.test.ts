import test from "node:test";
import assert from "node:assert/strict";
import { loadCityStars, saveCityStars, cityStarKey } from "./cityStars.ts";

const mem = () => { const m = new Map<string, string>(); return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }; };

test("does not write without a user id", () => {
    const s = mem();
    assert.equal(saveCityStars(s, "p::", "", new Set(["a"])), false);
    assert.equal(s.m.size, 0);
  });
test("folds anon stars into the user's and removes the anon copy", () => {
    const s = mem();
    s.setItem("p::anon", JSON.stringify(["TX||dallas"]));
    s.setItem("p::u1", JSON.stringify(["OK||tulsa"]));
    assert.deepEqual([...loadCityStars(s, "p::", "u1")].sort(), ["OK||tulsa", "TX||dallas"]);
    assert.equal(s.getItem("p::anon"), null);
    assert.equal(JSON.parse(s.getItem("p::u1")!).length, 2);
  });
test("keys are case-insensitive on city", () => {
    assert.equal(cityStarKey(" tx ", "Dallas"), "TX||dallas");
  });
test("survives bad json", () => {
    const s = mem(); s.setItem("p::u1", "{oops");
    assert.equal(loadCityStars(s, "p::", "u1").size, 0);
  });