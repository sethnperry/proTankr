// lib/recap/report.ts
//
// Assembles the five pages of the Weekly Recap from scored shifts: region summary, driver table, delay ledger,
// driver patterns and the system lens. Pure.

import type { RecapDriver, RecapSettings, RecapTrip, Scored, ShiftScore } from "./types.ts";
import { BUCKET_LABEL, bucketOf, median } from "./time.ts";

export type DriverRecovery = { pct: number | null; loads: number; under: number; flagged: number };

export type PriorRecap = {
  atrMedian: number | null; recoveryPct: number | null; loadedShare: number | null; loads: number; gallons: number;
  placeLost: Record<string, number>;
  /** Each driver's ATR in recent earlier weeks, newest first. */
  driverAtr: Record<string, number[]>;
};

export type RecapInput = {
  companyName: string;
  weekStart: string;           // Monday, YYYY-MM-DD
  weekEnd: string;             // Sunday
  tz: string;
  standardsVersion: string;
  settings: RecapSettings;
  drivers: RecapDriver[];
  scores: ShiftScore[];
  trips: RecapTrip[];
  recovery: Record<string, DriverRecovery>;
  regionRecovery: { pct: number | null; loads: number };
  prior: PriorRecap | null;
  generatedAt: string;
};

export type Tile = { label: string; value: string; sub?: string | null; change?: number | null; unit?: string };
export type DriverRow = {
  userId: string; name: string; region: string | null; shifts: number; onDutyMin: number;
  atr: number | null; atrChange: number | null; recovery: number | null; loadsUnder: number;
  unclaimedMin: number; largestUnclaimed: string | null; chips: string[]; insufficient: boolean; estimate: boolean;
};
export type LedgerCause = { cause: string; lostMin: number };
export type LedgerPlace = { key: string; label: string; visits: number; lostMin: number; avgExcess: number; drivers: number; trend: number | null };
export type Pattern = { userId: string; name: string; kind: "Time of day" | "Place" | "Tap habits" | "Delay reporting"; evidence: string; avgMinLost: number; action: string };
export type SystemRow = { label: string; value: string; detail?: string | null };

export type Recap = {
  companyName: string; weekStart: string; weekEnd: string; standardsVersion: string; generatedAt: string; tz: string;
  tiles: Tile[];
  topCauses: LedgerCause[];
  drivers: DriverRow[];
  recognition: { name: string; atr: number }[];
  ledger: { causes: LedgerCause[]; places: LedgerPlace[]; heat: number[][] };
  patterns: Pattern[];
  system: { allocationHops: SystemRow[]; deadhead: SystemRow[]; terminals: SystemRow[]; notes: string[] };
  completeness: number;
};

const pct = (x: number) => Math.round(x * 1000) / 10;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const lost = (s: Scored) => (s.type === "gray" ? s.unaccounted : s.type === "fuel" ? 0 : s.excessMin);
const causeOf = (s: Scored) => s.cause ?? (s.type === "gray" ? "Unexplained gap" : "Unexplained");

