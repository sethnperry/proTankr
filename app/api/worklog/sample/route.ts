// app/api/worklog/sample/route.ts
//
// Super-admin-only: email the caller a Work Log for a chosen range, so the real email can be seen
// before the scheduled send. Sends to the caller's own address only.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServiceSupabase } from "@/lib/supabase/serviceClient";
import { buildDriverWorklog } from "@/lib/worklog/serverWorklog";
import { sendWorklogEmail } from "@/lib/worklog/emailWorklog";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    const caller = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const { data: u } = await caller.auth.getUser(token);
    const user = u?.user;
    if (!user?.email) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    const admin = getServiceSupabase();
    const { data: sa } = await admin.from("super_admins").select("user_id").eq("user_id", user.id).maybeSingle();
    if (!sa) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const { start, end, tz, title } = (await req.json()) as { start: string; end: string; tz?: string; title?: string };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start ?? "") || !/^\d{4}-\d{2}-\d{2}$/.test(end ?? "") || start > end) return NextResponse.json({ error: "Bad dates." }, { status: 400 });
    const zone = tz || "America/New_York";
    const { data: prof } = await admin.from("profiles").select("display_name").eq("user_id", user.id).maybeSingle();
    const { data: uc } = await admin.from("user_settings").select("active_company_id").eq("user_id", user.id).maybeSingle();
    const companyId = (uc as { active_company_id?: string } | null)?.active_company_id;
    if (!companyId) return NextResponse.json({ error: "No active company." }, { status: 400 });
    const w = await buildDriverWorklog({ companyId, userId: user.id, range: { start, end }, tz: zone, title: title || "Weekly", driverName: (prof as any)?.display_name ?? user.email });
    await sendWorklogEmail(user.email, w, { sample: true });
    return NextResponse.json({ ok: true, to: user.email });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
