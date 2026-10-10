// lib/trips/netGallons.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  alpha60,
  calculateNetGallons,
  densityKgM3FromApi,
  editedNetFlag,
  netMethodForProduct,
  vcfTable6B,
} from "./netGallons.ts";

test("expansion coefficient is continuous across every group boundary", () => {
  for (const rho of [770.352, 787.5195, 838.3127]) {
    const below = alpha60(rho - 1e-6)!;
    const above = alpha60(rho + 1e-6)!;
    assert.ok(Math.abs(below - above) < 2e-8, `jump at ${rho}: ${below} vs ${above}`);
  }
});

test("VCF is exactly 1 at 60°F and below 1 when warm", () => {
  assert.equal(vcfTable6B(35, 60), 1);
  assert.ok(vcfTable6B(35, 80)! < 1);
  assert.ok(vcfTable6B(60, 40)! > 1);
});

test("typical diesel and gasoline land in the expected range", () => {
  // Diesel ~0.00046/°F, gasoline ~0.00068/°F.
  assert.equal(vcfTable6B(35.0, 80.0), 0.9907);
  const gas = vcfTable6B(60.0, 80.0)!;
  assert.ok(gas > 0.985 && gas < 0.988, String(gas));
});

test("net is whole gallons; out-of-range or excluded products give null", () => {
  assert.equal(calculateNetGallons(8000, 35, 80), 7926);
  assert.equal(calculateNetGallons(8000, 35, 80, "none"), null);
  assert.equal(calculateNetGallons(0, 35, 80), null);
  assert.equal(calculateNetGallons(8000, 90, 80), null);
  assert.equal(calculateNetGallons(8000, null, 80), null);
});

test("density from API", () => {
  assert.ok(Math.abs(densityKgM3FromApi(10) - 999.012) < 0.01);
});

test("product method: neat ethanol and B100 excluded, blends covered", () => {
  for (const n of ["B100", "Biodiesel B99", "Biodiesel", "Denatured Ethanol", "Ethanol", "E85"]) {
    assert.equal(netMethodForProduct(n), "none", n);
  }
  for (const n of ["ULSD Diesel #2", "Biodiesel Blend B20", "B5 Diesel", "Regular Unleaded E10 87", "E15", "Jet A", "Kerosene", "Ethanol-blended gasoline"]) {
    assert.equal(netMethodForProduct(n), "table6b", n);
  }
});

test("edited-net flag only for validated products and beyond 2 gallons", () => {
  const validated = new Set(["p1"]);
  assert.equal(editedNetFlag({ productId: "p1", netGallons: 7928, calculatedGallons: 7926, validated }), null);
  assert.equal(
    editedNetFlag({ productId: "p1", netGallons: 7930, calculatedGallons: 7926, validated }),
    "net edited from calculated (7,926 → 7,930)",
  );
  assert.equal(editedNetFlag({ productId: "p2", netGallons: 7000, calculatedGallons: 7926, validated }), null);
});
