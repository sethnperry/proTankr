"use client";
// app/for-fleets/page.tsx
// Audience page for fleets/companies. Reuses the same design tokens/
// section rhythm as app/page.tsx and app/for-drivers/page.tsx.
//
// Copy rule, same as the homepage: no unsupported guarantees. "Recovers
// unused capacity" and "reduces overweight risk" are defensible; "always
// loads the maximum" or a specific guaranteed CSA/percentage improvement
// is not, so it isn't claimed here. The ROI estimator below is a public
// estimate with a clearly-labeled, editable assumption -- not a promised
// return -- same discipline as the homepage's Opportunity Calculator.
//
// The "Driver Alignment" outcome deliberately does NOT describe a
// leaderboard or a bonus/incentive payout calculator -- the app's real
// utilization scoring is gallon-weighted, staff-visible, and explicitly
// not a ranking (see CLAUDE.md's Payload Utilization system notes). This
// page describes what's actually shipped, not the earlier "earn points,
// earn bonuses" framing that system replaced.

import { useState } from "react";
import Link from "next/link";
import SiteHeader from "../marketing/SiteHeader";
import SiteFooter from "../marketing/SiteFooter";

const OUTCOMES = [
  {
    // The main feature of the app -- its button gets its own concrete,
    // real example (#load-example, inside the Fleet Economics section)
    // rather than sharing the generic explainer the other three link to.
    tag: "Asset optimization",
    title: "Recover unused legal payload.",
    body: "Every load that's planned a little short is a little bit of capacity left at the rack. Small, per-load recovery adds up fast across a fleet.",
    stat: "See the math below ↓",
    href: "#load-example",
  },
  {
    // Deliberately NOT framed as "fewer wasted trips" -- that's the
    // terminal-issue flagging feature's job (Out of Product/Out of
    // Allocation reports), not this one. This is about dispatch having
    // an accurate, per-terminal card picture BEFORE the first dispatch,
    // so the driver never has to radio in mid-route for new sourcing or
    // a card that's about to lapse.
    tag: "Sourcing accuracy",
    title: "Know before you dispatch, not after.",
    body: "Card status updates itself through the normal workflow, down to which terminal a no-load happened at. Pull a driver's cards before the first dispatch — not after they've rolled and need new sourcing.",
    stat: "See how it works →",
    href: "#how-it-works",
  },
  {
    // Deliberately the TERMINAL-first lookup (pick a terminal, see every
    // driver's status there -- staffing/coverage), contrasted against the
    // Sourcing Accuracy tile's DRIVER-first lookup (pick a driver, see
    // their own cards -- one dispatch). Same underlying card data, two
    // real, different directions dispatch actually uses it from -- not
    // redundant once that's explicit. "Renewals... surface automatically"
    // was also dropped -- same overreach already caught on /for-drivers'
    // "when it renews" ("renews" implies the app takes an action; it only
    // flags what's expiring).
    tag: "Dispatch operations",
    title: "See who's carded where, terminal by terminal.",
    body: "Pick a terminal and see every driver's card status there at once — who's covered, who's expiring, who isn't carded yet. The company-wide staffing view, not a single dispatch.",
    stat: "See how it works →",
    href: "#how-it-works",
  },
  {
    // The point of this metric, stated plainly for whoever edits this
    // copy next: reward loading closer to capacity without ever rewarding
    // overloading, cutting corners, or speeding. Loads over the legal
    // weight limit are excluded from scoring entirely (never counted, not
    // just capped), so there is no path to a better number through unsafe
    // loading. The app computes the number only -- it has no payout
    // calculator, by design; a company plugs this into whatever bonus or
    // incentive program it already runs.
    tag: "Driver alignment",
    title: "Reward precision, not risk.",
    body: "A gallon weighted score measures how close each load landed to capacity. Loads over the legal weight limit are excluded, so overloading can never score higher. Feed it into your own bonus program to reward careful loading, not speed.",
    stat: "See how it works →",
    href: "#how-it-works",
  },
];

