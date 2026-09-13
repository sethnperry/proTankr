"use client";
// app/for-drivers/page.tsx
// Audience page for drivers (owner-operators and company drivers alike).
// Reachable from the homepage's audience picker and the site nav. Reuses
// the same design tokens/section rhythm as app/page.tsx and app/about --
// white/off-white background, black emphasis cards, Outfit font, pill
// CTAs -- rather than inventing a second visual language for this page.
//
// Load Planning embeds the REAL app (DemoPlannerFrame.tsx) -- a live
// iframe of /planner logged into a fixed public demo account, not a
// recreation. An earlier pass hand-rebuilt the compartment math from
// scratch and it never quite matched the actual planner; rather than
// keep chasing fidelity, this embeds the actual thing. See
// DemoPlannerFrame.tsx and /api/demo/start's own header comments for the
// current scope and its tradeoffs. The Terminal Access and Equipment
// illustrations below are hand-built recreations of the real app's own
// Expirations screen (bell icon) and Equipment picker/report screen,
// built from screenshots the user supplied -- same title-bar shape, same
// amber/expiring vs. red/expired color+icon logic, same report-row
// layout -- not screenshots themselves (so they're easy to keep
// adjusting), and not invented UI. The Shared Knowledge cards are a
// separate hand-built illustration, not a specific screen.

import Link from "next/link";
import SiteHeader from "../marketing/SiteHeader";
import SiteFooter from "../marketing/SiteFooter";
import DemoPlannerFrame from "./DemoPlannerFrame";
import { CardIcon, CompartmentsIcon, WrenchIcon, ShareIcon } from "./icons";

const CHECKLIST = [
  { Icon: CardIcon, label: "Terminal cards & renewal alerts" },
  { Icon: CompartmentsIcon, label: "Custom compartment sequences" },
  { Icon: WrenchIcon, label: "Equipment, tare & service history" },
  { Icon: ShareIcon, label: "Shared, verified terminal data" },
];

function WarnIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3.5 22 20.5H2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <line x1="12" y1="9.5" x2="12" y2="14.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="17.3" r="1.1" fill="currentColor" />
    </svg>
  );
}
function NoEntryIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="2" />
      <line x1="5.5" y1="12" x2="18.5" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// Rebuilt from a real screenshot of the app's own Expirations screen
// (bell icon) -- same title-bar shape, same amber/expiring vs. red/expired
// color+icon logic, same "CITY, STATE" grouping. Not every row from the
// screenshot is reproduced (the Equipment section above Terminal Cards
// is what item 7's own mock covers) -- cropped to the part this feature's
// copy is actually about.
function ExpiringRow({
  name,
  dateLabel,
  daysLabel,
  state,
}: {
  name: string;
  dateLabel: string;
  daysLabel: string;
  state: "warn" | "expired";
}) {
  return (
    <div className={`exp-row exp-row-${state}`}>
      <span className="exp-row-name">{name}</span>
      <span className="exp-row-right">
        {state === "warn" ? <WarnIcon /> : <NoEntryIcon />}
        <span className="exp-row-date">
          {dateLabel} <span className="exp-row-days">({daysLabel})</span>
        </span>
      </span>
    </div>
  );
}

function TerminalCardsMock() {
  return (
    <div className="mock-panel mock-app-window">
      <div className="mock-app-titlebar">
        <span className="mock-app-close">Close</span>
        <span className="mock-app-title">Expirations</span>
        <span className="mock-app-right" />
      </div>
      <div className="mock-app-body">
        <span className="exp-section-label">Terminal cards</span>
        <span className="exp-city-label">Fort Lauderdale, FL</span>
        <ExpiringRow name="TransMontaign" dateLabel="12-14-2025" daysLabel="-273 days" state="expired" />
        <ExpiringRow name="ExxonMobil" dateLabel="06-22-2026" daysLabel="-83 days" state="expired" />
        <ExpiringRow name="Chevron" dateLabel="09-14-2026" daysLabel="1 day" state="warn" />
        <span className="exp-city-label">Tampa, FL</span>
        <ExpiringRow name="Chevron" dateLabel="09-15-2026" daysLabel="2 days" state="warn" />
      </div>
    </div>
  );
}

