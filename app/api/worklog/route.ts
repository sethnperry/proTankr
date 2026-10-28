// app/api/worklog/route.ts
//
// The signed-in driver's own Work Log for a range, as JSON (for the Report Center page) or a PDF
// (the download button). Built on the server so it includes on-duty time from the electronic log
// and matches the emailed PDF exactly.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServiceSupabase } from "@/lib/supabase/serviceClient";
import { buildDriverWorklog } from "@/lib/worklog/serverWorklog";
import { renderWorklogPdf, worklogFileName } from "@/lib/worklog/pdfWorklog";
import { isLongRange } from "@/lib/reports/periodOptions";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    const caller = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const { data: u } = await caller.auth.getUser(token);
    const user = u?.user;
    if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

    const { start, end, tz, title, format } = (await req.json()) as { start: string; end: string; tz?: string; title?: string; format?: "json" | "pdf" };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start ?? "") || !/^\d{4}-\d{2}-\d{2}$/.test(end ?? "") || start > end) return NextResponse.json({ error: "Bad dates." }, { status: 400 });
    const admin = getServiceSupabase();
    const [{ data: prof }, { data: us }] = await Promise.all([
      admin.from("profiles").select("display_name").eq("user_id", user.id).maybeSingle(),
      admin.from("user_settings").select("active_company_id").eq("user_id", user.id).maybeSingle(),
    ]);
    const companyId = (us as { active_company_id?: string } | null)?.active_company_id;
    if (!companyId) return NextResponse.json({ error: "No active company." }, { status: 400 });
    const w = await buildDriverWorklog({ companyId, userId: user.id, range: { start, end }, tz: tz || "America/New_York", title: title || "Work Log", driverName: (prof as any)?.display_name ?? user.email ?? "" });
    if (format === "pdf") {
      let logo: Uint8Array | null = null;
      try { const r = await fetch("https://protankr.com/icons/icon-email-black.png"); if (r.ok) logo = new Uint8Array(await r.arrayBuffer()); } catch { /* no logo */ }
      const pdf = await renderWorklogPdf(w, { mode: isLongRange(start, end) ? "condensed" : "full", logo });
      return new NextResponse(Buffer.from(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${worklogFileName(w)}"` } });
    }
    return NextResponse.json(w);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