function fmtInt(n: number) {
  return Math.round(n).toLocaleString("en-US");
}
function fmtUsd(n: number) {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function FleetRoiCalculator() {
  const [fleetSize, setFleetSize] = useState(25);
  const [weeklyLoads, setWeeklyLoads] = useState(10);
  const [recoverableGal, setRecoverableGal] = useState(265);
  const [valuePerGal, setValuePerGal] = useState(0.058);

  const weeklyGallons = fleetSize * weeklyLoads * recoverableGal;
  const annualGallons = weeklyGallons * 52;
  const annualValue = annualGallons * valuePerGal;

  return (
    <div className="roi-card">
      <div className="roi-sliders">
        <label className="roi-field">
          <div className="roi-field-head">
            <span>Fleet size</span>
            <span className="roi-field-val">{fmtInt(fleetSize)} units</span>
          </div>
          <input
            type="range"
            min={1}
            max={250}
            step={1}
            value={fleetSize}
            onChange={(e) => setFleetSize(Number(e.target.value))}
          />
        </label>
        <label className="roi-field">
          <div className="roi-field-head">
            <span>Weekly loads per truck</span>
            <span className="roi-field-val">{fmtInt(weeklyLoads)} / wk</span>
          </div>
          <input
            type="range"
            min={1}
            max={30}
            step={1}
            value={weeklyLoads}
            onChange={(e) => setWeeklyLoads(Number(e.target.value))}
          />
        </label>
        <label className="roi-field">
          <div className="roi-field-head">
            <span>Recoverable gallons / load</span>
            <span className="roi-field-val">{fmtInt(recoverableGal)} gal</span>
          </div>
          <input
            type="range"
            min={10}
            max={500}
            step={5}
            value={recoverableGal}
            onChange={(e) => setRecoverableGal(Number(e.target.value))}
          />
        </label>
        <label className="roi-field">
          <div className="roi-field-head">
            <span>Freight value / recovered gallon</span>
            <span className="roi-field-val">${valuePerGal.toFixed(3)}</span>
          </div>
          <input
            type="range"
            min={0.01}
            max={0.25}
            step={0.001}
            value={valuePerGal}
            onChange={(e) => setValuePerGal(Number(e.target.value))}
          />
        </label>
      </div>

      <div className="roi-result">
        <div className="roi-result-main">
          <span className="roi-result-label">Estimated annual value</span>
          <span className="roi-result-num">{fmtUsd(annualValue)}</span>
        </div>
        <div className="roi-result-sub">
          <span>Weekly extra volume: {fmtInt(weeklyGallons)} gal</span>
          <span>Annual extra volume: {fmtInt(annualGallons)} gal</span>
        </div>
      </div>

      <p className="roi-footnote">
        An estimate, not a guarantee — actual recovery depends on your
        product mix, terminal conditions, and driver behavior. The freight
        value assumption above is yours to set; ProTankr doesn&apos;t
        calculate or promise a dollar figure on your behalf. Subscription
        pricing is still being finalized — see{" "}
        <Link href="/pricing">Pricing</Link>.
      </p>
    </div>
  );
}

// A real completed load, pulled from ProTankr's own recorded verification
// history (not invented for this page) -- available/actual/unused gallons
// and the utilization percentage are the exact figures a real production
// load produced. Kept as its own small card rather than folded into the
// calculator above/below it: the calculator is a projection the visitor
// controls, this is proof the underlying math runs on a real load.
function ExampleLoadCard() {
  return (
    <div id="load-example" className="example-card">
      <p className="example-label">One real completed load</p>
      <div className="example-headline">
        <span className="example-headline-num">98.5%</span>
        <span className="example-headline-label">of legal capacity used</span>
      </div>
      <div className="example-row">
        <div className="example-stat">
          <span className="example-stat-label">Legal capacity that day</span>
          <span className="example-stat-num">7,941 gal</span>
        </div>
        <div className="example-stat">
          <span className="example-stat-label">Actually loaded</span>
          <span className="example-stat-num">7,824 gal</span>
        </div>
        <div className="example-stat example-stat-gap">
          <span className="example-stat-label">Left at the rack</span>
          <span className="example-stat-num">117 gal</span>
        </div>
      </div>
      <p className="example-footnote">
        ProTankr solved the actual legal weight limit for that specific
        truck, trailer, and terminal, using that day&apos;s real density.
        The driver still had 117 gallons of legal room left when they
        pulled away. Multiply a gap like that across a week, a fleet, a
        year, and the calculator below is that same math at your own
        scale.
      </p>
    </div>
  );
}

function FleetVisibilityMock() {
  const rows = [
    { name: "Truck 4408 / Trailer T-11", note: "Tare drift +570 lbs", warn: true },
    { name: "Truck 4192 / Trailer T-04", note: "Registration renews in 12 days", warn: true },
    { name: "Truck 3350 / Trailer T-22", note: "All current", warn: false },
  ];
  return (
    <div className="mock-panel">
      <div className="mock-panel-head">
        <span className="mock-panel-title">Items Needing Attention</span>
        <span className="mock-panel-sub">Fleet-wide</span>
      </div>
      <div className="mock-list">
        {rows.map((r) => (
          <div key={r.name} className="mock-list-row">
            <span className="mock-list-name">{r.name}</span>
            <span className={`mock-list-status${r.warn ? " mock-list-status-warn" : ""}`}>
              {r.note}
            </span>
          </div>
        ))}
      </div>
      <div className="mock-panel-footnote">
        Captured naturally through the driver&apos;s own workflow — nobody
        has to chase this information down.
      </div>
    </div>
  );
}

export default function ForFleetsPage() {
  return (
    <div className="page">
      <SiteHeader active="for-fleets" />

      {/* HERO */}
      <section className="fleet-hero">
        <div className="fleet-hero-inner">
          <p className="fleet-eyebrow">Driver-driven efficiency</p>
          <h1 className="fleet-h1">Efficiency from the bottom up.</h1>
          <p className="fleet-lead">
            The best loading decisions are made where the work happens.
            ProTankr gives drivers a smarter way to plan, adapt to
            changing conditions, and repeat what works.
          </p>
          <p className="fleet-sub">
            No new system to manage. No existing workflow to replace.
            Just a smarter way to turn driver experience into repeatable
            efficiency.
          </p>
          <a href="#roi" className="fleet-cta">
            Calculate Fleet Carrier ROI &rarr;
          </a>
        </div>
      </section>

      {/* OUTCOMES */}
      <section className="outcomes-section">
        <div className="outcomes-inner">
          <p className="outcomes-eyebrow">Measurable business impact</p>
          <h2 className="outcomes-h2">Outcomes that pay for the platform.</h2>
          <div className="outcomes-grid">
            {OUTCOMES.map((o) => (
              <div key={o.tag} className="outcome-tile">
                <span className="outcome-tag">{o.tag}</span>
                <h3 className="outcome-title">{o.title}</h3>
                <p className="outcome-body">{o.body}</p>
                <a href={o.href} className="outcome-stat">{o.stat}</a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS -- the shared destination for the Sourcing Accuracy,
          Dispatch Operations, and Driver Alignment outcome buttons. All
          three are really the same story (the workflow captures this
          automatically) told from three angles, so one explainer section
          serves all three rather than three separate deep dives. */}
      <section id="how-it-works" className="howitworks-section">
        <div className="howitworks-inner">
          <p className="howitworks-eyebrow">How it actually works</p>
          <h2 className="howitworks-h2">The workflow is the whole system.</h2>
          <p className="howitworks-sub">
            There&apos;s no separate admin tool for drivers to remember to
            update. Everything above comes from the same few taps a
            driver already makes to plan and run a load.
          </p>
          <div className="howitworks-steps">
            <div className="howitworks-step">
              <span className="howitworks-num">1</span>
              <h3>Already set up</h3>
              <p>
                The app opens with equipment already selected and the
                last terminal already picked. This step only matters if
                the driver is heading somewhere new or swapping trucks.
              </p>
            </div>
            <div className="howitworks-step">
              <span className="howitworks-num">2</span>
              <h3>Pick a plan</h3>
              <p>
                Choose from preconfigured product and compartment
                layouts in one tap, or skip this too if it&apos;s the same
                plan as last time.
              </p>
            </div>
            <div className="howitworks-step">
              <span className="howitworks-num">3</span>
              <h3>Load, then complete</h3>
              <p>
                See exactly what to load in each compartment, then load
                it. Completing is where the driver checks the BOL
                against the plan. On target gallons and API/temp mean
                nothing to change. Only update what&apos;s actually
                different.
              </p>
            </div>
            <div className="howitworks-step">
              <span className="howitworks-num">4</span>
              <h3>Everything else updates itself</h3>
              <p>
                API and product temp update for the next driver. The
                terminal access card renews. Terminal issues, outages,
                or allocation limits get flagged so other drivers skip a
                wasted trip. The utilization score gets calculated. All
                from the same workflow.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ROI CALCULATOR */}
      <section id="roi" className="roi-section">
        <div className="roi-inner">
          <p className="roi-eyebrow">Fleet economics</p>
          <h2 className="roi-h2">Calculate your carrier payload opportunity.</h2>
          <p className="roi-sub">
            Adjust the fleet size and volume below to see the scale of
            recoverable payload at your own operation.
          </p>
          <ExampleLoadCard />
          <FleetRoiCalculator />
        </div>
      </section>

      {/* FLEET VISIBILITY */}
      <section className="feature-section">
        <div className="feature-row">
          <div className="feature-copy">
            <p className="feature-eyebrow">Fleet visibility</p>
            <h2 className="feature-h2">
              See readiness without asking for it.
            </h2>
            <p className="feature-body">
              Equipment and truck/trailer combinations, current tare, driver
              readiness, terminal card status, credentials and permits, and
              load activity — all visible without a phone call, because
              it&apos;s captured as a natural byproduct of the driver&apos;s
              own workflow, not a report someone has to compile.
            </p>
          </div>
          <div className="feature-visual">
            <FleetVisibilityMock />
          </div>
        </div>
      </section>

      {/* SHARED EQUIPMENT KNOWLEDGE */}
      <section className="quote-section">
        <div className="quote-inner">
          <p className="quote-eyebrow">Shared equipment knowledge</p>
          <h2 className="quote-h2">
            The truck shouldn&apos;t become a mystery every time another
            driver gets in it.
          </h2>
          <p className="quote-body">
            Service history, tare weight, credentials, and known issues stay
            with the equipment through every slip-seat and handoff — not
            with whichever driver happened to notice them last.
          </p>
        </div>
      </section>

      {/* LESS MANAGEMENT, NOT MORE SOFTWARE */}
      <section className="manifesto-section">
        <div className="manifesto-inner">
          <h2 className="manifesto-h2">
            The goal is less management, not more software.
          </h2>
          <div className="manifesto-body">
            <p>
              ProTankr isn&apos;t trying to give dispatch and management more
              screens to watch. It&apos;s trying to give drivers better
              tools and let the workflow capture the information — so
              there&apos;s less to chase down and less to ask for twice.
            </p>
            <p>
              Less chasing. More visibility. More capable drivers, less
              administrative overhead behind them.
            </p>
          </div>
        </div>
      </section>

      {/* CLOSING CTA */}
      <section className="closing">
        <div className="closing-inner">
          <p className="closing-eyebrow">The Opportunity</p>
          <h2 className="closing-h2">
            What is your fleet leaving on the table?
          </h2>
          <p className="closing-sub">
            No long implementation, no TMS replacement, no commitment up
            front. Start by measuring the opportunity at one terminal, one
            truck, one load.
          </p>
          <div className="closing-actions">
            <Link href="/get-the-app" className="closing-cta">
              Get Early Access &rarr;
            </Link>
            <Link href="/for-drivers" className="closing-secondary">
              See the driver side &rarr;
            </Link>
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
        .fleet-hero { padding: 44px 48px 64px; }
        .fleet-hero-inner { max-width: 820px; margin: 0 auto; text-align: center; }
        .fleet-eyebrow {
          margin: 0;
          font: 800 12px var(--font);
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(0,0,0,0.4);
        }
        .fleet-h1 {
          margin: 16px 0 0;
          font: 900 46px var(--font);
          letter-spacing: -0.02em;
          line-height: 1.1;
          color: #111;
        }
        /* The subheadline tier -- gives the hero its punch, sized well
           below the h1 but clearly above the closing tier. */
        .fleet-lead {
          margin: 24px auto 0;
          max-width: 640px;
          font: 700 23px var(--font);
          letter-spacing: -0.005em;
          line-height: 1.45;
          color: #111;
        }
        /* The closing "no new system, no workflow to replace" statement --
           deliberately smaller/quieter than .fleet-lead, third in the
           hierarchy, not a restatement at the same visual weight. */
        .fleet-sub {
          margin: 16px auto 0;
          max-width: 520px;
          font: 400 14.5px var(--font);
          line-height: 1.6;
          color: rgba(0,0,0,0.5);
        }
        .fleet-cta {
          display: inline-block;
          margin-top: 30px;
          padding: 14px 26px;
          border-radius: 999px;
          background: #111;
          color: #fff;
          font: 700 15px var(--font);
          text-decoration: none;
        }
        .fleet-cta:hover { opacity: 0.85; }

        /* ---------- Outcomes ---------- */
        .outcomes-section { background: #f6f6f5; padding: 80px 48px; border-top: 1px solid rgba(0,0,0,0.07); border-bottom: 1px solid rgba(0,0,0,0.07); }
        .outcomes-inner { max-width: 1100px; margin: 0 auto; }
        .outcomes-eyebrow {
          margin: 0;
          font: 800 12px var(--font);
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(0,0,0,0.4);
        }
        .outcomes-h2 {
          margin: 12px 0 0;
          font: 900 38px var(--font);
          letter-spacing: -0.02em;
          color: #111;
        }
        .outcomes-grid {
          margin-top: 40px;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 20px;
        }
        .outcome-tile {
          padding: 28px;
          border-radius: 20px;
          background: #ffffff;
          border: 1px solid rgba(0,0,0,0.08);
          display: flex;
          flex-direction: column;
        }
        .outcome-tag {
          font: 800 10.5px var(--font);
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(0,0,0,0.4);
        }
        .outcome-title {
          margin: 10px 0 0;
          font: 800 21px var(--font);
          letter-spacing: -0.01em;
          color: #111;
        }
        .outcome-body {
          margin: 10px 0 0;
          font: 400 14px var(--font);
          line-height: 1.6;
          color: rgba(0,0,0,0.55);
          flex: 1;
        }
        .outcome-stat {
          margin-top: 16px;
          display: inline-block;
          align-self: flex-start;
          padding: 7px 12px;
          border-radius: 8px;
          background: #111;
          color: #fff;
          font: 700 12px var(--font);
          text-decoration: none;
        }
        .outcome-stat:hover { opacity: 0.8; }

        /* ---------- How it works ---------- */
        .howitworks-section { background: #ffffff; padding: 88px 48px; }
        .howitworks-inner { max-width: 920px; margin: 0 auto; text-align: center; }
        .howitworks-eyebrow {
          margin: 0;
          font: 800 12px var(--font);
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(0,0,0,0.4);
        }
        .howitworks-h2 { margin: 12px 0 0; font: 900 34px var(--font); letter-spacing: -0.02em; color: #111; }
        .howitworks-sub {
          margin: 14px auto 0;
          max-width: 560px;
          font: 400 15.5px var(--font);
          line-height: 1.6;
          color: rgba(0,0,0,0.55);
        }
        .howitworks-steps {
          margin-top: 48px;
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 28px;
          text-align: left;
        }
        .howitworks-step { display: flex; flex-direction: column; gap: 8px; }
        .howitworks-num { font: 900 26px var(--font); color: rgba(0,0,0,0.15); }
        .howitworks-step h3 { margin: 0; font: 800 16px var(--font); color: #111; }
        .howitworks-step p { margin: 0; font: 400 13.5px var(--font); line-height: 1.55; color: rgba(0,0,0,0.55); }

        /* ---------- Real-load example (sits inside the ROI section) ---------- */
        .example-card {
          margin-top: 28px;
          text-align: left;
          border-radius: 20px;
          background: #1a1a1a;
          border: 1px solid rgba(255,255,255,0.1);
          padding: 32px;
        }
        .example-label {
          margin: 0;
          font: 800 11px var(--font);
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.4);
        }
        .example-headline { margin-top: 14px; display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
        .example-headline-num { font: 900 44px var(--font); letter-spacing: -0.01em; color: #fff; }
        .example-headline-label { font: 700 13px var(--font); color: rgba(255,255,255,0.5); }
        .example-row {
          margin-top: 24px;
          padding-top: 22px;
          border-top: 1px solid rgba(255,255,255,0.12);
          display: flex;
          gap: 28px;
          flex-wrap: wrap;
        }
        .example-stat { display: flex; flex-direction: column; gap: 4px; }
        .example-stat-label { font: 700 11px var(--font); letter-spacing: 0.03em; color: rgba(255,255,255,0.4); }
        .example-stat-num { font: 800 18px var(--font); color: #fff; }
        .example-stat-gap .example-stat-num { color: #4ade80; }
        .example-footnote { margin: 22px 0 0; font: 400 12px var(--font); line-height: 1.55; color: rgba(255,255,255,0.4); }

        /* ---------- ROI calculator ---------- */
        .roi-section { background: #111111; padding: 88px 48px; }
        .roi-inner { max-width: 720px; margin: 0 auto; text-align: center; }
        .roi-eyebrow {
          margin: 0;
          font: 800 12px var(--font);
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.4);
        }
        .roi-h2 { margin: 12px 0 0; font: 900 34px var(--font); letter-spacing: -0.02em; color: #fff; }
        .roi-sub {
          margin: 14px auto 0;
          max-width: 480px;
          font: 400 15px var(--font);
          line-height: 1.55;
          color: rgba(255,255,255,0.55);
        }

        .roi-card {
          margin-top: 40px;
          text-align: left;
          border-radius: 20px;
          background: #1a1a1a;
          border: 1px solid rgba(255,255,255,0.1);
          padding: 32px;
        }
        .roi-sliders { display: flex; flex-direction: column; gap: 22px; }
        .roi-field { display: flex; flex-direction: column; gap: 8px; }
        .roi-field-head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          font: 700 12.5px var(--font);
          color: rgba(255,255,255,0.6);
        }
        .roi-field-val { font: 800 14px var(--font); color: #fff; }
        .roi-field input[type="range"] {
          width: 100%;
          accent-color: #ffffff;
          height: 4px;
        }

        .roi-result {
          margin-top: 30px;
          padding-top: 26px;
          border-top: 1px solid rgba(255,255,255,0.12);
          text-align: center;
        }
        .roi-result-main { display: flex; flex-direction: column; gap: 4px; }
        .roi-result-label {
          font: 700 11px var(--font);
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.4);
        }
        .roi-result-num { font: 900 44px var(--font); letter-spacing: -0.01em; color: #fff; }
        .roi-result-sub {
          margin-top: 12px;
          display: flex;
          justify-content: center;
          gap: 20px;
          flex-wrap: wrap;
          font: 600 12.5px var(--font);
          color: rgba(255,255,255,0.5);
        }

        .roi-footnote {
          margin: 22px 0 0;
          font: 400 12px var(--font);
          line-height: 1.55;
          color: rgba(255,255,255,0.4);
        }
        .roi-footnote a { color: rgba(255,255,255,0.7); text-decoration: underline; }
        .roi-footnote a:hover { color: #fff; }

        /* ---------- Feature row (shared shape with /for-drivers) ---------- */
        .feature-section { background: #ffffff; padding: 88px 48px; }
        .feature-row {
          max-width: 1140px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 56px;
          align-items: center;
        }
        .feature-eyebrow {
          margin: 0;
          font: 800 12px var(--font);
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(0,0,0,0.4);
        }
        .feature-h2 {
          margin: 12px 0 0;
          font: 900 32px var(--font);
          letter-spacing: -0.015em;
          line-height: 1.15;
          color: #111;
          max-width: 480px;
        }
        .feature-body {
          margin: 18px 0 0;
          max-width: 480px;
          font: 400 15.5px var(--font);
          line-height: 1.65;
          color: rgba(0,0,0,0.6);
        }
        .feature-visual { display: flex; justify-content: center; }

        /* ---------- Mock UI panel ---------- */
        .mock-panel {
          width: 100%;
          max-width: 420px;
          border-radius: 20px;
          background: #111111;
          border: 1px solid rgba(255,255,255,0.1);
          padding: 24px;
        }
        .mock-panel-head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 10px;
          padding-bottom: 16px;
          border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        .mock-panel-title { font: 800 15px var(--font); color: #fff; }
        .mock-panel-sub { font: 600 11.5px var(--font); color: rgba(255,255,255,0.4); white-space: nowrap; }
        .mock-panel-footnote {
          margin-top: 16px;
          padding-top: 14px;
          border-top: 1px solid rgba(255,255,255,0.08);
          font: 400 12px var(--font);
          line-height: 1.55;
          color: rgba(255,255,255,0.4);
        }
        .mock-list { margin-top: 16px; display: flex; flex-direction: column; gap: 12px; }
        .mock-list-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding-bottom: 12px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }
        .mock-list-row:last-child { border-bottom: none; padding-bottom: 0; }
        .mock-list-name { font: 600 13.5px var(--font); color: rgba(255,255,255,0.85); }
        .mock-list-status { font: 700 12px var(--font); color: rgba(255,255,255,0.5); white-space: nowrap; text-align: right; }
        .mock-list-status-warn { color: #fff; text-decoration: underline; text-decoration-style: dotted; text-underline-offset: 3px; }

        /* ---------- Quote / manifesto sections ---------- */
        .quote-section { background: #f6f6f5; padding: 80px 48px; }
        .quote-inner { max-width: 720px; margin: 0 auto; text-align: center; }
        .quote-eyebrow {
          margin: 0;
          font: 800 12px var(--font);
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(0,0,0,0.4);
        }
        .quote-h2 {
          margin: 14px 0 0;
          font: 800 30px var(--font);
          letter-spacing: -0.015em;
          line-height: 1.3;
          color: #111;
        }
        .quote-body {
          margin: 18px auto 0;
          max-width: 560px;
          font: 400 15.5px var(--font);
          line-height: 1.65;
          color: rgba(0,0,0,0.55);
        }

        .manifesto-section { background: #111111; padding: 88px 48px; }
        .manifesto-inner { max-width: 780px; margin: 0 auto; text-align: center; }
        .manifesto-h2 {
          margin: 0 auto;
          font: 900 38px var(--font);
          letter-spacing: -0.02em;
          line-height: 1.15;
          color: #fff;
          max-width: 620px;
        }
        .manifesto-body {
          margin-top: 24px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .manifesto-body p {
          margin: 0 auto;
          max-width: 560px;
          font: 400 16px var(--font);
          line-height: 1.65;
          color: rgba(255,255,255,0.62);
        }

        /* ---------- Closing ---------- */
        .closing { background: #ffffff; padding: 88px 48px; border-top: 1px solid rgba(0,0,0,0.07); }
        .closing-inner { max-width: 640px; margin: 0 auto; text-align: center; }
        .closing-eyebrow {
          margin: 0 0 12px;
          font: 800 12px var(--font);
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(0,0,0,0.4);
        }
        .closing-h2 { margin: 0; font: 900 40px var(--font); letter-spacing: -0.02em; color: #111; line-height: 1.1; }
        .closing-sub {
          margin: 16px auto 0;
          max-width: 460px;
          font: 400 15px var(--font);
          color: rgba(0,0,0,0.55);
          line-height: 1.55;
        }
        .closing-actions {
          margin-top: 26px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 22px;
          flex-wrap: wrap;
        }
        .closing-cta {
          padding: 14px 26px;
          border-radius: 999px;
          background: #111;
          color: #fff;
          font: 700 15px var(--font);
          text-decoration: none;
        }
        .closing-cta:hover { opacity: 0.85; }
        .closing-secondary {
          font: 700 14px var(--font);
          color: rgba(0,0,0,0.5);
          text-decoration: none;
        }
        .closing-secondary:hover { color: #111; }

        /* ---------- Mobile ---------- */
        @media (max-width: 980px) {
          .fleet-hero { padding: 28px 24px 44px; }
          .fleet-h1 { font-size: 32px; }
          .fleet-lead { font-size: 19px; }

          .outcomes-section { padding: 48px 24px; }
          .outcomes-h2 { font-size: 28px; }
          .outcomes-grid { grid-template-columns: 1fr; }

          .howitworks-section { padding: 48px 24px; }
          .howitworks-h2 { font-size: 26px; }
          .howitworks-steps { grid-template-columns: 1fr; gap: 28px; }

          .roi-section { padding: 48px 24px; }
          .roi-h2 { font-size: 26px; }
          .roi-card { padding: 22px; }
          .roi-result-num { font-size: 34px; }
          .example-card { padding: 22px; }
          .example-headline-num { font-size: 34px; }
          .example-row { gap: 20px; }

          .feature-section { padding: 48px 24px; }
          .feature-row { grid-template-columns: 1fr; gap: 32px; }
          .feature-h2 { font-size: 26px; max-width: none; }
          .feature-body { max-width: none; }

          .quote-section { padding: 48px 24px; }
          .quote-h2 { font-size: 24px; }

          .manifesto-section { padding: 48px 24px; }
          .manifesto-h2 { font-size: 28px; }

          .closing { padding: 48px 24px; }
          .closing-h2 { font-size: 30px; }
        }
      `}</style>
    </div>
  );
}
