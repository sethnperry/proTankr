// lib/ifta/report.ts
//
// The IFTA working report for one quarter: miles and fuel gallons by state,
// fleet-wide and per truck, with fleet MPG (total miles / total gallons). Pure.
// A working figure from GPS + odometer and the company's fuel stops, not a
// certified filing: tax-paid gallons and Canadian provinces are outside it.

export type MilesRow = { truck_id: string; state: string; miles: number };
export type GallonsRow = { truck_id: string | null; state: string | null; gallons: number };
export type StateLine = { state: string; miles: number; gallons: number };
export type IftaReport = {
  states: StateLine[];                                  // fleet, by state (OUT last)
  trucks: { truckId: string; name: string; miles: number; gallons: number; states: StateLine[] }[];
  totalMiles: number;
  totalGallons: number;
  mpg: number | null;
  gallonsNoState: number;                               // fuel stops with no state recorded
};

export function quarterRange(year: number, q: 1 | 2 | 3 | 4): { from: string; to: string; label: string } {
  const m0 = (q - 1) * 3;
  const from = new Date(Date.UTC(year, m0, 1)).toISOString().slice(0, 10);
  const to = new Date(Date.UTC(year, m0 + 3, 0)).toISOString().slice(0, 10);
  return { from, to, label: `Q${q} ${year}` };
}

export function quarterOf(iso: string): { year: number; q: 1 | 2 | 3 | 4 } {
  const [y, m] = iso.split("-").map(Number);
  return { year: y, q: (Math.floor((m - 1) / 3) + 1) as 1 | 2 | 3 | 4 };
}

const bump = (m: Map<string, StateLine>, state: string, miles: number, gallons: number) => {
  const x = m.get(state) ?? { state, miles: 0, gallons: 0 };
  x.miles += miles; x.gallons += gallons;
  m.set(state, x);
};
const order = (a: StateLine, b: StateLine) => (a.state === "OUT" ? 1 : b.state === "OUT" ? -1 : a.state.localeCompare(b.state));

export function buildIftaReport(miles: MilesRow[], gallons: GallonsRow[], truckName: (id: string) => string): IftaReport {
  const fleet = new Map<string, StateLine>();
  const per = new Map<string, Map<string, StateLine>>();
  const add = (truckId: string, state: string, mi: number, gal: number) => {
    bump(fleet, state, mi, gal);
    const t = per.get(truckId) ?? new Map<string, StateLine>();
    bump(t, state, mi, gal);
    per.set(truckId, t);
  };
  for (const r of miles) if (r.state !== "NONE" && Number(r.miles) > 0) add(r.truck_id, r.state, Number(r.miles), 0);
  let gallonsNoState = 0;
  for (const g of gallons) {
    const gal = Number(g.gallons);
    if (!Number.isFinite(gal) || gal <= 0) continue;
    if (!g.state || !g.truck_id) { gallonsNoState += gal; continue; }
    add(g.truck_id, g.state.toUpperCase(), 0, gal);
  }
  const lines = (m: Map<string, StateLine>) => [...m.values()].sort(order).map((l) => ({ ...l, miles: Math.round(l.miles * 10) / 10, gallons: Math.round(l.gallons * 10) / 10 }));
  const states = lines(fleet);
  const sum = (ls: StateLine[], k: "miles" | "gallons") => ls.reduce((s, l) => s + l[k], 0);
  const totalMiles = sum(states, "miles"), totalGallons = sum(states, "gallons") + gallonsNoState;
  return {
    states,
    trucks: [...per.entries()].map(([truckId, m]) => {
      const ls = lines(m);
      return { truckId, name: truckName(truckId), miles: Math.round(sum(ls, "miles") * 10) / 10, gallons: Math.round(sum(ls, "gallons") * 10) / 10, states: ls };
    }).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    totalMiles: Math.round(totalMiles * 10) / 10,
    totalGallons: Math.round(totalGallons * 10) / 10,
    mpg: totalGallons > 0 && totalMiles > 0 ? Math.round((totalMiles / totalGallons) * 100) / 100 : null,
    gallonsNoState: Math.round(gallonsNoState * 10) / 10,
  };
}