export function buildRecap(i: RecapInput): Recap {
  const names = new Map(i.drivers.map((d) => [d.userId, d]));
  const byUser = new Map<string, ShiftScore[]>();
  for (const s of i.scores) { const a = byUser.get(s.userId) ?? []; a.push(s); byUser.set(s.userId, a); }
  const all = i.scores.flatMap((s) => s.segments);

  // ── driver table ───────────────────────────────────────────────────────────
  const patterns = detectPatterns(i, byUser, names);
  const rows: DriverRow[] = [...byUser.entries()].map(([userId, sh]): DriverRow => {
    const onDuty = sum(sh.map((s) => s.onDutyMin));
    const credit = sum(sh.map((s) => s.creditMin));
    const atr = onDuty > 0 ? credit / onDuty : null;
    const prior = i.prior?.driverAtr[userId] ?? [];
    const avg = prior.length ? sum(prior.slice(0, 4)) / Math.min(4, prior.length) : null;
    const segs = sh.flatMap((s) => s.segments);
    const byType = new Map<string, number>();
    for (const g of segs) if (g.unaccounted > 0) byType.set(g.type, (byType.get(g.type) ?? 0) + g.unaccounted);
    const top = [...byType.entries()].sort((a, b) => b[1] - a[1])[0];
    const rec = i.recovery[userId];
    return {
      userId, name: names.get(userId)?.name ?? "Driver", region: names.get(userId)?.region ?? null,
      shifts: sh.length, onDutyMin: onDuty, atr: atr == null ? null : pct(atr), atrChange: atr != null && avg != null ? pct(atr) - pct(avg) : null,
      recovery: rec?.pct != null ? pct(rec.pct) : null, loadsUnder: rec?.under ?? 0,
      unclaimedMin: sum(segs.map((g) => g.unaccounted)), largestUnclaimed: top ? TYPE_LABEL[top[0]] ?? top[0] : null,
      chips: ([...new Set(patterns.filter((p) => p.userId === userId).map((p) => p.kind))] as string[]).concat(rec?.flagged ? [`${rec.flagged} load${rec.flagged === 1 ? "" : "s"} flagged`] : []),
      insufficient: sh.length < 3, estimate: sh.some((s) => s.estimate),
    };
  }).sort((a, b) => (a.insufficient === b.insufficient ? (a.atr ?? 999) - (b.atr ?? 999) : a.insufficient ? 1 : -1));

  // ── delay ledger ───────────────────────────────────────────────────────────
  const causeMap = new Map<string, number>();
  const placeMap = new Map<string, { label: string; visits: number; lost: number; users: Set<string> }>();
  const heat: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const g of all) {
    const l = lost(g);
    if (l > 0) {
      causeMap.set(causeOf(g), (causeMap.get(causeOf(g)) ?? 0) + l);
      heat[g.dow][g.hour] += l;
    }
    if ((g.type === "rack" || g.type === "drop") && g.key) {
      const p = placeMap.get(g.key) ?? { label: g.label, visits: 0, lost: 0, users: new Set<string>() };
      p.visits += 1; p.lost += l; if (l > 0) p.users.add(g.userId); placeMap.set(g.key, p);
    }
  }
  const causes = [...causeMap.entries()].map(([cause, lostMin]) => ({ cause, lostMin })).sort((a, b) => b.lostMin - a.lostMin);
  const places: LedgerPlace[] = [...placeMap.entries()].filter(([, p]) => p.lost > 0).map(([key, p]) => ({
    key, label: p.label, visits: p.visits, lostMin: p.lost, avgExcess: p.lost / p.visits, drivers: p.users.size,
    trend: i.prior && key in i.prior.placeLost ? p.lost - i.prior.placeLost[key] : null,
  })).sort((a, b) => b.lostMin - a.lostMin).slice(0, 10);

  // ── region summary ─────────────────────────────────────────────────────────
  const scored = rows.filter((r) => !r.insufficient && r.atr != null);
  const atrMed = median(scored.map((r) => r.atr as number));
  const onDutyAll = sum(i.scores.map((s) => s.onDutyMin));
  const loadedMin = sum(all.filter((g) => g.type === "rack" || g.type === "loaded_leg" || g.type === "drop").map((g) => g.minutes));
  const loadedShare = onDutyAll > 0 ? loadedMin / onDutyAll : null;
  const gallons = sum(i.trips.map((t) => t.gallons));
  const completeness = i.scores.length ? i.scores.filter((s) => !s.estimate).length / i.scores.length : 0;
  const arrow = (now: number | null, was: number | null) => (now != null && was != null && Math.abs(now - was) > 1 ? now - was : null);
  const tiles: Tile[] = [
    { label: "Region ATR", value: atrMed == null ? "-" : `${atrMed.toFixed(1)}%`, sub: `${scored.length} driver${scored.length === 1 ? "" : "s"} · ${i.scores.length} shifts`, change: arrow(atrMed, i.prior?.atrMedian ?? null) },
    { label: "Recovery %", value: i.regionRecovery.pct == null ? "-" : `${pct(i.regionRecovery.pct).toFixed(1)}%`, sub: `${i.regionRecovery.loads} scored loads`, change: arrow(i.regionRecovery.pct == null ? null : pct(i.regionRecovery.pct), i.prior?.recoveryPct ?? null) },
    { label: "Loaded share", value: loadedShare == null ? "-" : `${pct(loadedShare).toFixed(1)}%`, sub: "of on-duty time", change: arrow(loadedShare == null ? null : pct(loadedShare), i.prior?.loadedShare ?? null) },
    { label: "Loads delivered", value: String(i.trips.length), change: i.prior ? i.trips.length - i.prior.loads : null },
    { label: "Gallons delivered", value: Math.round(gallons).toLocaleString("en-US"), change: i.prior ? gallons - i.prior.gallons : null },
    { label: "Data completeness", value: `${Math.round(completeness * 100)}%`, sub: "of shifts with Geotab linked" },
  ];

  return {
    companyName: i.companyName, weekStart: i.weekStart, weekEnd: i.weekEnd, standardsVersion: i.standardsVersion, generatedAt: i.generatedAt, tz: i.tz,
    tiles, topCauses: causes.slice(0, 3), drivers: rows,
    recognition: scored.filter((r) => r.shifts >= 3 && !r.estimate).sort((a, b) => (b.atr as number) - (a.atr as number)).slice(0, 5).map((r) => ({ name: r.name, atr: r.atr as number })),
    ledger: { causes: causes.slice(0, 12), places, heat }, patterns,
    system: systemLens(i, all), completeness,
  };
}

