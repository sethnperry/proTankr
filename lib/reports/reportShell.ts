// lib/reports/reportShell.ts
//
// The report shell's rules: columns and filters described as data, applied to any list of records, then turned
// into a CSV file or a ReportDoc (the emailed PDF). A form's records become a filtered, exportable report by
// describing their columns here. Pure: no Supabase, no browser.

import type { ReportDoc } from "./reportDoc.ts";

export type ShellColumn<T> = {
  key: string;
  label: string;
  /** The text shown (and exported). */
  get: (row: T) => string | number | null | undefined;
  align?: "l" | "r";
  /** A fraction of the width for the PDF (the columns' widths are scaled to sum 1). Default 1. */
  weight?: number;
};

export type ShellFilter<T> = {
  id: string;
  label: string;
  /** The value of a row for this filter (an empty string = no value). */
  of: (row: T) => string;
  /** How a value reads in the list. Defaults to the value itself. */
  show?: (value: string) => string;
};

export type FilterPick = Record<string, string>; // filter id -> chosen value ("" = all)

export function filterOptions<T>(rows: T[], f: ShellFilter<T>): { value: string; label: string }[] {
  const seen = new Set<string>();
  for (const r of rows) { const v = f.of(r); if (v) seen.add(v); }
  return [...seen].sort((a, b) => a.localeCompare(b)).map((v) => ({ value: v, label: f.show ? f.show(v) : v }));
}

export function applyFilters<T>(rows: T[], filters: ShellFilter<T>[], pick: FilterPick): T[] {
  return rows.filter((r) => filters.every((f) => !pick[f.id] || f.of(r) === pick[f.id]));
}

const cell = <T,>(c: ShellColumn<T>, r: T) => {
  const v = c.get(r);
  return v == null ? "" : String(v);
};

export function csvEscape(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function toCsv<T>(columns: ShellColumn<T>[], rows: T[]): string {
  const lines = [columns.map((c) => csvEscape(c.label)).join(",")];
  for (const r of rows) lines.push(columns.map((c) => csvEscape(cell(c, r))).join(","));
  return lines.join("\r\n");
}

/** A column's total, for a summary cell (rows that aren't numbers count as 0). */
export function sumColumn<T>(column: ShellColumn<T>, rows: T[]): number {
  return rows.reduce((t, r) => t + (Number(column.get(r)) || 0), 0);
}

export function toReportDoc<T>(o: {
  title: string; subject?: string; fileName: string; who?: string; when?: string;
  columns: ShellColumn<T>[]; rows: T[]; cells?: [string, string, string?][];
}): ReportDoc {
  const total = o.columns.reduce((t, c) => t + (c.weight ?? 1), 0) || 1;
  return {
    title: o.title,
    who: o.who, when: o.when,
    cells: o.cells,
    sections: [{
      heading: o.title,
      table: {
        head: o.columns.map((c) => c.label),
        rows: o.rows.map((r) => o.columns.map((c) => cell(c, r))),
        widths: o.columns.map((c) => (c.weight ?? 1) / total),
        align: o.columns.map((c) => c.align ?? "l"),
      },
    }],
    subject: o.subject ?? o.title,
    attached: `${o.title.toLowerCase()} report`,
    fileName: o.fileName,
  };
}
