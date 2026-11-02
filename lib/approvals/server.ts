// lib/approvals/server.ts
//
// Issues, inspects and decides one-time approval links. Server only: the table has no client access at all.
// Inspecting never changes anything; only decideApproval does, and only from a deliberate tap on the page.

import { getServiceSupabase } from "@/lib/supabase/serviceClient";
import { approvalUrl, expiryFrom, hashToken, looksLikeToken, newToken, statusFor, type DecideResult, type Decision } from "./token";

/** Makes an approve link and a deny link for one record. The caller puts them in the email it sends. */
export async function issueApprovalLinks(o: { companyId: string; purpose: string; subjectId: string; approver?: string | null; origin: string; ttlDays?: number }): Promise<{ approveUrl: string; denyUrl: string }> {
  const admin = getServiceSupabase();
  const expires = expiryFrom(Date.now(), o.ttlDays);
  const make = async (decision: Decision) => {
    const { token, hash } = newToken();
    const { error } = await admin.from("approval_tokens").insert({ token_hash: hash, company_id: o.companyId, purpose: o.purpose, subject_id: o.subjectId, decision, approver: o.approver ?? null, expires_at: expires });
    if (error) throw new Error(error.message);
    return approvalUrl(o.origin, token);
  };
  return { approveUrl: await make("approve"), denyUrl: await make("deny") };
}

export type Inspect =
  | { valid: true; decision: Decision; purpose: string; title: string; lines: string[] }
  | { valid: false; reason: "unknown" | "used" | "expired" };

/** What a link would do, for the confirmation page. Changes nothing. */
export async function inspectApproval(token: unknown): Promise<Inspect> {
  if (!looksLikeToken(token)) return { valid: false, reason: "unknown" };
  const admin = getServiceSupabase();
  const { data: t } = await admin.from("approval_tokens").select("*").eq("token_hash", hashToken(token)).maybeSingle();
  const row = t as { purpose: string; subject_id: string; decision: Decision; decided_at: string | null; expires_at: string } | null;
  if (!row) return { valid: false, reason: "unknown" };
  const { data: spent } = await admin.from("approval_tokens").select("token_hash").eq("subject_id", row.subject_id).eq("purpose", row.purpose).not("decided_at", "is", null).limit(1);
  if (row.decided_at || (spent ?? []).length) return { valid: false, reason: "used" };
  if (Date.parse(row.expires_at) < Date.now()) return { valid: false, reason: "expired" };
  let title = "Request";
  const lines: string[] = [];
  if (row.purpose === "repair_request") {
    const { data: wo } = await admin.from("work_orders").select("subject, truck_id, trailer_id, detail").eq("work_order_id", row.subject_id).maybeSingle();
    const w = wo as { subject: string; truck_id: string | null; trailer_id: string | null; detail: Record<string, unknown> } | null;
    title = "Repair request";
    if (w) {
      lines.push(w.subject);
      if (w.truck_id) { const { data: tr } = await admin.from("trucks").select("truck_name").eq("truck_id", w.truck_id).maybeSingle(); if (tr) lines.push(`Truck ${(tr as { truck_name: string }).truck_name}`); }
      if (w.trailer_id) { const { data: tl } = await admin.from("trailers").select("trailer_name").eq("trailer_id", w.trailer_id).maybeSingle(); if (tl) lines.push(`Trailer ${(tl as { trailer_name: string }).trailer_name}`); }
      const note = typeof w.detail?.note === "string" ? w.detail.note : null;
      if (note) lines.push(note);
    }
  }
  return { valid: true, decision: row.decision, purpose: row.purpose, title, lines };
}

/** The decision. One locked step in the database makes the first one final, then the record is updated. */
export async function decideApproval(token: unknown): Promise<DecideResult> {
  if (!looksLikeToken(token)) return { ok: false, reason: "unknown" };
  const admin = getServiceSupabase();
  const { data, error } = await admin.rpc("decide_approval", { p_hash: hashToken(token) });
  if (error) throw new Error(error.message);
  const r = data as { ok: boolean; reason?: "unknown" | "used" | "expired"; decision?: Decision; purpose?: string; subject_id?: string; company_id?: string };
  if (!r.ok) return { ok: false, reason: r.reason ?? "unknown" };
  const status = statusFor(r.purpose!, r.decision!);
  if (status && r.purpose === "repair_request") {
    await admin.from("work_orders").update({ status, updated_at: new Date().toISOString() }).eq("work_order_id", r.subject_id!).eq("company_id", r.company_id!).eq("status", "awaiting_approval"); // an admin who already decided in the app stands
  }
  return { ok: true, decision: r.decision!, purpose: r.purpose!, subjectId: r.subject_id!, companyId: r.company_id! };
}
