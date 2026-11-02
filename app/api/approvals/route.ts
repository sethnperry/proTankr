// app/api/approvals/route.ts
//
// The approve and deny links' server side. GET shows what a link would do and changes nothing, so a mail
// scanner that fetches the page can't decide. POST is the deliberate tap. The emailed token is the only control.

import { NextRequest, NextResponse } from "next/server";
import { decideApproval, inspectApproval } from "@/lib/approvals/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    return NextResponse.json(await inspectApproval(req.nextUrl.searchParams.get("token")), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Couldn't check this link." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { token?: unknown };
    const r = await decideApproval(body.token);
    return NextResponse.json(r, { status: r.ok ? 200 : 409, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Couldn't record the decision." }, { status: 500 });
  }
}
