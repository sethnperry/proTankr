// app/api/terminal-reports/push/route.ts
//
// POST -> push any terminal reports that haven't been pushed yet, right now. The app calls it just after a driver posts
// a report so the other trucks hear at once instead of on the next 5-minute tick. Signed-in callers only.

import { NextRequest, NextResponse } from "next/server";
import { callerId } from "@/lib/auth/server";
import { pushTerminalReports } from "@/lib/push/terminalReportPush";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const uid = await callerId(req);
  if (!uid) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const sent = await pushTerminalReports().catch(() => 0);
  return NextResponse.json({ ok: true, sent });
}
