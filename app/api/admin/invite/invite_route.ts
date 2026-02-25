// app/api/admin/invite/route.ts
// Server-side only — uses service role key to send Supabase auth invites.
// Called by the Admin page when invite_user_to_company RPC returns status='pending'.

import { createClient } from "@supabase/supabase-js";
import { createSupabaseServer } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { email, companyId, role } = await req.json();

    if (!email || !companyId || !role) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    // Verify the caller is an authenticated admin of this company
    const supabaseAuth = await createSupabaseServer();
    const { data: { user } } = await supabaseAuth.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const { data: membership } = await supabaseAuth
      .from("user_companies")
      .select("role")
      .eq("user_id", user.id)
      .eq("company_id", companyId)
      .maybeSingle();

    if (membership?.role !== "admin") {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    // Use service role client to send the auth invite
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: invite, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email.toLowerCase(),
      {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/join?company=${companyId}&role=${role}`,
        data: { pending_company_id: companyId, pending_role: role },
      }
    );

    if (inviteError) {
      return NextResponse.json({ error: inviteError.message }, { status: 400 });
    }

    // Add to user_companies now (they may already exist via invite)
    if (invite?.user?.id) {
      await supabaseAdmin
        .from("user_companies")
        .upsert({
          user_id: invite.user.id,
          company_id: companyId,
          role,
        }, { onConflict: "user_id,company_id" });
    }

    return NextResponse.json({ ok: true, email });

  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Invite failed." }, { status: 500 });
  }
}
