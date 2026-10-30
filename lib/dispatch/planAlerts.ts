// lib/dispatch/planAlerts.ts
//
// Dispatch Dashboard, PLAN mode: everything in the company that runs out
// within the horizon (or already has), so a load isn't planned around a
// driver or unit that can't make it. Pure: takes raw rows, returns items
// sorted worst first. Terminal access that has already timed out (30 days
// past) isn't an alert, it's "no access", so it's dropped here.

import { daysUntilIso, expiryStateForDays, type ExpiryState } from "../expiry.ts";

export type AlertKind = "access" | "no_access" | "license" | "medical" | "twic" | "badge" | "permit" | "service" | "training";

export type PlanAlert = {
  key: string;
  kind: AlertKind;
  // Who or what: a driver's name, or "Truck 25184" / "Trailer 3151".
  subject: string;
  subjectId: string; // user_id or truck/trailer id
  isEquipment: boolean;
  label: string; // "Marathon access", "Medical card", "Registration"
  iso: string;
  days: number;
  state: ExpiryState;
  // When set, shown instead of the date and countdown ("12 loads in 90 days").
  detail?: string;
};

export type PlanInputs = {
  names: Map<string, string>; // user_id -> name
  access: { user_id: string; terminal_id: string; carded_on: string | null }[];
  terminals: Map<string, { name: string; renewal_days: number | null }>;
  credentials: { user_id: string; kind: "license" | "medical" | "twic"; expiration_date: string | null }[];
  badges: { user_id: string; port_name: string | null; expiration_date: string | null }[];
  training?: { user_id: string; terminal_id: string; expires_at: string | null }[];
  permits: { truck_id: string | null; trailer_id: string | null; expiration_date: string | null; permit_name: string | null }[];
  trucks: Map<string, string>;
  trailers: Map<string, string>;
  // Alerts built elsewhere (service due), filtered by the horizon here.
  extra?: PlanAlert[];
  // Loads per driver per terminal over the last 90 days (see accessGaps).
  loads?: { user_id: string; terminal_id: string }[];
};

// "Often sent": this many loads at one terminal inside the window.
export const OFTEN_LOADS = 3;
export const OFTEN_WINDOW_DAYS = 90;

const CRED_LABEL = { license: "License", medical: "Medical card", twic: "TWIC" } as const;

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

export function planAlerts(input: PlanInputs, horizonDays = 30, todayIso?: string): PlanAlert[] {
  const out: PlanAlert[] = [];
  const push = (a: Omit<PlanAlert, "days" | "state">, access = false) => {
    const days = daysUntilIso(a.iso, todayIso);
    if (days == null || days > horizonDays) return;
    const state = expiryStateForDays(days, { access });
    if (state === "inactive") return;
    out.push({ ...a, days, state });
  };
  const who = (id: string) => input.names.get(id) ?? "Driver";

  for (const r of input.access) {
    if (!input.names.has(r.user_id) || !r.carded_on) continue;
    const t = input.terminals.get(r.terminal_id);
    const iso = addDays(r.carded_on, t?.renewal_days ?? 90);
    push({ key: `a:${r.user_id}:${r.terminal_id}`, kind: "access", subject: who(r.user_id), subjectId: r.user_id, isEquipment: false,
      label: `${t?.name ?? "Terminal"} access`, iso }, true);
  }
  for (const c of input.credentials) {
    if (!input.names.has(c.user_id) || !c.expiration_date) continue;
    push({ key: `c:${c.user_id}:${c.kind}`, kind: c.kind, subject: who(c.user_id), subjectId: c.user_id, isEquipment: false,
      label: CRED_LABEL[c.kind], iso: c.expiration_date });
  }
  input.badges.forEach((b, i) => {
    if (!input.names.has(b.user_id) || !b.expiration_date) return;
    push({ key: `b:${b.user_id}:${i}`, kind: "badge", subject: who(b.user_id), subjectId: b.user_id, isEquipment: false,
      label: `${b.port_name ?? "Port"} badge`, iso: b.expiration_date });
  });
  for (const t of input.training ?? []) {
    if (!input.names.has(t.user_id) || !t.expires_at) continue;
    push({ key: `t:${t.user_id}:${t.terminal_id}`, kind: "training", subject: who(t.user_id), subjectId: t.user_id, isEquipment: false,
      label: `${input.terminals.get(t.terminal_id)?.name ?? "Terminal"} training`, iso: t.expires_at });
  }
  input.permits.forEach((p, i) => {
    if (!p.expiration_date) return;
    const truck = p.truck_id ? input.trucks.get(p.truck_id) : null;
    const trailer = p.trailer_id ? input.trailers.get(p.trailer_id) : null;
    // Units that are inactive or deleted aren't in the maps; skip them.
    if (p.truck_id && truck == null) return;
    if (p.trailer_id && trailer == null) return;
    const subject = p.truck_id ? `Truck ${truck}` : `Trailer ${trailer}`;
    push({ key: `p:${i}`, kind: "permit", subject, subjectId: (p.truck_id ?? p.trailer_id)!, isEquipment: true,
      label: p.permit_name ?? "Permit", iso: p.expiration_date });
  });

  for (const e of input.extra ?? []) if (e.days <= horizonDays) out.push(e);
  out.push(...accessGaps(input, todayIso));

  return out.sort((a, b) => a.days - b.days || a.subject.localeCompare(b.subject));
}

