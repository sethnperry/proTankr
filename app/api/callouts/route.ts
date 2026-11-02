// app/api/callouts/route.ts
//
// Sends the email for a call-out event (created, edited, withdrawn) to dispatch and the regional manager, once per
// event. The phone writes the call-out through the offline store first; this opens it as the signed-in user (RLS:
// the driver it is for, or company staff) and routes the email by the driver's region, local area and the
// call-out's division (lib/callouts). When dispatch made the change for a driver it reads as a correction and the
// driver is emailed as well. A failed or unroutable email goes to the error log, so the Desk shows it.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServiceSupabase } from "@/lib/supabase/serviceClient";
import { buildCalloutEmail, resolveRoutes, type CalloutEvent, type CalloutRoute, type CalloutRow } from "@/lib/callouts/callout";
import { logServerError } from "@/lib/errors/server";

export const runtime = "nodejs";
const json = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: { "Cache-Control": "no-store" } });
const EVENTS: CalloutEvent[] = ["created", "edited", "withdrawn"];

export async function POST(req: NextRequest) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !anon) return json({ error: "Not signed in." }, 401);
  const user = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: u } = await user.auth.getUser(token);
  if (!u?.user) return json({ error: "Not signed in." }, 401);

  const body = (await req.json().catch(() => ({}))) as { calloutId?: string; event?: string; tz?: string };
  const event = body.event as CalloutEvent;
  if (!body.calloutId || !EVENTS.includes(event)) return json({ error: "Bad request." }, 400);
  const tz = typeof body.tz === "string" && body.tz ? body.tz : "America/New_York";

  const { data: row } = await user.from("callouts").select("*").eq("callout_id", body.calloutId).maybeSingle();
  const c = row as (CalloutRow & { notified?: Record<string, string>; updated_at?: string }) | null;
  if (!c) return json({ sent: false, reason: "not_synced" }); // the phone hasn't sent it yet: try again
  const marker = event === "created" ? "created" : `${event}@${c.updated_at ?? ""}`;
  if (c.notified?.[marker]) return json({ sent: true, already: true });

  const admin = getServiceSupabase();
  const { data: rt } = await admin.from("callout_routes").select("route_id, kind, email, region, local_area, division").eq("company_id", c.company_id);
  const to = resolveRoutes((rt ?? []) as CalloutRoute[], { region: c.region, localArea: c.local_area, division: c.division });
  const byDispatch = u.user.id !== c.user_id;
  // When dispatch entered or changed it for the driver, the driver gets the email too.
  let driverEmail: string | null = null;
  if (byDispatch) { const { data: du } = await admin.auth.admin.getUserById(c.user_id); driverEmail = du?.user?.email ?? null; }
  const recipients = [...new Set([...to.dispatch, ...to.manager, ...(driverEmail ? [driverEmail] : [])].map((e) => e.toLowerCase()))];
  if (!recipients.length) {
    await logServerError({ companyId: c.company_id, userId: c.user_id, kind: "send_failed", message: "A call-out was made but no call-out email is set up for it. Add one in Call-out routing.", payload: { callout_id: c.callout_id } }, { dedupeMinutes: 60 });
    return json({ sent: false, reason: "no_recipients" });
  }
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    await logServerError({ companyId: c.company_id, userId: c.user_id, kind: "send_failed", message: "Call-out email not sent: RESEND_API_KEY is not set.", payload: { callout_id: c.callout_id } }, { dedupeMinutes: 60 });
    return json({ sent: false, reason: "email_unavailable" });
  }

  const names = new Map<string, string>();
  const { data: profs } = await admin.from("profiles").select("user_id, display_name").in("user_id", [c.user_id, u.user.id]);
  for (const p of (profs ?? []) as { user_id: string; display_name: string | null }[]) names.set(p.user_id, p.display_name ?? "");
  const driverName = names.get(c.user_id) || "A driver";
  const mail = buildCalloutEmail({ event, callout: c, driverName, actorName: names.get(u.user.id) || "Dispatch", byDispatch, tz });
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ from: `ProTankr <${process.env.INVITE_FROM_EMAIL ?? "noreply@protankr.com"}>`, to: recipients, subject: mail.subject, html: mail.html, text: mail.text }),
    });
    if (!res.ok) throw new Error(`Resend answered ${res.status}`);
    await admin.from("callouts").update({ notified: { ...(c.notified ?? {}), [marker]: new Date().toISOString() } }).eq("callout_id", c.callout_id);
    return json({ sent: true });
  } catch (e: any) {
    await logServerError({ companyId: c.company_id, userId: c.user_id, kind: "send_failed", message: `Call-out email failed: ${e?.message ?? e}`, payload: { callout_id: c.callout_id, event } });
    return json({ sent: false, reason: "failed" });
  }
}
