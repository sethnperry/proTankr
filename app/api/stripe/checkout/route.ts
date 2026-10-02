// app/api/stripe/checkout/route.ts
//
// Public endpoint (no auth) that starts a self-serve Solo subscription --
// this is the ONLY paid tier with a real checkout path today; Fleet stays
// request-based via /get-the-app (pricing not finalized). Creates a Stripe
// Checkout Session and returns its hosted URL; the client redirects the
// browser there. No ProTankr account exists yet at this point -- Checkout
// collects the email itself, and the webhook (the only writer of real
// state, see app/api/stripe/webhook/route.ts) provisions the account and
// company once payment actually completes. This route never touches the
// database at all.
//
// Required env vars:
//   STRIPE_SECRET_KEY
//   STRIPE_SOLO_PRICE_ID   (the $39/mo recurring Price id from the Stripe
//                           Dashboard -- see docs/STRIPE-SETUP.md)
//   NEXT_PUBLIC_APP_URL    (e.g. https://www.protankr.com)

import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/serverClient";

export const runtime = "nodejs";

// Card collected up front, first charge only after the trial ends -- see
// CLAUDE.md's Billing & Subscriptions spec ("Trials"). Matches the decided
// Solo terms: $39/mo, 14-day trial, monthly billing only.
const TRIAL_PERIOD_DAYS = 14;

export async function POST(req: NextRequest) {
  try {
    const priceId = process.env.STRIPE_SOLO_PRICE_ID;
    if (!priceId) {
      return NextResponse.json({ error: "Billing isn't configured yet." }, { status: 500 });
    }

    const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://www.protankr.com";

    // Optional prefill -- harmless if omitted, Checkout's own email field
    // covers it either way.
    const body = await req.json().catch(() => ({}));
    const email = typeof body?.email === "string" && body.email.trim() ? body.email.trim() : undefined;

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: { trial_period_days: TRIAL_PERIOD_DAYS },
      customer_email: email,
      allow_promotion_codes: true,
      // Enabling Stripe Tax in the Dashboard alone doesn't apply to a
      // Checkout Session created via the API (unlike a Payment Link, where
      // the Dashboard toggle is sufficient on its own) -- this session
      // itself has to opt in. Harmless with zero tax registrations: Stripe
      // calculates $0 tax (and charges nothing extra) until a registration
      // actually exists for the customer's jurisdiction, at which point
      // Checkout starts collecting whatever address it needs automatically.
      automatic_tax: { enabled: true },
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing`,
      metadata: { source: "self_serve_solo" },
    });

    if (!session.url) throw new Error("Stripe did not return a Checkout URL.");
    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    console.error("[stripe/checkout] error:", e?.message ?? e);
    return NextResponse.json({ error: "Something went wrong starting checkout. Please try again." }, { status: 500 });
  }
}
