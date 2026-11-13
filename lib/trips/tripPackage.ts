// lib/trips/tripPackage.ts
//
// The trip package: one PDF with a cover (a line-by-line list of everything collected on the trip, so a blurry
// photo can still be read), then the PTD, then the BOL and anything else captured (fuel and maintenance receipts,
// tickets), several small receipts to a page as backup. Pure given its inputs (the images arrive as bytes).

import { PdfDoc, M, W, H, MUTE, LINE, AMBER } from "../pdf/doc.ts";
import { drawPtd } from "./ptdPdf.ts";
import type { buildPtd } from "./ptd.ts";

export type PackageItem = {
  /** "Fuel receipt", "BOL", "Maintenance", "Scale ticket", ... */
  kind: string;
  at: string | null;
  /** One short line a person can read without opening the image. */
  line: string;
  /** Extra read-outs (OCR, amounts). */
  detail?: string[];
  images: { name: string; bytes: Uint8Array | null; note?: string }[];
  /** Big pages for documents (BOLs), or small tiles for receipts. */
  layout: "page" | "tile";
};

export type PackageInput = {
  ptd: ReturnType<typeof buildPtd>;
  driverName: string | null;
  truckName: string | null;
  trailerName: string | null;
  items: PackageItem[];
  tz?: string;
  generatedAt: Date;
};

export async function renderTripPackage(inp: PackageInput): Promise<Uint8Array> {
  const tz = inp.tz ?? "America/New_York";
  const d = await PdfDoc.create();
  const stamp = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-US", { timeZone: tz, month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");

  // 1. Cover.
  d.title("Trip package", `Order ${inp.ptd.orderNumbers.join(", ") || "-"}`);
  d.kv("Driver:", inp.driverName ?? "-");
  d.kv("Equipment:", `Truck ${inp.truckName ?? "-"}  Trailer ${inp.trailerName ?? "-"}`);
  d.kv("Trip:", `${stamp(inp.ptd.startedAt)} to ${stamp(inp.ptd.completedAt)}`);
  d.kv("Sent:", stamp(inp.generatedAt.toISOString()));
  d.heading("What is in this package");
  d.para("1. Product Transfer Document (PTD)", 10);
  inp.items.forEach((it, i) => d.para(`${i + 2}. ${it.kind}${it.at ? `  ${stamp(it.at)}` : ""}`, 10));
  d.heading("What was collected, line by line");
  d.para("Read from the trip's own records, so a blurry photo can still be checked.", 8.5, d.ital, MUTE);
  if (!inp.items.length) d.para("Nothing besides the PTD was collected on this trip.", 9.5, d.reg, MUTE);
  for (const it of inp.items) {
    d.kv(`${it.kind}${it.at ? ` ${stamp(it.at)}` : ""}:`, it.line);
    for (const x of it.detail ?? []) d.para(x, 8.5, d.reg, MUTE, 14);
    const missing = it.images.filter((im) => !im.bytes);
    for (const im of missing) d.para(`${im.name}: ${im.note ?? "image could not be added"}`, 8.5, d.ital, AMBER, 14);
  }

  // 2. The PTD.
  d.newPage();
  drawPtd(d, inp.ptd, { truckName: inp.truckName, trailerName: inp.trailerName, driverName: inp.driverName, tz });

  // 3. Documents (BOLs) one to a page; receipts and tickets as tiles, up to four to a page.
  const draw = async (bytes: Uint8Array, x: number, y: number, w: number, h: number) => {
    const img = await d.embed(bytes);
    if (!img) return false;
    const s = Math.min(w / img.width, h / img.height);
    d.page.drawImage(img, { x: x + (w - img.width * s) / 2, y: y + (h - img.height * s) / 2, width: img.width * s, height: img.height * s });
    return true;
  };
  for (const it of inp.items.filter((x) => x.layout === "page")) {
    for (const im of it.images) {
      if (!im.bytes) continue;
      d.newPage();
      d.title(it.kind, stamp(it.at));
      d.para(it.line, 9.5);
      await draw(im.bytes, M, M + 10, W - 2 * M, d.y - M - 18);
    }
  }
  const tiles = inp.items.filter((x) => x.layout === "tile").flatMap((it) => it.images.filter((im) => im.bytes).map((im) => ({ it, im })));
  const cellW = (W - 2 * M - 12) / 2, cellH = (H - 2 * M - 40 - 12) / 2;
  for (let i = 0; i < tiles.length; i += 4) {
    d.newPage();
    d.title("Receipts and tickets");
    const top = d.y - 6;
    for (let k = 0; k < 4 && i + k < tiles.length; k++) {
      const { it, im } = tiles[i + k];
      const col = k % 2, row = Math.floor(k / 2);
      const x = M + col * (cellW + 12), y = top - (row + 1) * cellH - row * 12;
      d.page.drawRectangle({ x, y, width: cellW, height: cellH, borderColor: LINE, borderWidth: 0.6 });
      d.page.drawText(`${it.kind}${it.at ? "  " + stamp(it.at) : ""}`.slice(0, 60), { x: x + 4, y: y + cellH - 11, size: 7.5, font: d.bold });
      await draw(im.bytes!, x + 3, y + 3, cellW - 6, cellH - 18);
    }
  }
  d.footer("ProTankr trip package");
  return d.save();
}
