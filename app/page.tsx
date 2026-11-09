"use client";
// app/page.tsx — protankr.com marketing landing page.
// Unauthenticated and authenticated visitors both see this; CTAs link to
// /get-the-app (the site's one real lead-capture path today), /pricing,
// or one of the two audience-specific pages (/for-drivers, /for-fleets).
//
// Reframed 2026-11 (v5). The site used to describe ProTankr as a driver-only
// load-plan calculator: an optimization layer that replaced nothing. That is
// no longer the product. ProTankr now runs the whole trip (plan, load,
// deliver, document) and sits between the TMS and the physical work. It
// replaces the clipboard, the scan-and-upload app and the stand-alone forms,
// while still working alongside the TMS and the ELD. The load planner is
// now the first step of that story, not the whole story.
//
// Screens are real captures from the public demo account
// (public/app-screens/*.jpg), not mockups. The dashboard capture is the
// guided tour's sample trip, which uses the real dashboard components.
//
// Copy rules, deliberate:
//  - Nothing here may claim ProTankr prevents overweight loads outright.
//    A sudden shift in terminal or product conditions can still catch a
//    driver out before the network has data on it. Avoid "never",
//    "guaranteed", "always safe", "eliminates" and similar absolutes.
//  - ProTankr is not a TMS and not an ELD. Say so plainly. Hours shown in
//    the app come from the carrier's existing ELD.
//  - The terminal still issues the BOL. ProTankr captures its numbers; it
//    does not replace the terminal's document.
//  - Don't name competitor products on the site; name the category.

import Link from "next/link";
import SiteHeader from "./marketing/SiteHeader";
import SiteFooter from "./marketing/SiteFooter";
import PhoneScreen from "./marketing/PhoneScreen";

// Three real, completed loads pulled from the ProTankr Planner's own
// "Load Report" screens (Buckey North, Tampa, FL) -- not invented example
// data. Deliberately kept as the exact figures shown on those reports
// (including the terminal's own on-file spelling) rather than rounded or
// "cleaned up". Three different product combinations, calculated against
// the same legal limit, landed within 76 lbs of each other.
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

// The four stages of a trip, in the order a driver lives them. Same four
// words the in-app dashboard walks through.
const TRIP_STAGES = [
  {
    n: "01",
    label: "Plan",
    body: "Dispatch builds the day, or the driver does. Compartments, products, supplier and order numbers are set before the truck moves, and the weight math is done for today's equipment and temperature.",
  },
  {
    n: "02",
    label: "Load",
    body: "Arrive, begin, finish. Times stamp themselves, API and temperature are checked against what other drivers saw at that rack, and BOL numbers are captured per product.",
  },
  {
    n: "03",
    label: "Deliver",
    body: "Match each compartment to a store tank, record before and after readings, collect the signatures. Delays get a reason as they happen, not a guess made later.",
  },
  {
    n: "04",
    label: "Document",
    body: "The Product Transfer Document, trip times, miles and the hours report are built from what was already captured. Nothing is typed twice.",
  },
];

// What the product takes the place of. Written as "what you do today" ->
// "what happens instead", and careful about the BOL: the terminal still
// issues it.
const REPLACES = [
  {
    was: "Paper PTDs and BOL transcription",
    now: "The terminal still issues the BOL. ProTankr captures its numbers per product at the rack, then builds the Product Transfer Document with times, tank readings and signatures.",
  },
  {
    was: "Scan-and-upload apps",
    now: "No photographing paper at the end of the day. The record is built while the trip happens, so there is nothing left to scan, crop and send.",
  },
  {
    was: "Stand-alone electronic forms",
    now: "Fuel stops, delivery details, additives, issues and delay reasons are taps inside the trip, not separate form links to find and fill out.",
  },
  {
    was: "Texts and calls to dispatch",
    now: "Terminal conditions, hours, truck position and who is headed where are visible on the dashboard, instead of asked for by message.",
  },
  {
    was: "Spreadsheets for cards, permits and service",
    now: "Terminal access, credentials, equipment permits and service due roll up into one expiration view with one set of color rules.",
  },
  {
    was: "Receipts and mileage logs",
    now: "Fuel stops, MPG and miles by state come from the same trip record. With a connected tracker, that is the raw material for your fuel tax return.",
  },
];

