// lib/reports/docs.ts
//
// ReportDoc builders for the reports a driver can email to themselves as a PDF: one load, the scale
// history, and the service / wash histories. Pure.

import type { ReportDoc } from "./reportDoc";
import type { DateRange } from "./dateRange";

const n0 = (v: number | null | undefined) => (v == null || !Number.isFinite(Number(v)) ? "–" : Math.round(Number(v)).toLocaleString());
const signed = (v: number) => `${v >= 0 ? "+" : ""}${Math.round(v).toLocaleString()}`;
const mdy = (iso: string) => { const d = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso); return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`; };
const stamp = (d = new Date()) => `${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}${String(d.getFullYear()).slice(2)}`;
const time = (iso: string) => { const d = new Date(iso); const h = d.getHours(); return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")}${h < 12 ? "a" : "p"}`; };
export function rangeLabel(r: DateRange): string { return r ? `${mdy(r.start)} to ${mdy(r.end)}` : "All time"; }

// ── One load ────────────────────────────────────────────────────────────────

type LoadRowLike = { started_at: string; city_name?: string | null; state_code?: string | null; terminal_name?: string; planned_total_gal: number | null; planned_gross_lbs: number | null; diff_lbs: number | null };
type LoadLineLike = { comp_number: number; product_name: string | null; button_code: string | null; planned_lbs: number | null; actual_lbs: number | null; actual_gallons?: number | null; planned_temp_f: number | null; actual_temp_f: number | null; planned_api: number | null; actual_api: number | null };

export function loadReportDoc(row: LoadRowLike, lines: LoadLineLike[] | undefined, driverName?: string): ReportDoc {
  const place = [row.city_name, row.state_code].filter(Boolean).join(", ");
  const ls = lines ?? [];
  const hasActual = ls.some((l) => l.actual_lbs != null);
  const totalPlanned = ls.reduce((s, l) => s + (l.planned_lbs ?? 0), 0);
  const totalActual = ls.reduce((s, l) => s + (l.actual_lbs ?? 0), 0);
  const diff = hasActual ? totalActual - totalPlanned : null;
  const tag = (d: number | null) => (d == null ? "" : d > 0 ? "over" : d === 0 ? "on weight" : "under");

  const sections: ReportDoc["sections"] = [];
  if (ls.length) {
    sections.push({
      heading: "Compartments",
      table: {
        head: ["Comp", "Product", "Planned lbs", "Planned temp / API", "Actual lbs", "Actual temp / API", "+/- lbs"],
        widths: [0.07, 0.19, 0.12, 0.17, 0.12, 0.19, 0.14], align: ["l", "l", "r", "r", "r", "r", "r"],
        rows: ls.map((l) => [
          `C${l.comp_number}`, l.button_code ? `${l.button_code}${l.product_name ? ` - ${l.product_name}` : ""}` : l.product_name ?? "–",
          n0(l.planned_lbs), `${l.planned_temp_f != null ? `${Math.round(l.planned_temp_f)}F` : "–"} / ${l.planned_api != null ? Number(l.planned_api).toFixed(1) : "–"}`,
          n0(l.actual_lbs), `${l.actual_temp_f != null ? `${Math.round(l.actual_temp_f)}F` : "–"} / ${l.actual_api != null ? Number(l.actual_api).toFixed(1) : "–"}`,
          l.actual_lbs != null && l.planned_lbs != null ? signed(l.actual_lbs - l.planned_lbs) : "–",
        ]),
      },
    });
    // How much to drain from the rear compartment to get back to 80,000 lbs gross.
    const LEGAL = 80000;
    if (hasActual && row.planned_gross_lbs != null && totalPlanned > 0) {
      const tare = Number(row.planned_gross_lbs) - totalPlanned;
      const gross = tare + totalActual;
      if (gross > LEGAL) {
        const rear = [...ls].filter((l) => l.actual_lbs != null && (l.actual_gallons ?? 0) > 0).sort((a, b) => b.comp_number - a.comp_number)[0];
        if (rear?.actual_gallons && rear.actual_lbs) {
          const gal = (gross - LEGAL) / (rear.actual_lbs / rear.actual_gallons);
          sections.push({ heading: "Correct to 80,000 lbs", text: `Drain about ${gal.toFixed(1)} gal from C${rear.comp_number} (${rear.button_code ?? rear.product_name ?? "product"}).` });
        }
      }
    }
  }
  const d = new Date(row.started_at);
  return {
    title: "Load Report",
    who: [driverName, row.terminal_name].filter(Boolean).join("  -  ") || undefined,
    when: `${mdy(row.started_at)} ${time(row.started_at)}${place ? `  -  ${place}` : ""}`,
    cells: [
      ["Planned gallons", n0(row.planned_total_gal)],
      ["Planned weight", hasActual || totalPlanned ? `${n0(totalPlanned)} lbs` : "–"],
      ["Actual weight", hasActual ? `${n0(totalActual)} lbs` : "–", diff == null ? undefined : `${signed(diff)} lbs ${tag(diff)}`],
    ],
    sections,
    note: "Planned figures come from the plan when the load began; actual figures are what was entered when it was logged.",
    subject: `ProTankr - Load Report ${mdy(row.started_at)}${row.terminal_name ? ` ${row.terminal_name}` : ""}`,
    attached: `load report for ${mdy(row.started_at)}${row.terminal_name ? ` at ${row.terminal_name}` : ""}`,
    fileName: `ProTankr-LoadReport-${stamp(d)}`,
  };
}

