// lib/terminals/readiness.ts
//
// Terminal access readiness for one city: which terminals this driver can
// load at right now. Uses the same rule as the rest of the app (Cards tab,
// bell): access expires `renewal_days` after the last carded date; within
// 7 days it's expiring; past it, expired. A starred terminal with no carded
// date is "not carded". Pure, so it can be tested without a session.

export type ReadinessState = "ready" | "expiring" | "expired" | "none";

export type ReadinessInput = {
  terminalId: string;
  name: string;
  city: string | null;
  state: string | null;
  renewalDays: number | null;
  cardedOn: string | null; // YYYY-MM-DD
  starred: boolean;
};

export type ReadinessSegment = {
  terminalId: string;
  name: string;
  short: string;
  state: ReadinessState;
  cardedOn: string | null;
  expiresOn: string | null;
  daysLeft: number | null;
  renewalDays: number;
  // 0..1 share of the renewal period still left (1 = just carded).
  remaining: number;
  isPickup: boolean;
};

export type ReadinessSummary = {
  segments: ReadinessSegment[];
  ready: number;
  expiring: number;
  expired: number;
  none: number;
  // The one thing worth saying: the pickup terminal's problem, else the
  // worst other problem, else the next renewal.
  headline: { tone: "ok" | "warn" | "bad" | "muted"; text: string } | null;
};

export const WARN_DAYS = 7;

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.UTC(...(fromIso.slice(0, 10).split("-").map(Number).map((v, i) => (i === 1 ? v - 1 : v)) as [number, number, number]));
  const b = Date.UTC(...(toIso.slice(0, 10).split("-").map(Number).map((v, i) => (i === 1 ? v - 1 : v)) as [number, number, number]));
  return Math.round((b - a) / 86400000);
}

export function shortName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "—";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

export function terminalReadiness(
  rows: ReadinessInput[],
  opts: { city: string | null; state: string | null; todayIso: string; pickupTerminalId?: string | null },
): ReadinessSummary {
  const seen = new Set<string>();
  const segments: ReadinessSegment[] = [];
  for (const r of rows) {
    if (seen.has(r.terminalId)) continue;
    if (norm(r.city) !== norm(opts.city) || norm(r.state) !== norm(opts.state)) continue;
    const isPickup = !!opts.pickupTerminalId && r.terminalId === opts.pickupTerminalId;
    if (!r.starred && !r.cardedOn && !isPickup) continue;
    seen.add(r.terminalId);
    const renewalDays = Number(r.renewalDays) > 0 ? Number(r.renewalDays) : 90;
    if (!r.cardedOn) {
      segments.push({ terminalId: r.terminalId, name: r.name, short: shortName(r.name), state: "none", cardedOn: null, expiresOn: null, daysLeft: null, renewalDays, remaining: 0, isPickup });
      continue;
    }
    const expiresOn = addDays(r.cardedOn, renewalDays);
    const daysLeft = daysBetween(opts.todayIso, expiresOn);
    const state: ReadinessState = daysLeft < 0 ? "expired" : daysLeft <= WARN_DAYS ? "expiring" : "ready";
    segments.push({
      terminalId: r.terminalId, name: r.name, short: shortName(r.name), state,
      cardedOn: r.cardedOn, expiresOn, daysLeft, renewalDays,
      remaining: Math.max(0, Math.min(1, daysLeft / renewalDays)), isPickup,
    });
  }
  segments.sort((a, b) => a.name.localeCompare(b.name));

  const count = (s: ReadinessState) => segments.filter((x) => x.state === s).length;
  const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
  const problem = (s: ReadinessSegment) =>
    s.state === "none" ? `Not carded at ${s.name}`
      : s.state === "expired" ? `${s.name} expired ${days(-(s.daysLeft ?? 0))} ago`
      : s.state === "expiring" ? (s.daysLeft === 0 ? `${s.name} expires today` : `${s.name} expires in ${days(s.daysLeft ?? 0)}`)
      : "";

  let headline: ReadinessSummary["headline"] = null;
  const pickup = segments.find((s) => s.isPickup);
  const rank = { expired: 0, none: 1, expiring: 2, ready: 3 } as const;
  const worst = [...segments].filter((s) => s.state === "expired" || s.state === "expiring")
    .sort((a, b) => rank[a.state] - rank[b.state] || (a.daysLeft ?? 0) - (b.daysLeft ?? 0))[0];
  if (pickup && pickup.state !== "ready") {
    headline = { tone: pickup.state === "expiring" ? "warn" : "bad", text: `Pickup: ${problem(pickup)}` };
  } else if (worst) {
    headline = { tone: worst.state === "expired" ? "bad" : "warn", text: problem(worst) };
  } else if (segments.length > 0) {
    const next = [...segments].filter((s) => s.state === "ready").sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0))[0];
    headline = next
      ? { tone: "ok", text: `Next renewal: ${next.name} in ${days(next.daysLeft ?? 0)}` }
      : { tone: "muted", text: "No terminals carded here yet" };
  }

  return { segments, ready: count("ready"), expiring: count("expiring"), expired: count("expired"), none: count("none"), headline };
}
