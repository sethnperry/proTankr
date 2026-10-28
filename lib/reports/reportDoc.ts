// lib/reports/reportDoc.ts
//
// A report described as data: a title, a few summary cells, and sections of tables or blocks. The
// same description becomes the emailed PDF for any report, so every report looks like the Work Log.

export type DocTable = { head: string[]; rows: string[][]; /** column widths as fractions (sum 1) */ widths: number[]; /** "r" right-aligns a column */ align?: ("l" | "r")[] };
export type DocBlock = { head: string; lines: string[] };
export type DocSection = { heading: string; table?: DocTable; blocks?: DocBlock[]; text?: string };

export type ReportDoc = {
  title: string;
  /** Left under the title (a name) and right (a date or range). */
  who?: string; when?: string;
  cells?: [string, string, string?][];
  sections: DocSection[];
  note?: string;
  /** Email subject, and the short sentence in the email body after "Attached is your ...". */
  subject: string;
  attached: string;
  /** Without the .pdf. */
  fileName: string;
};

export const MAX_DOC_CHARS = 250_000;
