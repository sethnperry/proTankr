// lib/pdf/doc.ts
//
// A small Letter-page writer on pdf-lib: text that wraps, rules, key/value lines and simple tables, with page
// breaks handled. Used by the PTD, the trip package cover and the End of Day report. Standard fonts only, so text
// is cleaned to what they can draw. No browser, so it runs on the server.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";

export const W = 612, H = 792, M = 43;
export const INK = rgb(0.07, 0.07, 0.07), MUTE = rgb(0.38, 0.38, 0.38), LINE = rgb(0.8, 0.8, 0.8), BAR = rgb(0.93, 0.93, 0.93), RED = rgb(0.75, 0.1, 0.1), AMBER = rgb(0.7, 0.45, 0);
export const safe = (s: unknown) => String(s ?? "").replace(/→/g, "->").replace(/[^\x20-\x7E -ÿ–—…•‘’“”]/g, "?");

export class PdfDoc {
  pdf!: PDFDocument;
  reg!: PDFFont; bold!: PDFFont; ital!: PDFFont;
  page!: PDFPage;
  y = H - M;
  static async create(): Promise<PdfDoc> {
    const d = new PdfDoc();
    d.pdf = await PDFDocument.create();
    d.reg = await d.pdf.embedFont(StandardFonts.Helvetica);
    d.bold = await d.pdf.embedFont(StandardFonts.HelveticaBold);
    d.ital = await d.pdf.embedFont(StandardFonts.HelveticaOblique);
    d.newPage();
    return d;
  }
  newPage() { this.page = this.pdf.addPage([W, H]); this.y = H - M; }
  /** Starts a new page when fewer than `h` points are left. */
  need(h: number) { if (this.y - h < M + 18) this.newPage(); }
  text(t: string, x: number, size: number, f: PDFFont = this.reg, color = INK, right = false) {
    const s = safe(t);
    this.page.drawText(s, { x: right ? x - f.widthOfTextAtSize(s, size) : x, y: this.y, size, font: f, color });
  }
  wrap(t: string, f: PDFFont, size: number, maxW: number): string[] {
    const out: string[] = []; let cur = "";
    for (const word of safe(t).split(/\s+/).filter(Boolean)) {
      const next = cur ? `${cur} ${word}` : word;
      if (cur && f.widthOfTextAtSize(next, size) > maxW) { out.push(cur); cur = word; } else cur = next;
    }
    if (cur) out.push(cur);
    return out.length ? out : [""];
  }
  rule(th = 0.7, color = LINE) { this.page.drawLine({ start: { x: M, y: this.y }, end: { x: W - M, y: this.y }, thickness: th, color }); }
  gap(n: number) { this.y -= n; }
  title(t: string, right?: string) {
    this.text(t.toUpperCase(), M, 17, this.bold);
    if (right) this.text(right, W - M, 10, this.reg, MUTE, true);
    this.y -= 14; this.rule(2, INK); this.y -= 6;
  }
  heading(t: string) { this.need(40); this.y -= 20; this.text(t.toUpperCase(), M, 9.5, this.bold); this.y -= 5; this.rule(1.2, INK); this.y -= 3; }
  /** A wrapped paragraph. */
  para(t: string, size = 9.5, f: PDFFont = this.reg, color = INK, indent = 0) {
    for (const ln of this.wrap(t, f, size, W - 2 * M - indent)) { this.need(size + 4); this.y -= size + 2.5; this.text(ln, M + indent, size, f, color); }
  }
  /** "Label: value" on one line, value wrapping under itself. */
  kv(k: string, v: string, size = 9.5) {
    const kw = this.bold.widthOfTextAtSize(safe(k), size) + 4;
    const lines = this.wrap(v, this.reg, size, W - 2 * M - kw);
    lines.forEach((ln, i) => { this.need(size + 4); this.y -= size + 2.5; if (i === 0) this.text(k, M, size, this.bold); this.text(ln, M + kw, size, this.reg); });
  }
  /** A table: widths are fractions of the page width; `align` is "l" or "r" per column. */
  table(head: string[], rows: string[][], widths: number[], align: ("l" | "r")[] = [], o: { size?: number; muteRows?: Set<number> } = {}) {
    const size = o.size ?? 8.5, inner = W - 2 * M;
    const xs: number[] = []; let acc = 0;
    widths.forEach((w) => { xs.push(M + acc * inner); acc += w; });
    const wd = widths.map((w) => w * inner - 6);
    const right = (i: number) => (align[i] ?? "l") === "r";
    const put = (c: string, i: number, f: PDFFont, sz: number, color = INK) => this.text(c, right(i) ? xs[i] + wd[i] + 3 : xs[i] + 2, sz, f, color, right(i));
    const header = () => { this.need(24); this.y -= 12; head.forEach((h, i) => put(h.toUpperCase(), i, this.bold, 6.5, MUTE)); this.y -= 4; this.rule(1, INK); };
    header();
    rows.forEach((r, ri) => {
      const cells = r.map((c, i) => this.wrap(c, this.reg, size, wd[i]));
      const n = Math.max(...cells.map((l) => l.length));
      if (this.y - (n * (size + 2.5) + 6) < M + 18) { this.newPage(); header(); }
      const top = this.y;
      cells.forEach((ls, i) => ls.forEach((ln, k) => { this.y = top - (size + 2) - k * (size + 2.5); put(ln, i, this.reg, size, o.muteRows?.has(ri) ? MUTE : INK); }));
      this.y = top - n * (size + 2.5) - 1; this.y -= 3; this.rule(0.4, LINE);
    });
  }
  async embed(bytes: Uint8Array): Promise<PDFImage | null> {
    try {
      const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
      return isPng ? await this.pdf.embedPng(bytes) : await this.pdf.embedJpg(bytes);
    } catch { return null; }
  }
  /** Page numbers on every page, drawn last. */
  footer(label: string) {
    const pages = this.pdf.getPages();
    pages.forEach((p, i) => {
      const s = `${label}  -  Page ${i + 1} of ${pages.length}`;
      p.drawText(s, { x: W / 2 - this.reg.widthOfTextAtSize(s, 7.5) / 2, y: 22, size: 7.5, font: this.reg, color: MUTE });
    });
  }
  save(): Promise<Uint8Array> { return this.pdf.save(); }
}
