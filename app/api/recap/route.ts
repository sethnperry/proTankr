// app/api/recap/route.ts
//
// The Weekly Recap's server actions. Admin and dispatch only (lead drivers and drivers never see it).
//   generate  build (or rebuild) a week and store it                     admin
//   email     email a stored week's PDF to chosen admin/dispatch users    admin, dispatch
//   settings  save the schedule, recipients and the time allowances       admin (every change is logged)
//   pdf       the stored week as a PDF download                          admin, dispatch

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServiceSupabase } from "@/lib/supabase/serviceClient";
import { DEFAULT_RECAP_SETTINGS } from "@/lib/recap/types";
import { emailRecap, generateWeeklyRecap, loadSettings, mondayOf, recapPdf } from "@/lib/recap/recapServer";
import type { Recap } from "@/lib/recap/report";

export const runtime = "nodejs";
export const maxDuration = 60;

const READ = new Set(["owner", "admin", "dispatch"]);
const WRITE = new Set(["owner", "admin"]);

export async function POST(req: NextRequest) {
  try {
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const caller = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const { data: u } = token ? await caller.auth.getUser(token) : { data: { user: null } };
    const me = u?.user;
    if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    const body = (await req.json().catch(() => ({}))) as { action?: string; companyId?: string; weekStart?: string; to?: string[]; settings?: Record<string, unknown> };
    const companyId = String(body.companyId ?? "");
    const admin = getServiceSupabase();
    const { data: mem } = await admin.from("user_companies").select("role").eq("company_id", companyId).eq("user_id", me.id).maybeSingle();
    const role = String((mem as { role?: string } | null)?.role ?? "");
    const { data: sa } = await admin.from("super_admins").select("user_id").eq("user_id", me.id).maybeSingle();
    const isSuper = !!sa;
    const canRead = isSuper || READ.has(role), canWrite = isSuper || WRITE.has(role);
    if (!canRead) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
    const week = /^\d{4}-\d{2}-\d{2}$/.test(String(body.weekStart ?? "")) ? mondayOf(String(body.weekStart)) : null;
    const action = String(body.action ?? "");

    if (action === "generate") {
      if (!canWrite || !week) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
      const s = await loadSettings(admin, companyId);
      // Only completed weeks (the Monday after the week ends has begun).
      if (Date.parse(`${week}T00:00:00Z`) + 7 * 86400_000 > Date.now() + 86400_000) return NextResponse.json({ error: "That week isn't over yet." }, { status: 400 });
      void s;
      const r = await generateWeeklyRecap(admin, companyId, week, me.id);
      return NextResponse.json({ ok: true, drivers: r.drivers.length });
    }

    if (action === "staff") {
      const { data: staff } = await admin.from("user_companies").select("user_id, role").eq("company_id", companyId).in("role", ["owner", "admin", "dispatch"]);
      const ids = ((staff ?? []) as { user_id: string }[]).map((x) => x.user_id);
      const { data: profs } = ids.length ? await admin.from("profiles").select("user_id, display_name").in("user_id", ids) : { data: [] };
      const nm = new Map(((profs ?? []) as { user_id: string; display_name: string | null }[]).map((p) => [p.user_id, p.display_name ?? ""]));
      const list: { name: string; email: string; role: string }[] = [];
      for (const st of (staff ?? []) as { user_id: string; role: string }[]) { const { data: au } = await admin.auth.admin.getUserById(st.user_id); const e = au?.user?.email; if (e) list.push({ name: nm.get(st.user_id) || e, email: e.toLowerCase(), role: st.role }); }
      return NextResponse.json({ ok: true, staff: list });
    }

    if (action === "email" || action === "pdf") {
      if (!week) return NextResponse.json({ error: "Pick a week." }, { status: 400 });
      const { data: row } = await admin.from("weekly_recaps").select("report").eq("company_id", companyId).eq("week_start", week).maybeSingle();
      if (!row) return NextResponse.json({ error: "That week hasn't been generated." }, { status: 404 });
      const report = (row as { report: Recap }).report;
      if (action === "pdf") {
        const pdf = await recapPdf(report);
        return new NextResponse(Buffer.from(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="WeeklyRecap-${week}.pdf"` } });
      }
      // Recipients come from company admin and dispatch users only, never a typed address.
      const { data: staff } = await admin.from("user_companies").select("user_id, role").eq("company_id", companyId).in("role", ["owner", "admin", "dispatch"]);
      const ids = new Set(((staff ?? []) as { user_id: string }[]).map((x) => x.user_id));
      const emails: string[] = [];
      for (const id of ids) { const { data: au } = await admin.auth.admin.getUserById(id); const e = au?.user?.email; if (e) emails.push(e.toLowerCase()); }
      const wanted = (body.to ?? []).map((x) => String(x).toLowerCase()).filter((x) => emails.includes(x));
      if (!wanted.length) return NextResponse.json({ error: "Pick at least one admin or dispatch user." }, { status: 400 });
      await emailRecap(report, wanted);
      return NextResponse.json({ ok: true, to: wanted });
    }

    if (action === "settings") {
      if (!canWrite) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
      const cur = await loadSettings(admin, companyId);
      const incoming = (body.settings ?? {}) as Record<string, unknown>;
      const allowances: Record<string, number> = { ...(cur.allowances as Record<string, number>) };
      for (const [k, v] of Object.entries(incoming.allowances ?? {})) if (k in DEFAULT_RECAP_SETTINGS && Number.isFinite(Number(v))) allowances[k] = Number(v);
      const changed = JSON.stringify(allowances) !== JSON.stringify(cur.allowances ?? {});
      const recipients = Array.isArray(incoming.recipients) ? (incoming.recipients as unknown[]).map((x) => String(x).trim().toLowerCase()).filter((x) => /^\S+@\S+\.\S+$/.test(x)).slice(0, 10) : cur.recipients;
      const next = {
        company_id: companyId, enabled: typeof incoming.enabled === "boolean" ? incoming.enabled : cur.enabled, recipients,
        tz: typeof incoming.tz === "string" && incoming.tz ? incoming.tz : cur.tz, send_at: typeof incoming.send_at === "string" && /^\d{2}:\d{2}$/.test(incoming.send_at) ? incoming.send_at : cur.send_at,
        allowances, version: changed ? cur.version + 1 : cur.version, updated_by: me.id, updated_at: new Date().toISOString(),
      };
      await admin.from("weekly_recap_settings").upsert({ ...next, last_for_week: cur.last_for_week });
      if (changed) await admin.from("weekly_recap_settings_log").insert({ company_id: companyId, changed_by: me.id, old_value: cur.allowances ?? {}, new_value: allowances });
      return NextResponse.json({ ok: true, version: next.version });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
