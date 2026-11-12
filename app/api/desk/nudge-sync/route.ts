// app/api/desk/nudge-sync/route.ts
//
// The Desk's "Ask phone to sync": pushes a notification to a driver telling their phone to send the work it has
// saved. The service worker also tells any open app window to sync right away. Company admins (for drivers in their
// company) and super admins only.

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/serviceClient";
import { sendPush } from "@/lib/push/send";

export const runtime = "nodejs";
const json = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: NextRequest) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const admin = getServiceSupabase();
  const { data: { user } } = token ? await admin.auth.getUser(token) : { data: { user: null } };
  if (!user) return json({ error: "Not signed in." }, 401);
  const body = (await req.json().catch(() => ({}))) as { userId?: string };
  const target = String(body.userId ?? "");
  if (!target) return json({ error: "Bad request." }, 400);

  const { data: sa } = await admin.from("super_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!sa) {
    const { data: theirs } = await admin.from("user_companies").select("company_id").eq("user_id", target);
    const ids = ((theirs ?? []) as { company_id: string }[]).map((r) => r.company_id);
    const { data: mine } = ids.length ? await admin.from("user_companies").select("role").eq("user_id", user.id).eq("role", "admin").in("company_id", ids) : { data: [] };
    if (!(mine ?? []).length) return json({ error: "Only an admin of this driver's company can do that." }, 403);
  }

  const { data: subs } = await admin.from("push_subscriptions").select("endpoint, p256dh, auth").eq("user_id", target);
  const sent = await sendPush((subs ?? []) as { endpoint: string; p256dh: string; auth: string }[], {
    title: "Send your saved work", body: "Open ProTankr to finish sending what's saved on your phone.", url: "/planner/home", tag: "desk-sync", sync: true,
  });
  return json({ sent });
}
