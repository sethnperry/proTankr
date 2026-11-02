// lib/repairs/repairRequest.ts
//
// Truck Down and the repair request, the rules only: what the driver has to give, the work order it becomes,
// who the email comes from and what it says. Pure: no Supabase, no network. The server route does the sending.

import { newId, type TripStore } from "../trips/tripStore.ts";
import type { WorkOrderRow } from "../trips/types.ts";
import { createWorkOrder } from "../workorders/workOrders.ts";

export type UnitKind = "truck" | "trailer";

export const REPAIR_CATEGORIES = [
  { value: "engine", label: "Engine or transmission" },
  { value: "brakes", label: "Brakes" },
  { value: "tires", label: "Tires or wheels" },
  { value: "electrical", label: "Electrical or lights" },
  { value: "tank", label: "Tank, valves or hoses" },
  { value: "body", label: "Body, cab or fuel system" },
  { value: "other", label: "Other" },
] as const;
export type RepairCategory = (typeof REPAIR_CATEGORIES)[number]["value"];
export const categoryLabel = (v: string | null | undefined) => REPAIR_CATEGORIES.find((c) => c.value === v)?.label ?? "";

export const AWAITING_APPROVAL = "Awaiting approval";
export const REPAIR_DOMAIN = "protankr.com";

export type RepairInput = { unitId: string | null; unitName: string; category: RepairCategory | null; note: string };

export function repairProblem(i: RepairInput): string | null {
  if (!i.unitId) return "Pick the unit that is down.";
  if (!i.category) return "Pick what is wrong.";
  if (!i.note.trim()) return "Say what happened, in a few words.";
  return null;
}

/** "Truck 25184 (Seth Perry)": the subject, so the approver sees the unit and the driver at a glance. */
export const repairSubject = (kind: UnitKind, unitName: string, driverName: string): string =>
  `${kind === "truck" ? "Truck" : "Trailer"} ${unitName.trim()}${driverName.trim() ? ` (${driverName.trim()})` : ""}`;

export const regionSlug = (region: string | null | undefined): string =>
  (region ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

/** servicerequest+<region>@protankr.com, or plain servicerequest@ when the unit has no region. */
export const fromAddress = (region: string | null | undefined, domain = REPAIR_DOMAIN): string => {
  const slug = regionSlug(region);
  return `servicerequest${slug ? `+${slug}` : ""}@${domain}`;
};

export type RepairDetail = {
  unit_kind: UnitKind; unit_name: string; driver_name: string; region: string | null;
  category: RepairCategory; note: string; capture_id: string | null; email_sent_at?: string | null;
};

/** The work order a repair request creates. Same id again (a retried tap) is the same work order. */
export function createRepairWorkOrder(store: TripStore, o: {
  companyId: string; reportedBy: string; kind: UnitKind; unitId: string; unitName: string; driverName: string; region: string | null;
  category: RepairCategory; note: string; captureId: string | null; id?: string;
}): WorkOrderRow {
  const detail: RepairDetail = { unit_kind: o.kind, unit_name: o.unitName, driver_name: o.driverName, region: o.region, category: o.category, note: o.note.trim(), capture_id: o.captureId };
  return createWorkOrder(store, {
    id: o.id ?? newId(), companyId: o.companyId, reportedBy: o.reportedBy, source: "repair_request",
    subject: `${repairSubject(o.kind, o.unitName, "")} down: ${categoryLabel(o.category)}`,
    truckId: o.kind === "truck" ? o.unitId : null, trailerId: o.kind === "trailer" ? o.unitId : null, detail: detail as unknown as Record<string, unknown>,
  });
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function buildRepairEmail(o: { subject: string; detail: RepairDetail; approveUrl: string; denyUrl: string }): { html: string; text: string } {
  const d = o.detail;
  const rows: [string, string][] = [
    ["Unit", `${d.unit_kind === "truck" ? "Truck" : "Trailer"} ${d.unit_name}`],
    ["Driver", d.driver_name],
    ...(d.region ? ([["Region", d.region]] as [string, string][]) : []),
    ["What's wrong", categoryLabel(d.category)],
    ["Details", d.note],
  ];
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#111">
<p style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#666;margin:0 0 8px">ProTankr repair request</p>
<h2 style="margin:0 0 14px">${esc(o.subject)}</h2>
<table style="border-collapse:collapse;width:100%">${rows.map(([k, v]) => `<tr><td style="padding:6px 10px 6px 0;color:#666;vertical-align:top">${esc(k)}</td><td style="padding:6px 0;font-weight:600">${esc(v)}</td></tr>`).join("")}</table>
<p style="margin:22px 0 10px"><a href="${esc(o.approveUrl)}" style="background:#111;color:#fff;padding:12px 20px;text-decoration:none;font-weight:700;display:inline-block">Review and approve</a>
&nbsp;<a href="${esc(o.denyUrl)}" style="border:1px solid #111;color:#111;padding:11px 20px;text-decoration:none;font-weight:700;display:inline-block">Review and deny</a></p>
<p style="font-size:12px;color:#666">Opening a link decides nothing. You confirm on the next page, and the first decision is final.</p></div>`;
  const text = `${o.subject}\n\n${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\nApprove: ${o.approveUrl}\nDeny: ${o.denyUrl}\n\nOpening a link decides nothing. You confirm on the next page, and the first decision is final.`;
  return { html, text };
}
