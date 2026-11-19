// app/api/squawk/push/route.ts
//
// POST { id } -> push a Squawk message the caller just sent to everyone in its channel. Only the sender may call it.

import { NextRequest, NextResponse } from "next/server";
import { callerId } from "@/lib/telematics/server";
import { pushSquawkMessage } from "@/lib/squawk/squawkPush";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const uid = await callerId(req);
  if (!uid) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body: any = await req.json().catch(() => ({}));
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });
  const sent = await pushSquawkMessage(id, uid).catch(() => 0);
  return NextResponse.json({ ok: true, sent });
}
