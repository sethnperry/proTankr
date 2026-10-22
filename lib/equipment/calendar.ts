// lib/equipment/calendar.ts
//
// Pure date helpers for the expiration-date picker. Dates are local "YYYY-MM-DD" strings.

export const pad2 = (n: number) => String(n).padStart(2, "0");
export const toIso = (y: number, m0: number, d: number) => `${y}-${pad2(m0 + 1)}-${pad2(d)}`;

export function isoFromDate(d: Date): string {
  return toIso(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Adds whole months, clamping the day (Jan 31 + 1 month = Feb 28/29). */
export function addMonthsIso(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12), nm = total % 12;
  const last = new Date(ny, nm + 1, 0).getDate();
  return toIso(ny, nm, Math.min(d, last));
}

export type Cell = { iso: string; day: number; inMonth: boolean };

/** Six-row, Sunday-first month grid so the picker never changes height. */
export function monthGrid(year: number, month0: number): Cell[][] {
  const first = new Date(year, month0, 1);
  const start = new Date(year, month0, 1 - first.getDay());
  const weeks: Cell[][] = [];
  for (let w = 0; w < 6; w++) {
    const row: Cell[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + i);
      row.push({ iso: isoFromDate(d), day: d.getDate(), inMonth: d.getMonth() === month0 });
    }
    weeks.push(row);
  }
  return weeks;
}

export function formatLong(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}
