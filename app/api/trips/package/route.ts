// app/api/trips/package/route.ts
//
// Emails a trip package (cover, PTD, BOLs, receipts) as one PDF. Who may ask: the trip's driver, or company staff.
// "auto" goes only to the driver's own address, once per trip, and only when their profile toggle is on.
// "manual" goes to up to three addresses the sender types (their own included), with a daily limit.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServiceSupabase } from "@/lib/supabase/serviceClient";
import { loadPackageItems, loadPtdBundle } from "@/lib/trips/packageServer";
import { renderTripPackage } from "@/lib/trips/tripPackage";
import { ptdCode } from "@/lib/trips/code39";

export const runtime = "nodejs";
export const maxDuration = 60;

const STAFF = new Set(["owner", "admin", "lead", "dispatch"]);
const MAX_MANUAL_PER_DAY = 25;

export async function POST(req: NextRequest) {
  try {
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    const caller = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const { data: u } = await caller.auth.getUser(token);
    const me = u?.user;
    if (!me?.email) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as { tripId?: string; mode?: string; to?: string[] };
    const tripId = String(body.tripId ?? "");
    const mode = body.mode === "auto" ? "auto" : "manual";
    if (!/^[0-9a-f-]{36}$/i.test(tripId)) return NextResponse.json({ error: "Bad trip." }, { status: 400 });

    const admin = getServiceSupabase();
    const bundle = await loadPtdBundle(admin, tripId);
    if (!bundle) return NextResponse.json({ error: "Trip not found." }, { status: 404 });
    const trip = bundle.trip;
    const { data: mem } = await admin.from("user_companies").select("role").eq("company_id", trip.company_id).eq("user_id", me.id).maybeSingle();
    const isDriver = trip.driver_id === me.id;
    if (!mem || (!isDriver && !STAFF.has(String((mem as { role: string }).role)))) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    let to: string[] = [];
    if (mode === "auto") {
      if (!isDriver) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
      const { data: prof } = await admin.from("profiles").select("email_trip_package").eq("user_id", me.id).maybeSingle();
      if (!(prof as { email_trip_package?: boolean } | null)?.email_trip_package) return NextResponse.json({ ok: true, skipped: "off" });
      const { count } = await admin.from("trip_package_log").select("log_id", { count: "exact", head: true }).eq("trip_id", tripId).eq("user_id", me.id).eq("mode", "auto");
      if ((count ?? 0) > 0) return NextResponse.json({ ok: true, skipped: "already" });
      to = [me.email];
    } else {
      const wanted = [...new Set((body.to ?? []).map((x) => String(x).trim().toLowerCase()).filter((x) => /^\S+@\S+\.\S+$/.test(x)))].slice(0, 3);
      if (!wanted.length) return NextResponse.json({ error: "Enter at least one email address." }, { status: 400 });
      const since = new Date(Date.now() - 86400_000).toISOString();
      const { count } = await admin.from("trip_package_log").select("log_id", { count: "exact", head: true }).eq("user_id", me.id).eq("mode", "manual").gte("sent_at", since);
      if ((count ?? 0) >= MAX_MANUAL_PER_DAY) return NextResponse.json({ error: "Daily limit reached. Try again tomorrow." }, { status: 429 });
      to = wanted;
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Email isn't set up." }, { status: 500 });
    const items = await loadPackageItems(admin, trip, bundle.bols);
    const pdf = await renderTripPackage({ ptd: bundle.ptd, driverName: bundle.driverName, truckName: bundle.truckName, trailerName: bundle.trailerName, items, generatedAt: new Date() });
    const size = pdf.byteLength;
    if (size > 30 * 1024 * 1024) return NextResponse.json({ error: "That package is too large to email." }, { status: 413 });

    const order = bundle.ptd.orderNumbers[0] ?? ptdCode(tripId);
    const from = process.env.INVITE_FROM_EMAIL ?? "noreply@protankr.com";
    const text = `Trip package for order ${order}${bundle.driverName ? `, driver ${bundle.driverName}` : ""}. The cover lists everything collected; the PTD, BOLs and receipts follow.`;
    for (const addr of to) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          from: `ProTankr <${from}>`, to: [addr], subject: `Trip package - Order ${order}`, text,
          html: `<p style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#111111">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`,
          attachments: [{ filename: `Trip-${String(order).replace(/[^A-Za-z0-9._-]+/g, "-")}.pdf`, content: Buffer.from(pdf).toString("base64") }],
        }),
      });
      if (!res.ok) return NextResponse.json({ error: `Couldn't send the email (${res.status}).` }, { status: 502 });
    }
    await admin.from("trip_package_log").insert({ company_id: trip.company_id, trip_id: tripId, user_id: me.id, mode, recipients: to.length });
    return NextResponse.json({ ok: true, to, items: items.length });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
