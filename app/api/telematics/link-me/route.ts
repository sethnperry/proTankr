// app/api/telematics/link-me/route.ts
//
// POST { companyId, userId? } -> { linked: boolean }
// Links the caller to their Geotab driver (employee number, sign-in email, then name). Called when
// someone joins a company or saves their profile. Members only; a no-op without a connection.
// With userId, an admin/dispatch/lead links that member instead (after editing their profile).

import { NextRequest, NextResponse } from "next/server";
import { autoLinkDriver, callerId, companyRole, isCompanyAdmin } from "@/lib/telematics/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const uid = await callerId(req);
  if (!uid) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body: any = await req.json().catch(() => ({}));
  const companyId = typeof body.companyId === "string" ? body.companyId : "";
  if (!companyId) return NextResponse.json({ error: "companyId is required." }, { status: 400 });
  const r = await companyRole(uid, companyId);
  if (!r.role) return NextResponse.json({ error: "Not in this company." }, { status: 403 });
  let target = uid;
  if (typeof body.userId === "string" && body.userId && body.userId !== uid) {
    if (!(isCompanyAdmin(r) || r.role === "dispatch" || r.role === "lead")) return NextResponse.json({ error: "Staff only." }, { status: 403 });
    target = body.userId;
  }
  try {
    return NextResponse.json({ linked: !!(await autoLinkDriver(companyId, target, true)) });
  } catch (e) {
    console.warn("[telematics] link-me failed:", (e as Error).message);
    return NextResponse.json({ linked: false });
  }
}