/** CSV: one row per truck per state, then a fleet block. */
export function iftaCsv(r: IftaReport, label: string): string {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = [["Quarter", "Truck", "State", "Miles", "Gallons purchased"].map(q).join(",")];
  for (const t of r.trucks) for (const s of t.states) rows.push([q(label), q(t.name), q(s.state), s.miles, s.gallons].join(","));
  for (const s of r.states) rows.push([q(label), q("ALL TRUCKS"), q(s.state), s.miles, s.gallons].join(","));
  if (r.gallonsNoState) rows.push([q(label), q("ALL TRUCKS"), q("(no state recorded)"), 0, r.gallonsNoState].join(","));
  return rows.join("\n");
}

/** The state of a fuel purchase: the one recorded, else looked up from where the
 * stop was (lat/lon). Null when neither is known. */
export function purchaseState(p: { state: string | null; lat: number | null; lon: number | null }, stateOf: (lat: number, lon: number) => string | null): string | null {
  const s = p.state?.trim().toUpperCase();
  if (s) return s;
  if (p.lat != null && p.lon != null) return stateOf(Number(p.lat), Number(p.lon));
  return null;
}

/** IFTA members that file by jurisdiction: the lower 48, DC and the Canadian
 * provinces. Alaska, Hawaii, the Northwest Territories and Nunavut aren't
 * members, and OUT is outside the states and provinces, so none of them is reported. */
const NOT_IFTA = new Set(["AK", "HI", "NT", "NU", "OUT"]);

export type ReturnLine = { jurisdiction: string; totalMiles: number; taxableMiles: number; taxableGallons: number; taxPaidGallons: number; netTaxableGallons: number };
export type IftaReturn = { lines: ReturnLine[]; totalMiles: number; totalGallons: number; mpg: number | null; skippedMiles: number; skippedGallons: number; noStateGallons: number };

/** The return worksheet: per jurisdiction, total and taxable miles (no exempt
 * miles are tracked, so they are equal), fleet MPG, taxable gallons (taxable
 * miles / MPG), tax-paid gallons (what was bought there) and net taxable
 * gallons. Tax rates change every quarter and aren't included. Whole numbers. */
export function iftaReturn(r: IftaReport): IftaReturn {
  const kept = r.states.filter((s) => !NOT_IFTA.has(s.state));
  const skipped = r.states.filter((s) => NOT_IFTA.has(s.state));
  const miles = kept.reduce((s, l) => s + l.miles, 0);
  const gallons = kept.reduce((s, l) => s + l.gallons, 0);
  const mpg = miles > 0 && gallons > 0 ? miles / gallons : null;
  const lines = kept
    .filter((l) => l.miles > 0 || l.gallons > 0)
    .map((l) => {
      const totalMiles = Math.round(l.miles);
      const taxableGallons = mpg ? Math.round(l.miles / mpg) : 0;
      const taxPaidGallons = Math.round(l.gallons);
      return { jurisdiction: l.state, totalMiles, taxableMiles: totalMiles, taxableGallons, taxPaidGallons, netTaxableGallons: taxableGallons - taxPaidGallons };
    });
  return {
    lines,
    totalMiles: lines.reduce((s, l) => s + l.totalMiles, 0),
    totalGallons: Math.round(gallons),
    mpg: mpg != null ? Math.round(mpg * 100) / 100 : null,
    skippedMiles: Math.round(skipped.reduce((s, l) => s + l.miles, 0)),
    skippedGallons: Math.round(skipped.reduce((s, l) => s + l.gallons, 0)),
    noStateGallons: Math.round(r.gallonsNoState),
  };
}

/** CSV of the return worksheet, ready to key or import into a filing tool. */
export function iftaReturnCsv(r: IftaReport, label: string): string {
  const ret = iftaReturn(r);
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = [["Quarter", "Jurisdiction", "Total miles", "Taxable miles", "Fleet MPG", "Taxable gallons", "Tax-paid gallons", "Net taxable gallons"].map(q).join(",")];
  for (const l of ret.lines) rows.push([q(label), q(l.jurisdiction), l.totalMiles, l.taxableMiles, ret.mpg ?? "", l.taxableGallons, l.taxPaidGallons, l.netTaxableGallons].join(","));
  rows.push([q(label), q("TOTAL"), ret.totalMiles, ret.totalMiles, ret.mpg ?? "", ret.lines.reduce((s, l) => s + l.taxableGallons, 0), ret.lines.reduce((s, l) => s + l.taxPaidGallons, 0), ret.lines.reduce((s, l) => s + l.netTaxableGallons, 0)].join(","));
  return rows.join("\n");
}
