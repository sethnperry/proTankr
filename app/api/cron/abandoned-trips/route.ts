// app/api/cron/abandoned-trips/route.ts
//
// Cancels abandoned loads and runs the Monday cancelled-loads report and cleanup. The five-minute hos-alerts
// job already calls this logic, so no new database schedule is needed; this route is for a manual run, with
// `Authorization: Bearer $CRON_SECRET`.
import { NextRequest, NextResponse } from "next/server";
import { runAbandonedTrips } from "@/lib/trips/abandonedServer";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }

async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "") !== secret) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  try { return NextResponse.json({ ok: true, ...(await runAbandonedTrips()) }); }
  catch (e) { console.warn("[cron] abandoned trips failed:", (e as Error).message); return NextResponse.json({ ok: false, error: "Run failed." }, { status: 500 }); }
}
