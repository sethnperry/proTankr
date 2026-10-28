// lib/worklog/pdfWorklog.ts
//
// The Work Log as a PDF (Letter, 0.6 in margins, page numbers). Built with pdf-lib so it runs in a
// serverless function without a browser. Plain black on white: it is printed and filed.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { OT_RULES } from "./overtime.ts";
import { shortDate, weekday } from "./time.ts";
import type { Worklog } from "./buildWorklog.ts";

const W = 612, H = 792, M = 43;
const INK = rgb(0.07, 0.07, 0.07), MUTE = rgb(0.38, 0.38, 0.38), LINE = rgb(0.8, 0.8, 0.8), BAR = rgb(0.93, 0.93, 0.93), CELL = rgb(0.965, 0.965, 0.965);

const num = (n: number) => Math.round(n).toLocaleString("en-US");
const hr = (n: number) => n.toFixed(1);
const money = (n: number) => `$${n.toFixed(2)}`;
const monthName = (m: string) => new Date(`${m}-01T12:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
const safe = (s: string) => s.replace(/[^\x20-\x7E -ÿ–—…•‘’“”]/g, "?");

export function worklogFileName(w: Pick<Worklog, "range" | "title">): string {
  return `ProTankr-${w.title.replace(/[^A-Za-z0-9]+/g, "")}-Worklog-${w.range.start}-to-${w.range.end}.pdf`;
}

export async function renderWorklogPdf(w: Worklog, o: { mode?: "full" | "condensed"; logo?: Uint8Array | null } = {}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ital = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const logo = o.logo ? await pdf.embedPng(o.logo).catch(() => null) : null;

  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - M;
  const newPage = () => { page = pdf.addPage([W, H]); y = H - M; };
  const need = (h: number) => { if (y - h < M + 18) newPage(); };
  const wid = (t: string, f: PDFFont, size: number) => f.widthOfTextAtSize(safe(t), size);
  const text = (t: string, x: number, size: number, f: PDFFont = reg, color = INK, right = false) => {
    const s = safe(t);
    page.drawText(s, { x: right ? x - f.widthOfTextAtSize(s, size) : x, y, size, font: f, color });
  };
  const wrap = (t: string, f: PDFFont, size: number, maxW: number): string[] => {
    const out: string[] = []; let cur = "";
    for (const word of safe(t).split(/\s+/)) {
      const next = cur ? `${cur} ${word}` : word;
      if (cur && f.widthOfTextAtSize(next, size) > maxW) { out.push(cur); cur = word; } else cur = next;
    }
    if (cur) out.push(cur);
    return out;
  };
  const rule = (th = 0.7, color = LINE, dash?: number[]) => page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: th, color, dashArray: dash });
  const h2 = (t: string) => { need(34); y -= 22; text(t.toUpperCase(), M, 9.5, bold); y -= 5; rule(1.4, INK); y -= 4; };

  // Header
  text(`${w.title} Work Log`.toUpperCase(), M, 17, bold);
  if (logo) page.drawImage(logo, { x: W - M - 26, y: y - 8, width: 26, height: 26 });
  y -= 14; rule(2, INK); y -= 17;
  text(w.driverName, M, 12.5, bold);
  text(`${shortDate(w.range.start)} to ${shortDate(w.range.end)}`, W - M, 11, reg, MUTE, true);
  y -= 6;

  // Summary cells
  const s = w.summary, m = s.miles;
  const cells = (items: [string, string, string?][]) => {
    const cw = (W - 2 * M) / items.length, ch = 40;
    need(ch + 4);
    items.forEach(([k, v, sub], i) => {
      const x = M + i * cw;
      page.drawRectangle({ x: x + 1, y: y - ch - 2, width: cw - 2, height: ch, color: CELL });
      const keep = y;
      y = keep - 12; text(k.toUpperCase(), x + 7, 7, reg, MUTE);
      y = keep - 28; text(v, x + 7, 15, bold);
      if (sub) { y = keep - 37; text(sub, x + 7, 7, reg, MUTE); }
      y = keep;
    });
    y -= ch + 6;
  };
  y -= 8;
  const hasDuty = s.nonRev != null;
  cells([
    ["Hours worked", hr(s.worked), hasDuty ? `trip ${hr(s.worked - (s.nonRev ?? 0))} + non-rev ${hr(s.nonRev ?? 0)}` : `${s.daysWorked} day${s.daysWorked === 1 ? "" : "s"} worked`],
    ["Regular hours", hr(s.regular)],
    ["Overtime hours", hr(s.overtime + s.double), s.double > 0 ? `incl. ${hr(s.double)} double time` : undefined],
  ]);
  cells([
    ["Non-rev hours", s.nonRev == null ? "–" : hr(s.nonRev), s.nonRev == null ? "needs electronic log" : "on duty, not on a trip"],
    ["Loads", String(s.loads)],
    ["Days worked", String(s.daysWorked)],
  ]);
  cells([["Gross gallons", num(s.gross)], ["Net gallons", num(s.net)], ["Paid by you", money(s.spend), "card or cash"]]);
  cells([["Loaded miles", m.loaded == null ? "–" : num(m.loaded), m.partial ? "tracked trips only" : undefined], ["Empty miles", m.empty == null ? "–" : num(m.empty)], ["Total miles", num(m.total)]]);
  const otLabel = OT_RULES.find((r) => r.id === s.otRule)?.label ?? "";
  y -= 3; text(`Regular and overtime are estimated from hours worked using: ${otLabel}.`, M, 7.5, ital, MUTE); y -= 4;

  // Tables
  const table = (head: string[], rows: string[][], xs: number[], rightFrom = 1) => {
    need(26);
    y -= 14;
    head.forEach((h, i) => text(h.toUpperCase(), i >= rightFrom ? xs[i] : xs[i], 7, bold, INK, i >= rightFrom));
    y -= 4; rule(1.2, INK);
    for (const r of rows) {
      need(18); y -= 13;
      r.forEach((c, i) => text(c, xs[i], 9.5, reg, INK, i >= rightFrom));
      y -= 4; rule(0.5, LINE);
    }
  };
  const right = W - M;

  h2("By product");
  if (s.byProduct.length) table(["Product", "Gross gal", "Net gal"], s.byProduct.map((p) => [`${p.name} (${p.code})`, num(p.gross), num(p.net)]), [M + 3, right - 90, right], 1);
  else { y -= 12; text("No loads in this period.", M, 9.5, reg, MUTE); y -= 2; }

  if ((o.mode ?? "full") === "condensed") {
    h2("By month");
    table(["Month", "Days", "Hours", "Loads", "Gross gal", "Net gal", "Miles"], w.months.map((x) => [monthName(x.month), String(x.days), hr(x.hours), String(x.loads), num(x.gross), num(x.net), num(x.miles)]),
      [M + 3, M + 190, M + 240, M + 290, M + 355, M + 420, right], 1);
  } else {
    h2("Work log");
    if (!w.days.length) { y -= 12; text("No work recorded in this period.", M, 9.5, reg, MUTE); y -= 2; }
    w.days.forEach((d, idx) => {
      const prev = w.days[idx - 1];
      if (prev && prev.midnightAfter && prev.date < d.date) {
        need(22); y -= 12; rule(1.2, MUTE, [4, 3]);
        const label = "MIDNIGHT", lw = wid(label, reg, 7);
        page.drawRectangle({ x: W / 2 - lw / 2 - 6, y: y - 3, width: lw + 12, height: 8, color: rgb(1, 1, 1) });
        text(label, W / 2 - lw / 2, 7, reg, MUTE); y -= 6;
      }
      const tail: string[] = [];
      if (d.from) tail.push(`${d.from} to ${d.to}`);
      tail.push(d.nonRev != null ? `${hr(d.worked)} Hr (trip ${hr(d.hours)} + non-rev ${hr(d.nonRev)})` : `${hr(d.hours)} Hr`);
      tail.push(`${num(d.miles)} Mi`);
      if (d.loads) tail.push(`${d.loads} load${d.loads === 1 ? "" : "s"}`, `${num(d.gross)} Ggal`, `${num(d.net)} Ngal`);
      const headLines = wrap(`${weekday(d.date)} ${shortDate(d.date)}   ${tail.join("  ·  ")}`, bold, 9, W - 2 * M - 12);
      need(headLines.length * 12 + 20);
      y -= 5;
      const bh = headLines.length * 12 + 4;
      page.drawRectangle({ x: M, y: y - bh + 2, width: W - 2 * M, height: bh, color: BAR });
      headLines.forEach((ln) => { y -= 11; text(ln, M + 6, 9, bold); });
      y -= 6;
      for (const r of d.rows) {
        const time = r.continued || r.continues ? ` (${r.timeFrom} to ${r.timeTo}${r.continues ? ", continues" : ""})` : "";
        const orderTxt = r.orders.length ? r.orders.join(", ") : "Trip";
        const lines = wrap(r.route, reg, 9, W - 2 * M - 12);
        need(lines.length * 11 + 36);
        y -= 11;
        text(orderTxt, M + 6, 9.5, r.continued ? ital : bold);
        const ox = M + 6 + wid(orderTxt, bold, 9.5);
        if (time) text(time, ox, 9, reg, MUTE);
        lines.forEach((ln) => { y -= 11; text(ln, M + 6, 9); });
        y -= 11;
        text(`${r.products}  ·  ${hr(r.hours)} Hr  ·  ${num(r.miles)} Mi${r.gross != null ? `  ·  ${num(r.gross)} Ggal  ·  ${num(r.net ?? 0)} Ngal` : ""}`, M + 6, 9, reg, MUTE);
        y -= 4; rule(0.5, LINE);
      }
      if (!d.rows.length) { y -= 11; text("On duty, no trip recorded", M + 6, 9, ital, MUTE); y -= 4; rule(0.5, LINE); }
    });
  }

  if (w.purchases.length) {
    h2("Purchases you paid for");
    table(["When", "Where", "Paid with", "Gal", "Amount"], [
      ...w.purchases.map((p) => [new Date(p.at).toLocaleDateString("en-US", { month: "numeric", day: "numeric", timeZone: w.tz }), `${p.store}${p.place ? ` - ${p.place}` : ""}`, p.kind === "cash" ? "Cash" : "My card", p.gallons != null ? num(p.gallons) : "-", p.amount != null ? money(p.amount) : "-"]),
      ["", "", "", "Total", money(s.spend)],
    ], [M + 3, M + 50, M + 330, right - 70, right], 3);
  }

  const note = "Hours worked are the time on trips (from Begin Trip to the last stop) plus non-revenue time: on duty in the electronic log before Begin Trip, between trips and after. Days split at midnight in your time zone. Loads and gallons count on the day the load was picked up. Gross and net gallons are as recorded in ProTankr. This is a record of your work, not a pay statement: compare it with your pay stub or settlement.";
  const noteLines = wrap(note, reg, 7.5, W - 2 * M);
  need(noteLines.length * 10 + 24);
  y -= 16; rule(0.7, LINE); y -= 4;
  noteLines.forEach((ln) => { y -= 10; text(ln, M, 7.5, reg, MUTE); });

  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    const label = `Page ${i + 1} of ${pages.length}`;
    p.drawText(label, { x: W / 2 - reg.widthOfTextAtSize(label, 7.5) / 2, y: 22, size: 7.5, font: reg, color: MUTE });
  });
  return pdf.save();
}
