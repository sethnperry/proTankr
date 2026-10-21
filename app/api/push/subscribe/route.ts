// app/api/push/subscribe/route.ts
//
// POST   { companyId, subscription } -> file this device's push subscription for the signed-in member
// DELETE { endpoint }                 -> remove it

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/serviceClient";
import { callerId, companyRole } from "@/lib/telematics/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const uid = await callerId(req);
  if (!uid) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body: any = await req.json().catch(() => ({}));
  const sub = body.subscription;
  const companyId = String(body.companyId ?? "");
  if (!companyId || !sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) return NextResponse.json({ error: "A company and a push subscription are required." }, { status: 400 });
  const r = await companyRole(uid, companyId);
  if (!r.role && !r.superAdmin) return NextResponse.json({ error: "Not in this company." }, { status: 403 });
  const { error } = await getServiceSupabase().from("push_subscriptions").upsert(
    { endpoint: sub.endpoint, user_id: uid, company_id: companyId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, last_ok_at: new Date().toISOString() },
    { onConflict: "endpoint" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const uid = await callerId(req);
  if (!uid) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body: any = await req.json().catch(() => ({}));
  if (!body.endpoint) return NextResponse.json({ error: "endpoint is required." }, { status: 400 });
  await getServiceSupabase().from("push_subscriptions").delete().eq("endpoint", body.endpoint).eq("user_id", uid);
  return NextResponse.json({ ok: true });
}
