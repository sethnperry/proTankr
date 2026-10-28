// lib/reports/pdfReport.ts
//
// Renders a ReportDoc as a Letter PDF in the same look as the Work Log (pdf-lib, no browser needed).

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { ReportDoc } from "./reportDoc.ts";

const W = 612, H = 792, M = 43;
const INK = rgb(0.07, 0.07, 0.07), MUTE = rgb(0.38, 0.38, 0.38), LINE = rgb(0.8, 0.8, 0.8), BAR = rgb(0.93, 0.93, 0.93), CELL = rgb(0.965, 0.965, 0.965);
const safe = (s: string) => String(s ?? "").replace(/[^\x20-\x7E -ÿ–—…•‘’“”]/g, "?");

export async function renderReportPdf(d: ReportDoc, o: { logo?: Uint8Array | null } = {}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ital = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const logo = o.logo ? await pdf.embedPng(o.logo).catch(() => null) : null;

  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - M;
  const need = (h: number) => { if (y - h < M + 18) { page = pdf.addPage([W, H]); y = H - M; } };
  const text = (t: string, x: number, size: number, f: PDFFont = reg, color = INK, right = false) => {
    const s = safe(t);
    page.drawText(s, { x: right ? x - f.widthOfTextAtSize(s, size) : x, y, size, font: f, color });
  };
  const wrap = (t: string, f: PDFFont, size: number, maxW: number): string[] => {
    const out: string[] = []; let cur = "";
    for (const word of safe(t).split(/\s+/).filter(Boolean)) {
      const next = cur ? `${cur} ${word}` : word;
      if (cur && f.widthOfTextAtSize(next, size) > maxW) { out.push(cur); cur = word; } else cur = next;
    }
    if (cur) out.push(cur);
    return out.length ? out : [""];
  };
  const rule = (th = 0.7, color = LINE) => page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: th, color });

  text(d.title.toUpperCase(), M, 17, bold);
  if (logo) page.drawImage(logo, { x: W - M - 26, y: y - 8, width: 26, height: 26 });
  y -= 14; rule(2, INK); y -= 17;
  if (d.who) text(d.who, M, 12.5, bold);
  if (d.when) text(d.when, W - M, 11, reg, MUTE, true);
  y -= 6;

  if (d.cells?.length) {
    y -= 8;
    for (let i = 0; i < d.cells.length; i += 3) {
      const row = d.cells.slice(i, i + 3), cw = (W - 2 * M) / 3, ch = 40;
      need(ch + 4);
      row.forEach(([k, v, sub], j) => {
        const x = M + j * cw, keep = y;
        page.drawRectangle({ x: x + 1, y: y - ch - 2, width: cw - 2, height: ch, color: CELL });
        y = keep - 12; text(k.toUpperCase(), x + 7, 7, reg, MUTE);
        y = keep - 28; text(v, x + 7, 15, bold);
        if (sub) { y = keep - 37; text(sub, x + 7, 7, reg, MUTE); }
        y = keep;
      });
      y -= ch + 6;
    }
  }

  for (const s of d.sections) {
    need(40); y -= 22; text(s.heading.toUpperCase(), M, 9.5, bold); y -= 5; rule(1.4, INK); y -= 4;
    if (s.text) {
      for (const ln of wrap(s.text, reg, 9.5, W - 2 * M)) { need(14); y -= 13; text(ln, M, 9.5); }
      y -= 2;
    }
    if (s.table) {
      const t = s.table, inner = W - 2 * M;
      const xs: number[] = []; let acc = 0;
      t.widths.forEach((w) => { xs.push(M + acc * inner); acc += w; });
      const wd = t.widths.map((w) => w * inner - 8);
      const right = (i: number) => (t.align?.[i] ?? (i === 0 ? "l" : "r")) === "r";
      const put = (c: string, i: number, f: PDFFont, size: number, color = INK) => text(c, right(i) ? xs[i] + wd[i] + 4 : xs[i] + 3, size, f, color, right(i));
      need(26); y -= 14;
      t.head.forEach((h, i) => put(h.toUpperCase(), i, bold, 7));
      y -= 4; rule(1.2, INK);
      for (const r of t.rows) {
        const cellLines = r.map((c, i) => wrap(c, reg, 9.5, wd[i]));
        const n = Math.max(...cellLines.map((l) => l.length));
        need(n * 12 + 8);
        const top = y;
        cellLines.forEach((ls, i) => ls.forEach((ln, k) => { y = top - 13 - k * 12; put(ln, i, reg, 9.5); }));
        y = top - n * 12 - 1; y -= 4; rule(0.5, LINE);
      }
    }
    for (const b of s.blocks ?? []) {
      const heads = wrap(b.head, bold, 9, W - 2 * M - 12);
      need(heads.length * 12 + 24);
      y -= 5;
      const bh = heads.length * 12 + 4;
      page.drawRectangle({ x: M, y: y - bh + 2, width: W - 2 * M, height: bh, color: BAR });
      heads.forEach((ln) => { y -= 11; text(ln, M + 6, 9, bold); });
      y -= 6;
      for (const l of b.lines) {
        for (const ln of wrap(l, reg, 9, W - 2 * M - 12)) { need(13); y -= 11; text(ln, M + 6, 9); }
        y -= 2;
      }
      y -= 6;
    }
  }

  if (d.note) {
    const lines = wrap(d.note, reg, 7.5, W - 2 * M);
    need(lines.length * 10 + 24);
    y -= 16; rule(0.7, LINE); y -= 4;
    lines.forEach((ln) => { y -= 10; text(ln, M, 7.5, reg, MUTE); });
  }

  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    const label = `Page ${i + 1} of ${pages.length}`;
    p.drawText(label, { x: W / 2 - reg.widthOfTextAtSize(label, 7.5) / 2, y: 22, size: 7.5, font: reg, color: MUTE });
  });
  void ital;
  return pdf.save();
}