// Rebuilt from a real screenshot of the Equipment picker/report screen --
// same two-column Trucks/Trailers grid with the active pair highlighted,
// same Tare/Target + service/wash report rows underneath, same
// Scale/Service/Wash/Edit action row. This is the real equipment/tare/
// service record this feature's copy describes, not an invented "drift
// tracker" widget.
function EquipmentDriftMock() {
  return (
    <div className="mock-panel mock-app-window">
      <div className="mock-app-titlebar">
        <span className="mock-app-close">Close</span>
        <span className="mock-app-title">Equipment</span>
        <span className="mock-app-right">Filter</span>
      </div>
      <div className="mock-app-body">
        <div className="eq-grid">
          <div className="eq-col">
            <span className="eq-col-label">Trucks</span>
            <span className="eq-unit">25169</span>
            <span className="eq-unit eq-unit-active">25184</span>
            <span className="eq-unit">25512</span>
          </div>
          <div className="eq-col">
            <span className="eq-col-label">Trailers</span>
            <span className="eq-unit">3151</span>
            <span className="eq-unit eq-unit-active">370</span>
            <span className="eq-unit">582</span>
          </div>
        </div>
        <div className="eq-report">
          <div className="eq-report-row">
            <span>Tare / Target</span>
            <span className="eq-report-value">25,070 / 79,500 lbs</span>
          </div>
          <div className="eq-report-row">
            <span>Truck &middot; Dry</span>
            <span className="eq-report-value eq-report-amber">Due at 291,086 mi</span>
          </div>
          <div className="eq-report-row">
            <span>Trailer serviced</span>
            <span className="eq-report-value eq-report-amber">No service recorded</span>
          </div>
          <div className="eq-report-row">
            <span>Washed</span>
            <span className="eq-report-value eq-report-cyan">08/16/2026</span>
          </div>
        </div>
        <div className="eq-actions">
          <span className="eq-action-btn">Scale</span>
          <span className="eq-action-btn">Service</span>
          <span className="eq-action-btn">Wash</span>
          <span className="eq-action-btn">Edit</span>
        </div>
      </div>
    </div>
  );
}

