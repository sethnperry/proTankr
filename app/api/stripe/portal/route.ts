// app/api/stripe/portal/route.ts
//
// Authenticated: creates a Stripe Billing Portal session so a company admin
// can update their payment method, view invoices, or cancel -- without a
// custom UI for any of that (Stripe's own hosted portal handles it all).
// Wired to CompanySettingsModal's "Manage Billing" button.
//
// Required env vars: STRIPE_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY,
// NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_APP_URL

import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/serverClient";
import { getServiceSupabase } from "@/lib/supabase/serviceClient";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const admin = getServiceSupabase();
    const { data: { user }, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const { data: settings } = await admin
      .from("user_settings")
      .select("active_company_id")
      .eq("user_id", user.id)
      .maybeSingle();
    const companyId = settings?.active_company_id as string | undefined;
    if (!companyId) return NextResponse.json({ error: "No active company." }, { status: 400 });

    // Admin-only -- this manages real payment state, a narrower gate than
    // the staff-wide read access company_subscriptions itself allows.
    const { data: membership } = await admin
      .from("user_companies")
      .select("role")
      .eq("user_id", user.id)
      .eq("company_id", companyId)
      .maybeSingle();
    if (membership?.role !== "admin") {
      return NextResponse.json({ error: "Only a company admin can manage billing." }, { status: 403 });
    }

    const { data: sub } = await admin
      .from("company_subscriptions")
      .select("stripe_customer_id")
      .eq("company_id", companyId)
      .maybeSingle();
    if (!sub?.stripe_customer_id) {
      return NextResponse.json({ error: "No billing account found for this company yet." }, { status: 400 });
    }

    const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://www.protankr.com";
    const stripe = getStripe();
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${origin}/admin`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (e: any) {
    console.error("[stripe/portal] error:", e?.message ?? e);
    return NextResponse.json({ error: "Something went wrong opening billing management." }, { status: 500 });
  }
}
