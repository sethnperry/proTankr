"use client";
// app/for-drivers/page.tsx
// Audience page for drivers (owner-operators and company drivers alike).
// Reachable from the homepage's audience picker and the site nav. Reuses
// the same design tokens/section rhythm as app/page.tsx and app/about --
// white/off-white background, black emphasis cards, Outfit font, pill
// CTAs -- rather than inventing a second visual language for this page.
//
// The illustrative "mock" panels below (compartment bars, terminal card
// rows, the equipment drift tracker) are hand-built monochrome UI
// sketches, not screenshots -- they're deliberately grayscale (no product
// colors) to stay inside this site's monochromatic identity, while still
// resembling the real app's actual dark-theme layout, not a generic
// analytics dashboard.

import Link from "next/link";
import SiteHeader from "../marketing/SiteHeader";
import SiteFooter from "../marketing/SiteFooter";
import PhoneScreen from "../marketing/PhoneScreen";

const CHECKLIST = [
  "Terminal cards & renewal alerts",
  "Custom compartment sequences",
  "Equipment, tare & service history",
  "Shared, verified terminal data",
];

function LoadPlanMock() {
  const bars = [46, 78, 62, 100];
  return (
    <div className="mock-panel">
      <div className="mock-panel-head">
        <span className="mock-panel-title">Marathon &middot; Tampa, FL</span>
        <span className="mock-panel-sub">South Rack</span>
      </div>
      <div className="mock-bars">
        {bars.map((h, i) => (
          <div key={i} className="mock-bar-col">
            <div className="mock-bar-track">
              <div className="mock-bar-fill" style={{ height: `${h}%` }} />
            </div>
            <span className="mock-bar-label">{bars.length - i}</span>
          </div>
        ))}
      </div>
      <div className="mock-stats-row">
        <div className="mock-stat">
          <span className="mock-stat-label">Planned gal</span>
          <span className="mock-stat-value">7,700</span>
        </div>
        <div className="mock-stat">
          <span className="mock-stat-label">Gross weight</span>
          <span className="mock-stat-value">79,488 lbs</span>
        </div>
        <div className="mock-stat">
          <span className="mock-stat-label">Margin</span>
          <span className="mock-stat-value mock-stat-safe">&minus;512 lbs safe</span>
        </div>
      </div>
      <div className="mock-load-btn">Load</div>
    </div>
  );
}

function TerminalCardsMock() {
  const rows = [
    { name: "Kinder Morgan · North Haven", status: "184 days left", warn: false },
    { name: "Buckeye Terminal · Bridgeport", status: "14 days left", warn: true },
  ];
  return (
    <div className="mock-panel">
      <div className="mock-panel-head">
        <span className="mock-panel-title">Terminal Cards</span>
        <span className="mock-panel-sub">2 active</span>
      </div>
      <div className="mock-list">
        {rows.map((r) => (
          <div key={r.name} className="mock-list-row">
            <span className="mock-list-name">{r.name}</span>
            <span className={`mock-list-status${r.warn ? " mock-list-status-warn" : ""}`}>
              {r.status}
            </span>
          </div>
        ))}
      </div>
      <div className="mock-panel-footnote">One-tap sync of card status with dispatch.</div>
    </div>
  );
}

function EquipmentDriftMock() {
  return (
    <div className="mock-panel">
      <div className="mock-panel-head">
        <span className="mock-panel-title">Equipment Drift Tracker</span>
        <span className="mock-panel-sub">Tractor 4408 &middot; Trailer T-11</span>
      </div>
      <div className="mock-stats-row mock-stats-row-3">
        <div className="mock-stat">
          <span className="mock-stat-label">Spec tare</span>
          <span className="mock-stat-value">28,840 lbs</span>
        </div>
        <div className="mock-stat">
          <span className="mock-stat-label">Last scale ticket</span>
          <span className="mock-stat-value">29,410 lbs</span>
        </div>
        <div className="mock-stat">
          <span className="mock-stat-label">Active delta</span>
          <span className="mock-stat-value mock-stat-warn">+570 lbs</span>
        </div>
      </div>
      <div className="mock-panel-footnote">
        No more guesswork when swapping trailers. If you get dropped into a
        spare mid-shift, ProTankr pulls the last verified tare instead of an
        outdated number.
      </div>
    </div>
  );
}

