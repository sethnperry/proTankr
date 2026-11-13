// app/api/eod/send/route.ts
//
// "Send now" for the End of Day report: a company admin sends the report for a chosen day (default: yesterday)
// to the saved recipients, without waiting for the schedule.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServiceSupabase } from "@/lib/supabase/serviceClient";
import { sendEod, type EodSettings } from "@/lib/eod/eodServer";
import { addDays, localDateOf } from "@/lib/worklog/time";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const caller = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const { data: u } = token ? await caller.auth.getUser(token) : { data: { user: null } };
    if (!u?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    const body = (await req.json().catch(() => ({}))) as { companyId?: string; date?: string };
    const companyId = String(body.companyId ?? "");
    const admin = getServiceSupabase();
    const { data: mem } = await admin.from("user_companies").select("role").eq("company_id", companyId).eq("user_id", u.user.id).maybeSingle();
    if (!["admin", "owner"].includes(String((mem as { role?: string } | null)?.role))) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
    const { data: s } = await admin.from("eod_report_settings").select("*").eq("company_id", companyId).maybeSingle();
    if (!s) return NextResponse.json({ error: "Save the settings first." }, { status: 400 });
    const settings = s as EodSettings;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(body.date ?? "")) ? String(body.date) : addDays(localDateOf(Date.now(), settings.tz), -1);
    const r = await sendEod(admin, settings, date);
    return NextResponse.json({ ok: true, date, ...r });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
