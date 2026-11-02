// app/api/cron/notifications/route.ts
//
// The scheduler's tick: sends every reminder and recap that is due (notification_schedules). Run every few
// minutes by a database schedule, with `Authorization: Bearer $CRON_SECRET`, like the other cron routes. The
// existing five-minute hos-alerts job also calls it, so no new database schedule is needed; this route is for a
// manual run.

import { NextRequest, NextResponse } from "next/server";
import { runNotifications } from "@/lib/notify/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }

async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "") !== secret) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, ...(await runNotifications()) });
  } catch (e) {
    console.warn("[cron] notifications failed:", (e as Error).message);
    return NextResponse.json({ ok: false, error: "Run failed." }, { status: 500 });
  }
}
