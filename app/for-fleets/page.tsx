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
    tag: "Asset optimization",
    title: "Recover unused legal payload.",
    body: "Every load that's planned a little short is a little bit of capacity left at the rack. Small, per-load recovery adds up fast across a fleet.",
    stat: "See the math below ↓",
  },
  {
    tag: "Time & deadhead",
    title: "Fewer wasted trips to the wrong terminal.",
    body: "Terminal and card readiness are visible before a truck is dispatched, so nobody gets sent somewhere they can't load or aren't carded.",
    stat: "Fewer blind dispatches",
  },
  {
    tag: "Dispatch operations",
    title: "Terminal card readiness, fleet-wide.",
    body: "See who's carded where without calling around. Renewals and expirations surface automatically instead of getting discovered at the gate.",
    stat: "Real-time, company-wide",
  },
  {
    tag: "Driver alignment",
    title: "An honest, shared baseline.",
    body: "A gallon-weighted utilization score gives every load the same objective measure of how close it landed to capacity — a coaching reference, not a leaderboard.",
    stat: "No ranking. Just data.",
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
          <p className="fleet-eyebrow">Fleet operations &amp; asset utilization</p>
          <h1 className="fleet-h1">
            The goal isn&apos;t more management.
            <br />
            It&apos;s less need for it.
          </h1>
          <p className="fleet-sub">
            Move routine operational intelligence to the point of work.
            Drivers get precise loading tools; dispatch gets instant
            terminal and equipment readiness — without more headcount
            watching over either.
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
                <span className="outcome-stat">{o.stat}</span>
              </div>
            ))}
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
        .fleet-sub {
          margin: 22px auto 0;
          max-width: 620px;
          font: 400 16.5px var(--font);
          line-height: 1.6;
          color: rgba(0,0,0,0.6);
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
        }

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

          .outcomes-section { padding: 48px 24px; }
          .outcomes-h2 { font-size: 28px; }
          .outcomes-grid { grid-template-columns: 1fr; }

          .roi-section { padding: 48px 24px; }
          .roi-h2 { font-size: 26px; }
          .roi-card { padding: 22px; }
          .roi-result-num { font-size: 34px; }

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
