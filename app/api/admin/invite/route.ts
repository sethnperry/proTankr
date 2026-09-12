// app/api/admin/invite/route.ts
//
// Handles both new and existing users:
// - New user: inviteUserByEmail (creates account) + Resend custom email
// - Existing user: generateLink (magic link) + Resend custom email
//
// Required env vars:
//   SUPABASE_SERVICE_ROLE_KEY
//   NEXT_PUBLIC_SUPABASE_URL
//   NEXT_PUBLIC_APP_URL          (e.g. https://protankr.com)
//   RESEND_API_KEY               (from resend.com)
//   INVITE_FROM_EMAIL            (e.g. noreply@protankr.com — must be verified in Resend)

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@supabase/supabase-js";
import { isRole }                    from "@/lib/ui/driver/role";

export const runtime = "nodejs";

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars.");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function verifyAdmin(
  req: NextRequest,
  admin: ReturnType<typeof getAdmin>,
  companyId: string,
): Promise<boolean> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return false;
  // A super admin (the operator) can invite to ANY company -- the ProTankr
  // Dash lets them pick any company and add users to it, and the operator is
  // not necessarily a member of that company. Checked first so it doesn't
  // depend on a user_companies row existing for them.
  const { data: sa } = await admin
    .from("super_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (sa) return true;
  const { data: uc } = await admin
    .from("user_companies").select("role")
    .eq("user_id", user.id).eq("company_id", companyId).maybeSingle();
  return uc?.role === "admin";
}