function SharedKnowledgeMock() {
  return (
    <div className="mock-panel-pair">
      <div className="mock-panel mock-panel-compact">
        <div className="mock-panel-head">
          <span className="mock-panel-title">Premium 93 (V-Power)</span>
          <span className="mock-panel-sub">8 min ago</span>
        </div>
        <p className="mock-panel-text">
          Buckeye Bayway (Linden, NJ) — rack 2 arm pump maintenance. Out of
          premium until 14:00.
        </p>
      </div>
      <div className="mock-panel mock-panel-compact">
        <div className="mock-panel-head">
          <span className="mock-panel-title">All Products (Queue)</span>
          <span className="mock-panel-sub">22 min ago</span>
        </div>
        <p className="mock-panel-text">
          Kinder Morgan Carteret (Carteret, NJ) — 7 trucks backed up at the
          terminal gate. Expect a 45 minute wait.
        </p>
      </div>
    </div>
  );
}

export default function ForDriversPage() {
  return (
    <div className="page">
      <SiteHeader active="for-drivers" />

      {/* HERO */}
      <section className="driver-hero">
        <div className="driver-hero-inner">
          <div className="driver-hero-copy">
            <p className="driver-eyebrow">Built for the person behind the wheel</p>
            <h1 className="driver-h1">
              Your load. Your way.
              <br />
              No guesswork. No scale surprises.
            </h1>
            <p className="driver-sub">
              Whether you drive for a fleet or run your own authority,
              ProTankr organizes your loading workflow and tare weight
              intelligence right where you need it.
            </p>
            <ul className="driver-checklist">
              {CHECKLIST.map((c) => (
                <li key={c}>
                  <span className="check">&check;</span>
                  {c}
                </li>
              ))}
            </ul>
            <div className="driver-hero-actions">
              <Link href="/get-the-app" className="driver-cta">
                Get Early Access &rarr;
              </Link>
              <Link href="/for-fleets" className="driver-cta-secondary">
                Running a fleet instead? &rarr;
              </Link>
            </div>
          </div>
          <div className="driver-hero-visual">
            <PhoneScreen />
          </div>
        </div>
      </section>

      {/* FEATURE 1 — driver-driven planner */}
      <section className="feature-section feature-alt">
        <div className="feature-row">
          <div className="feature-copy">
            <p className="feature-eyebrow">Load planning</p>
            <h2 className="feature-h2">Configure your preferred layout. Tap load.</h2>
            <p className="feature-body">
              Set up your compartment sequence once, and ProTankr handles
              the density math from there. Pick your terminal, saved plan,
              product and today&apos;s conditions, and calculate a practical
              legal load plan before you ever pull up to the rack.
            </p>
            <p className="feature-body feature-body-muted">
              It doesn&apos;t replace your judgment at the rack — it gives you
              a real number to check it against, instead of the same
              memorized guess every time.
            </p>
          </div>
          <div className="feature-visual">
            <LoadPlanMock />
          </div>
        </div>
      </section>

      {/* FEATURE 2 — terminal access */}
      <section className="feature-section">
        <div className="feature-row feature-row-reverse">
          <div className="feature-copy">
            <p className="feature-eyebrow">Terminal access</p>
            <h2 className="feature-h2">Know where you&apos;re ready to work.</h2>
            <p className="feature-body">
              Track every terminal card you carry, its current status, and
              when it renews. ProTankr flags what&apos;s expiring before it
              becomes a problem at the gate, and your card status can be
              shared with dispatch or your company the moment it matters.
            </p>
          </div>
          <div className="feature-visual">
            <TerminalCardsMock />
          </div>
        </div>
      </section>

      {/* FEATURE 3 — equipment & tare */}
      <section className="feature-section feature-alt">
        <div className="feature-row">
          <div className="feature-copy">
            <p className="feature-eyebrow">Equipment records</p>
            <h2 className="feature-h2">Every scale ticket makes you smarter.</h2>
            <p className="feature-body">
              Truck and trailer combinations, tare weight, compartment
              configuration, service records, credentials and permits —
              all of it stays with the equipment and the workflow, not
              buried in someone&apos;s memory or a notebook in the door
              pocket.
            </p>
          </div>
          <div className="feature-visual">
            <EquipmentDriftMock />
          </div>
        </div>
      </section>

      {/* FEATURE 4 — shared knowledge */}
      <section className="feature-section">
        <div className="feature-row-stack">
          <p className="feature-eyebrow feature-eyebrow-center">Shared knowledge</p>
          <h2 className="feature-h2 feature-h2-center">
            The truck in front of you already knows.
          </h2>
          <p className="feature-body feature-body-center">
            The first driver who discovers a terminal issue, or verifies a
            corrected tare or temperature reading, shouldn&apos;t be the only
            one who benefits from it. ProTankr keeps that knowledge with the
            equipment and the terminal, not the individual — usually
            captured with nothing more than two numbers.
          </p>
          <SharedKnowledgeMock />
        </div>
      </section>

      {/* CLOSING CTA */}
      <section className="closing">
        <div className="closing-inner">
          <p className="closing-eyebrow">Ready when you are</p>
          <h2 className="closing-h2">Stop guessing at the rack.</h2>
          <p className="closing-sub">
            Free to try, no long setup. Bring your own truck and trailer, or
            join a fleet already running ProTankr.
          </p>
          <div className="closing-actions">
            <Link href="/get-the-app" className="closing-cta">
              Get Early Access &rarr;
            </Link>
            <Link href="/for-fleets" className="closing-secondary">
              See the fleet side &rarr;
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
        .driver-hero { padding: 44px 48px 32px; }
        .driver-hero-inner {
          max-width: 1200px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: 1fr 380px;
          gap: 64px;
          align-items: center;
        }
        .driver-eyebrow {
          margin: 0;
          font: 800 12px var(--font);
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(0,0,0,0.4);
        }
        .driver-h1 {
          margin: 14px 0 0;
          font: 900 44px var(--font);
          letter-spacing: -0.02em;
          line-height: 1.1;
          color: #111;
        }
        .driver-sub {
          margin: 20px 0 0;
          max-width: 520px;
          font: 400 16px var(--font);
          line-height: 1.6;
          color: rgba(0,0,0,0.6);
        }
        .driver-checklist {
          list-style: none;
          margin: 26px 0 0;
          padding: 0;
          display: flex;
          flex-wrap: wrap;
          gap: 10px 22px;
        }
        .driver-checklist li {
          display: flex;
          align-items: center;
          gap: 7px;
          font: 600 13.5px var(--font);
          color: rgba(0,0,0,0.65);
        }
        .driver-checklist .check {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 16px;
          height: 16px;
          border-radius: 999px;
          background: #111;
          color: #fff;
          font-size: 10px;
          flex-shrink: 0;
        }
        .driver-hero-actions {
          margin-top: 30px;
          display: flex;
          align-items: center;
          gap: 22px;
          flex-wrap: wrap;
        }
        .driver-cta {
          padding: 13px 24px;
          border-radius: 999px;
          background: #111;
          color: #fff;
          font: 700 14.5px var(--font);
          text-decoration: none;
        }
        .driver-cta:hover { opacity: 0.85; }
        .driver-cta-secondary {
          font: 700 13.5px var(--font);
          color: rgba(0,0,0,0.5);
          text-decoration: none;
        }
        .driver-cta-secondary:hover { color: #111; }
        .driver-hero-visual { display: flex; justify-content: center; }

        /* ---------- Feature rows ---------- */
        .feature-section { background: #ffffff; padding: 72px 48px; }
        .feature-alt { background: #f6f6f5; }
        .feature-row {
          max-width: 1140px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 56px;
          align-items: center;
        }
        .feature-row-reverse .feature-copy { order: 2; }
        .feature-row-reverse .feature-visual { order: 1; }
        .feature-row-stack { max-width: 900px; margin: 0 auto; text-align: center; }

        .feature-eyebrow {
          margin: 0;
          font: 800 12px var(--font);
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(0,0,0,0.4);
        }
        .feature-eyebrow-center { }
        .feature-h2 {
          margin: 12px 0 0;
          font: 900 32px var(--font);
          letter-spacing: -0.015em;
          line-height: 1.15;
          color: #111;
          max-width: 480px;
        }
        .feature-h2-center { max-width: none; margin: 12px auto 0; }
        .feature-body {
          margin: 18px 0 0;
          max-width: 480px;
          font: 400 15.5px var(--font);
          line-height: 1.65;
          color: rgba(0,0,0,0.6);
        }
        .feature-body-muted { color: rgba(0,0,0,0.45); font-size: 14px; }
        .feature-body-center { max-width: 620px; margin: 18px auto 0; }
        .feature-visual { display: flex; justify-content: center; }

        /* ---------- Mock UI panels ---------- */
        .mock-panel {
          width: 100%;
          max-width: 420px;
          border-radius: 20px;
          background: #111111;
          border: 1px solid rgba(255,255,255,0.1);
          padding: 24px;
        }
        .mock-panel-compact { max-width: none; padding: 20px; }
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
        .mock-panel-text {
          margin: 12px 0 0;
          font: 400 13.5px var(--font);
          line-height: 1.55;
          color: rgba(255,255,255,0.62);
        }
        .mock-panel-footnote {
          margin-top: 16px;
          padding-top: 14px;
          border-top: 1px solid rgba(255,255,255,0.08);
          font: 400 12px var(--font);
          line-height: 1.55;
          color: rgba(255,255,255,0.4);
        }
        .mock-panel-pair {
          margin-top: 40px;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
          text-align: left;
        }

        .mock-bars {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
          margin-top: 20px;
          height: 120px;
          align-items: end;
        }
        .mock-bar-col { display: flex; flex-direction: column; align-items: center; gap: 8px; height: 100%; justify-content: flex-end; }
        .mock-bar-track {
          width: 100%;
          height: 100%;
          border-radius: 6px;
          background: rgba(255,255,255,0.08);
          display: flex;
          align-items: flex-end;
          overflow: hidden;
        }
        .mock-bar-fill { width: 100%; background: #ffffff; border-radius: 6px 6px 0 0; }
        .mock-bar-label { font: 700 11px var(--font); color: rgba(255,255,255,0.4); }

        .mock-stats-row {
          margin-top: 20px;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
          padding-top: 16px;
          border-top: 1px solid rgba(255,255,255,0.1);
        }
        .mock-stats-row-3 { border-top: none; padding-top: 0; margin-top: 0; }
        .mock-stat { display: flex; flex-direction: column; gap: 4px; }
        .mock-stat-label { font: 700 9.5px var(--font); letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255,255,255,0.35); }
        .mock-stat-value { font: 800 14px var(--font); color: #fff; }
        .mock-stat-safe { color: rgba(255,255,255,0.85); }
        .mock-stat-warn { color: rgba(255,255,255,0.85); text-decoration: underline; text-decoration-style: dotted; text-underline-offset: 3px; }

        .mock-load-btn {
          margin-top: 18px;
          text-align: center;
          padding: 11px;
          border-radius: 10px;
          background: #fff;
          color: #111;
          font: 800 13px var(--font);
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
        .mock-list-status { font: 700 12.5px var(--font); color: rgba(255,255,255,0.5); white-space: nowrap; }
        .mock-list-status-warn { color: #fff; text-decoration: underline; text-decoration-style: dotted; text-underline-offset: 3px; }

        /* ---------- Closing ---------- */
        .closing { background: #111111; padding: 88px 48px; }
        .closing-inner { max-width: 640px; margin: 0 auto; text-align: center; }
        .closing-eyebrow {
          margin: 0 0 12px;
          font: 800 12px var(--font);
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.4);
        }
        .closing-h2 { margin: 0; font: 900 40px var(--font); letter-spacing: -0.02em; color: #fff; line-height: 1.1; }
        .closing-sub {
          margin: 16px auto 0;
          max-width: 460px;
          font: 400 15px var(--font);
          color: rgba(255,255,255,0.55);
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
          .driver-hero { padding: 28px 24px 24px; }
          .driver-hero-inner { grid-template-columns: 1fr; gap: 36px; }
          .driver-hero-visual { order: -1; }
          .driver-h1 { font-size: 32px; }

          .feature-section { padding: 48px 24px; }
          .feature-row { grid-template-columns: 1fr; gap: 32px; }
          .feature-row-reverse .feature-copy { order: 1; }
          .feature-row-reverse .feature-visual { order: 2; }
          .feature-h2 { font-size: 26px; max-width: none; }
          .feature-body { max-width: none; }
          .mock-panel-pair { grid-template-columns: 1fr; }

          .closing { padding: 48px 24px; }
          .closing-h2 { font-size: 30px; }
        }
      `}</style>
    </div>
  );
}
