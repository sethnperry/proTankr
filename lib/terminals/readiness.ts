// lib/terminals/readiness.ts
//
// Terminal access for one city: every terminal in the city, and whether this
// driver can load there right now. Uses the app-wide rule (lib/expiry.ts):
// access expires `renewal_days` after the last carded date; 8-30 days left is
// "soon" (yellow), 0-7 "expiring" (orange), past it "expired" (red), and 30
// days after that it times out to no access. A terminal never carded is no
// access. Pure, so it can be tested without a session.

import { daysUntilIso, expiryStateForDays } from "../expiry.ts";

export type ReadinessState = "ready" | "soon" | "expiring" | "expired" | "none" | "training";

// Access steps underway at a terminal, bottom to top (lib/terminals/accessSteps.ts).
export type ReadinessSteps = { done: number; total: number; states: ("done" | "next" | "pending" | "blocked")[] };

export type ReadinessInput = {
  terminalId: string;
  name: string;
  city: string | null;
  state: string | null;
  renewalDays: number | null;
  cardedOn: string | null; // YYYY-MM-DD
  // Access steps in progress here (card not issued yet). Shown instead of
  // the access fill.
  steps?: ReadinessSteps | null;
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
  // 0..1 share of the renewal period still left (1 = carded today).
  remaining: number;
  // Expired more than the grace period ago: shown as no access.
  timedOut: boolean;
  isPickup: boolean;
  steps: ReadinessSteps | null;
};

export type ReadinessSummary = {
  segments: ReadinessSegment[];
  // Can load now (ready + soon + expiring).
  access: number;
  soon: number;
  expiring: number;
  expired: number;
  none: number;
  training: number;
  // The one thing worth saying: the pickup terminal's problem, else the
  // worst other problem, else the next renewal.
  headline: { tone: "ok" | "soon" | "warn" | "bad" | "muted"; text: string } | null;
};

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
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
    seen.add(r.terminalId);
    const isPickup = !!opts.pickupTerminalId && r.terminalId === opts.pickupTerminalId;
    const renewalDays = Number(r.renewalDays) > 0 ? Number(r.renewalDays) : 90;
    const base = { terminalId: r.terminalId, name: r.name, short: shortName(r.name), renewalDays, isPickup, steps: r.steps ?? null };
    if (r.steps) {
      segments.push({ ...base, state: "training", cardedOn: r.cardedOn, expiresOn: null, daysLeft: null, remaining: 0, timedOut: false });
      continue;
    }
    if (!r.cardedOn) {
      segments.push({ ...base, state: "none", cardedOn: null, expiresOn: null, daysLeft: null, remaining: 0, timedOut: false });
      continue;
    }
    const expiresOn = addDays(r.cardedOn, renewalDays);
    const daysLeft = daysUntilIso(expiresOn, opts.todayIso) ?? 0;
    const level = expiryStateForDays(daysLeft, { access: true });
    const state: ReadinessState =
      level === "inactive" ? "none" : level === "valid" ? "ready" : level === "soon" ? "soon"
        : level === "expiring" ? "expiring" : "expired";
    segments.push({
      ...base, state, cardedOn: r.cardedOn, expiresOn, daysLeft,
      remaining: Math.max(0, Math.min(1, daysLeft / renewalDays)),
      timedOut: level === "inactive",
    });
  }
  // Terminals you can load at first, then the rest; alphabetical within.
  const hasAccess = (s: ReadinessSegment) => (s.state === "none" ? 2 : s.state === "training" ? 1 : 0);
  segments.sort((a, b) => hasAccess(a) - hasAccess(b) || a.name.localeCompare(b.name));

  const count = (s: ReadinessState) => segments.filter((x) => x.state === s).length;
  const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
  const problem = (s: ReadinessSegment) =>
    s.state === "none" ? `No access at ${s.name}`
      : s.state === "training" ? `${s.name}: access steps ${s.steps!.done} of ${s.steps!.total}`
      : s.state === "expired" ? `${s.name} expired ${days(-(s.daysLeft ?? 0))} ago`
      : s.daysLeft === 0 ? `${s.name} expires today`
      : `${s.name} expires in ${days(s.daysLeft ?? 0)}`;
  const tone = (s: ReadinessSegment): "soon" | "warn" | "bad" | "muted" =>
    s.state === "soon" ? "soon" : s.state === "expiring" ? "warn" : s.state === "training" ? "muted" : "bad";

  let headline: ReadinessSummary["headline"] = null;
  const pickup = segments.find((s) => s.isPickup);
  const rank = { expired: 0, expiring: 1, soon: 2 } as const;
  const worst = segments
    .filter((s): s is ReadinessSegment & { state: keyof typeof rank } => s.state in rank)
    .sort((a, b) => rank[a.state] - rank[b.state] || (a.daysLeft ?? 0) - (b.daysLeft ?? 0))[0];
  if (pickup && pickup.state !== "ready") {
    headline = { tone: tone(pickup), text: `Pickup: ${problem(pickup)}` };
  } else if (worst) {
    headline = { tone: tone(worst), text: problem(worst) };
  } else if (segments.some((s) => s.state === "training")) {
    const t = segments.find((s) => s.state === "training")!;
    headline = { tone: "muted", text: problem(t) };
  } else if (segments.some((s) => s.state === "ready")) {
    const next = segments.filter((s) => s.state === "ready").sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0))[0];
    headline = { tone: "ok", text: `Next renewal: ${next.name} in ${days(next.daysLeft ?? 0)}` };
  } else if (segments.length > 0) {
    headline = { tone: "muted", text: "No access at any terminal here yet" };
  }

  const soon = count("soon"), expiring = count("expiring");
  return {
    segments, access: count("ready") + soon + expiring, soon, expiring,
    expired: count("expired"), none: count("none"), training: count("training"), headline,
  };
}

