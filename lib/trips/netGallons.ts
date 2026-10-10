// lib/trips/netGallons.ts
//
// Net gallons at 60°F from gross gallons, observed temp and API gravity
// (docs/trip-workflow-design.md §7).
//
// Method: API MPMS Ch. 11.1 / ASTM D1250 Table 6B (generalized refined
// products). Density at 60°F picks the product group, the group's constants
// give the thermal expansion coefficient, and
//
//   VCF = exp(-a60 * dT * (1 + 0.8 * a60 * dT)),   dT = T - 60°F
//
// Group constants (density in kg/m³ at 60°F):
//   gasolines   (653.0 – 770.352)    a60 = 192.4571/ρ² + 0.2438/ρ
//   transition  (770.352 – 787.5195) a60 = -0.0018684 + 1489.0670/ρ²
//   jet fuels   (787.5195 – 838.3127) a60 = 330.3010/ρ²
//   fuel oils   (838.3127 – 1163.5)  a60 = 103.8720/ρ² + 0.2701/ρ
//
// The groups meet at their boundaries (a60 is continuous across each one),
// which the unit tests check: a wrong constant shows up as a jump.
//
// Rounding: temp and API to 0.1, VCF to 4 decimals (the 1980 tables), net
// to whole gallons. The 2004 edition uses 5-decimal VCFs and a slightly
// different temperature basis; those differences are well under a gallon
// on a full compartment but are exactly what the BOL test set must settle
// before any product is marked validated (see VALIDATED_PRODUCT_IDS).
//
// Neat ethanol and B100 use different correction methods: no net prefill,
// the driver enters net from the BOL.

export type NetMethod = "table6b" | "none";

const KG_M3_PER_SG = 999.012; // water at 60°F, kg/m³ (1980 tables)

export function densityKgM3FromApi(api: number): number {
  return (141.5 / (api + 131.5)) * KG_M3_PER_SG;
}

function round(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

export type ProductGroup = "gasoline" | "transition" | "jet" | "fuel_oil";

export function productGroupForDensity(rho: number): ProductGroup | null {
  if (rho < 653.0 || rho > 1163.5) return null;
  if (rho < 770.352) return "gasoline";
  if (rho < 787.5195) return "transition";
  if (rho < 838.3127) return "jet";
  return "fuel_oil";
}

export function alpha60(rho: number): number | null {
  switch (productGroupForDensity(rho)) {
    case "gasoline":
      return 192.4571 / (rho * rho) + 0.2438 / rho;
    case "transition":
      return -0.0018684 + 1489.067 / (rho * rho);
    case "jet":
      return 330.301 / (rho * rho);
    case "fuel_oil":
      return 103.872 / (rho * rho) + 0.2701 / rho;
    default:
      return null;
  }
}

// Volume correction factor to 60°F, or null outside the table's range.
export function vcfTable6B(apiObserved: number, tempF: number): number | null {
  if (!Number.isFinite(apiObserved) || !Number.isFinite(tempF)) return null;
  const api = round(apiObserved, 1);
  const t = round(tempF, 1);
  if (api < 0 || api > 85 || t < 0 || t > 300) return null;
  // Table 6B is entered with API already corrected to 60°F (it's what a BOL
  // prints as gravity). Observed-to-60 gravity correction is a separate
  // table (5B) the driver never sees; we take the BOL's gravity as given.
  const rho = densityKgM3FromApi(api);
  const a = alpha60(rho);
  if (a == null) return null;
  const dT = t - 60;
  return round(Math.exp(-a * dT * (1 + 0.8 * a * dT)), 4);
}

// Which method a product uses, from its name. Neat ethanol and B99/B100 get
// none; everything else (gasoline grades and E10/E15 blends, diesel, dyed,
// B5/B20, kerosene, jet) gets Table 6B.
export function netMethodForProduct(name: string | null | undefined): NetMethod {
  const n = String(name ?? "").toLowerCase();
  if (!n) return "table6b";
  const blendB = n.match(/\bb\s?-?(\d{1,3})\b/);
  if (blendB && Number(blendB[1]) >= 99) return "none";
  if (/biodiesel/.test(n) && !blendB && !/blend/.test(n)) return "none";
  if (/\be\s?-?(85|98|100)\b/.test(n) || /denatured/.test(n)) return "none";
  if (/ethanol/.test(n) && !/(gasoline|unleaded|regular|premium|mid|plus|\be\s?-?1[05]\b)/.test(n)) return "none";
  return "table6b";
}

// Calculated net, whole gallons, or null when it can't be calculated.
export function calculateNetGallons(
  grossGallons: number | null | undefined,
  apiObserved: number | null | undefined,
  tempF: number | null | undefined,
  method: NetMethod = "table6b",
): number | null {
  if (method !== "table6b") return null;
  const g = Number(grossGallons);
  if (grossGallons == null || !Number.isFinite(g) || g <= 0) return null;
  if (apiObserved == null || tempF == null) return null;
  const vcf = vcfTable6B(Number(apiObserved), Number(tempF));
  if (vcf == null) return null;
  return Math.round(g * vcf);
}

// Products whose calculation has been proven against real BOLs (design §7's
// release gate). Empty until the BOL test set is collected: every covered
// product prefills net, but the edited-net flag only shows for these, so an
// unproven calculation can never accuse anyone.
export const VALIDATED_PRODUCT_IDS: ReadonlySet<string> = new Set<string>([]);

export const EDITED_NET_TOLERANCE_GAL = 2;

// The PTD's edited-net note, or null when there's nothing to flag.
export function editedNetFlag(args: {
  productId: string | null | undefined;
  netGallons: number | null | undefined;
  calculatedGallons: number | null | undefined;
  validated?: ReadonlySet<string>;
}): string | null {
  const validated = args.validated ?? VALIDATED_PRODUCT_IDS;
  if (!args.productId || !validated.has(args.productId)) return null;
  const net = Number(args.netGallons);
  const calc = Number(args.calculatedGallons);
  if (args.netGallons == null || args.calculatedGallons == null || !Number.isFinite(net) || !Number.isFinite(calc)) return null;
  if (Math.abs(net - calc) <= EDITED_NET_TOLERANCE_GAL) return null;
  return `net edited from calculated (${Math.round(calc).toLocaleString("en-US")} → ${Math.round(net).toLocaleString("en-US")})`;
}