// ─── Send email via Resend ────────────────────────────────────────────────────
async function sendInviteEmail(to: string, confirmUrl: string, companyName: string, code: string, installUrl: string) {
  const apiKey   = process.env.RESEND_API_KEY;
  const fromAddr = process.env.INVITE_FROM_EMAIL ?? "noreply@protankr.com";
  if (!apiKey) throw new Error("RESEND_API_KEY not set.");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: `ProTankr <${fromAddr}>`,
      to: [to],
      subject: `You've been invited to ${companyName} on ProTankr`,
      html: buildEmailHtml(confirmUrl, companyName, code, installUrl),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend error ${res.status}: ${body}`);
  }
}

// ─── POST /api/admin/invite ───────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { email, companyId, role = "driver", region } = await req.json() as {
      email: string; companyId: string; role?: string; region?: string;
    };
    if (!email || !companyId) {
      return NextResponse.json({ error: "email and companyId are required." }, { status: 400 });
    }
    if (!isRole(role)) {
      return NextResponse.json({ error: `Invalid role "${role}".` }, { status: 400 });
    }
    const regionClean = typeof region === "string" ? region.trim() : "";

    const admin = getAdmin();
    if (!await verifyAdmin(req, admin, companyId)) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { data: co } = await admin.from("companies").select("company_name")
      .eq("company_id", companyId).maybeSingle();
    const companyName = co?.company_name ?? "your company";

    const origin      = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://protankr.com";
    const redirectTo  = `${origin}/auth/confirm`;

    // ── Check if user already exists ────────────────────────────────────────
    const { data: existingList } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const existing = existingList?.users?.find(
      u => u.email?.toLowerCase() === email.toLowerCase()
    );

    let confirmUrl: string;
    let code: string; // the email_otp the driver can type into /login (most
                      // reliable path across Outlook/Gmail in-app browsers that
                      // can't open the app or hold a session)
    let invitedUserId: string | null = null; // resolved id, for the optional
                      // region write below

    // Both branches build confirmUrl from a token_hash pointing at our own
    // /auth/confirm route -- NOT Supabase's raw action_link, which points
    // at <project>.supabase.co/auth/v1/verify. That endpoint is a GET
    // request that consumes the one-time token on hit, so any link-scanner
    // that prefetches it (Outlook Safe Links, some corporate mail gateways)
    // silently burns the invite before the user ever taps it -- the exact
    // same class of bug already fixed for the Magic Link sign-in email
    // template (see CLAUDE.md's "magic link / login reliability" history).
    // /auth/confirm/page.tsx already expects `?token_hash=...&type=...` and
    // only consumes it via an explicit client-side verifyOtp() call, so
    // this is a drop-in fix, not a new mechanism.

    if (existing) {
      // User exists — generate a fresh magic link so they can log in.
      // generateLink() never sends an email itself either way.
      const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { redirectTo },
      });
      if (linkErr || !linkData?.properties?.hashed_token) {
        throw new Error(linkErr?.message ?? "Failed to generate login link.");
      }
      confirmUrl = `${redirectTo}?token_hash=${encodeURIComponent(linkData.properties.hashed_token)}&type=magiclink`;
      code = linkData.properties.email_otp ?? "";
      invitedUserId = existing.id;

      // Ensure they're in the company -- but do NOT silently overwrite the
      // role of someone who is ALREADY a member. An invite is an "add someone"
      // action; re-sending it (a common thing to do when the first email is
      // lost) must not quietly demote a lead/dispatch/admin back to the
      // default "driver". Role changes for existing members go through the
      // admin roster dropdown, not the invite endpoint.
      const { data: existingMembership } = await admin
        .from("user_companies").select("role")
        .eq("user_id", existing.id).eq("company_id", companyId).maybeSingle();
      if (!existingMembership) {
        await admin.from("user_companies").insert(
          { user_id: existing.id, company_id: companyId, role }
        );
      }

      // Set active_company_id so the app knows which company to load
      await admin.from("user_settings").upsert(
        { user_id: existing.id, active_company_id: companyId },
        { onConflict: "user_id" }
      );
    } else {
      // New user — generateLink({type:"invite"}) both creates the account
      // AND returns a link, without ever sending Supabase's own built-in
      // invite email the way inviteUserByEmail() unavoidably does (that API
      // has no flag to suppress it). Using generateLink directly here --
      // instead of calling inviteUserByEmail() and then generateLink() a
      // second time just to get a link, as before -- is what actually
      // stops Supabase's own (broken, uncustomized) invite email from
      // going out alongside our branded Resend one.
      const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
        type: "invite",
        email,
        options: { redirectTo, data: { company_id: companyId, role } },
      });
      if (linkErr || !linkData?.properties?.hashed_token) {
        throw new Error(linkErr?.message ?? "Failed to generate invite link.");
      }
      confirmUrl = `${redirectTo}?token_hash=${encodeURIComponent(linkData.properties.hashed_token)}&type=invite`;
      code = linkData.properties.email_otp ?? "";
      invitedUserId = linkData.user?.id ?? null;

      // Pre-create company membership + active company setting
      if (linkData.user?.id) {
        await admin.from("user_companies").upsert(
          { user_id: linkData.user.id, company_id: companyId, role },
          { onConflict: "user_id,company_id" }
        );
        await admin.from("user_settings").upsert(
          { user_id: linkData.user.id, active_company_id: companyId },
          { onConflict: "user_id" }
        );
      }
    }

    // ── Optional: stamp the driver's region at invite time ───────────────────
    // The equipment modal defaults its Region filter to the driver's own
    // profiles.region ("change the filter to see more, not less"), so setting
    // it here means the admin doesn't have to open the driver's profile after
    // inviting them. profiles.display_name is nullable, so a bare
    // {user_id, region} upsert is safe for a brand-new invitee whose profile
    // row doesn't exist yet. Best-effort: a region write must never fail the
    // invite itself.
    if (regionClean && invitedUserId) {
      try {
        await admin.from("profiles").upsert(
          { user_id: invitedUserId, region: regionClean },
          { onConflict: "user_id" },
        );
      } catch (e: any) {
        console.warn("[invite] region write failed:", e?.message ?? e);
      }
    }

    // ── Send our custom branded email ────────────────────────────────────────
    await sendInviteEmail(email, confirmUrl, companyName, code, `${origin}/install`);

    return NextResponse.json({ ok: true });

  } catch (e: any) {
    console.error("[invite] error:", e?.message ?? e);
    return NextResponse.json({ error: e?.message ?? "Internal error." }, { status: 500 });
  }
}


// ─── Email HTML ───────────────────────────────────────────────────────────────
// Mirrors the solo-invite email (app/api/superadmin/invite-solo/route.ts):
// lead with a sign-in CODE the driver types into /login -- the most reliable
// path across Outlook/Gmail in-app browsers that can't open the app or hold a
// session -- plus the one-page install guide, with the magic link kept only as
// a secondary fallback. Adds the fleet-specific "you've been added to {company}"
// context the solo email doesn't need. Code is grouped in two halves for
// readability whatever the OTP length (Supabase OTP length is a project setting
// -- 8 digits here, not the usual 6).
function buildEmailHtml(confirmUrl: string, companyName: string, code: string, installUrl: string): string {
  const codeDisplay = code ? `${code.slice(0, Math.ceil(code.length / 2))} ${code.slice(Math.ceil(code.length / 2))}`.trim() : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>You've been invited to ProTankr</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111111;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;background:#ffffff;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">

  <!-- Header -->
  <tr><td style="padding:0 0 24px;border-bottom:1px solid #e5e5e5;">
    <table cellpadding="0" cellspacing="0" width="100%"><tr>
      <td valign="middle">
        <div style="font-size:24px;font-weight:900;letter-spacing:-0.5px;color:#111111;white-space:nowrap;">ProTankr</div>
      </td>
      <td valign="middle" align="right" width="40">
        <img src="https://protankr.com/icons/icon-email-black.png" width="36" height="36" alt="ProTankr" style="display:block;" />
      </td>
    </tr></table>
  </td></tr>

  <!-- Body -->
  <tr><td style="padding:28px 0 8px;">
    <div style="font-size:17px;font-weight:700;color:#111111;margin-bottom:14px;line-height:1.4;">
      You've been added to<br><span style="color:#555555;">${companyName}</span>.
    </div>
    ${codeDisplay ? `
    <div style="font-size:11px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:#aaaaaa;margin-bottom:8px;">Your sign-in code</div>
    <div style="font-size:36px;font-weight:900;letter-spacing:6px;color:#111111;margin-bottom:6px;">${codeDisplay}</div>
    <p style="margin:0 0 24px;font-size:12px;color:#999999;">Enter this in the app to sign in. It expires in 1 hour.</p>` : ""}
  </td></tr>

  <!-- Get started -->
  <tr><td style="padding:0 0 24px;">
    <div style="font-size:10px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:#aaaaaa;margin-bottom:12px;">How to get started</div>
    <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:16px;"><tr>
      <td valign="top" width="26" style="font-size:14px;font-weight:900;color:#111;">1</td>
      <td style="font-size:14px;color:#444;line-height:1.5;">Add ProTankr to your phone's home screen &mdash; tap the button below for step-by-step help for your phone.</td>
    </tr></table>
    <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:16px;"><tr>
      <td valign="top" width="26" style="font-size:14px;font-weight:900;color:#111;">2</td>
      <td style="font-size:14px;color:#444;line-height:1.5;">Open <strong>ProTankr</strong> from your home screen.</td>
    </tr></table>
    <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;"><tr>
      <td valign="top" width="26" style="font-size:14px;font-weight:900;color:#111;">3</td>
      <td style="font-size:14px;color:#444;line-height:1.5;">Enter your email and the code above.</td>
    </tr></table>
    <table cellpadding="0" cellspacing="0" width="100%">
      <tr><td style="background:#111111;border-radius:12px;text-align:center;">
        <a href="${installUrl}" style="display:block;padding:15px 24px;font-size:15px;font-weight:800;color:#ffffff;text-decoration:none;">Add ProTankr to my phone &#8594;</a>
      </td></tr>
    </table>
  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:20px 0 0;border-top:1px solid #e5e5e5;">
    <p style="margin:0 0 6px;font-size:11px;color:#aaaaaa;line-height:1.6;">In a hurry? You can also <a href="${confirmUrl}" style="color:#888888;">tap here to open ProTankr in your browser</a> &mdash; but adding it to your home screen keeps you signed in.</p>
    <p style="margin:12px 0 0;font-size:11px;color:#aaaaaa;line-height:1.6;">If you didn't expect this, you can safely ignore it.</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}
