// app/api/admin/invite/route.ts
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ ok: true, route: "admin/invite" });
}

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const appUrl      = process.env.NEXT_PUBLIC_APP_URL ?? "";

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json(
        { error: "Server misconfiguration: SUPABASE_SERVICE_ROLE_KEY is not set." },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });

    const { email, companyId, role } = body;
    if (!email || !companyId || !role) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    // Get the caller's JWT from the Authorization header (sent by supabase-js client)
    const authHeader = req.headers.get("authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "").trim();

    if (!jwt) {
      return NextResponse.json({ error: "Not authenticated — no token." }, { status: 401 });
    }

    // Verify the JWT and get the user using the service role client
    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: { user }, error: userErr } = await supabaseAdmin.auth.getUser(jwt);
    if (userErr || !user) {
      return NextResponse.json({ error: "Not authenticated — invalid token." }, { status: 401 });
    }

    // Verify caller is admin of this company
    const { data: membership } = await supabaseAdmin
      .from("user_companies")
      .select("role")
      .eq("user_id", user.id)
      .eq("company_id", companyId)
      .maybeSingle();

    if (membership?.role !== "admin") {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    // Send the invite
    const { data: invite, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email.toLowerCase(),
      {
        redirectTo: `${appUrl}/join?company=${companyId}&role=${role}`,
        data: { pending_company_id: companyId, pending_role: role },
      }
    );

    if (inviteError) {
      // User already exists — add them to company directly
      if (inviteError.message?.includes("already registered") || (inviteError as any).status === 422) {
        const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
        const existing = users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
        if (existing) {
          await supabaseAdmin.from("user_companies").upsert(
            { user_id: existing.id, company_id: companyId, role },
            { onConflict: "user_id,company_id" }
          );
          return NextResponse.json({ ok: true, email, status: "added" });
        }
      }
      return NextResponse.json({ error: inviteError.message }, { status: 400 });
    }

    if (invite?.user?.id) {
      await supabaseAdmin.from("user_companies").upsert(
        { user_id: invite.user.id, company_id: companyId, role },
        { onConflict: "user_id,company_id" }
      );
    }

    return NextResponse.json({ ok: true, email });

  } catch (e: any) {
    console.error("[invite route]", e);
    return NextResponse.json({ error: e?.message ?? "Invite failed." }, { status: 500 });
  }
}