const TYPE_LABEL: Record<string, string> = { rack: "Rack", loaded_leg: "Loaded leg", drop: "Drop", empty_leg: "Empty leg", fuel: "Fuel", gray: "Gray zone" };

// ── driver patterns ─────────────────────────────────────────────────────────

const ACTION = {
  time: "Consider moving start time earlier or later",
  place: "Check training or equipment at this place",
  tap: "Reminder on shift taps",
  delay: "Reminder to report delays as they happen",
};

function detectPatterns(i: RecapInput, byUser: Map<string, ShiftScore[]>, names: Map<string, RecapDriver>): Pattern[] {
  const out: Pattern[] = [];
  const need = i.settings.softFlagShifts;
  const allSegs = i.scores.flatMap((s) => s.segments);
  for (const [userId, shifts] of byUser) {
    const name = names.get(userId)?.name ?? "Driver";
    const worked = shifts.length;
    // Time of day: the same hour window loses time on most shifts worked.
    if (worked >= 4) {
      const per = new Map<number, { shifts: number; min: number }>();
      for (const sh of shifts) {
        const bucketLost = new Map<number, number>();
        for (const g of sh.segments) { const l = lost(g); if (l > 0) bucketLost.set(bucketOf(g.hour), (bucketLost.get(bucketOf(g.hour)) ?? 0) + l); }
        for (const [b, m] of bucketLost) if (m >= 10) { const e = per.get(b) ?? { shifts: 0, min: 0 }; e.shifts += 1; e.min += m; per.set(b, e); }
      }
      for (const [b, e] of per) if (e.shifts >= Math.max(need, Math.ceil(worked * 0.8))) out.push({ userId, name, kind: "Time of day", evidence: `${e.shifts} of ${worked} shifts, ${BUCKET_LABEL[b]} h`, avgMinLost: e.min / e.shifts, action: ACTION.time });
    }
    // Place: one terminal or store shows excess on most of this driver's visits, and not for the others.
    const mineByPlace = new Map<string, Scored[]>();
    for (const g of shifts.flatMap((s) => s.segments)) if ((g.type === "rack" || g.type === "drop") && g.key) { const a = mineByPlace.get(g.key) ?? []; a.push(g); mineByPlace.set(g.key, a); }
    for (const [key, vis] of mineByPlace) {
      if (vis.length < need) continue;
      const slowMine = vis.filter((v) => v.excessMin >= 10);
      if (slowMine.length / vis.length < 0.6) continue;
      const others = allSegs.filter((g) => g.key === key && g.userId !== userId);
      if (others.length >= 2 && others.filter((g) => g.excessMin >= 10).length / others.length >= 0.4) continue; // a place problem, not a driver's
      out.push({ userId, name, kind: "Place", evidence: `${slowMine.length} of ${vis.length} visits to ${vis[0].label}`, avgMinLost: sum(slowMine.map((v) => v.excessMin)) / slowMine.length, action: ACTION.place });
    }
    // Tap habits: end taps the system had to make, long end gaps, gray overruns.
    const sloppy = shifts.filter((s) => s.shift.unconfirmed || s.shift.endSource === "geotab" || s.segments.some((g) => g.type === "gray" && g.unaccounted > 0));
    if (worked >= need && sloppy.length >= need) out.push({ userId, name, kind: "Tap habits", evidence: `${sloppy.length} of ${worked} shifts`, avgMinLost: sum(sloppy.flatMap((s) => s.segments.filter((g) => g.type === "gray").map((g) => g.unaccounted))) / sloppy.length, action: ACTION.tap });
    // Delay reporting: little of the lost time was reported as it happened.
    const lostTotal = sum(shifts.flatMap((s) => s.segments.filter((g) => g.type !== "gray").map((g) => g.excessMin)));
    const reported = sum(shifts.flatMap((s) => s.segments.map((g) => Math.min(g.liveDelayMin, g.excessMin))));
    if (lostTotal >= 60 && reported / lostTotal < 0.3) out.push({ userId, name, kind: "Delay reporting", evidence: `${Math.round((reported / lostTotal) * 100)}% of ${Math.round(lostTotal)} min reported live`, avgMinLost: lostTotal / worked, action: ACTION.delay });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// ── system lens ─────────────────────────────────────────────────────────────

function systemLens(i: RecapInput, all: Scored[]): Recap["system"] {
  const hop = new Map<string, { label: string; n: number; reasons: Map<string, number> }>();
  for (const t of i.trips) for (const p of t.pickups) if (p.outcome === "no_load") {
    const k = p.terminalId ?? p.pickupId;
    const e = hop.get(k) ?? { label: p.name ?? "Terminal", n: 0, reasons: new Map() };
    e.n += 1; const r = p.noLoadReason ?? "other"; e.reasons.set(r, (e.reasons.get(r) ?? 0) + 1); hop.set(k, e);
  }
  const allocationHops = [...hop.values()].sort((a, b) => b.n - a.n).slice(0, 10).map((e) => ({ label: e.label, value: `${e.n} hop${e.n === 1 ? "" : "s"}`, detail: [...e.reasons.entries()].map(([r, n]) => `${r.replace(/_/g, " ")} ${n}`).join(", ") }));
  const lane = new Map<string, { label: string; n: number; min: number }>();
  for (const g of all) if (g.type === "empty_leg" && g.minutes >= 5) { const k = g.key ?? g.label; const e = lane.get(k) ?? { label: g.label, n: 0, min: 0 }; e.n += 1; e.min += g.minutes; lane.set(k, e); }
  const deadhead = [...lane.values()].sort((a, b) => b.min - a.min).slice(0, 10).map((e) => ({ label: e.label, value: `${Math.round(e.min)} min`, detail: `${e.n} empty run${e.n === 1 ? "" : "s"}` }));
  const term = new Map<string, { label: string; visits: number; min: number }>();
  for (const g of all) if (g.type === "rack" && g.key) { const e = term.get(g.key) ?? { label: g.label, visits: 0, min: 0 }; e.visits += 1; e.min += g.minutes; term.set(g.key, e); }
  const onDuty = sum(i.scores.map((s) => s.onDutyMin)) || 1;
  const terminals = [...term.values()].sort((a, b) => b.min - a.min).slice(0, 10).map((e) => ({ label: e.label, value: `${pct(e.min / onDuty).toFixed(1)}% of on-duty time`, detail: `${e.visits} visit${e.visits === 1 ? "" : "s"}, ${Math.round(e.min / e.visits)} min average` }));
  return { allocationHops, deadhead, terminals, notes: ["Out-of-hours aborts and hops caused by missing terminal cards are not measured yet."] };
}
