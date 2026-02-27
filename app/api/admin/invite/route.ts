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
    const normalizedEmail = email.toLowerCase();

    // Check if user already exists in auth
    const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    const existingUser = users?.find(u => u.email?.toLowerCase() === normalizedEmail);

    if (existingUser) {
      // Delete the auth account so inviteUserByEmail works and sends the email.
      // App data (profiles, load_log, driver cards etc.) is preserved — those tables
      // use ON DELETE CASCADE only for user_companies, not the core data tables.
      // The new auth account will get a new UUID, so we need to migrate the old UUID.
      const oldUserId = existingUser.id;

      // Delete old auth account
      const { error: deleteErr } = await supabaseAdmin.auth.admin.deleteUser(oldUserId);
      if (deleteErr) {
        console.error("[invite] Failed to delete old auth user:", deleteErr.message);
        return NextResponse.json({ error: `Could not re-invite user: ${deleteErr.message}` }, { status: 500 });
      }
    }

    // Send invite — works for both new users and re-invites (after deletion above)
    const { data: invite, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      normalizedEmail,
      {
        redirectTo,
        data: { pending_company_id: companyId, pending_role: role },
      }
    );

    if (inviteError) {
      return NextResponse.json({ error: inviteError.message }, { status: 400 });
    }

    // Pre-create company membership with the new user ID
    if (invite?.user?.id) {
      await supabaseAdmin.from("user_companies").upsert(
        { user_id: invite.user.id, company_id: companyId, role },
        { onConflict: "user_id,company_id" }
      );

      // If there was an old user ID, migrate their profile row to the new UUID
      // so their driver profile, load history etc. all carry over
      if (existingUser && existingUser.id !== invite.user.id) {
        const newUserId = invite.user.id;
        const oldUserId = existingUser.id;

        // Update profiles
        await supabaseAdmin
          .from("profiles")
          .update({ user_id: newUserId })
          .eq("user_id", oldUserId);

        // Update driver cards
        for (const table of ["driver_licenses", "driver_medical_cards", "driver_twic_cards", "driver_port_ids"]) {
          await supabaseAdmin.from(table).update({ user_id: newUserId }).eq("user_id", oldUserId);
        }

        // Update terminal_access
        await supabaseAdmin
          .from("terminal_access")
          .update({ user_id: newUserId })
          .eq("user_id", oldUserId);

        // Note: load_log rows reference user_id but are historical —
        // update them too so My Loads history is preserved
        await supabaseAdmin
          .from("load_log")
          .update({ user_id: newUserId })
          .eq("user_id", oldUserId);
      }
    }

    return NextResponse.json({ ok: true, email: normalizedEmail, status: "invited" });

  } catch (e: any) {
    console.error("[invite route]", e);
    return NextResponse.json({ error: e?.message ?? "Invite failed." }, { status: 500 });
  }
}
