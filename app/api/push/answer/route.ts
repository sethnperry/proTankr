// app/api/push/answer/route.ts
//
// A button tapped on a "Did you arrive?" / "Did you load here?" notification. The service worker
// posts the notification's answer id and the button; no sign-in is needed because the id is a random
// uuid that only reached that driver's device. Records the answer once; the app applies it later.

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/serviceClient";

const OK = new Set(["arrived", "delay", "yes", "no"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  let id = "", answer = "";
  try { const b = await req.json(); id = String(b?.id ?? ""); answer = String(b?.answer ?? ""); } catch { /* bad body */ }
  if (!UUID.test(id) || !OK.has(answer)) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const admin = getServiceSupabase();
  const { data, error } = await admin.from("stop_answers")
    .update({ answer, answered_at: new Date().toISOString() })
    .eq("id", id).is("answer", null).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, recorded: !!data });
}
