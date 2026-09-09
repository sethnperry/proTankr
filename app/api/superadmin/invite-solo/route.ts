// app/api/superadmin/invite-solo/route.ts
//
// Super-admin-only: invite a NEW solo (independent) driver. Unlike
// /api/admin/invite (which adds a user to an EXISTING company as a member),
// this provisions the invitee their OWN solo company and records an
// entitlement row -- access is invite-only via the super admin for now, with
// a Free/Paid toggle that records intent for future billing (see the
// 20260909010000_solo_invite_entitlement migration).
//
// Required env vars:
//   SUPABASE_SERVICE_ROLE_KEY
//   NEXT_PUBLIC_SUPABASE_URL
//   NEXT_PUBLIC_SUPABASE_ANON_KEY
//   NEXT_PUBLIC_APP_URL          (e.g. https://protankr.com)
//   RESEND_API_KEY
//   INVITE_FROM_EMAIL            (e.g. noreply@protankr.com -- verified in Resend)

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@supabase/supabase-js";

export const runtime = "nodejs";

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars.");
  return createClient(url, key, { auth: { persistSession: false } });
}

// A client acting AS the caller (their JWT), so the admin_invite_solo_user
// RPC's own is_super_admin() gate authorizes against the real caller -- a
// second, in-DB check on top of the route's super_admins lookup below.
function getCallerClient(token: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

async function sendEmail(to: string, confirmUrl: string, code: string, installUrl: string) {
  const apiKey   = process.env.RESEND_API_KEY;
  const fromAddr = process.env.INVITE_FROM_EMAIL ?? "noreply@protankr.com";
  if (!apiKey) throw new Error("RESEND_API_KEY not set.");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({
      from: `ProTankr <${fromAddr}>`,
      to: [to],
      subject: "Your ProTankr sign-in code",
      html: buildEmailHtml(confirmUrl, code, installUrl),
    }),
  });
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
}

export async function POST(req: NextRequest) {
  try {
    const { email, comped } = await req.json() as { email?: string; comped?: boolean };
    if (!email) return NextResponse.json({ error: "email is required." }, { status: 400 });
    const isComped = comped === true;

    const admin = getAdmin();

    // ── Super-admin gate ────────────────────────────────────────────────────
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const { data: { user: caller } } = await admin.auth.getUser(token);
    if (!caller) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const { data: sa } = await admin.from("super_admins").select("user_id").eq("user_id", caller.id).maybeSingle();
    if (!sa) return NextResponse.json({ error: "Super admin only." }, { status: 403 });

    const origin     = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://protankr.com";
    const redirectTo = `${origin}/auth/confirm`;

    // ── Create or find the invitee, get a consuming-safe token_hash link ─────
    // token_hash pointing at our own /auth/confirm (not Supabase's raw
    // action_link, which a link-scanner would burn on prefetch) -- same
    // mechanic as /api/admin/invite.
    const { data: existingList } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const existing = existingList?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());

    let userId: string;
    let confirmUrl: string;
    let code: string; // the 6-digit email_otp the driver types into the app
    if (existing) {
      userId = existing.id;
      const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
        type: "magiclink", email, options: { redirectTo },
      });
      if (linkErr || !linkData?.properties?.hashed_token) throw new Error(linkErr?.message ?? "Failed to generate login link.");
      confirmUrl = `${redirectTo}?token_hash=${encodeURIComponent(linkData.properties.hashed_token)}&type=magiclink`;
      code = linkData.properties.email_otp ?? "";
    } else {
      const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
        type: "invite", email, options: { redirectTo },
      });
      if (linkErr || !linkData?.properties?.hashed_token || !linkData.user?.id) throw new Error(linkErr?.message ?? "Failed to generate invite link.");
      userId = linkData.user.id;
      confirmUrl = `${redirectTo}?token_hash=${encodeURIComponent(linkData.properties.hashed_token)}&type=invite`;
      code = linkData.properties.email_otp ?? "";
    }

    // ── Provision their solo company + entitlement (acting as the caller so
    //    the RPC's is_super_admin() gate authorizes correctly) ───────────────
    const caller_ = getCallerClient(token);
    const { error: rpcErr } = await caller_.rpc("admin_invite_solo_user", { p_user_id: userId, p_comped: isComped });
    if (rpcErr) throw new Error(rpcErr.message);

    await sendEmail(email, confirmUrl, code, `${origin}/install`);
    return NextResponse.json({ ok: true, comped: isComped });
  } catch (e: any) {
    console.error("[invite-solo] error:", e?.message ?? e);
    return NextResponse.json({ error: e?.message ?? "Internal error." }, { status: 500 });
  }
}

function buildEmailHtml(confirmUrl: string, code: string, installUrl: string): string {
  // Reliable-everywhere flow: a CODE the driver types into the app (never opens
  // in the wrong browser / never loses its session like a link can), plus a
  // one-page install guide. The magic link stays as a secondary fallback.
  // Group into two halves for readability, whatever the OTP length (Supabase
  // OTP length is a project setting -- 8 digits here, not the usual 6).
  const codeDisplay = code ? `${code.slice(0, Math.ceil(code.length / 2))} ${code.slice(Math.ceil(code.length / 2))}`.trim() : "";
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Your ProTankr sign-in code</title></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111111;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;background:#ffffff;"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
  <tr><td style="padding:0 0 24px;border-bottom:1px solid #e5e5e5;">
    <table cellpadding="0" cellspacing="0" width="100%"><tr>
      <td valign="middle"><div style="font-size:24px;font-weight:900;letter-spacing:-0.5px;color:#111111;">ProTankr</div></td>
      <td valign="middle" align="right" width="40"><img src="https://protankr.com/icons/icon-email-black.png" width="36" height="36" alt="ProTankr" style="display:block;" /></td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:28px 0 8px;">
    <div style="font-size:17px;font-weight:700;color:#111111;margin-bottom:14px;line-height:1.4;">Your ProTankr account is ready.</div>
    ${codeDisplay ? `
    <div style="font-size:11px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:#aaaaaa;margin-bottom:8px;">Your sign-in code</div>
    <div style="font-size:36px;font-weight:900;letter-spacing:6px;color:#111111;margin-bottom:6px;">${codeDisplay}</div>
    <p style="margin:0 0 24px;font-size:12px;color:#999999;">Enter this in the app to sign in. It expires in 1 hour.</p>` : ""}
  </td></tr>
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
  <tr><td style="padding:20px 0 0;border-top:1px solid #e5e5e5;">
    <p style="margin:0 0 6px;font-size:11px;color:#aaaaaa;line-height:1.6;">In a hurry? You can also <a href="${confirmUrl}" style="color:#888888;">tap here to open ProTankr in your browser</a> &mdash; but adding it to your home screen keeps you signed in.</p>
    <p style="margin:12px 0 0;font-size:11px;color:#aaaaaa;line-height:1.6;">If you didn't expect this, you can safely ignore it.</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}
