// app/api/report-email/route.ts
//
// Emails the signed-in person a report as a PDF. The report arrives as data (a ReportDoc built by the
// screen that showed it) and goes only to the caller's own address, so it can't be used to mail anyone else.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { renderReportPdf } from "@/lib/reports/pdfReport";
import { MAX_DOC_CHARS, type ReportDoc } from "@/lib/reports/reportDoc";

export const runtime = "nodejs";
export const maxDuration = 30;

const clean = (s: unknown, n: number) => String(s ?? "").replace(/[\r\n]+/g, " ").slice(0, n);

export async function POST(req: NextRequest) {
  try {
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    const caller = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const { data: u } = await caller.auth.getUser(token);
    const email = u?.user?.email;
    if (!email) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

    const raw = await req.text();
    if (raw.length > MAX_DOC_CHARS) return NextResponse.json({ error: "That report is too large to email." }, { status: 413 });
    const d = JSON.parse(raw) as ReportDoc;
    if (!d?.title || !Array.isArray(d.sections)) return NextResponse.json({ error: "Bad report." }, { status: 400 });

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Email isn't set up." }, { status: 500 });
    let logo: Uint8Array | null = null;
    try { const r = await fetch("https://protankr.com/icons/icon-email-black.png"); if (r.ok) logo = new Uint8Array(await r.arrayBuffer()); } catch { /* no logo */ }
    const pdf = await renderReportPdf(d, { logo });

    const message = `Attached is your ${clean(d.attached, 200)}. Save this email for your personal records and/or print the attachment to file.`;
    const from = process.env.INVITE_FROM_EMAIL ?? "noreply@protankr.com";
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from: `ProTankr <${from}>`, to: [email], subject: clean(d.subject, 200) || `ProTankr - ${clean(d.title, 80)}`,
        text: message, html: `<p style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#111111">${message.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`,
        attachments: [{ filename: `${clean(d.fileName, 100).replace(/[^A-Za-z0-9._-]+/g, "-") || "ProTankr-report"}.pdf`, content: Buffer.from(pdf).toString("base64") }],
      }),
    });
    if (!res.ok) return NextResponse.json({ error: `Couldn't send the email (${res.status}).` }, { status: 502 });
    return NextResponse.json({ ok: true, to: email });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
