// app/api/stripe/webhook/route.ts
//
// The ONLY writer of company_subscriptions for real (non-comped) accounts --
// same "server-to-server webhook is the source of truth, never the client
// redirect" architecture CLAUDE.md's Billing & Subscriptions spec already
// decided. The /checkout/success page the customer's browser lands on only
// ever shows a "setting up" state; this route is what actually provisions
// the account and flips billing state, whenever Stripe's servers reach us
// (which can arrive before, during, or after the customer's own redirect).
//
// Handles two event types:
//   - checkout.session.completed: a brand-new self-serve Solo signup just
//     paid (or started their trial). No ProTankr account exists yet --
//     Checkout collected the email itself. This finds-or-creates the
//     Supabase auth user, finds-or-creates their solo company (idempotent,
//     same shape as admin_invite_solo_user's own logic), upserts
//     company_subscriptions, and emails them a sign-in code.
//   - customer.subscription.updated / customer.subscription.deleted: syncs
//     status/current_period_end for an existing company_subscriptions row,
//     matched by stripe_subscription_id. Covers trial->active conversion,
//     past_due, cancellation, etc.
//
// Required env vars:
//   STRIPE_SECRET_KEY
//   STRIPE_WEBHOOK_SECRET   (from the Dashboard's webhook endpoint config --
//                            see docs/STRIPE-SETUP.md)
//   SUPABASE_SERVICE_ROLE_KEY
//   NEXT_PUBLIC_SUPABASE_URL
//   NEXT_PUBLIC_APP_URL
//   RESEND_API_KEY
//   INVITE_FROM_EMAIL

import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe/serverClient";
import { getServiceSupabase } from "@/lib/supabase/serviceClient";

export const runtime = "nodejs";

type DbStatus = "trialing" | "active" | "past_due" | "canceled" | "incomplete";

// company_subscriptions.status only allows 5 values (see its own migration's
// check constraint); Stripe's real subscription.status enum has 8. Map the
// three it doesn't know about to the closest safe bucket rather than let a
// raw Stripe status value hit a check-constraint violation, which would
// otherwise silently fail the whole webhook write.
function mapStripeStatus(s: Stripe.Subscription.Status): DbStatus {
  switch (s) {
    case "trialing": return "trialing";
    case "active": return "active";
    case "past_due": return "past_due";
    case "canceled": return "canceled";
    case "incomplete": return "incomplete";
    case "incomplete_expired": return "canceled";
    case "unpaid": return "past_due";
    case "paused": return "past_due";
    default: return "past_due";
  }
}

function toIso(unixSeconds: number | null | undefined): string | null {
  return typeof unixSeconds === "number" ? new Date(unixSeconds * 1000).toISOString() : null;
}

// current_period_end lives on each subscription ITEM in this API version,
// not on the top-level Subscription object (a real, easy-to-get-wrong
// version difference -- confirmed against the installed SDK's own types
// before writing this, not assumed from memory).
function currentPeriodEndOf(sub: Stripe.Subscription): string | null {
  const item = sub.items?.data?.[0];
  return item ? toIso(item.current_period_end) : null;
}

async function sendWelcomeEmail(to: string, confirmUrl: string, code: string, installUrl: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddr = process.env.INVITE_FROM_EMAIL ?? "noreply@protankr.com";
  if (!apiKey) throw new Error("RESEND_API_KEY not set.");
  const codeDisplay = code
    ? `${code.slice(0, Math.ceil(code.length / 2))} ${code.slice(Math.ceil(code.length / 2))}`.trim()
    : "";
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Welcome to ProTankr</title></head>
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
    <div style="font-size:17px;font-weight:700;color:#111111;margin-bottom:14px;line-height:1.4;">Payment received &mdash; your ProTankr account is ready.</div>
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
    <p style="margin:12px 0 0;font-size:11px;color:#aaaaaa;line-height:1.6;">Questions about your subscription? Just reply to this email.</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from: `ProTankr <${fromAddr}>`,
      to: [to],
      subject: "Welcome to ProTankr — your sign-in code",
      html,
    }),
  });
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
}

