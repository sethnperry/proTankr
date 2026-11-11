import test from "node:test";
import assert from "node:assert/strict";
import { isSplashable, refineSecondStop, splashPickupPlans } from "./splashRows.ts";

test("E0 gasoline and RBOB can take a splash; E10 and diesel cannot", () => {
  assert.ok(isSplashable("Unleaded E0 87"));
  assert.ok(isSplashable("Recreation Fuel E0 90"));
  assert.ok(isSplashable("RBOB Blendstock"));
  assert.ok(!isSplashable("Regular Unleaded E10 87"));
  assert.ok(!isSplashable("ULSD Diesel #2"));
  assert.ok(!isSplashable("Unleaded E0"+"0"));
});

test("both pickups: base carries every comp, splash only the blended ones", () => {
  const { base, splash } = splashPickupPlans({
    comps: [{ n: 1, size: 2000, base: "e0" }, { n: 2, size: 2000, base: "e0" }, { n: 3, size: 3000, base: "d2" }],
    splash: { 1: { additiveProductId: "eth", pct: 10 }, 2: { additiveProductId: "eth", pct: 15 } },
  });
  assert.deepEqual(base.map((c) => c.comp_number), [1, 2, 3]);
  assert.equal(base[2].splash, undefined);
  assert.deepEqual(splash.map((c) => [c.comp_number, c.product_id]), [[1, "eth"], [2, "eth"]]);
  assert.equal(base[0].splash!.add + splash[0].splash!.add, 1980);
  assert.equal(splash[1].splash!.add, 297);
});

test("the second stop is re-worked from what is really aboard", () => {
  const { splash } = splashPickupPlans({ comps: [{ n: 1, size: 2000, base: "e0" }], splash: { 1: { additiveProductId: "eth", pct: 10 } } });
  const next = refineSecondStop({
    planned: splash, aboard: { 1: { product_id: "e0", gallons: 1700 } }, splash: { 1: { additiveProductId: "eth", pct: 10 } },
    sizes: { 1: 2000 }, roomLbs: 5000, lbsPerGal: () => 6.7,
  });
  assert.equal(next![0].splash!.add, 188);
  assert.equal(next![0].splash!.aboard, 1700);
  assert.equal(refineSecondStop({ planned: next!, aboard: { 1: { product_id: "e0", gallons: 1700 } }, splash: { 1: { additiveProductId: "eth", pct: 10 } }, sizes: { 1: 2000 }, roomLbs: 5000, lbsPerGal: () => 6.7 }), null);
});
