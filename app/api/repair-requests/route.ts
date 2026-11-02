// app/api/repair-requests/route.ts
//
// Sends the one automatic email for a repair request (Truck Down), once. The driver's phone has already written
// the work order through the offline store; this opens it as the signed-in driver (so only their own request
// counts), puts the unit at Deadline with the "Awaiting approval" sub-status, issues the approve and deny links
// and emails the company's one approver from servicerequest+<region>@protankr.com.
//
// Safe to call again: the work order remembers when its email went (detail.email_sent_at) and a second call
// returns without sending. With no approver set, nothing is sent and the request waits in the work order list,
// where an admin can decide it.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServiceSupabase } from "@/lib/supabase/serviceClient";
import { issueApprovalLinks } from "@/lib/approvals/server";
import { AWAITING_APPROVAL, buildRepairEmail, fromAddress, repairSubject, type RepairDetail } from "@/lib/repairs/repairRequest";
import { logServerError } from "@/lib/errors/server";

export const runtime = "nodejs";

const json = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: NextRequest) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !anon) return json({ error: "Not signed in." }, 401);
  const user = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: u } = await user.auth.getUser(token);
  if (!u?.user) return json({ error: "Not signed in." }, 401);

  const body = (await req.json().catch(() => ({}))) as { workOrderId?: string };
  if (!body.workOrderId) return json({ error: "Bad request." }, 400);

  // Opened as the driver: RLS lets a company member read it, and we only act on their own request.
  const { data: wo } = await user.from("work_orders").select("work_order_id, company_id, truck_id, trailer_id, source, reported_by, detail").eq("work_order_id", body.workOrderId).maybeSingle();
  const w = wo as { work_order_id: string; company_id: string; truck_id: string | null; trailer_id: string | null; source: string; reported_by: string; detail: RepairDetail } | null;
  if (!w) return json({ sent: false, reason: "not_synced" }); // the phone hasn't sent the row yet: try again
  if (w.source !== "repair_request" || w.reported_by !== u.user.id) return json({ error: "Not allowed." }, 403);
  if (w.detail?.email_sent_at) return json({ sent: true, already: true });

  const admin = getServiceSupabase();
  const unitKind = w.truck_id ? "truck" : "trailer";
  const unitId = (w.truck_id ?? w.trailer_id)!;

  // The unit goes to Deadline now. As the driver, so the database's own company checks apply.
  const down = await user.rpc("set_equipment_status", { p_unit_kind: unitKind, p_unit_id: unitId, p_status: "deadline", p_notes: w.detail.note ?? null, p_sub_status: AWAITING_APPROVAL });
  if (down.error) await logServerError({ companyId: w.company_id, userId: u.user.id, kind: "other", message: `Repair request: couldn't set the unit to Deadline: ${down.error.message}`, payload: { work_order_id: w.work_order_id } }, { dedupeMinutes: 30 });

  const { data: ts } = await admin.from("trip_settings").select("repair_approver_email").eq("company_id", w.company_id).maybeSingle();
  const approver = String((ts as { repair_approver_email?: string | null } | null)?.repair_approver_email ?? "").trim();
  if (!approver) return json({ sent: false, reason: "no_approver" });

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    await logServerError({ companyId: w.company_id, userId: u.user.id, kind: "send_failed", message: "Repair request email not sent: RESEND_API_KEY is not set.", payload: { work_order_id: w.work_order_id } }, { dedupeMinutes: 60 });
    return json({ sent: false, reason: "email_unavailable" });
  }

  try {
    const origin = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    const links = await issueApprovalLinks({ companyId: w.company_id, purpose: "repair_request", subjectId: w.work_order_id, approver, origin });
    const subject = repairSubject(unitKind, w.detail.unit_name, w.detail.driver_name);
    const { html, text } = buildRepairEmail({ subject, detail: w.detail, approveUrl: links.approveUrl, denyUrl: links.denyUrl });
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ from: `ProTankr Service Requests <${fromAddress(w.detail.region)}>`, to: [approver], subject, html, text, reply_to: u.user.email ?? undefined }),
    });
    if (!res.ok) throw new Error(`Resend answered ${res.status}`);
    await admin.from("work_orders").update({ detail: { ...w.detail, email_sent_at: new Date().toISOString() }, updated_at: new Date().toISOString() }).eq("work_order_id", w.work_order_id);
    return json({ sent: true });
  } catch (e: any) {
    await logServerError({ companyId: w.company_id, userId: u.user.id, kind: "send_failed", message: `Repair request email failed: ${e?.message ?? e}`, payload: { work_order_id: w.work_order_id } });
    return json({ sent: false, reason: "failed" });
  }
}
