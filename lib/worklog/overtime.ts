// lib/worklog/overtime.ts
//
// Regular, overtime and double-time hours from hours worked per day, under a chosen rule. An estimate
// for the driver's own records: a company may be exempt from overtime (motor carrier exemption) or
// use its own policy, so this never says what anyone is owed. Pure.

export type OtRule = "federal" | "california" | "daily8" | "colorado";
export const OT_RULES: { id: OtRule; label: string; note: string }[] = [
  { id: "federal", label: "Federal: over 40 hours a week", note: "Most states, including Florida and Texas." },
  { id: "daily8", label: "Daily 8 + weekly 40", note: "Alaska, Nevada and similar." },
  { id: "colorado", label: "Daily 12 + weekly 40", note: "Colorado." },
  { id: "california", label: "California: daily 8/12, 7th day, weekly 40", note: "Overtime after 8, double time after 12." },
];
export const isOtRule = (v: unknown): v is OtRule => OT_RULES.some((r) => r.id === v);

export type OtResult = { regular: number; overtime: number; double: number };

const DAILY: Record<OtRule, { ot: number; dt: number }> = {
  federal: { ot: Infinity, dt: Infinity },
  daily8: { ot: 8, dt: Infinity },
  colorado: { ot: 12, dt: Infinity },
  california: { ot: 8, dt: 12 },
};

const dayNumber = (iso: string) => Math.floor(Date.parse(`${iso}T12:00:00Z`) / 86400000);

/** `days` in any order; weeks are 7-day blocks counted from `weekAnchor`. */
export function computeOvertime(days: { date: string; hours: number }[], rule: OtRule, weekAnchor: string): OtResult {
  const weeks = new Map<number, { date: string; hours: number }[]>();
  for (const d of days) {
    const k = Math.floor((dayNumber(d.date) - dayNumber(weekAnchor)) / 7);
    weeks.set(k, [...(weeks.get(k) ?? []), d]);
  }
  const out: OtResult = { regular: 0, overtime: 0, double: 0 };
  const th = DAILY[rule];
  for (const list of weeks.values()) {
    list.sort((a, b) => (a.date < b.date ? -1 : 1));
    const seventh = rule === "california" && list.length === 7 && list.every((d) => d.hours > 0);
    let regAcc = 0;
    list.forEach((d, i) => {
      let reg: number, ot: number, dbl: number;
      if (seventh && i === 6) { reg = 0; ot = Math.min(d.hours, 8); dbl = Math.max(d.hours - 8, 0); }
      else {
        dbl = Math.max(d.hours - th.dt, 0);
        ot = Math.max(Math.min(d.hours, th.dt) - th.ot, 0);
        reg = d.hours - ot - dbl;
        const room = Math.max(40 - regAcc, 0);
        const toOt = Math.max(reg - room, 0);
        reg -= toOt; ot += toOt; regAcc += reg;
      }
      out.regular += reg; out.overtime += ot; out.double += dbl;
    });
  }
  return out;
}
