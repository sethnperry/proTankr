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

async function sendEmail(to: string, confirmUrl: string) {
  const apiKey   = process.env.RESEND_API_KEY;
  const fromAddr = process.env.INVITE_FROM_EMAIL ?? "noreply@protankr.com";
  if (!apiKey) throw new Error("RESEND_API_KEY not set.");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({
      from: `ProTankr <${fromAddr}>`,
      to: [to],
      subject: "Your ProTankr account is ready",
      html: buildEmailHtml(confirmUrl),
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
    if (existing) {
      userId = existing.id;
      const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
        type: "magiclink", email, options: { redirectTo },
      });
      if (linkErr || !linkData?.properties?.hashed_token) throw new Error(linkErr?.message ?? "Failed to generate login link.");
      confirmUrl = `${redirectTo}?token_hash=${encodeURIComponent(linkData.properties.hashed_token)}&type=magiclink`;
    } else {
      const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
        type: "invite", email, options: { redirectTo },
      });
      if (linkErr || !linkData?.properties?.hashed_token || !linkData.user?.id) throw new Error(linkErr?.message ?? "Failed to generate invite link.");
      userId = linkData.user.id;
      confirmUrl = `${redirectTo}?token_hash=${encodeURIComponent(linkData.properties.hashed_token)}&type=invite`;
    }

    // ── Provision their solo company + entitlement (acting as the caller so
    //    the RPC's is_super_admin() gate authorizes correctly) ───────────────
    const caller_ = getCallerClient(token);
    const { error: rpcErr } = await caller_.rpc("admin_invite_solo_user", { p_user_id: userId, p_comped: isComped });
    if (rpcErr) throw new Error(rpcErr.message);

    await sendEmail(email, confirmUrl);
    return NextResponse.json({ ok: true, comped: isComped });
  } catch (e: any) {
    console.error("[invite-solo] error:", e?.message ?? e);
    return NextResponse.json({ error: e?.message ?? "Internal error." }, { status: 500 });
  }
}

function buildEmailHtml(confirmUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Your ProTankr account is ready</title></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111111;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;background:#ffffff;"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
  <tr><td style="padding:0 0 24px;border-bottom:1px solid #e5e5e5;">
    <table cellpadding="0" cellspacing="0" width="100%"><tr>
      <td valign="middle"><div style="font-size:24px;font-weight:900;letter-spacing:-0.5px;color:#111111;">ProTankr</div></td>
      <td valign="middle" align="right" width="40"><img src="https://protankr.com/icons/icon-email-black.png" width="36" height="36" alt="ProTankr" style="display:block;" /></td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:28px 0 24px;">
    <div style="font-size:17px;font-weight:700;color:#111111;margin-bottom:8px;line-height:1.4;">Your ProTankr account is ready.</div>
    <p style="margin:0 0 24px;font-size:14px;color:#666666;line-height:1.6;">
      Tap the button below to sign in and set up your truck. The link logs you in automatically &mdash; no password needed.
    </p>
    <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:32px;">
      <tr><td style="background:#111111;border-radius:12px;text-align:center;">
        <a href="${confirmUrl}" style="display:block;padding:15px 24px;font-size:15px;font-weight:800;color:#ffffff;text-decoration:none;">Open ProTankr &#8594;</a>
      </td></tr>
    </table>
    <div style="border-top:1px solid #e5e5e5;padding-top:20px;">
      <div style="font-size:10px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:#aaaaaa;margin-bottom:16px;">Save it to your home screen</div>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:14px;">
        <tr><td style="font-size:12px;font-weight:700;color:#444444;padding-bottom:4px;">Android / Chrome</td></tr>
        <tr><td style="font-size:12px;color:#888888;line-height:1.8;">Tap the three-dot menu &rsaquo; <span style="color:#333333;font-weight:600;">Add to Home screen</span> &rsaquo; <span style="color:#333333;font-weight:600;">Install app</span>.</td></tr>
      </table>
      <table cellpadding="0" cellspacing="0" width="100%">
        <tr><td style="font-size:12px;font-weight:700;color:#444444;padding-bottom:4px;">iPhone / Safari</td></tr>
        <tr><td style="font-size:12px;color:#888888;line-height:1.8;">Open in <span style="color:#333333;font-weight:600;">Safari</span>, then tap <span style="color:#333333;font-weight:600;">Share</span> &rsaquo; <span style="color:#333333;font-weight:600;">Add to Home Screen</span>.</td></tr>
      </table>
    </div>
  </td></tr>
  <tr><td style="padding:20px 0 0;border-top:1px solid #e5e5e5;">
    <p style="margin:0 0 6px;font-size:11px;color:#aaaaaa;line-height:1.6;">This link expires in 24 hours and works only once. If you didn't expect this, you can safely ignore it.</p>
    <p style="margin:0 0 4px;font-size:11px;color:#aaaaaa;">Button not working? Copy and paste into your browser:</p>
    <a href="${confirmUrl}" style="font-size:11px;color:#888888;word-break:break-all;overflow-wrap:break-word;">${confirmUrl}</a>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}