/**
 * ALWAYS creates a brand-new solo company -- deliberately does NOT reuse an
 * existing one, even if this email already belongs to a company. Paying for
 * Solo means "give me my own company," full stop; reusing whatever company
 * the email happens to already be a member of (e.g. a real driver's
 * existing Fleet company) would silently attach a stranger's $39/mo
 * subscription to that other company's billing record instead -- confirmed
 * live: testing checkout with an email that already belonged to a real
 * multi-member company clobbered THAT company's company_subscriptions row
 * to tier='solo' and dropped the payer into it on sign-in, instead of a new
 * company of their own. (An earlier version of this function mirrored
 * admin_invite_solo_user's own "reuse an existing company" idempotency --
 * that reuse makes sense THERE, where the super admin is inviting someone
 * presumed accountless; it's wrong here, where checkout is public and the
 * email could belong to anyone.)
 *
 * Idempotency for a genuinely retried webhook event is handled by the
 * caller instead, keyed on stripe_subscription_id -- see
 * handleCheckoutCompleted's own check before this is ever called.
 */
async function createSoloCompany(
  admin: ReturnType<typeof getServiceSupabase>,
  userId: string,
  email: string
): Promise<string> {
  const { data: profile } = await admin
    .from("profiles")
    .select("display_name")
    .eq("user_id", userId)
    .maybeSingle();
  const nameSeed = profile?.display_name || email.split("@")[0] || "Driver";

  const { data: company, error: companyErr } = await admin
    .from("companies")
    .insert({ company_name: `${nameSeed}'s Equipment`, is_solo: true, owner_user_id: userId })
    .select("company_id")
    .single();
  if (companyErr) throw companyErr;
  const companyId = company.company_id as string;

  const { error: memberErr } = await admin
    .from("user_companies")
    .insert({ user_id: userId, company_id: companyId, role: "admin" });
  if (memberErr) throw memberErr;

  // The payer just bought THIS subscription -- switch them into the new
  // company so signing in lands them there, not wherever active_company_id
  // previously pointed (which could be an unrelated existing company for
  // this email, same reasoning as not reusing the company itself above).
  const { error: settingsErr } = await admin
    .from("user_settings")
    .upsert({ user_id: userId, active_company_id: companyId }, { onConflict: "user_id" });
  if (settingsErr) throw settingsErr;

  return companyId;
}