// ── Scale history ───────────────────────────────────────────────────────────

type ScaleRowLike = { recorded_at: string; heavy_weight_lbs: number; light_weight_lbs: number; net_weight_lbs: number; tare_updated: boolean; notes: string | null };

export function scaleHistoryDoc(rows: ScaleRowLike[], o: { equipment?: string; range: DateRange; who?: string }): ReportDoc {
  const sorted = [...rows].sort((a, b) => (a.recorded_at < b.recorded_at ? 1 : -1));
  const rl = rangeLabel(o.range);
  return {
    title: "Scale History", who: o.who ?? o.equipment, when: rl,
    cells: [["Records", String(rows.length)], ["Latest net", sorted[0] ? `${n0(sorted[0].net_weight_lbs)} lbs` : "–"], ["Equipment", o.equipment || "All equipment"]],
    sections: [{
      heading: "Weights",
      table: {
        head: ["Date", "Heavy lbs", "Light lbs", "Net lbs", "Notes"], widths: [0.16, 0.14, 0.14, 0.14, 0.42], align: ["l", "r", "r", "r", "l"],
        rows: sorted.map((r) => [mdy(r.recorded_at), n0(r.heavy_weight_lbs), n0(r.light_weight_lbs), n0(r.net_weight_lbs), [r.tare_updated ? "tare updated" : "", r.notes ?? ""].filter(Boolean).join(" - ")]),
      },
    }],
    subject: `ProTankr - Scale History (${rl})`, attached: `scale history report for ${rl}`, fileName: `ProTankr-ScaleHistory-${stamp()}`,
  };
}

// ── Service / wash history ──────────────────────────────────────────────────

type UnitLike = { label: string; name: string };
type ServiceRowLike = { date: string; unit: UnitLike; typeName: string; companion: UnitLike | null; shopName: string | null; location: string | null; notes: string | null };
type WashRowLike = { date: string; unit: UnitLike; location: string | null; notes: string | null };

export function recordHistoryDoc(kind: "service" | "wash", service: ServiceRowLike[], wash: WashRowLike[], o: { title: string; range: DateRange; who?: string }): ReportDoc {
  const rl = rangeLabel(o.range);
  const isService = kind === "service";
  const table = isService
    ? {
        head: ["Date", "Unit", "Service", "Shop / location", "Notes"], widths: [0.12, 0.17, 0.2, 0.22, 0.29], align: ["l", "l", "l", "l", "l"] as ("l" | "r")[],
        rows: [...service].sort((a, b) => (a.date < b.date ? 1 : -1)).map((r) => [
          mdy(r.date), `${r.unit.label} ${r.unit.name}`, r.companion ? `${r.typeName} (with ${r.companion.label} ${r.companion.name})` : r.typeName,
          [r.shopName, r.location].filter(Boolean).join(" - "), r.notes ?? "",
        ]),
      }
    : {
        head: ["Date", "Unit", "Location", "Notes"], widths: [0.14, 0.2, 0.3, 0.36], align: ["l", "l", "l", "l"] as ("l" | "r")[],
        rows: [...wash].sort((a, b) => (a.date < b.date ? 1 : -1)).map((r) => [mdy(r.date), `${r.unit.label} ${r.unit.name}`, r.location ?? "", r.notes ?? ""]),
      };
  const count = isService ? service.length : wash.length;
  return {
    title: o.title, who: o.who, when: rl,
    cells: [["Records", String(count)]],
    sections: [{ heading: isService ? "Services" : "Washes", table }],
    subject: `ProTankr - ${o.title} (${rl})`, attached: `${o.title.toLowerCase()} report for ${rl}`,
    fileName: `ProTankr-${o.title.replace(/[^A-Za-z0-9]+/g, "")}-${stamp()}`,
  };
}
