import test from "node:test";
import assert from "node:assert/strict";
import { closeNames, normName } from "./nameMatch.ts";

test("names compare without case, accents or punctuation", () => {
  assert.equal(normName("José  O'Neil"), normName("jose oneil"));
});
test("near misses and swapped order are suggested; unrelated names are not", () => {
  const c = ["Seth Perry", "Pedro Guzman", "Kyle Tatro"];
  assert.deepEqual(closeNames("Seth Pery", c), ["Seth Perry"]);
  assert.deepEqual(closeNames("Perry Seth", c), ["Seth Perry"]);
  assert.deepEqual(closeNames("Dana White", c), []);
  assert.deepEqual(closeNames("Seth Perry", c), []); // exact is "verified", not "close"
});
