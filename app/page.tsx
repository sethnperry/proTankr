"use client";
// app/page.tsx — protankr.com marketing landing page.
// Unauthenticated and authenticated visitors both see this; CTAs link to
// /get-the-app (the site's one real lead-capture path today), /pricing,
// or one of the two audience-specific pages (/for-drivers, /for-fleets).
//
// Restructured 2026-09 (v4): reordered to match the site-wide narrative —
// hero, the cost of the problem, a hands-on calculator that proves it,
// how the product actually works, then a fork into the two audiences
// before closing with the "not a TMS" distinction, the shared-knowledge
// network effect, and the founder trust signal. Nothing content-wise was
// deleted from the v3 pass; sections were re-sequenced and two new
// sections (Audience picker, Shared Knowledge) were added.
//
// Copy rule, deliberate: nothing on this page may claim ProTankr
// prevents overweight loads outright. A sudden shift in terminal or
// product conditions can still catch a driver out before the network
// has data on it. What the product prevents is the PERMANENT downward
// ratchet afterward. Avoid "never", "guaranteed", "always safe",
// "eliminates" and similar absolutes anywhere in this file.

import Link from "next/link";
import SiteHeader from "./marketing/SiteHeader";
import SiteFooter from "./marketing/SiteFooter";
import PhoneScreen from "./marketing/PhoneScreen";

// Three real, completed loads pulled from the ProTankr Planner's own
// "Load Report" screens (Buckey North, Tampa, FL) -- not invented example
// data. Deliberately kept as the exact figures shown on those reports
// (including the terminal's own on-file spelling) rather than rounded or
// "cleaned up". The point of the section: three different product
// combinations, calculated against the same legal limit, landed within
// 76 lbs of each other -- that's the real precision story, not a
// hypothetical one.
const LOAD_EXAMPLES = [
  {
    product: "Diesel, Premium & Regular (mixed)",
    gallons: "8,451 gal",
    weightLbs: "79,895",
    terminal: "Buckey North · Tampa, FL",
  },
  {
    product: "Regular Unleaded E10 87",
    gallons: "9,086 gal",
    weightLbs: "79,967",
    terminal: "Buckey North · Tampa, FL",
  },
  {
    product: "ULSD Diesel #2",
    gallons: "7,905 gal",
    weightLbs: "79,971",
    terminal: "Buckey North · Tampa, FL",
  },
];

const PRODUCT_FEATURES = [
  {
    label: "Equipment aware",
    body: "Tare weight, compartment count, and how much each compartment can legally hold, keyed to the exact truck and trailer you're pulling today.",
  },
  {
    label: "Temperature aware",
    body: "Live API and temperature drive the density math, so the payload number reflects today's conditions, not a guess from last summer.",
  },
  {
    label: "Payload focused",
    body: "Every variable resolves to a single number you can act on at the rack, not a report to interpret later.",
  },
];

// Matches the real workflow, not a simplified stand-in -- same 4 steps
// established on /for-fleets' own "How It Works" section, condensed to
// this page's shorter body-copy length. Keeping the two in sync matters:
// this used to be a generic "Calculate. Load. Capture." 3-step gloss that
// undersold how few taps the real workflow actually needs and what it
// captures as a byproduct (terminal card renewal, terminal issue
// flagging, utilization scoring) -- exactly the kind of drift worth
// fixing once it's been corrected elsewhere on the site.
const WORKFLOW_STEPS = [
  {
    n: "01",
    label: "Already set up",
    body: "Equipment and your last terminal are already picked when you open the app. Change them only when something's actually different.",
  },
  {
    n: "02",
    label: "Pick a plan",
    body: "Choose a saved product and compartment layout in one tap, or skip it entirely if it's the same plan as last time.",
  },
  {
    n: "03",
    label: "Load, then complete",
    body: "See exactly what to load, then load it. Only update what's actually different from the plan, gallons, API, or temp.",
  },
  {
    n: "04",
    label: "Everything else updates itself",
    body: "Temperature data, terminal card status, terminal issues, and your utilization score. All captured as a byproduct, not entered separately.",
  },
];