function SharedKnowledgeMock() {
  return (
    <div className="mock-panel-pair">
      <div className="mock-panel mock-panel-compact mock-panel-slate">
        <div className="mock-panel-head">
          <span className="mock-panel-title">
            <span className="mock-dot mock-dot-red" />
            Premium 93 (V-Power)
          </span>
          <span className="mock-panel-sub">8 min ago</span>
        </div>
        <p className="mock-panel-text">
          Buckeye Bayway (Linden, NJ) — rack 2 arm pump maintenance. Out of
          premium until 14:00.
        </p>
      </div>
      <div className="mock-panel mock-panel-compact mock-panel-slate">
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

      {/* HERO — text only; the actual planner is the visual, one section down. */}
      <section className="driver-hero">
        <div className="driver-hero-inner">
          <p className="driver-eyebrow">Built for the person behind the wheel</p>
          <h1 className="driver-h1">
            Your load. Your way.
            <br />
            No guesswork. No scale surprises.
          </h1>
          <p className="driver-sub">
            Whether you run company equipment or your own, ProTankr
            organizes your loading workflow and tare weight intelligence
            right where you need it.
          </p>
          <ul className="driver-checklist">
            {CHECKLIST.map(({ Icon, label }) => (
              <li key={label}>
                <span className="check">
                  <Icon />
                </span>
                {label}
              </li>
            ))}
          </ul>
          <div className="driver-hero-actions">
            <Link href="/login" className="driver-cta">
              Create Your Account &rarr;
            </Link>
            <Link href="/for-fleets" className="driver-cta-secondary">
              Running a fleet instead? &rarr;
            </Link>
          </div>
        </div>
      </section>

      {/* FEATURE 1 — driver-driven planner, the real interactive tool */}
      <section className="feature-section feature-alt">
        <div className="feature-row feature-row-planner">
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
            <p className="feature-try-note">
              Try it below — pick a terminal, choose products per
              compartment, drag the caps, slide the CG, and Save Plan.
            </p>
          </div>
          <div className="feature-visual">
            <DemoPlannerFrame />
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
            Shared knowledge becomes infrastructure.
          </h2>
          <p className="feature-body feature-body-center">
            The first driver who discovers a terminal issue, or verifies a
            corrected tare or temperature reading, shouldn&apos;t be the only
            one who benefits from it. ProTankr keeps that knowledge with the
            equipment and the terminal, not the individual. Most of the
            time, capturing it takes nothing more than two numbers.
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
            <Link href="/login" className="closing-cta">
              Create Your Account &rarr;
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

        /* ---------- Hero (text only -- the interactive planner one
           section down is the visual) ---------- */
        .driver-hero { padding: 44px 48px 32px; }
        .driver-hero-inner { max-width: 720px; margin: 0 auto; }
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
          width: 22px;
          height: 22px;
          border-radius: 7px;
          background: #111;
          color: #fff;
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
        .feature-row-planner { grid-template-columns: 1fr 480px; }
        .feature-row-stack { max-width: 900px; margin: 0 auto; text-align: center; }
        .feature-try-note {
          margin: 18px 0 0;
          max-width: 480px;
          font: 700 13px var(--font);
          line-height: 1.5;
          color: #111;
        }

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
        .mock-panel-slate { background: #2a2c30; border-color: rgba(255,255,255,0.12); }
        .mock-panel-head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 10px;
          padding-bottom: 16px;
          border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        .mock-panel-title { display: flex; align-items: center; gap: 8px; font: 800 15px var(--font); color: #fff; }
        .mock-dot { width: 8px; height: 8px; border-radius: 999px; flex-shrink: 0; }
        .mock-dot-red { background: #ef4444; }
        .mock-panel-sub { font: 600 11.5px var(--font); color: rgba(255,255,255,0.4); white-space: nowrap; }
        .mock-panel-text {
          margin: 12px 0 0;
          font: 400 13.5px var(--font);
          line-height: 1.55;
          color: rgba(255,255,255,0.62);
        }
        .mock-panel-pair {
          margin-top: 40px;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
          text-align: left;
        }

        /* ---------- Real-app recreations: Expirations + Equipment ---------- */
        .mock-app-window { padding: 0; overflow: hidden; }
        .mock-app-titlebar {
          display: flex;
          align-items: center;
          padding: 16px 20px;
          border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        .mock-app-close { flex: 0 0 auto; font: 600 13px var(--font); color: rgba(255,255,255,0.7); }
        .mock-app-title { flex: 1; text-align: center; font: 800 17px var(--font); color: #fff; }
        .mock-app-right {
          flex: 0 0 auto;
          min-width: 40px;
          text-align: right;
          font: 600 12px var(--font);
          color: rgba(255,255,255,0.4);
        }
        .mock-app-body { padding: 18px 20px 20px; display: flex; flex-direction: column; gap: 10px; }

        .exp-section-label,
        .exp-city-label {
          font: 800 10px var(--font);
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.35);
        }
        .exp-city-label { margin-top: 6px; }
        .exp-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 12px 14px;
          border-radius: 10px;
          border: 1px solid;
        }
        .exp-row-warn { border-color: rgba(245,180,60,0.55); background: rgba(245,180,60,0.05); }
        .exp-row-expired { border-color: rgba(239,68,68,0.5); background: rgba(239,68,68,0.06); }
        .exp-row-name { font: 700 13.5px var(--font); color: #fff; }
        .exp-row-right { display: flex; align-items: center; gap: 6px; }
        .exp-row-warn .exp-row-right { color: #f5b942; }
        .exp-row-expired .exp-row-right { color: #ef4444; }
        .exp-row-date { font: 800 12.5px var(--font); white-space: nowrap; }
        .exp-row-days { font-weight: 700; opacity: 0.85; }

        .eq-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
        .eq-col { display: flex; flex-direction: column; gap: 8px; }
        .eq-col-label {
          text-align: center;
          margin-bottom: 2px;
          font: 800 10px var(--font);
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.35);
        }
        .eq-unit {
          padding: 12px 8px;
          border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.03);
          color: rgba(255,255,255,0.7);
          font: 800 14px var(--font);
          text-align: center;
        }
        .eq-unit-active { border-color: rgba(255,255,255,0.5); background: rgba(255,255,255,0.12); color: #fff; }
        .eq-report {
          margin-top: 18px;
          padding-top: 14px;
          border-top: 1px solid rgba(255,255,255,0.1);
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .eq-report-row {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 10px;
          font: 600 12.5px var(--font);
          color: rgba(255,255,255,0.55);
        }
        .eq-report-value { font: 800 13px var(--font); color: #fff; white-space: nowrap; }
        .eq-report-amber { color: #f5b942; }
        .eq-report-cyan { color: #38bdf8; }
        .eq-actions { margin-top: 16px; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
        .eq-action-btn {
          padding: 9px 4px;
          text-align: center;
          border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.12);
          font: 700 11px var(--font);
          color: rgba(255,255,255,0.7);
        }

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
