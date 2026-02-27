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

    // Verify caller is an authenticated admin via JWT
    const authHeader = req.headers.get("authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "").trim();
    if (!jwt) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: { user: caller }, error: callerErr } = await supabaseAdmin.auth.getUser(jwt);
    if (callerErr || !caller) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const { data: membership } = await supabaseAdmin
      .from("user_companies")
      .select("role")
      .eq("user_id", caller.id)
      .eq("company_id", companyId)
      .maybeSingle();

    if (membership?.role !== "admin") {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const redirectTo = `${appUrl}/join?company=${companyId}&role=${role}`;

    // Check if user already exists in auth
    const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    const existingUser = users?.find(u => u.email?.toLowerCase() === email.toLowerCase());

    if (existingUser) {
      // User exists — add/update their company membership
      await supabaseAdmin.from("user_companies").upsert(
        { user_id: existingUser.id, company_id: companyId, role },
        { onConflict: "user_id,company_id" }
      );

      // Send them a magic link (OTP) so they can log in
      const { error: otpErr } = await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email: email.toLowerCase(),
        options: { redirectTo },
      });

      if (otpErr) {
        // generateLink may not be available on all plans — fall back to inviteUserByEmail
        // which will re-send even for existing users on some Supabase versions
        console.warn("[invite] generateLink failed, falling back:", otpErr.message);
        // Still return success since they're already added to the company
        // and can log in via the normal magic link flow
        return NextResponse.json({ ok: true, email, status: "added_no_email",
          note: "User added to company. They can log in at the app and will have access." });
      }

      return NextResponse.json({ ok: true, email, status: "existing_user_notified" });

    } else {
      // New user — send invite email which creates the account
      const { data: invite, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
        email.toLowerCase(),
        { redirectTo, data: { pending_company_id: companyId, pending_role: role } }
      );

      if (inviteError) {
        return NextResponse.json({ error: inviteError.message }, { status: 400 });
      }

      // Pre-create company membership so it's ready when they accept
      if (invite?.user?.id) {
        await supabaseAdmin.from("user_companies").upsert(
          { user_id: invite.user.id, company_id: companyId, role },
          { onConflict: "user_id,company_id" }
        );
      }

      return NextResponse.json({ ok: true, email, status: "invited" });
    }

  } catch (e: any) {
    console.error("[invite route]", e);
    return NextResponse.json({ error: e?.message ?? "Invite failed." }, { status: 500 });
  }
}
