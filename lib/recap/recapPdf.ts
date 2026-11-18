// lib/recap/recapPdf.ts
//
// The Weekly Recap as a PDF: one page per section, "Confidential - internal" in the footer.

import { PdfDoc } from "../pdf/doc.ts";
import type { Recap } from "./report.ts";
import { BUCKET_LABEL } from "./time.ts";

const h = (m: number) => `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, "0")}m`;
const sign = (n: number | null | undefined, unit = "") => (n == null ? "" : `${n > 0 ? "+" : ""}${Math.abs(n) >= 100 ? Math.round(n).toLocaleString("en-US") : n.toFixed(1)}${unit}`);

export function drawRecap(d: PdfDoc, r: Recap) {
  d.title("Weekly Recap", `${r.weekStart} to ${r.weekEnd}`);
  d.kv("Company:", r.companyName);
  d.kv("Standards:", r.standardsVersion);

  d.heading("1. Region summary");
  d.table(["", "This week", "Change"], r.tiles.map((t) => [`${t.label}${t.sub ? ` (${t.sub})` : ""}`, t.value, sign(t.change, t.label.includes("%") || t.label.includes("ATR") || t.label.includes("share") ? " pts" : "")]), [0.55, 0.25, 0.2], ["l", "r", "r"]);
  d.gap(6);
  d.para("Top causes of lost time:");
  d.table(["Cause", "Time lost"], r.topCauses.length ? r.topCauses.map((c) => [c.cause, h(c.lostMin)]) : [["None", ""]], [0.7, 0.3], ["l", "r"]);
  if (r.recognition.length) { d.gap(6); d.para(`Highest ATR with complete evidence: ${r.recognition.map((x) => `${x.name} ${x.atr.toFixed(1)}%`).join(", ")}`); }

  d.newPage();
  d.heading("2. Driver table");
  d.table(["Driver", "Shifts", "ATR", "vs avg", "Recovery", "Under", "Unclaimed", "Largest", "Review"],
    r.drivers.map((x) => [x.name + (x.estimate ? " *" : ""), String(x.shifts), x.insufficient ? "insufficient data" : x.atr == null ? "-" : `${x.atr.toFixed(1)}%`, sign(x.atrChange), x.recovery == null ? "-" : `${x.recovery.toFixed(1)}%`, String(x.loadsUnder), h(x.unclaimedMin), x.largestUnclaimed ?? "-", x.chips.join(", ")]),
    [0.2, 0.06, 0.12, 0.07, 0.1, 0.06, 0.1, 0.11, 0.18], ["l", "r", "r", "r", "r", "r", "r", "l", "l"], { size: 8 });
  d.para("* on-duty time is the app shift (no Geotab link): an estimate.", 8);

  d.newPage();
  d.heading("3. Delay ledger");
  d.table(["Cause", "Time lost"], r.ledger.causes.map((c) => [c.cause, h(c.lostMin)]), [0.7, 0.3], ["l", "r"]);
  d.gap(8);
  d.table(["Place", "Visits", "Time lost", "Avg excess", "Drivers", "vs prior"], r.ledger.places.map((p) => [p.label, String(p.visits), h(p.lostMin), `${p.avgExcess.toFixed(0)} min`, String(p.drivers), p.trend == null ? "" : sign(p.trend, " min")]), [0.34, 0.1, 0.16, 0.14, 0.12, 0.14], ["l", "r", "r", "r", "r", "r"]);
  d.gap(8);
  d.para("Time lost by hour of day (all weekdays):");
  const byHour = Array.from({ length: 24 }, (_, hr) => r.ledger.heat.reduce((n, row) => n + row[hr], 0));
  d.table(["Window", "Time lost"], [0, 1, 2, 3, 4].map((b) => { const hours = [[0, 6], [6, 9], [9, 15], [15, 19], [19, 24]][b]; return [BUCKET_LABEL[b], h(byHour.slice(hours[0], hours[1]).reduce((n, x) => n + x, 0))]; }), [0.7, 0.3], ["l", "r"]);

  d.newPage();
  d.heading("4. Driver patterns");
  d.table(["Driver", "Pattern", "Evidence", "Avg lost", "Suggested action"], r.patterns.length ? r.patterns.map((p) => [p.name, p.kind, p.evidence, `${p.avgMinLost.toFixed(0)} min`, p.action]) : [["No patterns this week", "", "", "", ""]], [0.18, 0.14, 0.26, 0.1, 0.32], ["l", "l", "l", "r", "l"], { size: 8.5 });
  d.para("A pattern shows only when it holds on enough shifts. These are for review, never discipline.", 8);

  d.newPage();
  d.heading("5. System lens");
  d.para("Rack hops by terminal");
  d.table(["Terminal", "Hops", "Why"], r.system.allocationHops.length ? r.system.allocationHops.map((x) => [x.label, x.value, x.detail ?? ""]) : [["None", "", ""]], [0.4, 0.15, 0.45], ["l", "r", "l"]);
  d.gap(6); d.para("Empty runs by lane");
  d.table(["Lane", "Time", "Runs"], r.system.deadhead.length ? r.system.deadhead.map((x) => [x.label, x.value, x.detail ?? ""]) : [["None", "", ""]], [0.5, 0.2, 0.3], ["l", "r", "l"]);
  d.gap(6); d.para("Time spent at terminals");
  d.table(["Terminal", "Share", "Visits"], r.system.terminals.length ? r.system.terminals.map((x) => [x.label, x.value, x.detail ?? ""]) : [["None", "", ""]], [0.4, 0.25, 0.35], ["l", "r", "l"]);
  for (const n of r.system.notes) d.para(n, 8);

  d.footer(`ProTankr Weekly Recap ${r.weekStart} - Confidential - internal - standards ${r.standardsVersion} - ${Math.round(r.completeness * 100)}% Geotab linked`);
}