// Drivers with NO access at a terminal they're often sent to: loaded there
// OFTEN_LOADS+ times in the window, but never carded, or access timed out
// (30+ days past). Access that is merely expired or expiring is already an
// alert above, so it isn't repeated here. Shown whatever the horizon is.
export function accessGaps(input: PlanInputs, todayIso?: string): PlanAlert[] {
  const counts = new Map<string, number>();
  for (const l of input.loads ?? []) {
    if (!l.terminal_id || !input.names.has(l.user_id)) continue;
    const k = `${l.user_id}|${l.terminal_id}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const carded = new Map<string, string | null>();
  for (const r of input.access) carded.set(`${r.user_id}|${r.terminal_id}`, r.carded_on);
  const out: PlanAlert[] = [];
  for (const [k, n] of counts) {
    if (n < OFTEN_LOADS) continue;
    const [userId, terminalId] = k.split("|");
    const t = input.terminals.get(terminalId);
    const cardedOn = carded.get(k) ?? null;
    if (cardedOn) {
      const days = daysUntilIso(addDays(cardedOn, t?.renewal_days ?? 90), todayIso);
      if (days != null && expiryStateForDays(days, { access: true }) !== "inactive") continue;
    }
    out.push({ key: `g:${k}`, kind: "no_access", subject: input.names.get(userId) ?? "Driver", subjectId: userId, isEquipment: false,
      label: `${t?.name ?? "Terminal"} · no access`, iso: "", days: -1, state: "expired",
      detail: `${n} loads in ${OFTEN_WINDOW_DAYS}d` });
  }
  return out;
}

export type PlanCounts = { expired: number; week: number; month: number; driversAffected: number; unitsAffected: number };

export function planCounts(alerts: PlanAlert[]): PlanCounts {
  const people = new Set<string>(), units = new Set<string>();
  let expired = 0, week = 0, month = 0;
  for (const a of alerts) {
    if (a.days < 0) expired++;
    else if (a.days <= 7) week++;
    else month++;
    (a.isEquipment ? units : people).add(a.subjectId);
  }
  return { expired, week, month, driversAffected: people.size, unitsAffected: units.size };
}

// Group by subject, worst item first within each, subjects ordered by
// their worst item.
export function groupBySubject(alerts: PlanAlert[]): { subject: string; subjectId: string; isEquipment: boolean; items: PlanAlert[] }[] {
  const m = new Map<string, { subject: string; subjectId: string; isEquipment: boolean; items: PlanAlert[] }>();
  for (const a of alerts) {
    const g = m.get(a.subjectId) ?? { subject: a.subject, subjectId: a.subjectId, isEquipment: a.isEquipment, items: [] };
    g.items.push(a);
    m.set(a.subjectId, g);
  }
  return [...m.values()].sort((x, y) => x.items[0].days - y.items[0].days || x.subject.localeCompare(y.subject));
}