export default function Home() {
  return (
    <div className="page">
      <SiteHeader />

      {/* 1. HERO — per explicit direction, replaced the joke headline with
          a straighter statement + a 3-tier copy descent (.hero-lead ->
          .hero-body -> .hero-sub), same pattern as /for-fleets' own hero
          rework: each tier a step quieter than the last, carrying the
          idea from WHY (built around the people doing the work) to WHAT
          (a fast, organized way to load/adapt/reload) to the risk
          reassurance (works alongside what a hauler already runs). */}
      <section className="hero">
        <p className="hero-eyebrow">Driver-driven efficiency</p>
        <h1 className="hero-h1">A smarter way to load.</h1>
        <p className="hero-lead">
          Built around the people doing the work. Designed to make every
          load more efficient.
        </p>
        <p className="hero-body">
          ProTankr gives fuel haulers a fast, organized way to load,
          adapt, and reload with accuracy.
        </p>
        <p className="hero-sub">
          Built to work alongside the operation you already have, where
          one driver&apos;s experience becomes fleet-wide efficiency.
        </p>
      </section>

      {/* 2. PROBLEM / MANIFESTO — the cost of the problem, before the pitch. */}
      <section className="manifesto-section">
        <div className="manifesto-inner">
          {/* Per explicit direction: "Every load could have carried more"
              was a real overclaim -- not every load could, and this
              section's own rewrite deliberately says so (sometimes the
              right correction is LESS fuel, to avoid a ticket, not more)
              -- matching this file's own stated copy rule against
              absolutes at the top of the file even more honestly than
              the line it replaces. */}
          <h2 className="manifesto-h2">
            The right load changes with the conditions.
          </h2>
          <div className="manifesto-body">
            <p>
              Drivers learn what works. They find a safe number and stick
              with it — because being a little light is better than being
              overweight.
            </p>
            <p>
              But conditions change. Temperature, product, equipment, and
              terminal conditions can all move that number. Sometimes the
              opportunity is more fuel. Sometimes it&apos;s avoiding a
              ticket.
            </p>
            <p>
              ProTankr learns from the driver who&apos;s there and carries
              that experience forward. One real-world report can keep the
              next driver from having to learn the same lesson.
            </p>
          </div>
        </div>
      </section>

      {/* 3. REAL LOADS — three completed loads from the app itself,
          replacing the old interactive BOL calculator (retired: an
          estimate built on standard published density tables couldn't
          match the app's own per-product tuning closely enough to be
          trustworthy as a public-facing number). Real data instead of a
          tool that might be wrong. */}
      <section id="calculator" className="calc-section">
        <div className="calc-inner">
          <div className="calc-header">
            <h2 className="calc-h2">
              Different products. Nearly identical weight.
            </h2>
            <p className="calc-intro">
              Three completed loads at the same terminal, three different
              product combinations. Each one calculated against the same
              legal limit, and each one landed within 76 lbs of the
              others.
            </p>
          </div>

          <div className="load-examples">
            {LOAD_EXAMPLES.map((load, i) => (
              <div
                key={load.product}
                className={`load-card ${
                  i % 2 === 0 ? "load-card-dark" : "load-card-light"
                }`}
              >
                <span className="load-card-tag">{load.terminal}</span>
                <span className="load-card-weight">
                  {load.weightLbs}
                  <span className="load-card-weight-unit"> lbs</span>
                </span>
                <span className="load-card-sub">
                  {load.gallons} &middot; {load.product}
                </span>
              </div>
            ))}
          </div>

          <p className="calc-footnote">
            Real completed loads from the ProTankr Planner. Actual weight
            is calculated from live API and temperature at the time of
            loading, not looked up after the fact.
          </p>
        </div>
      </section>

      {/* 4. PRODUCT — how it actually works. */}
      <section id="product" className="product-section">
        <div className="product-inner">
          <div className="product-copy">
            <h2 className="product-h2">
              Know your real weight before you pull away.
            </h2>
            <p className="product-sub">
              Tare weight. Product density. Temperature. Compartment
              constraints. Legal weight. ProTankr turns all of it into one
              practical answer: how much can I legally and reasonably put
              on this trailer, right now.
            </p>
            <ul className="product-features">
              {PRODUCT_FEATURES.map((f) => (
                <li key={f.label}>
                  <span className="product-feature-label">
                    <span className="bullet">&bull;</span>
                    {f.label}
                  </span>
                  <span className="product-feature-body">{f.body}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="product-visual">
            <PhoneScreen />
          </div>
        </div>
      </section>

      {/* 5. WORKFLOW — headline reused verbatim from /for-fleets' own "How
          It Works" section for site-wide consistency. */}
      <section className="workflow-section">
        <div className="workflow-inner">
          <h2 className="workflow-h2">The workflow is the whole system.</h2>
          <p className="workflow-sub">
            There&apos;s no separate admin tool to remember. The same few
            taps a driver already makes to plan and run a load are the
            whole system.
          </p>
          <div className="workflow-steps">
            {WORKFLOW_STEPS.map((s) => (
              <div key={s.n} className="workflow-step">
                <span className="workflow-n">{s.n}</span>
                <span className="workflow-label">{s.label}.</span>
                <p className="workflow-body">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 6. AUDIENCE PICKER — fork into the two ways to use ProTankr. */}
      <section id="audience" className="audience-section">
        <div className="audience-inner">
          <p className="audience-eyebrow">One system, two views</p>
          <h2 className="audience-h2">
            Built for the driver. Built for the fleet.
          </h2>
          <p className="audience-sub">
            Same equipment records, same terminal data, same shared
            knowledge — organized around whoever&apos;s actually looking at
            it.
          </p>
          <div className="audience-cards">
            <Link href="/for-drivers" className="audience-card">
              <span className="audience-card-label">For Drivers</span>
              <p className="audience-card-body">
                Plan the load, track your terminal cards, and keep your
                equipment&apos;s history where you can actually use it.
              </p>
              <span className="audience-card-cta">
                See the driver tools &rarr;
              </span>
            </Link>
            <Link href="/for-fleets" className="audience-card audience-card-dark">
              <span className="audience-card-label">For Fleets</span>
              <p className="audience-card-body">
                Recover more payload, see equipment and card status
                without asking, and hand off knowledge between drivers
                automatically.
              </p>
              <span className="audience-card-cta">
                See the fleet tools &rarr;
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* 7. NOT ANOTHER TMS */}
      <section className="tms-section">
        <div className="tms-inner">
          <h2 className="tms-h2">Not another TMS.</h2>
          <div className="tms-flow">
            <p className="tms-line">
              Your TMS tells you where the truck is going. Your dispatch
              system tells you what to haul.
            </p>
            <p className="tms-line tms-line-emphasis">
              ProTankr tells you how much you can legally put on the
              trailer.
            </p>
            <p className="tms-line tms-line-sub">
              It works as an optimization layer alongside the systems you
              already have, not a replacement for any of them.
            </p>
          </div>
        </div>
      </section>

      {/* 8. SHARED KNOWLEDGE — the network effect, made concrete. */}
      <section className="network-section">
        <div className="network-inner">
          <p className="network-eyebrow">Shared knowledge</p>
          <h2 className="network-h2">
            The driver in front of you already learned something.
          </h2>
          <p className="network-sub">
            A terminal that just ran out of a product. A verified API
            reading that corrects a stale prediction. Once one driver
            confirms it, the next one starts with better information
            instead of starting cold.
          </p>
          {/* Card 1 matches /for-drivers' own Shared Knowledge card content
              verbatim (Marathon, Tampa FL, real "Out of Product" wording,
              "Clears" framing) rather than the invented "Buckeye Bayway"
              placeholder this section used to show -- same real dual
              terminal-outage system (Out of Product/Out of Allocation),
              not a generic activity feed. Card 2 keeps its own distinct
              feature (temp/API bias correction) but moved off Marathon
              to a different terminal so the two cards don't reference the
              same place. */}
          <div className="network-examples">
            <div className="network-card">
              <div className="network-card-head">
                <span className="network-card-tag">Terminal status</span>
                <span className="network-card-time">Clears 12:00</span>
              </div>
              <p className="network-card-title">Premium 93</p>
              <p className="network-card-body">
                Marathon &middot; Tampa, FL — Terminal Out of Premium 93,
                marked out at 08:14 hrs. Visible to every driver headed
                there, any company.
              </p>
            </div>
            <div className="network-card">
              <div className="network-card-head">
                <span className="network-card-tag">Temperature reading</span>
                <span className="network-card-time">Today</span>
              </div>
              <p className="network-card-title">API reading verified</p>
              <p className="network-card-body">
                Chevron &middot; Fort Lauderdale, FL — one confirmed load
                corrects the terminal&apos;s predicted temperature for
                everyone loading there today, not just the driver who
                reported it.
              </p>
            </div>
          </div>
          <p className="network-footnote">
            The model improves with verified load data. Every confirmed
            result can make the next load more informed — shared knowledge
            becomes operational infrastructure.
          </p>
        </div>
      </section>

      {/* 9. FOUNDER STORY */}
      <section className="founder-section">
        <div className="founder-inner">
          <blockquote className="founder-quote">
            <p>
              &ldquo;I didn&apos;t start ProTankr because I wanted to build
              trucking software. I started it because I was tired of
              choosing between an overweight ticket and payload left on the
              table.&rdquo;
            </p>
            <p>
              &ldquo;The event that caused it passes. The lower volume
              stays.&rdquo;
            </p>
          </blockquote>
          <p className="founder-byline">
            Built by a bulk fuel hauler with hands-on experience.
          </p>
          <p className="founder-patent">
            <span className="patent-badge">Patent Pending</span>
          </p>
        </div>
      </section>

      {/* 10. FINAL CTA */}
      <section className="closing">
        <div className="closing-inner">
          <div className="closing-header">
            <p className="closing-eyebrow">The Opportunity</p>
            <h2 className="closing-h2">
              How many gallons are your trucks leaving behind?
            </h2>
          </div>

          <div className="closing-footer">
            <p className="closing-sub">
              ProTankr rolls out gradually, with no long implementation, no
              TMS replacement, and no commitment up front. Start by
              measuring the opportunity at one terminal, one truck, one
              load.
            </p>
            <div className="closing-actions">
              <Link href="/get-the-app" className="closing-cta">
                Get Early Access &rarr;
              </Link>
              <Link href="/pricing" className="closing-secondary">
                See pricing &rarr;
              </Link>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />

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

        /* ---------- Hero ---------- */
        .hero { padding: 40px 48px 64px; max-width: 900px; }
        .hero-eyebrow {
          margin: 0;
          font: 800 13px var(--font);
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(0,0,0,0.4);
        }
        .hero-h1 {
          margin: 14px 0 0;
          font: 900 76px var(--font);
          letter-spacing: -0.025em;
          line-height: 0.98;
          color: #111;
        }
        /* The punchy WHY tier -- gives the hero its weight below the
           headline, same role .fleet-lead plays on /for-fleets. */
        .hero-lead {
          margin: 26px 0 0;
          max-width: 680px;
          font: 700 24px var(--font);
          letter-spacing: -0.005em;
          line-height: 1.4;
          color: #111;
        }
        /* The WHAT tier -- the literal, functional statement of what the
           product does. */
        .hero-body {
          margin: 16px 0 0;
          max-width: 620px;
          font: 400 17px var(--font);
          line-height: 1.6;
          color: rgba(0,0,0,0.62);
        }
        /* The closing risk-reassurance tier -- deliberately quieter/
           smaller than .hero-body, third in the hierarchy, not a
           same-weight restatement. */
        .hero-sub {
          margin: 14px 0 0;
          max-width: 560px;
          font: 400 14.5px var(--font);
          line-height: 1.6;
          color: rgba(0,0,0,0.5);
        }
        /* ---------- Calculator (light, distinct widget block) ---------- */
        .calc-section {
          background: #f6f6f5;
          border-top: 1px solid rgba(0,0,0,0.07);
          border-bottom: 1px solid rgba(0,0,0,0.07);
          padding: 72px 48px;
          scroll-margin-top: 24px;
        }
        .calc-inner { max-width: 900px; margin: 0 auto; }
        .calc-header { text-align: center; margin-bottom: 32px; }
        .calc-h2 {
          margin: 0;
          font: 900 40px var(--font);
          letter-spacing: -0.02em;
          color: #111;
        }
        .calc-intro {
          margin: 14px auto 0;
          max-width: 500px;
          font: 400 16px var(--font);
          line-height: 1.55;
          color: rgba(0,0,0,0.58);
        }

        /* Three real-load cards, same diagonal-stripe "receipt" motif as
           the old .hero-stat block -- explicitly kept per direction even
           as the content underneath it changed. Alternating dark/light
           treatment (not a uniform color) per explicit direction, so the
           three cards read as distinct examples rather than one repeated
           template. */
        .load-examples {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }
        .load-card {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 22px 20px;
          border-radius: 16px;
        }
        .load-card-light {
          background: repeating-linear-gradient(
            135deg,
            #f2f2f2,
            #f2f2f2 10px,
            #e9e9e9 10px,
            #e9e9e9 20px
          );
          border: 1px dashed rgba(0,0,0,0.25);
        }
        .load-card-dark {
          background: repeating-linear-gradient(
            135deg,
            #1a1a1a,
            #1a1a1a 10px,
            #111111 10px,
            #111111 20px
          );
          border: 1px dashed rgba(255,255,255,0.22);
        }
        .load-card-tag {
          font: 700 10.5px var(--font);
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .load-card-light .load-card-tag { color: rgba(0,0,0,0.45); }
        .load-card-dark .load-card-tag { color: rgba(255,255,255,0.45); }
        .load-card-weight {
          font: 900 30px var(--font);
          letter-spacing: -0.01em;
        }
        .load-card-light .load-card-weight { color: #111; }
        .load-card-dark .load-card-weight { color: #fff; }
        .load-card-weight-unit {
          font: 700 14px var(--font);
          letter-spacing: 0;
        }
        .load-card-sub {
          font: 500 13px var(--font);
          line-height: 1.5;
        }
        .load-card-light .load-card-sub { color: rgba(0,0,0,0.55); }
        .load-card-dark .load-card-sub { color: rgba(255,255,255,0.6); }

        .calc-footnote {
          margin: 20px 0 0;
          font: 400 11.5px var(--font);
          line-height: 1.5;
          color: rgba(0,0,0,0.38);
          text-align: center;
        }

        /* ---------- Problem / Manifesto ---------- */
        .manifesto-section { background: #111111; padding: 88px 48px; }
        .manifesto-inner { max-width: 860px; margin: 0 auto; }
        .manifesto-h2 {
          margin: 0;
          font: 900 44px var(--font);
          letter-spacing: -0.02em;
          line-height: 1.08;
          color: #fff;
          max-width: 760px;
        }
        .manifesto-body {
          margin-top: 30px;
          display: flex;
          flex-direction: column;
          gap: 18px;
          max-width: 660px;
        }
        .manifesto-body p {
          margin: 0;
          font: 400 16px var(--font);
          line-height: 1.65;
          color: rgba(255,255,255,0.62);
        }

        /* ---------- Founder ---------- */
        .founder-section { background: #ffffff; padding: 76px 48px; }
        .founder-inner { max-width: 700px; margin: 0 auto; text-align: center; }
        .founder-quote { margin: 0; padding: 0; border: none; }
        .founder-quote p {
          margin: 0 0 14px;
          font: 700 26px var(--font);
          letter-spacing: -0.01em;
          line-height: 1.4;
          color: #111;
        }
        .founder-quote p:last-child { margin-bottom: 0; color: rgba(0,0,0,0.55); font-weight: 600; }
        .founder-byline {
          margin: 22px 0 0;
          font: 500 13px var(--font);
          color: rgba(0,0,0,0.42);
        }
        .founder-patent { margin: 18px 0 0; }
        .patent-badge {
          display: inline-block;
          padding: 6px 14px;
          border-radius: 999px;
          border: 1px solid rgba(0,0,0,0.18);
          font: 800 10.5px var(--font);
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(0,0,0,0.5);
        }

        /* ---------- Product ---------- */
        .product-section { background: #ffffff; padding: 96px 48px; }
        .product-inner {
          max-width: 1200px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: 1fr 380px;
          gap: 64px;
          align-items: center;
        }
        .product-h2 {
          margin: 0;
          font: 900 42px var(--font);
          letter-spacing: -0.02em;
          line-height: 1.1;
          color: #111;
          max-width: 520px;
        }
        .product-sub {
          margin: 20px 0 0;
          max-width: 520px;
          font: 400 16px var(--font);
          line-height: 1.6;
          color: rgba(0,0,0,0.6);
        }
        .product-features {
          list-style: none;
          margin: 36px 0 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 20px;
          max-width: 520px;
        }
        .product-features li {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding-top: 18px;
          border-top: 1px solid rgba(0,0,0,0.08);
        }
        .product-feature-label {
          display: flex;
          align-items: center;
          gap: 7px;
          font: 800 15px var(--font);
          color: #111;
        }
        .product-feature-label .bullet { color: rgba(0,0,0,0.3); font-size: 16px; }
        .product-feature-body {
          font: 400 13.5px var(--font);
          line-height: 1.5;
          color: rgba(0,0,0,0.55);
          padding-left: 15px;
        }
        .product-visual { display: flex; justify-content: center; }

        /* ---------- Not another TMS ---------- */
        .tms-section { background: #f6f6f5; padding: 96px 48px; }
        .tms-inner { max-width: 780px; margin: 0 auto; text-align: center; }
        .tms-h2 {
          margin: 0 0 40px;
          font: 900 40px var(--font);
          letter-spacing: -0.02em;
          color: #111;
        }
        .tms-flow { display: flex; flex-direction: column; gap: 18px; align-items: center; }
        .tms-line {
          margin: 0;
          font: 500 18px var(--font);
          line-height: 1.5;
          color: rgba(0,0,0,0.5);
          max-width: 600px;
        }
        .tms-line-emphasis {
          font: 800 30px var(--font);
          letter-spacing: -0.01em;
          color: #111;
          max-width: 640px;
        }
        .tms-line-sub {
          font: 400 15px var(--font);
          color: rgba(0,0,0,0.45);
          max-width: 480px;
        }

        /* ---------- Workflow ---------- */
        .workflow-section { background: #ffffff; padding: 96px 48px; }
        .workflow-inner { max-width: 1100px; margin: 0 auto; }
        .workflow-h2 {
          margin: 0;
          font: 900 44px var(--font);
          letter-spacing: -0.02em;
          color: #111;
        }
        .workflow-sub {
          margin: 14px 0 0;
          max-width: 560px;
          font: 400 16px var(--font);
          line-height: 1.6;
          color: rgba(0,0,0,0.55);
        }
        .workflow-steps {
          margin-top: 48px;
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 32px;
        }
        .workflow-step { display: flex; flex-direction: column; }
        .workflow-n {
          font: 800 13px var(--font);
          letter-spacing: 0.08em;
          color: rgba(0,0,0,0.28);
        }
        .workflow-label {
          margin-top: 10px;
          font: 800 26px var(--font);
          letter-spacing: -0.01em;
          color: #111;
        }
        .workflow-body {
          margin: 12px 0 0;
          font: 400 14.5px var(--font);
          line-height: 1.6;
          color: rgba(0,0,0,0.55);
        }

        /* ---------- Audience picker ---------- */
        .audience-section { background: #ffffff; padding: 96px 48px; border-top: 1px solid rgba(0,0,0,0.07); }
        .audience-inner { max-width: 1100px; margin: 0 auto; text-align: center; }
        .audience-eyebrow {
          margin: 0;
          font: 800 12px var(--font);
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(0,0,0,0.4);
        }
        .audience-h2 {
          margin: 14px 0 0;
          font: 900 44px var(--font);
          letter-spacing: -0.02em;
          color: #111;
        }
        .audience-sub {
          margin: 16px auto 0;
          max-width: 560px;
          font: 400 16px var(--font);
          line-height: 1.55;
          color: rgba(0,0,0,0.55);
        }
        .audience-cards {
          margin-top: 48px;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 24px;
          text-align: left;
        }
        .audience-card {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 12px;
          padding: 36px 32px;
          border-radius: 20px;
          background: #f6f6f5;
          border: 1px solid rgba(0,0,0,0.08);
          text-decoration: none;
          color: inherit;
          transition: border-color 150ms ease, background 150ms ease;
        }
        .audience-card:hover { background: #f0f0ee; border-color: rgba(0,0,0,0.16); }
        .audience-card-dark {
          background: #111111;
          border-color: #111111;
          color: #ffffff;
        }
        .audience-card-dark:hover { background: #1c1c1c; border-color: #1c1c1c; }
        .audience-card-label { font: 800 22px var(--font); letter-spacing: -0.01em; }
        .audience-card-body {
          margin: 0;
          font: 400 15px var(--font);
          line-height: 1.55;
          color: rgba(0,0,0,0.6);
        }
        .audience-card-dark .audience-card-body { color: rgba(255,255,255,0.68); }
        .audience-card-cta { margin-top: 4px; font: 700 14px var(--font); color: #111; }
        .audience-card-dark .audience-card-cta { color: #fff; }

        /* ---------- Shared knowledge / network ---------- */
        .network-section { background: #f6f6f5; padding: 96px 48px; }
        .network-inner { max-width: 780px; margin: 0 auto; text-align: center; }
        .network-eyebrow {
          margin: 0;
          font: 800 12px var(--font);
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(0,0,0,0.4);
        }
        .network-h2 {
          margin: 14px 0 0;
          font: 900 38px var(--font);
          letter-spacing: -0.02em;
          line-height: 1.15;
          color: #111;
        }
        .network-sub {
          margin: 16px auto 0;
          max-width: 600px;
          font: 400 16px var(--font);
          line-height: 1.6;
          color: rgba(0,0,0,0.55);
        }
        .network-examples {
          margin-top: 40px;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 18px;
          text-align: left;
        }
        .network-card {
          padding: 22px 22px 20px;
          border-radius: 16px;
          background: #111111;
          border: 1px solid rgba(255,255,255,0.1);
        }
        .network-card-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .network-card-tag {
          font: 800 10.5px var(--font);
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.4);
        }
        .network-card-time { font: 600 11.5px var(--font); color: rgba(255,255,255,0.35); }
        .network-card-title {
          margin: 12px 0 0;
          font: 800 16px var(--font);
          color: #fff;
        }
        .network-card-body {
          margin: 8px 0 0;
          font: 400 13.5px var(--font);
          line-height: 1.55;
          color: rgba(255,255,255,0.6);
        }
        .network-footnote {
          margin: 32px auto 0;
          max-width: 560px;
          font: 500 13px var(--font);
          line-height: 1.6;
          color: rgba(0,0,0,0.45);
        }

        /* ---------- Closing ---------- */
        .closing { background: #111111; padding: 88px 48px; }
        .closing-inner {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 28px;
          max-width: 760px;
          margin: 0 auto;
        }
        .closing-header { text-align: center; }
        .closing-eyebrow {
          margin: 0 0 14px;
          font: 800 12px var(--font);
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.4);
        }
        .closing-h2 { margin: 0; font: 900 44px var(--font); letter-spacing: -0.02em; color: #fff; line-height: 1.08; }
        .closing-footer { text-align: center; }
        .closing-sub {
          margin: 0 auto;
          max-width: 560px;
          font: 400 16px var(--font);
          color: rgba(255,255,255,0.55);
          line-height: 1.55;
        }
        .closing-actions {
          margin-top: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 22px;
          flex-wrap: wrap;
        }
        .closing-cta {
          padding: 14px 26px;
          border-radius: 999px;
          background: #fff;
          color: #111;
          font: 700 15px var(--font);
          text-decoration: none;
        }
        .closing-cta:hover { opacity: 0.85; }
        .closing-secondary {
          font: 700 14px var(--font);
          color: rgba(255,255,255,0.55);
          text-decoration: none;
        }
        .closing-secondary:hover { color: #fff; }

        /* ---------- Mobile ---------- */
        @media (max-width: 980px) {
          .hero { padding: 24px 24px 44px; }
          .hero-h1 { font-size: 44px; }
          .hero-lead { font-size: 19px; }
          .hero-body { font-size: 15.5px; }
          .hero-sub { font-size: 13.5px; }

          .calc-section { padding: 48px 24px; }
          .calc-h2 { font-size: 30px; }
          .load-examples { grid-template-columns: 1fr; }

          .manifesto-section { padding: 56px 24px; }
          .manifesto-h2 { font-size: 30px; }
          .manifesto-body p { font-size: 15px; }

          .founder-section { padding: 48px 24px; }
          .founder-quote p { font-size: 20px; }

          .product-section { padding: 56px 24px; }
          .product-inner { grid-template-columns: 1fr; gap: 40px; }
          .product-h2 { font-size: 30px; max-width: none; }
          .product-sub, .product-features { max-width: none; }
          .product-visual { order: -1; }

          .tms-section { padding: 56px 24px; }
          .tms-h2 { font-size: 30px; }
          .tms-line-emphasis { font-size: 22px; }

          .workflow-section { padding: 56px 24px; }
          .workflow-h2 { font-size: 30px; }
          .workflow-steps { grid-template-columns: 1fr; gap: 28px; margin-top: 32px; }

          .audience-section { padding: 56px 24px; }
          .audience-h2 { font-size: 30px; }
          .audience-cards { grid-template-columns: 1fr; margin-top: 32px; }

          .network-section { padding: 56px 24px; }
          .network-h2 { font-size: 26px; }
          .network-examples { grid-template-columns: 1fr; margin-top: 28px; }

          .closing { padding: 48px 24px; }
          .closing-h2 { font-size: 30px; }
        }
      `}</style>
    </div>
  );
}
