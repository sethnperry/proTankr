// app/api/telematics/my-login/route.ts
//
// A driver connects their own telematics login so their hours of service come from their own account.
// GET ?companyId=  -> { companyConnected, database, userName (stored, else employee number), connected, lastError }
// POST {companyId, userName, password} -> verify against the company's database, store encrypted, link
//      the driver's provider user to this member
// DELETE {companyId} -> forget it (hours fall back to the company login)

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/serviceClient";
import { geotabProvider } from "@/lib/telematics/geotab";
import { encryptSecret } from "@/lib/telematics/crypto";
import { TelematicsAuthError } from "@/lib/telematics/types";
import { callerId, companyRole } from "@/lib/telematics/server";

export const runtime = "nodejs";

async function gate(req: NextRequest, companyId: string | null) {
  const uid = await callerId(req);
  if (!uid) return { err: NextResponse.json({ error: "Not signed in." }, { status: 401 }) };
  if (!companyId) return { err: NextResponse.json({ error: "companyId is required." }, { status: 400 }) };
  const r = await companyRole(uid, companyId);
  if (!r.role && !r.superAdmin) return { err: NextResponse.json({ error: "Not in this company." }, { status: 403 }) };
  return { uid, companyId };
}

export async function GET(req: NextRequest) {
  const g = await gate(req, req.nextUrl.searchParams.get("companyId"));
  if ("err" in g) return g.err;
  const admin = getServiceSupabase();
  const [conn, mine, prof] = await Promise.all([
    admin.from("telematics_connections").select("database_name, status").eq("company_id", g.companyId).maybeSingle(),
    admin.from("telematics_driver_credentials").select("user_name, status, last_error").eq("company_id", g.companyId).eq("user_id", g.uid).maybeSingle(),
    admin.from("profiles").select("employee_number").eq("user_id", g.uid).maybeSingle(),
  ]);
  const c = conn.data as { database_name: string; status: string } | null;
  if (!c || c.status !== "active") return NextResponse.json({ companyConnected: false });
  const m = mine.data as { user_name: string; status: string; last_error: string | null } | null;
  return NextResponse.json({
    companyConnected: true, database: c.database_name,
    userName: m?.user_name ?? (prof.data as { employee_number?: string | null } | null)?.employee_number ?? "",
    connected: !!m && m.status === "active", lastError: m?.last_error ?? null,
  });
}

export async function POST(req: NextRequest) {
  const body: any = await req.json().catch(() => ({}));
  const g = await gate(req, body.companyId ?? null);
  if ("err" in g) return g.err;
  const userName = String(body.userName ?? "").trim();
  const password = String(body.password ?? "");
  if (!userName || !password) return NextResponse.json({ error: "Enter your user name and password." }, { status: 400 });
  const admin = getServiceSupabase();
  const { data: c } = await admin.from("telematics_connections").select("database_name, status").eq("company_id", g.companyId).maybeSingle();
  const conn = c as { database_name: string; status: string } | null;
  if (!conn || conn.status !== "active") return NextResponse.json({ error: "Your company hasn't connected telematics yet." }, { status: 400 });
  try {
    const prov = geotabProvider({ database: conn.database_name, userName, password });
    const pid = prov.selfUserId ? await prov.selfUserId(userName) : null;
    await admin.from("telematics_driver_credentials").upsert({
      company_id: g.companyId, user_id: g.uid, user_name: userName, credentials_enc: encryptSecret(password),
      provider_user_id: pid, status: "active", last_error: null, last_ok_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }, { onConflict: "company_id,user_id" });
    // This login is this person: point the company's driver map at it.
    if (pid) {
      await admin.from("telematics_driver_map").delete().eq("company_id", g.companyId).eq("user_id", g.uid);
      await admin.from("telematics_driver_map").delete().eq("company_id", g.companyId).eq("provider_user_id", pid);
      await admin.from("telematics_driver_map").insert({ company_id: g.companyId, provider_user_id: pid, user_id: g.uid, driver_name: userName, matched_by: "own_login" });
    }
    return NextResponse.json({ ok: true, linked: !!pid });
  } catch (e) {
    const auth = e instanceof TelematicsAuthError;
    return NextResponse.json({ error: auth ? "That user name or password didn't work." : (e as Error).message }, { status: auth ? 401 : 502 });
  }
}

export async function DELETE(req: NextRequest) {
  const body: any = await req.json().catch(() => ({}));
  const g = await gate(req, body.companyId ?? null);
  if ("err" in g) return g.err;
  await getServiceSupabase().from("telematics_driver_credentials").delete().eq("company_id", g.companyId).eq("user_id", g.uid);
  return NextResponse.json({ ok: true });
}
