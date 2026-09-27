"use client";
// app/pricing/page.tsx
// Solo is real: $39/mo, 14-day trial, self-serve via Stripe Checkout (see
// app/api/stripe/checkout/route.ts). Fleet stays a placeholder -- pricing
// for that tier isn't finalized, so it's still "TBD" / Request Early Access
// via /get-the-app, same as before. Tier SHAPE (1 admin + 4 team seats
// included, additional seats of either kind priced separately) is real,
// sourced from CLAUDE.md's "Roles & permissions" -> Pricing.

import { useState } from "react";
import Link from "next/link";
import SiteHeader from "../marketing/SiteHeader";

const FLEET_FEATURES = [
  "Everything in Solo, for every driver",
  "Multi-driver equipment sharing & history",
  "Fleet-wide card & credential visibility",
  "Dispatch board",
  "Role-based permissions (Driver / Lead / Dispatch / Admin)",
  "Payload utilization scoring for your bonus program",
];

const SOLO_FEATURES = [
  "Load planning, presets & recap",
  "Personal equipment & spares tracking",
  "Terminal cards & credential tracking",
  "Password vault",
  "Crowdsourced API data, shared industry-wide",
];

export default function PricingPage() {
  const [startingCheckout, setStartingCheckout] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  async function startSoloCheckout() {
    setCheckoutError(null);
    setStartingCheckout(true);
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.url) throw new Error(data?.error ?? "Couldn't start checkout. Please try again.");
      window.location.href = data.url;
    } catch (e: any) {
      setCheckoutError(e?.message ?? "Couldn't start checkout. Please try again.");
      setStartingCheckout(false);
    }
  }

  return (
    <div className="page">
      <SiteHeader active="pricing" />

      <section className="hero">
        <h1 className="hero-h1">Pricing</h1>
        <p className="hero-sub">
          Solo is available now, with a 14-day free trial. Fleet pricing is
          still being finalized ahead of launch.
        </p>
      </section>

      <section className="tiers-section">
        <div className="tiers">
          <div className="tier">
            <div className="tier-name">Solo</div>
            <p className="tier-tagline">For owner-operators tracking their own truck.</p>

            <div className="tier-price-row">
              <span className="tier-price">$39</span>
              <span className="tier-price-note">/ month · 14-day free trial</span>
            </div>

            <ul className="tier-features">
              {SOLO_FEATURES.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>

            {checkoutError && <div className="tier-error">{checkoutError}</div>}
            <button type="button" className="tier-cta tier-cta-btn" onClick={startSoloCheckout} disabled={startingCheckout}>
              {startingCheckout ? "Starting…" : "Start Free Trial"}
            </button>
            <p className="tier-fineprint">Card required to start. Nothing is charged until your trial ends.</p>
          </div>

          <div className="tier tier-highlight">
            <div className="tier-name">Fleet</div>
            <p className="tier-tagline">For companies running multiple drivers.</p>

            <div className="tier-price-row">
              <span className="tier-price">TBD</span>
              <span className="tier-price-note">/ month — includes 1 admin + 4 team seats</span>
            </div>

            <ul className="tier-features">
              {FLEET_FEATURES.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>

            <Link href="/get-the-app" className="tier-cta">
              Request Early Access
            </Link>
          </div>
        </div>

        <div className="seats-note">
          <span className="seats-note-label">Fleet seats</span>
          Additional team seats and additional admin seats are both priced
          separately — exact figures: <strong>TBD</strong>.
        </div>
      </section>

      <style jsx global>{`
        .page {
          --ink: #0d0d0c;
          --font: var(--font-outfit), "Outfit", Helvetica, Arial, sans-serif;
          min-height: 100dvh;
          background: #ffffff;
          color: var(--ink);
          font-family: var(--font);
          overflow-x: hidden;
        }

        .hero { padding: 40px 48px 0; max-width: 720px; }
        .hero-h1 { margin: 0; font: 900 56px var(--font); letter-spacing: -0.02em; color: #111; }
        .hero-sub { margin: 12px 0 0; font: 400 16px var(--font); color: rgba(0,0,0,0.6); line-height: 1.5; }

        .tiers-section { padding: 48px 48px 100px; }
        .tiers {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 24px;
          max-width: 900px;
          margin: 0 auto;
        }

        .tier {
          border-radius: 20px;
          background: #f6f6f5;
          border: 1px solid rgba(0,0,0,0.08);
          padding: 32px 28px;
          display: flex;
          flex-direction: column;
        }
        .tier-highlight {
          background: #111111;
          color: #ffffff;
          border-color: #111111;
        }

        .tier-name { font: 800 24px var(--font); }
        .tier-tagline {
          margin: 8px 0 0;
          font: 400 14px var(--font);
          color: rgba(0,0,0,0.55);
          line-height: 1.5;
          min-height: 42px;
        }
        .tier-highlight .tier-tagline { color: rgba(255,255,255,0.65); }

        .tier-price-row { margin: 22px 0 4px; display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
        .tier-price { font: 900 40px var(--font); letter-spacing: -0.01em; }
        .tier-price-note { font: 600 12px var(--font); color: rgba(0,0,0,0.45); }
        .tier-highlight .tier-price-note { color: rgba(255,255,255,0.5); }

        .tier-features { list-style: none; margin: 22px 0 0; padding: 0; flex: 1; }
        .tier-features li {
          font: 500 14px var(--font);
          padding: 9px 0;
          border-top: 1px solid rgba(0,0,0,0.08);
          display: flex;
          align-items: baseline;
          gap: 8px;
        }
        .tier-features li::before { content: "•"; color: rgba(0,0,0,0.3); flex-shrink: 0; }
        .tier-highlight .tier-features li { border-top-color: rgba(255,255,255,0.14); }
        .tier-highlight .tier-features li::before { color: rgba(255,255,255,0.4); }

        .tier-error {
          margin-top: 16px;
          padding: 10px 14px;
          border-radius: 10px;
          background: rgba(200,30,30,0.08);
          color: #b91c1c;
          font: 500 13px var(--font);
        }

        .tier-cta {
          margin-top: 26px;
          display: block;
          width: 100%;
          box-sizing: border-box;
          text-align: center;
          padding: 13px 16px;
          border-radius: 999px;
          font: 700 14px var(--font);
          text-decoration: none;
          background: #111111;
          color: #ffffff;
          border: none;
          cursor: pointer;
        }
        .tier-cta-btn { margin-top: 16px; }
        .tier-cta:disabled { opacity: 0.6; cursor: not-allowed; }
        .tier-highlight .tier-cta { background: #ffffff; color: #111111; }
        .tier-cta:not(:disabled):hover { opacity: 0.85; }

        .tier-fineprint {
          margin: 10px 0 0;
          font: 400 11.5px var(--font);
          color: rgba(0,0,0,0.42);
          text-align: center;
        }

        .seats-note {
          max-width: 900px;
          margin: 24px auto 0;
          padding: 16px 20px;
          border-radius: 12px;
          background: rgba(0,0,0,0.03);
          font: 400 13px var(--font);
          color: rgba(0,0,0,0.6);
          line-height: 1.6;
        }
        .seats-note-label {
          display: block;
          font: 700 10px var(--font);
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(0,0,0,0.35);
          margin-bottom: 6px;
        }

        @media (max-width: 760px) {
          .hero { padding: 28px 24px 0; }
          .hero-h1 { font-size: 40px; }
          .tiers-section { padding: 32px 24px 64px; }
          .tiers { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
