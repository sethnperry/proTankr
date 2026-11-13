// lib/trips/ptdPdf.ts
//
// The Product Transfer Document as PDF pages (pdf-lib), from the same buildPtd data the on-screen and printed
// PTD use, so the three can't disagree. Signatures print as "Signed electronically" with the time.

import { PdfDoc, M, W, MUTE, RED, INK, safe } from "../pdf/doc.ts";
import { code39Bars } from "./code39.ts";
import { fmtMinutes } from "./billingTime.ts";
import type { buildPtd } from "./ptd.ts";

type Ptd = ReturnType<typeof buildPtd>;

const gal = (n: number | null | undefined) => (n == null ? "-" : Math.round(n).toLocaleString("en-US"));
const dec = (n: number | null | undefined) => (n == null ? "-" : (Math.round(n * 10) / 10).toLocaleString("en-US"));
const when = (iso: string | null | undefined, tz: string) =>
  iso ? new Date(iso).toLocaleString("en-US", { timeZone: tz, month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }) : "-";
const hm = (iso: string | null | undefined, tz: string) =>
  iso ? new Date(iso).toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }) : "-";

export function drawPtd(d: PdfDoc, ptd: Ptd, o: { truckName?: string | null; trailerName?: string | null; driverName?: string | null; tz?: string } = {}) {
  const tz = o.tz ?? "America/New_York";
  // Barcode across the top.
  try {
    const { bars, width } = code39Bars(ptd.code);
    const scale = Math.min(1.2, (W - 2 * M - 120) / width);
    d.y -= 28;
    for (const b of bars) d.page.drawRectangle({ x: M + b.x * scale, y: d.y, width: b.w * scale, height: 26, color: INK });
  } catch { /* no barcode */ }
  d.y -= 12;
  d.text(ptd.code, M, 9, d.reg, MUTE);
  d.y -= 16;
  d.title("Product Transfer Document", ptd.date ? when(ptd.date, tz) : undefined);

  d.kv("Orders:", ptd.orderNumbers.join(", ") || "-");
  d.kv("Shipper / Customer:", `${ptd.shipper ?? "-"} / ${ptd.customer ?? "-"}`);
  d.kv("Driver:", o.driverName ?? "-");
  d.kv("Equipment:", `Truck ${o.truckName ?? "-"}  Trailer ${o.trailerName ?? "-"}`);
  d.kv("Miles:", `${dec(ptd.beginMiles)} to ${dec(ptd.endMiles)}${ptd.totalMiles != null ? `  (${dec(ptd.totalMiles)} mi)` : ""}`);
  if (ptd.cancellation) d.para(`LOAD CANCELLED ${when(ptd.cancellation.at, tz)}: ${[...ptd.cancellation.reasons, ptd.cancellation.note].filter(Boolean).join("; ")}`, 9.5, d.bold, RED);
  for (const t of ptd.truckChanges) d.para(`Truck changed ${when((t as { at?: string }).at ?? null, tz)}`, 9, d.ital, MUTE);

  d.heading("Pickups");
  for (const p of ptd.pickups) {
    d.kv(`${p.name}:`, p.noLoad
      ? `Couldn't load. ${p.noLoadReason ?? ""}`
      : `arrived ${hm(p.arrivedAt, tz)}, began ${hm(p.beginAt, tz)}, departed ${hm(p.leftAt, tz)}${p.delayReason || p.delayNote ? `. Delay: ${p.delayReason ?? p.delayNote}` : ""}`);
  }

  d.heading("Compartments");
  d.table(["Comp", "Product", "BOL", "Supplier", "Gross", "Net", "Temp", "API", "Order"],
    ptd.compartments.map((c) => [`C${c.comp}`, c.product, c.bol ?? "", c.supplier ?? "", gal(c.gross), gal(c.net), c.temp == null ? "" : `${dec(c.temp)}F`, dec(c.api), c.order ?? ""]),
    [0.07, 0.16, 0.13, 0.17, 0.1, 0.1, 0.09, 0.07, 0.11], ["l", "l", "l", "l", "r", "r", "r", "r", "l"]);
  d.gap(4);
  d.kv("Totals:", `${gal(ptd.totals.gross)} gal gross, ${gal(ptd.totals.net)} gal net`);
  if (ptd.billing.length) d.kv("Billing (net):", ptd.billing.map((b) => `${b.order ?? "-"} ${b.product} ${gal(b.net)}`).join("; "));

  for (const del of ptd.deliveries) {
    d.heading(`${del.deliveryType === "pump_off" ? "Pump off" : "Delivery"}: ${del.name}`);
    d.kv("Times:", `arrived ${hm(del.arrivedAt, tz)}, began ${hm(del.beginAt, tz)}, finished ${hm(del.leftAt, tz)}${del.delayReason || del.delayNote ? `. Delay: ${del.delayReason ?? del.delayNote}` : ""}`);
    if (del.status === "planned") d.para("Not delivered yet.", 9, d.ital, MUTE);
    if (del.drops.length) {
      d.table(["Comp", "Product", "Tank", "Gallons", "Before", "After", "Water"],
        del.drops.map((x) => [`C${x.comp}`, x.product, x.tank ?? "-", x.gallons != null ? gal(x.gallons) : gal(x.net), x.before == null ? "" : `${dec(x.before)}${x.unit === "inches" ? " in" : ""}`, x.after == null ? "" : `${dec(x.after)}${x.unit === "inches" ? " in" : ""}`, x.water == null ? "" : `${dec(x.water)} in`]),
        [0.08, 0.22, 0.1, 0.14, 0.15, 0.15, 0.16], ["l", "l", "l", "r", "r", "r", "r"]);
      for (const x of del.drops) if (x.partial) d.para(`C${x.comp}: ${x.partial}`, 8.5, d.ital, MUTE);
    }
    if (del.otherTanks.length) d.para(`Other tanks read: ${del.otherTanks.map((t) => `${t.tank} ${dec(t.before)} to ${dec(t.after)}`).join("; ")}`, 8.5, d.reg, MUTE);
    const notes = [
      del.odometer != null ? `Odometer ${dec(del.odometer)}` : null,
      del.bioBlends.length ? `Bio: ${del.bioBlends.join(", ")}` : null,
      del.additives.length ? `Additives: ${del.additives.join(", ")}` : null,
      del.issues.length ? `Issues: ${del.issues.join(", ")}` : null,
    ].filter(Boolean) as string[];
    for (const n of notes) d.para(n, 9);
    d.kv("Signed:", `${del.driver ?? "-"}${del.driverSignedAt ? ` electronically ${when(del.driverSignedAt, tz)}` : " (not signed)"}${del.consigneeName ? `. Consignee: ${del.consigneeName}${del.consigneeSignature ? " (signature on file)" : ""}` : ""}`);
  }

  if (ptd.loadingSigs.length) { d.heading("Loading drivers"); for (const s of ptd.loadingSigs) d.para(`${s.name}  signed electronically ${when(s.at, tz)}`); }
  if (ptd.parks.length) { d.heading("Parked loads"); for (const p of ptd.parks) d.para(`Parked ${when(p.parkedAt, tz)}${p.where ? ` at ${p.where}` : ""}${p.resumedAt ? `, resumed ${when(p.resumedAt, tz)}` : ""}${p.note ? `. ${p.note}` : ""}`); }

  const t = ptd.time;
  d.heading("Time");
  d.kv("Travel to first rack:", fmtMinutes(t.travelToRack));
  d.kv("Trying to load:", fmtMinutes(t.loadingSpan));
  d.kv("Travel to delivery:", fmtMinutes(t.travelToDelivery));
  d.kv("At deliveries:", fmtMinutes(t.atDeliveries));
  d.kv("Total trip:", fmtMinutes(t.total));
  void safe;
}
