// lib/trips/packageServer.ts
//
// Server-side loading for the trip package and the End of Day report: the PTD for a trip (the same buildPtd the
// screens use) and everything captured while the trip was open. Uses the service client, so callers check who
// may see the trip first. Fails soft per piece: a missing photo never blocks the package.

import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { buildPtd } from "./ptd.ts";
import { locationTitle } from "./deliveryLocations.ts";
import { partialsOf } from "./partialDrops.ts";
import { bolGroups, parseBolRef, type BolGroup } from "./bols.ts";
import type { PackageItem } from "./tripPackage.ts";
import type { TripCompartmentLoadRow, TripDeliveryRow, TripDeliveryTankRow, TripEventRow, TripOrderRow, TripPickupRow, TripRow } from "./types.ts";

export type PtdBundle = {
  trip: TripRow;
  ptd: ReturnType<typeof buildPtd>;
  driverName: string | null;
  truckName: string | null;
  trailerName: string | null;
  /** Where each delivery went, for line-by-line summaries. */
  deliveryPlaces: Record<string, { name: string; city: string | null; state: string | null }>;
  pickupPlaces: Record<string, { city: string | null; state: string | null }>;
  /** What the End of Day cover line needs. */
  /** Every BOL number on the trip (a split load can have several). */
  bols: BolGroup[];
  eod: { fromCity: string | null; to: string; slots: (string | null)[]; gallons: number; minutes: number | null; products: { name: string; gallons: number }[] };
};

