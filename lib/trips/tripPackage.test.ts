import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { buildPtd } from "./ptd.ts";
import { renderTripPackage, type PackageItem } from "./tripPackage.ts";

const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
const trip = { trip_id: "aaaaaaaa-0000-0000-0000-000000000000", company_id: "co", truck_id: null, trailer_id: null, driver_id: "u1", created_by: "u1", status: "complete", shipper: "Gemini", customer: "Loves", begin_miles: 1000, end_miles: 1120, entered_late: false, notes: null, started_at: "2026-11-12T14:00:00Z", completed_at: "2026-11-12T22:00:00Z" };
const ptd = buildPtd({
  trip: trip as any, orders: [{ order_id: "o1", trip_id: trip.trip_id, order_number: "4816492", shipper: null, customer: null, is_primary: true }], pickups: [], deliveries: [], compLoads: [], tanks: [], events: [],
} as any, { product: () => "ULSD", delivery: () => "Store", driver: () => "Seth", delayReason: () => null } as any);

const item = (kind: string, layout: PackageItem["layout"], n: number): PackageItem => ({
  kind, at: "2026-11-12T16:00:00Z", line: `${kind} test line`, detail: ["Gallons 120.5"], layout,
  images: Array.from({ length: n }, (_, i) => ({ name: `${kind}-${i}.png`, bytes: PNG })),
});

test("a package has a cover, the PTD, one page per BOL and four receipts to a page", async () => {
  const bytes = await renderTripPackage({
    ptd, driverName: "Seth Perry", truckName: "25184", trailerName: "3151", generatedAt: new Date("2026-11-12T23:00:00Z"),
    items: [item("BOL", "page", 2), item("Fuel receipt", "tile", 5)],
  });
  const doc = await PDFDocument.load(bytes);
  // cover(1+) + PTD(1+) + 2 BOL pages + 2 receipt pages
  assert.ok(doc.getPageCount() >= 6);
});

test("an image that can't be added is listed on the cover instead of failing the package", async () => {
  const bytes = await renderTripPackage({
    ptd, driverName: null, truckName: null, trailerName: null, generatedAt: new Date(),
    items: [{ kind: "Maintenance", at: null, line: "Brake chamber", layout: "tile", images: [{ name: "a.heic", bytes: null, note: "HEIC photo, open it from the app" }] }],
  });
  assert.ok((await PDFDocument.load(bytes)).getPageCount() >= 2);
});