async function findOrCreateUserByEmail(
  admin: ReturnType<typeof getServiceSupabase>,
  email: string
): Promise<{ userId: string; isNew: boolean }> {
  // Same listUsers-then-find pattern app/api/superadmin/invite-solo/route.ts
  // already uses -- consistent with this codebase's established convention,
  // even though it doesn't paginate past 1000 users.
  const { data: existingList } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const existing = existingList?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (existing) return { userId: existing.id, isNew: false };

  const { data: created, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error || !created?.user) throw new Error(error?.message ?? "Failed to create user.");
  return { userId: created.user.id, isNew: true };
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  if (session.mode !== "subscription") return; // this endpoint only handles the Solo subscription flow

  const email = session.customer_details?.email ?? session.customer_email;
  if (!email) {
    console.error("[stripe/webhook] checkout.session.completed with no email; session:", session.id);
    return;
  }

  const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  if (!subscriptionId || !customerId) {
    console.error("[stripe/webhook] checkout.session.completed missing subscription/customer id; session:", session.id);
    return;
  }

  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  const admin = getServiceSupabase();

  // Idempotency lives HERE now, keyed on the Stripe subscription itself --
  // not on "does this email already have a company" (see createSoloCompany's
  // own comment for why that used to be wrong). A genuinely retried
  // checkout.session.completed for the same subscription just re-syncs the
  // existing row and stops -- no second company, no second welcome email.
  const { data: already } = await admin
    .from("company_subscriptions")
    .select("company_id")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();
  if (already?.company_id) {
    const { error: resyncErr } = await admin
      .from("company_subscriptions")
      .update({
        status: mapStripeStatus(subscription.status),
        current_period_end: currentPeriodEndOf(subscription),
      })
      .eq("company_id", already.company_id);
    if (resyncErr) throw resyncErr;
    return;
  }

  const { userId } = await findOrCreateUserByEmail(admin, email);
  const companyId = await createSoloCompany(admin, userId, email);

  const { error: subErr } = await admin.from("company_subscriptions").upsert(
    {
      company_id: companyId,
      tier: "solo",
      status: mapStripeStatus(subscription.status),
      paid_admin_seats: 1,
      paid_other_seats: 0,
      comped: false,
      trial_ends_at: toIso(subscription.trial_end),
      current_period_end: currentPeriodEndOf(subscription),
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
    },
    { onConflict: "company_id" }
  );
  if (subErr) throw subErr;

  // Sign-in link: same consuming-link-safe token_hash pattern established
  // for every other invite email in this app (never Supabase's raw
  // action_link, which a mail-client link-scanner would burn on first GET).
  const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://www.protankr.com";
  const redirectTo = `${origin}/auth/confirm`;
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo },
  });
  if (linkErr || !linkData?.properties?.hashed_token) {
    // The account and subscription are already provisioned at this point --
    // don't fail the whole webhook over the welcome email. Worth a look if
    // it happens, but the customer can still sign in via /login's own
    // "Email me a code" self-serve path.
    console.error("[stripe/webhook] failed to generate sign-in link for", email, linkErr?.message);
    return;
  }
  const confirmUrl = `${redirectTo}?token_hash=${encodeURIComponent(linkData.properties.hashed_token)}&type=magiclink`;
  const code = linkData.properties.email_otp ?? "";

  try {
    await sendWelcomeEmail(email, confirmUrl, code, `${origin}/install`);
  } catch (e: any) {
    console.error("[stripe/webhook] failed to send welcome email:", e?.message ?? e);
  }
}

async function syncSubscriptionStatus(subscription: Stripe.Subscription) {
  const admin = getServiceSupabase();
  const { data: existing, error: findErr } = await admin
    .from("company_subscriptions")
    .select("company_id")
    .eq("stripe_subscription_id", subscription.id)
    .maybeSingle();
  if (findErr) throw findErr;

  if (!existing) {
    // Can legitimately arrive before checkout.session.completed's own
    // upsert has landed (Stripe doesn't guarantee delivery order) --
    // log and skip rather than error; the next subscription.updated event
    // (there will be one, e.g. at trial end or renewal) reconciles it once
    // the row exists.
    console.warn("[stripe/webhook] subscription.updated for unknown subscription (will reconcile on next event):", subscription.id);
    return;
  }

  const { error: updateErr } = await admin
    .from("company_subscriptions")
    .update({
      status: mapStripeStatus(subscription.status),
      current_period_end: currentPeriodEndOf(subscription),
    })
    .eq("company_id", existing.company_id);
  if (updateErr) throw updateErr;
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Webhook not configured." }, { status: 500 });
  }

  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (e: any) {
    console.error("[stripe/webhook] signature verification failed:", e?.message ?? e);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncSubscriptionStatus(event.data.object as Stripe.Subscription);
        break;
      default:
        // Every other event type is ignored on purpose -- this webhook
        // endpoint only needs the ones above for the Solo self-serve flow.
        break;
    }
  } catch (e: any) {
    console.error(`[stripe/webhook] handler failed for ${event.type}:`, e?.message ?? e);
    // Non-2xx makes Stripe retry with backoff -- correct here, since a
    // failure at this point (e.g. a transient DB error) means state was NOT
    // successfully synced and should be retried, not silently dropped.
    return NextResponse.json({ error: "Handler failed." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