const rows = async <T>(p: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> => ((await p).data ?? []) as T[];

export async function loadPtdBundle(admin: SupabaseClient, tripId: string): Promise<PtdBundle | null> {
  const { data: tripRow } = await admin.from("trips").select("*").eq("trip_id", tripId).maybeSingle();
  if (!tripRow) return null;
  const trip = tripRow as TripRow;
  const [orders, pickups, deliveries, compLoads, events] = await Promise.all([
    rows<TripOrderRow>(admin.from("trip_orders").select("*").eq("trip_id", tripId)),
    rows<TripPickupRow>(admin.from("trip_pickups").select("*").eq("trip_id", tripId)),
    rows<TripDeliveryRow>(admin.from("trip_deliveries").select("*").eq("trip_id", tripId)),
    rows<TripCompartmentLoadRow>(admin.from("trip_compartment_loads").select("*").eq("trip_id", tripId)),
    rows<TripEventRow>(admin.from("trip_events").select("*").eq("trip_id", tripId)),
  ]);
  const dIds = deliveries.map((d) => d.delivery_id);
  const tanks = dIds.length ? await rows<TripDeliveryTankRow>(admin.from("trip_delivery_tanks").select("*").in("delivery_id", dIds)) : [];

  const productIds = [...new Set([...compLoads.map((c) => c.product_id), ...tanks.map((t) => t.product_id), ...events.flatMap((e) => ((e.payload as { product_id?: string })?.product_id ? [(e.payload as { product_id: string }).product_id] : []))].filter(Boolean) as string[])];
  const driverIds = [...new Set([trip.driver_id, ...deliveries.map((d) => d.delivering_driver_id), ...events.map((e) => e.actor_id)].filter(Boolean) as string[])];
  const locIds = [...new Set(deliveries.map((d) => d.location_id).filter(Boolean) as string[])];
  const reasonIds = [...new Set([...pickups.map((p) => p.delay_reason_id), ...deliveries.map((d) => d.delay_reason_id)].filter(Boolean) as string[])];
  const [prods, profs, locs, reasons, truck, trailer, trailerComps] = await Promise.all([
    productIds.length ? rows<{ product_id: string; product_name: string | null; display_name: string | null }>(admin.from("products").select("product_id, product_name, display_name").in("product_id", productIds)) : [],
    driverIds.length ? rows<{ user_id: string; display_name: string | null }>(admin.from("profiles").select("user_id, display_name").in("user_id", driverIds)) : [],
    locIds.length ? rows<{ location_id: string; name: string; location_number: string | null; city: string | null; state: string | null }>(admin.from("delivery_locations").select("location_id, name, location_number, city, state").in("location_id", locIds)) : [],
    reasonIds.length ? rows<{ reason_id: string; label: string }>(admin.from("delay_reasons").select("reason_id, label").in("reason_id", reasonIds)) : [],
    trip.truck_id ? admin.from("trucks").select("truck_name").eq("truck_id", trip.truck_id).maybeSingle() : Promise.resolve({ data: null }),
    trip.trailer_id ? admin.from("trailers").select("trailer_name").eq("trailer_id", trip.trailer_id).maybeSingle() : Promise.resolve({ data: null }),
    trip.trailer_id ? rows<{ comp_number: number }>(admin.from("trailer_compartments").select("comp_number").eq("trailer_id", trip.trailer_id)) : [],
  ]);
  const codeRows = productIds.length ? await rows<{ product_id: string; button_code: string | null; product_code: string | null; product_name: string | null }>(admin.from("products").select("product_id, button_code, product_code, product_name").in("product_id", productIds)) : [];
  const pn = new Map(prods.map((p) => [p.product_id, String(p.display_name || p.product_name || "Product")]));
  const dn = new Map(profs.map((p) => [p.user_id, p.display_name ?? ""]));
  const ln = new Map(locs.map((l) => [l.location_id, locationTitle(l)]));
  const rl = new Map(reasons.map((r) => [r.reason_id, r.label]));

  const ptd = buildPtd({ trip, orders, pickups, deliveries, compLoads, tanks, events }, {
    product: (id) => (id && pn.get(id)) || "Product",
    delivery: (d) => (d.location_id && ln.get(d.location_id)) || d.one_off_name || "Delivery",
    driver: (id) => (id && dn.get(id)) || "Driver",
    delayReason: (id) => (id ? rl.get(id) ?? null : null),
  });
  const deliveryPlaces: PtdBundle["deliveryPlaces"] = {};
  for (const d of deliveries) {
    const l = d.location_id ? locs.find((x) => x.location_id === d.location_id) : null;
    deliveryPlaces[d.delivery_id] = { name: (d.location_id && ln.get(d.location_id)) || d.one_off_name || "Delivery", city: l?.city ?? null, state: l?.state ?? null };
  }
  const pickupPlaces: PtdBundle["pickupPlaces"] = {};
  for (const p of pickups) pickupPlaces[p.pickup_id] = { city: p.city ?? null, state: p.state ?? null };
  const codeOf = (id: string | null) => { const r = codeRows.find((x) => x.product_id === id); return String(r?.button_code ?? r?.product_code ?? (r?.product_name ?? "").split(" ")[0] ?? "").trim().toUpperCase() || "?"; };
  const live = compLoads.filter((c) => c.disposition !== "cancelled");
  const nComps = Math.max(trailerComps.length ? Math.max(...trailerComps.map((c) => c.comp_number)) : 0, ...live.map((c) => c.comp_number), 0);
  const slots = Array.from({ length: nComps }, (_, i) => { const c = live.find((x) => x.comp_number === i + 1); return c ? codeOf(c.product_id) : null; });
  const firstLoaded = [...pickups].sort((a, b) => a.seq - b.seq).find((p) => p.outcome !== "no_load") ?? null;
  const prodGal = new Map<string, number>();
  const partial = partialsOf(events);
  const loadedGross = (c: TripCompartmentLoadRow) => Number(c.gross_gallons ?? 0) + partial.filter((p) => p.compartment_load_id === c.compartment_load_id).reduce((n, p) => n + p.gallons, 0);
  for (const c of live) { const n = (c.product_id && pn.get(c.product_id)) || "Product"; prodGal.set(n, (prodGal.get(n) ?? 0) + loadedGross(c)); }
  const eod = {
    fromCity: firstLoaded?.city ?? null,
    to: [...deliveries].filter((d) => d.status !== "cancelled").sort((a, b) => a.seq - b.seq).map((d) => deliveryPlaces[d.delivery_id]?.name ?? "Delivery").join(" + ") || "-",
    slots, gallons: live.reduce((n, c) => n + loadedGross(c), 0), minutes: ptd.time.total,
    products: [...prodGal.entries()].map(([name, gallons]) => ({ name, gallons })),
  };
  return {
    trip, ptd, deliveryPlaces, pickupPlaces, eod, bols: bolGroups(compLoads, pickups, (id) => (id && pn.get(id)) || "Product"),
    driverName: dn.get(trip.driver_id) || null,
    truckName: ((truck as { data: { truck_name?: string } | null }).data?.truck_name) ?? null,
    trailerName: ((trailer as { data: { trailer_name?: string } | null }).data?.trailer_name) ?? null,
  };
}

/** A photo from a bucket as JPEG or PNG bytes (other formats are converted); null when it can't be read. */
async function photo(admin: SupabaseClient, bucket: string, path: string): Promise<{ bytes: Uint8Array | null; note?: string }> {
  try {
    const { data, error } = await admin.storage.from(bucket).download(path);
    if (error || !data) return { bytes: null, note: "photo could not be downloaded" };
    const raw = new Uint8Array(await data.arrayBuffer());
    const isPng = raw[0] === 0x89 && raw[1] === 0x50, isJpg = raw[0] === 0xff && raw[1] === 0xd8;
    // Every photo is turned upright and scaled down: a package of full-size camera photos would be too big to email.
    try { return { bytes: new Uint8Array(await sharp(raw).rotate().resize(1800, 1800, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer()) }; }
    catch { return isPng || isJpg ? { bytes: raw } : { bytes: null, note: "photo format can't be added (open it in the app)" }; }
  } catch { return { bytes: null, note: "photo could not be read" }; }
}

const DOC_PURPOSES = new Set(["document", "manifest", "bol"]);
const PURPOSE_LABEL: Record<string, string> = { fuel_receipt: "Fuel receipt", scale_ticket: "Scale ticket", tank_ticket: "Tank ticket", document: "Document", manifest: "Manifest", bol: "BOL", inspection: "Inspection", down_time: "Down time", paper_log: "Paper log" };

/** Everything the driver collected while this trip was open: fuel stops, captured photos, repair requests. */
export async function loadPackageItems(admin: SupabaseClient, trip: TripRow, bols: BolGroup[] = []): Promise<PackageItem[]> {
  const from = trip.started_at ?? new Date(0).toISOString();
  const to = trip.completed_at ?? trip.cancelled_at ?? new Date().toISOString();
  const driver = trip.driver_id;
  const items: PackageItem[] = [];

  const [fuel, windowCaps, bolCaps, wos] = await Promise.all([
    rows<any>(admin.from("fuel_purchases").select("*").eq("driver_id", driver).eq("status", "complete").gte("started_at", from).lte("started_at", to).order("started_at")),
    rows<any>(admin.from("form_captures").select("*").eq("user_id", driver).gte("created_at", from).lte("created_at", to).order("created_at")),
    // BOL scans belong to the trip itself: found by their link, whenever and by whoever scanned them (a BOL can be filed later from the document center).
    rows<any>(admin.from("form_captures").select("*").eq("ref_id", trip.trip_id).like("ref_type", "bol:%").order("created_at")),
    rows<any>(admin.from("work_orders").select("*").eq("reported_by", driver).gte("created_at", from).lte("created_at", to).order("created_at")),
  ]);
  const caps = [...windowCaps, ...bolCaps.filter((b) => !windowCaps.some((w) => w.capture_id === b.capture_id))];
  const pays = fuel.length ? await rows<any>(admin.from("fuel_purchase_payments").select("*").in("purchase_id", fuel.map((f) => f.id))) : [];
  const usedCaptures = new Set<string>();

  for (const f of fuel) {
    const pay = pays.find((p) => p.purchase_id === f.id);
    const images: PackageItem["images"] = [];
    if (pay?.receipt_path) { const p = await photo(admin, "fuel-receipts", pay.receipt_path); images.push({ name: "fuel receipt", bytes: p.bytes, note: p.note }); }
    for (const c of caps.filter((x) => x.ref_id === f.id)) { usedCaptures.add(c.capture_id); for (const path of c.file_paths ?? []) { const p = await photo(admin, "form-captures", path); images.push({ name: "fuel receipt", bytes: p.bytes, note: p.note }); } }
    const where = [f.store_name, f.store_number ? `#${f.store_number}` : null, [f.city, f.state].filter(Boolean).join(", ")].filter(Boolean).join(" ");
    items.push({
      kind: "Fuel receipt", at: f.started_at, layout: "tile",
      line: `${where || "Fuel stop"}  ${f.diesel_gallons != null ? `${Number(f.diesel_gallons).toLocaleString("en-US")} gal diesel` : ""}${f.def_gallons ? `, ${f.def_gallons} gal DEF` : ""}${pay?.total_amount != null && !pay.is_personal ? `, $${Number(pay.total_amount).toFixed(2)}` : ""}`.trim(),
      detail: [f.odometer != null ? `Odometer ${Number(f.odometer).toLocaleString("en-US")}` : "", f.pump_number ? `Pump ${f.pump_number}` : ""].filter(Boolean),
      images,
    });
  }
  // One BOL item per BOL number: its scans, and a plain "not scanned" line for a number with none.
  const bolInfo = (b: string) => { const g = bols.find((x) => x.bol === b); return g ? [g.supplier, g.pickup, `${g.products.join(", ")} (C${g.comps.join(", C")})`].filter(Boolean).join(" · ") : ""; };
  const scanned = new Set<string>();
  for (const c of caps.filter((x) => parseBolRef(x.ref_type))) {
    usedCaptures.add(c.capture_id);
    const b = parseBolRef(c.ref_type)!; scanned.add(b);
    const images: PackageItem["images"] = [];
    for (const path of c.file_paths ?? []) { const p = await photo(admin, "form-captures", path); images.push({ name: `BOL ${b}`, bytes: p.bytes, note: p.note }); }
    items.push({ kind: `BOL ${b}`, at: c.created_at, layout: "page", line: `${bolInfo(b)}  ${images.length} page${images.length === 1 ? "" : "s"}`.trim(), detail: [], images });
  }
  for (const g of bols) if (g.bol && !scanned.has(g.bol)) items.push({ kind: `BOL ${g.bol}`, at: null, layout: "page", line: `${bolInfo(g.bol)}  NOT SCANNED`.trim(), detail: [], images: [] });

  for (const c of caps) {
    if (usedCaptures.has(c.capture_id)) continue;
    const images: PackageItem["images"] = [];
    for (const path of c.file_paths ?? []) { const p = await photo(admin, "form-captures", path); images.push({ name: PURPOSE_LABEL[c.purpose] ?? c.purpose, bytes: p.bytes, note: p.note }); }
    const o = (c.ocr ?? {}) as Record<string, unknown>;
    const read = Object.entries(o).filter(([, v]) => v != null && typeof v !== "object").map(([k, v]) => `${k}: ${v}`);
    items.push({
      kind: PURPOSE_LABEL[c.purpose] ?? "Photo", at: c.created_at, layout: DOC_PURPOSES.has(c.purpose) ? "page" : "tile",
      line: `${images.length} photo${images.length === 1 ? "" : "s"}${c.ref_type ? ` (${String(c.ref_type).replace(/_/g, " ")})` : ""}`, detail: read, images,
    });
  }
  for (const w of wos) {
    items.push({ kind: "Maintenance", at: w.created_at, layout: "tile", line: `${w.subject ?? "Repair request"} (${w.status ?? "open"})`, detail: w.detail ? [String(w.detail).slice(0, 300)] : [], images: [] });
  }
  return items.sort((a, b) => String(a.at).localeCompare(String(b.at)));
}
