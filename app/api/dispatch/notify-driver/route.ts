// app/api/dispatch/notify-driver/route.ts
//
// POST { tripId, text } -> push a short message to the driver on a trip. Used when dispatch edits or
// cancels a load in progress. Only company dispatch, lead, admin or owner (or a super admin) may send.

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/serviceClient";
import { callerId, companyRole } from "@/lib/telematics/server";
import { sendPush, type StoredSub } from "@/lib/push/send";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const uid = await callerId(req);
  if (!uid) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body: any = await req.json().catch(() => ({}));
  const tripId = String(body.tripId ?? "");
  const text = String(body.text ?? "").slice(0, 200);
  if (!tripId || !text) return NextResponse.json({ error: "tripId and text are required." }, { status: 400 });
  const admin = getServiceSupabase();
  const { data: trip } = await admin.from("trips").select("company_id, driver_id").eq("trip_id", tripId).maybeSingle();
  const t = trip as { company_id: string; driver_id: string | null } | null;
  if (!t?.driver_id) return NextResponse.json({ error: "No driver on that trip." }, { status: 404 });
  const r = await companyRole(uid, t.company_id);
  if (!r.superAdmin && !["admin", "owner", "dispatch", "lead"].includes(r.role ?? "")) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const { data: subs } = await admin.from("push_subscriptions").select("endpoint, p256dh, auth").eq("user_id", t.driver_id);
  const sent = await sendPush((subs ?? []) as StoredSub[], { title: "Dispatch changed your load", body: text, url: "/planner/home", tag: `dispatch-edit-${tripId}` });
  return NextResponse.json({ ok: true, sent });
}
