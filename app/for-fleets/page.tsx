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
    title: "Recover more payload.",
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
    title: "Dispatch smarter with readiness visibility.",
    body: "Card status updates itself through the normal workflow, down to which terminal a no load happened at. Check it before the first dispatch, not after, so drivers stop asking for new sourcing and dispatchers stop reworking routes mid trip.",
    stat: "See how it works →",
    href: "#how-it-works",
  },
  {
    // Reframed per explicit direction around the real pain point: a
    // reactive dispatcher spends the day answering messages instead of
    // planning, and a driver left waiting on a reply becomes the next
    // customer call. Links to its own section (#dispatch-planning), not
    // the shared #how-it-works explainer -- deliberately not a third
    // card pointing at the same generic destination.
    tag: "Dispatch operations",
    title: "Keep drivers rolling, not waiting.",
    body: "Terminal and card readiness are visible up front, so the plan is right from the start instead of built load by load. Fewer driver messages means fewer idle trucks waiting on a reply, and a lighter workload for dispatch.",
    stat: "See how dispatch changes →",
    href: "#dispatch-planning",
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
    // Links to the manifesto section (#less-management) rather than the
    // shared #how-it-works explainer -- that section now carries a real
    // explanation of how/why the utilization score works, per explicit
    // direction, rather than sending this card to a generic destination
    // that never actually mentions it.
    tag: "Driver alignment",
    title: "Properly aligned incentives.",
    body: "A gallon weighted score measures how close each load landed to capacity. Loads over the legal weight limit are excluded, so overloading can never score higher. Feed it into your own bonus program to reward careful loading, not speed.",
    stat: "See how it's calculated →",
    href: "#less-management",
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
  // Matches ExampleLoadCard's own typical-vs-precise gap (350 gal diesel,
  // 450 gal regular, averaging 400) rather than an arbitrary default --
  // the calculator's starting position should agree with the real load
  // example directly above it, not undercut it.
  const [recoverableGal, setRecoverableGal] = useState(400);
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

// Real-world gap, not a single database-pulled load -- the earlier version
// of this card used one real completed load (98.5% of legal capacity,
// 117 gal left at the rack), which was genuinely real but badly understated
// the actual opportunity: the operator's own conversations with drivers put
// typical diesel loads at 7,500-7,600 gal and typical gasoline loads at
// 8,500-8,600 gal, against the operator's own routine 7,900 / 9,000 gal --
// a 300-500 gal gap per load, not ~100. Framed honestly as "based on driver
// conversations," not a single verified load, since that's what this
// actually is -- matches the site's existing "no unsupported guarantees"
// discipline (see this file's own header comment).
function ExampleLoadCard() {
  return (
    <div id="load-example" className="example-card">
      <p className="example-label">What drivers typically leave on the table</p>
      <div className="example-headline">
        <span className="example-headline-num">400 gal</span>
        <span className="example-headline-label">left behind on an average load</span>
      </div>
      <div className="example-products">
        <div className="example-product">
          <p className="example-product-name">Diesel</p>
          <div className="example-row">
            <div className="example-stat">
              <span className="example-stat-label">Typical load</span>
              <span className="example-stat-num">7,550 gal</span>
            </div>
            <div className="example-stat">
              <span className="example-stat-label">Precise load</span>
              <span className="example-stat-num">7,900 gal</span>
            </div>
            <div className="example-stat example-stat-gap">
              <span className="example-stat-label">Recovered</span>
              <span className="example-stat-num">350 gal</span>
            </div>
          </div>
        </div>
        <div className="example-product">
          <p className="example-product-name">Regular</p>
          <div className="example-row">
            <div className="example-stat">
              <span className="example-stat-label">Typical load</span>
              <span className="example-stat-num">8,550 gal</span>
            </div>
            <div className="example-stat">
              <span className="example-stat-label">Precise load</span>
              <span className="example-stat-num">9,000 gal</span>
            </div>
            <div className="example-stat example-stat-gap">
              <span className="example-stat-label">Recovered</span>
              <span className="example-stat-num">450 gal</span>
            </div>
          </div>
        </div>
      </div>
      <p className="example-footnote">
        Based on real conversations with drivers about what they
        typically load versus what the legal limit actually allows that
        day. Multiply a gap like this across a week, a fleet, a year,
        and the calculator below is that same math at your own scale.
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

      {/* DISPATCH PLANNING -- the Dispatch Operations outcome tile's own
          destination, not the shared #how-it-works explainer. Built
          around the real pain point described directly: a driver left
          waiting on a reply becomes the next customer call, and a
          dispatcher who's always answering messages never gets ahead of
          it. Reuses the .quote-section pattern (a second instance, not a
          new visual language) since it's the same "short narrative"
          shape as Shared Equipment Knowledge right below it. */}
      <section id="dispatch-planning" className="quote-section">
        <div className="quote-inner">
          <p className="quote-eyebrow">Proactive dispatch</p>
          <h2 className="quote-h2">Stop reacting. Start planning ahead.</h2>
          <p className="quote-body">
            A driver waiting on new instructions can&apos;t stay
            efficient. That wait becomes the next customer call, then
            the one behind it, and a dispatcher spends the whole day
            catching up without ever getting ahead of it.
          </p>
          <p className="quote-body">
            Terminal and card readiness are already visible before the
            first message goes out, so the best plan gets built up
            front. Fewer driver messages means fewer trucks sitting
            idle, and a dispatcher who can finally plan instead of
            firefight.
          </p>
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

      {/* LESS MANAGEMENT, NOT MORE SOFTWARE -- also the Driver Alignment
          outcome tile's destination (#less-management), which is why the
          utilization score gets its own detail block below the original
          two paragraphs rather than just the philosophy statement alone. */}
      <section id="less-management" className="manifesto-section">
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
          <div className="manifesto-detail">
            <p className="manifesto-detail-label">How the utilization score works</p>
            <p className="manifesto-detail-text">
              Every completed load is measured against how much it
              could have carried that day, given the truck, trailer,
              and terminal conditions. Loads that cross the legal
              weight limit are excluded entirely, so there is no way to
              score higher by cutting corners. The result is gallon
              weighted, never a ranking, and it plugs into whatever
              bonus or incentive program a company already runs.
              ProTankr computes the number. What a company does with it
              is entirely up to them.
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
        .example-products {
          margin-top: 28px;
          padding-top: 24px;
          border-top: 1px solid rgba(255,255,255,0.12);
          display: flex;
          flex-direction: column;
          gap: 22px;
        }
        .example-product-name {
          margin: 0 0 12px;
          font: 800 12px var(--font);
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.55);
        }
        .example-row { display: flex; gap: 28px; flex-wrap: wrap; }
        .example-stat { display: flex; flex-direction: column; gap: 4px; }
        .example-stat-label { font: 700 11px var(--font); letter-spacing: 0.03em; color: rgba(255,255,255,0.4); }
        .example-stat-num { font: 800 18px var(--font); color: #fff; }
        .example-stat-gap .example-stat-num { color: #4ade80; }
        .example-footnote { margin: 26px 0 0; font: 400 12px var(--font); line-height: 1.55; color: rgba(255,255,255,0.4); }

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
        .manifesto-detail {
          margin: 40px auto 0;
          max-width: 620px;
          text-align: left;
          border-radius: 20px;
          background: #1a1a1a;
          border: 1px solid rgba(255,255,255,0.1);
          padding: 28px 32px;
        }
        .manifesto-detail-label {
          margin: 0;
          font: 800 11px var(--font);
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.4);
        }
        .manifesto-detail-text {
          margin: 14px 0 0;
          font: 400 15px var(--font);
          line-height: 1.65;
          color: rgba(255,255,255,0.65);
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
          .manifesto-detail { padding: 20px; }

          .closing { padding: 48px 24px; }
          .closing-h2 { font-size: 30px; }
        }
      `}</style>
    </div>
  );
}
