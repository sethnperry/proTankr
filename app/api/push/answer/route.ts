// app/api/push/answer/route.ts
//
// A button tapped on a stop notification ("Arrived" / "Delay", "Yes" / "No", or a reason). The
// service worker posts the notification's answer id and the button; no sign-in is needed because
// the id is a random uuid that only reached that driver's device. See lib/push/stopAnswerServer.ts.

import { NextRequest, NextResponse } from "next/server";
import { handleStopAnswer } from "@/lib/push/stopAnswerServer";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  let id = "", answer = "";
  try { const b = await req.json(); id = String(b?.id ?? ""); answer = String(b?.answer ?? ""); } catch { /* bad body */ }
  if (!UUID.test(id) || !answer) return NextResponse.json({ error: "bad request" }, { status: 400 });
  try {
    const r = await handleStopAnswer(id, answer);
    return NextResponse.json({ ok: true, recorded: r.recorded });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