const REPORT_POINTS = [
  {
    label: "Trips & PTDs",
    body: "Every completed trip, one tap to its Product Transfer Document. Print it or save a PDF.",
  },
  {
    label: "DROP report",
    body: "Days worked, hours, loads, gallons and miles for any period, ready to download.",
  },
  {
    label: "Payload utilization",
    body: "How much of the available capacity each load used, measured the same way every time.",
  },
  {
    label: "Equipment and compliance",
    body: "Scale, service and fuel history by truck, plus terminal cards and credentials in one place.",
  },
];

export default function Home() {
  return (
    <div className="page">
      <SiteHeader />

      {/* 1. HERO — the new frame: ProTankr is the layer between the TMS and
          the physical work. Same 3-tier copy descent as before (lead ->
          body -> sub), each tier a step quieter. */}
      <section className="hero hero-split">
        <div className="hero-copy">
          <p className="hero-eyebrow">The work layer for fuel haulers</p>
          <h1 className="hero-h1">Between the TMS and the truck.</h1>
          <p className="hero-lead">
            Dispatch plans the trip. ProTankr runs it, and the paperwork
            writes itself.
          </p>
          <p className="hero-body">
            One app takes a driver from plan to rack to drop: the load plan,
            the arrival times, the BOL details, the tank readings, the
            signatures. Each one entered once, at the moment it happens.
          </p>
          <p className="hero-sub">
            Works alongside your TMS and your ELD. It replaces the
            clipboard, the scan app and the forms in between.
          </p>
          <div className="hero-actions">
            <Link href="/get-the-app" className="btn-primary">
              Get Early Access &rarr;
            </Link>
            <a href="#trip" className="btn-secondary">
              See a trip, start to finish
            </a>
          </div>
        </div>
        <div className="hero-visual">
          <PhoneScreen
            src="/app-screens/dashboard.jpg?v=20261110"
            alt="ProTankr Driver Dashboard: hours, current trip, compartments and the next-step button"
            width={340}
            maxHeight={440}
          />
        </div>
      </section>

      {/* 2. PROBLEM — the cost of scattered records, before the pitch. */}
      <section className="manifesto-section">
        <div className="manifesto-inner">
          <h2 className="manifesto-h2">
            Your TMS knows the order. Nobody is recording the work.
          </h2>
          <div className="manifesto-body">
            <p>
              A fuel haul is dozens of small facts: when the truck arrived,
              which rack, what the BOL says, what the tanks read before and
              after, who signed. Today they are scattered across paper,
              photos, scan apps, form links and text messages.
            </p>
            <p>
              Somebody re-keys them. Somebody chases the missing ones. And
              the number that decides the load, how much the trailer can
              legally carry today, gets guessed at the rack.
            </p>
            <p>
              ProTankr captures each fact once, in the cab, as the work
              happens. The records your office used to assemble afterward
              are simply there.
            </p>
          </div>
        </div>
      </section>

      {/* 3. THE TRIP — four stages, then the real screens that go with them. */}
      <section id="trip" className="workflow-section">
        <div className="workflow-inner">
          <h2 className="workflow-h2">One trip, start to finish.</h2>
          <p className="workflow-sub">
            The same few taps a driver already makes to run a load are the
            whole system. There is no separate admin tool to remember and no
            end-of-day paperwork.
          </p>
          <div className="workflow-steps">
            {TRIP_STAGES.map((s) => (
              <div key={s.n} className="workflow-step">
                <span className="workflow-n">{s.n}</span>
                <span className="workflow-label">{s.label}.</span>
                <p className="workflow-body">{s.body}</p>
              </div>
            ))}
          </div>

          <div className="screens-row">
            <figure className="screen-fig">
              <PhoneScreen
                src="/app-screens/plan.jpg?v=20261110"
                alt="The load plan: three compartments with products, gallons and a target weight"
                width={300}
                maxHeight={470}
              />
              <figcaption>
                <strong>Plan the load.</strong> Compartments, products and
                weight for today&apos;s equipment.
              </figcaption>
            </figure>
            <figure className="screen-fig">
              <PhoneScreen
                src="/app-screens/trips.jpg?v=20261110"
                alt="Trips and PTDs: completed orders with terminal, store, truck and compartment strip"
                width={300}
                maxHeight={470}
              />
              <figcaption>
                <strong>Run the trip.</strong> Every order, terminal and
                store in one list.
              </figcaption>
            </figure>
            <figure className="screen-fig">
              <PhoneScreen
                src="/app-screens/ptd.jpg?v=20261110"
                alt="A completed Product Transfer Document with barcode, compartments, BOL numbers and deliveries"
                width={300}
                maxHeight={470}
              />
              <figcaption>
                <strong>Get the paperwork.</strong> The Product Transfer
                Document, built from the trip.
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      {/* 4. WHAT IT REPLACES */}
      <section className="replace-section">
        <div className="replace-inner">
          <p className="audience-eyebrow">What it replaces</p>
          <h2 className="replace-h2">
            Fewer apps. Fewer forms. No re-keying.
          </h2>
          <p className="replace-sub">
            ProTankr does not ask you to give up your TMS. It takes over the
            small, manual jobs that grew up around it.
          </p>
          <div className="replace-grid">
            {REPLACES.map((r) => (
              <div key={r.was} className="replace-card">
                <span className="replace-was">{r.was}</span>
                <p className="replace-now">{r.now}</p>
              </div>
            ))}
          </div>
          <p className="replace-foot">
            ProTankr is not an ELD. Hours shown in the app come from your
            existing ELD.
          </p>
        </div>
      </section>

      {/* 5. PRECISION — the load planner, now one step of the story. Same
          real completed loads as before. */}
      <section id="calculator" className="calc-section">
        <div className="calc-inner">
          <div className="calc-header">
            <h2 className="calc-h2">
              And the load plan is still the sharpest tool in the cab.
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
            Real completed loads from ProTankr. Actual weight is calculated
            from live API and temperature at the time of loading, not looked
            up after the fact.
          </p>
        </div>
      </section>

      {/* 6. REPORTS — what the office gets for free. */}
      <section id="product" className="product-section">
        <div className="product-inner reports-inner">
          <div className="product-copy">
            <h2 className="product-h2">Reports that write themselves.</h2>
            <p className="product-sub">
              Because every fact was captured as it happened, the reports
              your office assembles by hand are already there when the
              driver finishes the last drop.
            </p>
            <ul className="product-features">
              {REPORT_POINTS.map((f) => (
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
          <div className="product-visual reports-visual">
            <PhoneScreen
              src="/app-screens/reports.jpg?v=20261110"
              alt="The Reports hub: loads, DROP report, payload utilization, terminal cards and equipment history"
              width={270}
              maxHeight={540}
            />
            <PhoneScreen
              src="/app-screens/drop-report.jpg?v=20261110"
              alt="A DROP report: days worked, hours, loads, utilization score, gallons and miles"
              width={270}
              maxHeight={540}
            />
          </div>
        </div>
      </section>

      {/* 7. THE BRIDGE — where ProTankr sits among the systems a hauler
          already runs. */}
      <section className="tms-section">
        <div className="tms-inner">
          <h2 className="tms-h2">The bridge, not another TMS.</h2>
          <div className="tms-flow">
            <p className="tms-line">
              Your TMS holds the order, the customer and the invoice. Your
              ELD holds the hours. Your dispatcher decides what to haul.
            </p>
            <p className="tms-line tms-line-emphasis">
              ProTankr is where the physical work gets done and recorded.
            </p>
            <p className="tms-line tms-line-sub">
              It sits beside the systems you already run and does not ask
              you to replace them. Where it can replace a clipboard, a scan
              app or a form, it does.
            </p>
          </div>
        </div>
      </section>

      {/* 8. AUDIENCE PICKER — fork into the two ways to use ProTankr. */}
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
                Plan the load, run the trip, and have the paperwork done
                before you pull out of the last drop.
              </p>
              <span className="audience-card-cta">
                See the driver tools &rarr;
              </span>
            </Link>
            <Link href="/for-fleets" className="audience-card audience-card-dark">
              <span className="audience-card-label">For Fleets</span>
              <p className="audience-card-body">
                See every trip, card and truck without asking, and get
                the records your office used to chase.
              </p>
              <span className="audience-card-cta">
                See the fleet tools &rarr;
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* 9. SHARED KNOWLEDGE — the network effect, made concrete. */}
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

      {/* 10. FOUNDER STORY */}
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
            Built by a driver, for drivers. Built for{" "}
            <span className="founder-byline-strong">bulk</span>.
          </p>
          <p className="founder-patent">
            <span className="patent-badge">Patent Pending</span>
          </p>
        </div>
      </section>

      {/* 11. FINAL CTA */}
      <section className="closing">
        <div className="closing-inner">
          <div className="closing-header">
            <p className="closing-eyebrow">Early access</p>
            <h2 className="closing-h2">
              See a whole trip run on one screen.
            </h2>
          </div>

          <div className="closing-footer">
            <p className="closing-sub">
              ProTankr rolls out gradually, with no long implementation, no
              TMS replacement, and no commitment up front. Start with one
              driver, one truck, one trip, and see what stops needing to be
              typed twice.
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
        .founder-byline-strong {
          font-weight: 800;
          color: rgba(0,0,0,0.78);
          letter-spacing: 0.02em;
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

        /* ---------- v5 reframe additions ---------- */
        .hero-split {
          max-width: 1200px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: minmax(0, 1fr) 360px;
          gap: 56px;
          align-items: center;
        }
        .hero-split .hero-h1 { font-size: 64px; }
        .hero-visual { display: flex; justify-content: center; }
        .hero-actions { margin-top: 32px; display: flex; flex-wrap: wrap; gap: 12px; }
        .btn-primary {
          display: inline-block;
          padding: 15px 26px;
          background: #111;
          color: #fff;
          border-radius: 999px;
          font: 800 15px var(--font);
          text-decoration: none;
        }
        .btn-secondary {
          display: inline-block;
          padding: 14px 24px;
          border: 1.5px solid rgba(0,0,0,0.2);
          color: #111;
          border-radius: 999px;
          font: 700 15px var(--font);
          text-decoration: none;
        }
        .screens-row {
          margin-top: 64px;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 32px;
          justify-items: center;
        }
        .screen-fig { margin: 0; display: flex; flex-direction: column; align-items: center; gap: 22px; }
        .screen-fig figcaption {
          max-width: 280px;
          text-align: center;
          font: 400 14px var(--font);
          line-height: 1.5;
          color: rgba(0,0,0,0.55);
        }
        .screen-fig figcaption strong { color: #111; font-weight: 800; }
        .replace-section { background: #f6f6f5; padding: 96px 48px; }
        .replace-inner { max-width: 1100px; margin: 0 auto; text-align: center; }
        .replace-h2 {
          margin: 12px 0 0;
          font: 900 42px var(--font);
          letter-spacing: -0.02em;
          line-height: 1.1;
          color: #111;
        }
        .replace-sub {
          margin: 16px auto 0;
          max-width: 600px;
          font: 400 16px var(--font);
          line-height: 1.6;
          color: rgba(0,0,0,0.6);
        }
        .replace-grid {
          margin-top: 44px;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 16px;
          text-align: left;
        }
        .replace-card {
          background: #fff;
          border: 1px solid rgba(0,0,0,0.08);
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .replace-was {
          font: 800 16px var(--font);
          color: #111;
          text-decoration: line-through;
          text-decoration-color: rgba(0,0,0,0.3);
        }
        .replace-now { margin: 0; font: 400 14px var(--font); line-height: 1.55; color: rgba(0,0,0,0.6); }
        .replace-foot { margin: 28px 0 0; font: 600 13px var(--font); color: rgba(0,0,0,0.45); }
        .reports-inner { grid-template-columns: minmax(0, 1fr) 600px; }
        .reports-visual { gap: 24px; align-items: flex-start; }

        /* ---------- Mobile ---------- */
        @media (max-width: 980px) {
          .hero { padding: 24px 24px 44px; }
          .hero-h1 { font-size: 44px; }
          .hero-lead { font-size: 19px; }
          .hero-body { font-size: 15.5px; }
          .hero-sub { font-size: 13.5px; }

          .hero-split { grid-template-columns: 1fr; gap: 36px; }
          .hero-split .hero-h1 { font-size: 44px; }
          .hero-visual { order: 2; }
          .screens-row { grid-template-columns: 1fr; gap: 44px; margin-top: 40px; }
          .replace-section { padding: 56px 24px; }
          .replace-h2 { font-size: 30px; }
          .replace-grid { grid-template-columns: 1fr; }
          .reports-inner { grid-template-columns: 1fr; }
          .reports-visual { flex-direction: column; align-items: center; }

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
