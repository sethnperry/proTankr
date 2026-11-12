// app/api/errors/sync-cleared/route.ts
//
// A phone that had stuck writes reports that it has now sent them all, so the Desk's "Phone can't sync" entries for
// that driver close on their own. Only ever touches the signed-in user's own sync_stuck entries.

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/serviceClient";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const admin = getServiceSupabase();
  const { data: { user } } = token ? await admin.auth.getUser(token) : { data: { user: null } };
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  await admin.from("app_errors").update({ resolved_at: new Date().toISOString(), resolved_by: null }).eq("user_id", user.id).eq("kind", "sync_stuck").is("resolved_at", null);
  return NextResponse.json({ ok: true });
}
