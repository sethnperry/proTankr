// lib/dispatch/driverDay.ts
//
// A driver's "day" for the Plan board: the trips worked together, whichever
// calendar dates they span. A day starts before midnight and ends after it,
// so it is a run of trips with no long rest between them, not a date.
// A gap of REST_GAP_H or more between one trip's end and the next one's start
// ends the day (the 10 hour reset).
export const REST_GAP_H = 10;
const DEFAULT_LEN_MS = 4 * 3600000;

export type DayItem = {
  id: string;
  /** complete and cancelled are history; live ones are in progress; dispatched has not begun. */
  kind: "done" | "live" | "planned";
  startMs: number;
  endMs: number | null;
};

export type DriverDayResult<T extends DayItem> = { items: T[]; startMs: number; endMs: number } | null;

const endOf = (t: DayItem, nowMs: number) =>
  t.endMs ?? (t.kind === "live" ? Math.max(nowMs, t.startMs) + 1 : t.startMs + DEFAULT_LEN_MS);

export function driverDay<T extends DayItem>(all: T[], nowMs: number): DriverDayResult<T> {
  if (all.length === 0) return null;
  const sorted = [...all].sort((a, b) => a.startMs - b.startMs);
  const clusters: T[][] = [];
  let lastEnd = -Infinity;
  for (const t of sorted) {
    if (!clusters.length || t.startMs - lastEnd >= REST_GAP_H * 3600000) clusters.push([]);
    clusters[clusters.length - 1].push(t);
    lastEnd = Math.max(lastEnd, endOf(t, nowMs));
  }
  const span = (c: T[]) => ({ s: c[0].startMs, e: Math.max(...c.map((t) => endOf(t, nowMs))) });
  const pick =
    clusters.find((c) => c.some((t) => t.kind === "live")) ??
    clusters.find((c) => { const { s, e } = span(c); return s <= nowMs && nowMs <= e; }) ??
    clusters.find((c) => span(c).e >= nowMs) ??
    clusters[clusters.length - 1];
  const { s, e } = span(pick);
  return { items: pick, startMs: s, endMs: e };
}

export type DayLabel = "Yesterday" | "Today" | "Tomorrow";
export type LabeledDay<T extends DayItem> = {
  label: DayLabel; items: T[]; startMs: number; endMs: number;
  /** Set on a finished day whose rest is still running: when the driver is reset. */
  resetAtMs: number | null;
};

/** Every day around now, labeled. Only Yesterday, Today and Tomorrow are returned. */
export function driverDays<T extends DayItem>(all: T[], nowMs: number): LabeledDay<T>[] {
  if (all.length === 0) return [];
  const sorted = [...all].sort((a, b) => a.startMs - b.startMs);
  const clusters: T[][] = [];
  let lastEnd = -Infinity;
  for (const t of sorted) {
    if (!clusters.length || t.startMs - lastEnd >= REST_GAP_H * 3600000) clusters.push([]);
    clusters[clusters.length - 1].push(t);
    lastEnd = Math.max(lastEnd, endOf(t, nowMs));
  }
  const span = clusters.map((c) => ({ s: c[0].startMs, e: Math.max(...c.map((t) => endOf(t, nowMs))) }));
  const allDone = (c: T[]) => c.every((t) => t.kind === "done");
  const sameDate = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();
  let today = clusters.findIndex((c) => c.some((t) => t.kind === "live"));
  if (today < 0) today = clusters.findIndex((c, i) => !allDone(c) && span[i].s <= nowMs);
  if (today < 0) today = clusters.findIndex((c, i) => allDone(c) && span[i].e <= nowMs && span[i].e + REST_GAP_H * 3600000 > nowMs);
  let yesterday = -1, tomorrow = -1;
  if (today >= 0) { yesterday = today - 1; tomorrow = today + 1; }
  else {
    for (let i = 0; i < clusters.length; i++) if (span[i].e <= nowMs) yesterday = i;
    const next = clusters.findIndex((_, i) => span[i].s > nowMs);
    if (next >= 0) { if (sameDate(span[next].s, nowMs)) today = next; else tomorrow = next; }
    if (today >= 0) tomorrow = today + 1;
  }
  const out: LabeledDay<T>[] = [];
  const add = (i: number, label: DayLabel) => {
    if (i < 0 || i >= clusters.length) return;
    const complete = allDone(clusters[i]) && span[i].e <= nowMs;
    out.push({ label, items: clusters[i], startMs: span[i].s, endMs: span[i].e, resetAtMs: label === "Today" && complete ? span[i].e + REST_GAP_H * 3600000 : null });
  };
  add(yesterday, "Yesterday"); add(today, "Today"); add(tomorrow, "Tomorrow");
  return out;
}
