import { test } from "node:test";
import assert from "node:assert/strict";
import { headingToDelivery, headingToTerminal, parkedPreloads, type FleetTripLike } from "./dashboardCards.ts";

const f = (id: string, over: any = {}): FleetTripLike => ({
  driverName: `D${id}`, truckName: `T${id}`, trailerName: `R${id}`,
  pickups: [], deliveries: [], compLoads: [],
  ...over,
  trip: { trip_id: id, driver_id: `u${id}`, status: "in_transit", trailer_id: `r${id}`, ...(over.trip ?? {}) },
} as FleetTripLike);
const pk = (over: any = {}) => ({ pickup_id: "p", seq: 1, terminal_id: "T1", arrived_at: null, left_at: null, outcome: null, ...over });
const dl = (over: any = {}) => ({ delivery_id: "d", seq: 1, location_id: "L1", status: "planned", arrived_at: null, ...over });
const cl = (over: any = {}) => ({ compartment_load_id: "c", comp_number: 1, product_id: "P1", gross_gallons: 3000, disposition: "loaded", ...over });

test("trucks heading to my terminal: next pickup only, not me, arrived first", () => {
  const trips = [
    f("1", { pickups: [pk()] as any }),
    f("2", { pickups: [pk({ arrived_at: "x", planned_comps: [{ comp_number: 2, product_id: "P9" }] })] as any }),
    f("3", { pickups: [pk({ left_at: "x" }), pk({ pickup_id: "q", seq: 2, terminal_id: "T2" })] as any }),
    f("4", { pickups: [pk({ outcome: "no_load", left_at: "x" })] as any }),
    f("me", { trip: { driver_id: "me" }, pickups: [pk()] as any }),
  ];
  const r = headingToTerminal(trips, "T1", "me");
  assert.deepEqual(r.map((x) => [x.tripId, x.arrived]), [["2", true], ["1", false]]);
  assert.deepEqual(r[0].productIds, ["P9"]);
  assert.deepEqual(headingToTerminal(trips, null, "me"), []);
});

test("loads heading to my delivery: loaded, next stop matches, gallons per product", () => {
  const trips = [
    f("1", { deliveries: [dl()] as any, compLoads: [cl(), cl({ compartment_load_id: "c2", gross_gallons: 1000 }), cl({ compartment_load_id: "c3", product_id: "P2", gross_gallons: 500 })] as any }),
    f("2", { deliveries: [dl()] as any }),
    f("3", { deliveries: [dl({ location_id: "L2" })] as any, compLoads: [cl()] as any }),
  ];
  const r = headingToDelivery(trips, "L1", "me");
  assert.equal(r.length, 1);
  assert.deepEqual(r[0].aboard, [{ productId: "P1", gallons: 4000 }, { productId: "P2", gallons: 500 }]);
});

test("parked preloads skip my own trailer and empty trailers", () => {
  const trips = [
    f("1", { trip: { status: "parked", parked_at: "2026-10-01" }, compLoads: [cl()] as any }),
    f("2", { trip: { status: "parked", parked_at: "2026-10-02", trailer_id: "mine" }, compLoads: [cl()] as any }),
    f("3", { trip: { status: "parked", parked_at: "2026-10-03" } }),
    f("4", { trip: { status: "parked", parked_at: "2026-10-04" }, compLoads: [cl()] as any }),
  ];
  assert.deepEqual(parkedPreloads(trips, "mine").map((x) => x.trip.trip_id), ["4", "1"]);
});
