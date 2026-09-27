"use client";
// app/checkout/success/page.tsx
// Stripe Checkout's success_url for the self-serve Solo signup. Per the
// project's own "activation is webhook-driven, never client-redirect-driven"
// rule (see CLAUDE.md's Billing & Subscriptions spec): this page never reads
// the checkout session or writes anything itself -- it only shows a
// "setting up" state. The real work (provisioning the account, sending the
// sign-in code) happens in app/api/stripe/webhook/route.ts, which can land
// before, during, or after this page ever loads. That's also why this page
// can't reliably say "you're all set" -- the webhook might still be
// in flight -- so it points at email instead of implying instant readiness.

import Link from "next/link";
import SiteHeader from "../../marketing/SiteHeader";

export default function CheckoutSuccessPage() {
  return (
    <div className="page">
      <SiteHeader />
      <section className="wrap">
        <div className="card">
          <div className="check">✓</div>
          <h1 className="h1">You're subscribed.</h1>
          <p className="body">
            We're setting up your ProTankr account now. Check your email in
            the next minute or two for your sign-in code and a link to add
            ProTankr to your phone.
          </p>
          <p className="sub">
            Already have the code? <Link href="/login">Sign in</Link>
          </p>
        </div>
      </section>

      <style jsx global>{`
        .page {
          --ink: #0d0d0c;
          --font: var(--font-outfit), "Outfit", Helvetica, Arial, sans-serif;
          min-height: 100dvh; background: #ffffff; color: var(--ink);
          font-family: var(--font); overflow-x: hidden;
        }
        .wrap { display: flex; justify-content: center; padding: 60px 24px 100px; }
        .card {
          max-width: 440px; width: 100%; text-align: center;
          border-radius: 20px; background: #f6f6f5; border: 1px solid rgba(0,0,0,0.08);
          padding: 40px 32px;
        }
        .check {
          width: 52px; height: 52px; margin: 0 auto 18px; border-radius: 999px;
          background: rgba(34,160,90,0.12); color: #16803d;
          display: flex; align-items: center; justify-content: center;
          font: 900 24px var(--font);
        }
        .h1 { margin: 0; font: 900 28px var(--font); letter-spacing: -0.02em; color: #111; }
        .body { margin: 14px 0 0; font: 400 15px var(--font); color: rgba(0,0,0,0.6); line-height: 1.6; }
        .sub { margin: 20px 0 0; font: 500 13px var(--font); color: rgba(0,0,0,0.5); }
        .sub a { color: #111; text-decoration: underline; }
      `}</style>
    </div>
  );
}
