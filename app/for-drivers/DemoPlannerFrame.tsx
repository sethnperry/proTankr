"use client";
// app/for-drivers/DemoPlannerFrame.tsx
// Embeds a live iframe of the actual /planner app, logged into a fixed
// public demo account ("ProTankr Trucking", is_solo) via /api/demo/start.
// Same pattern app/studio/page.tsx already uses (a same-origin iframe
// shares cookies automatically, no separate auth needed) -- just a nicer
// frame for a public marketing page instead of a screen-recording rig.
//
// This is genuinely the app: real compartment bars with real drag-to-cap
// handles, the real terminal/location picker, the real product picker,
// the real Save Plan/preset system. See /api/demo/start's own header
// comment for the current scope (Option A of a staged rollout) -- no
// equipment-switching or real-load-submission restriction exists yet,
// so the on-page caption below says so plainly rather than implying
// guardrails that aren't built.
//
// Gated behind an explicit "Start Demo Session" tap rather than loading
// the iframe (and its auto-login) immediately on page view: (1) it means
// a visitor reads what they're about to open -- a shared, live account --
// before it silently signs them into one; (2) it avoids spending a fresh
// /api/demo/start magic-link token for every page view, most of which
// never actually interact with the phone at all.

import { useState } from "react";

const PHONE_WIDTH = 390;
const PHONE_HEIGHT = 844;
// Confirmed live 2026-09: "beta" is the solo account, renamed
// "ProTankr Trucking" specifically for this purpose.
const DEMO_PERSONA = "beta";

export default function DemoPlannerFrame() {
  const [started, setStarted] = useState(false);

  return (
    <div className="demo-frame-wrap">
      <div className="demo-phone">
        <div className="demo-phone-notch" />
        <div className="demo-phone-btn demo-phone-btn-power" />
        <div className="demo-phone-btn demo-phone-btn-vol-up" />
        <div className="demo-phone-btn demo-phone-btn-vol-down" />
        <div className="demo-phone-screen">
          <div className="demo-phone-sheen" />
          {started ? (
            <iframe
              src={`/api/demo/start?persona=${DEMO_PERSONA}`}
              title="ProTankr Planner — live interactive demo"
              className="demo-phone-iframe"
            />
          ) : (
            <div className="demo-phone-intro">
              <p className="demo-intro-eyebrow">Live interactive demo</p>
              <h3 className="demo-intro-title">
                This is the real
                <br />
                ProTankr Planner
              </h3>
              <p className="demo-intro-body">
                Pick a terminal, choose a product per compartment, drag the
                caps, slide the CG, and Save Plan — the same tool drivers
                use every day.
              </p>
              <p className="demo-intro-body demo-intro-body-muted">
                It&apos;s logged into a shared public demo account, so
                what you do here is visible to other visitors. A good
                place to experiment, not to store anything you need to
                keep.
              </p>
              <button
                type="button"
                className="demo-intro-btn"
                onClick={() => setStarted(true)}
              >
                Start Demo Session &rarr;
              </button>
            </div>
          )}
        </div>
      </div>
      {started && (
        <p className="demo-frame-caption">
          This is the real ProTankr Planner, logged into our public demo
          account. Anything you do here is real and shared with other
          visitors — a good place to experiment, not to store anything you
          need to keep.
        </p>
      )}

      <style jsx global>{`
        .demo-frame-wrap { display: flex; flex-direction: column; align-items: center; gap: 16px; }
        .demo-phone {
          position: relative;
          width: min(${PHONE_WIDTH + 18}px, 100%);
          box-sizing: border-box;
          background: linear-gradient(160deg, #3a3a3d 0%, #1c1c1e 45%, #0a0a0b 100%);
          border-radius: 22px;
          padding: 9px;
          box-shadow:
            0 2px 6px rgba(0,0,0,0.10),
            0 20px 40px rgba(0,0,0,0.20),
            0 56px 84px rgba(0,0,0,0.16),
            inset 0 0 0 1px rgba(255,255,255,0.10),
            inset 0 1px 1px rgba(255,255,255,0.22);
        }
        .demo-phone-notch {
          position: absolute;
          top: 9px;
          left: 50%;
          transform: translateX(-50%);
          width: 84px;
          height: 20px;
          background: #000;
          border-radius: 11px;
          z-index: 3;
          pointer-events: none;
        }
        .demo-phone-btn {
          position: absolute;
          background: linear-gradient(90deg, #4a4a4d, #222224);
          border-radius: 2px;
          z-index: 0;
        }
        .demo-phone-btn-power { right: -2px; top: 15%; width: 3px; height: 7%; }
        .demo-phone-btn-vol-up { left: -2px; top: 20%; width: 3px; height: 5.5%; }
        .demo-phone-btn-vol-down { left: -2px; top: 27%; width: 3px; height: 5.5%; }
        .demo-phone-screen {
          position: relative;
          background: #000;
          border-radius: 14px;
          overflow: hidden;
          line-height: 0;
          /* The screen's WIDTH is responsive (100% of .demo-phone, itself
             capped at min(${PHONE_WIDTH + 18}px, 100vw)) but the iframe
             below used to have a fixed pixel HEIGHT regardless -- on any
             viewport narrower than the phone's own design width, the
             width shrank while the height didn't, visibly squishing/
             stretching the mockup out of proportion. aspect-ratio locks
             height to width using the phone's real design ratio, so the
             mockup scales as one proportional unit at any screen size. */
          aspect-ratio: ${PHONE_WIDTH} / ${PHONE_HEIGHT};
        }
        /* A thin curved-glass highlight along the top/left edge -- purely
           decorative, pointer-events:none so it never blocks a real tap
           on the iframe (or the intro button) underneath. */
        .demo-phone-sheen {
          position: absolute;
          inset: 0;
          z-index: 2;
          pointer-events: none;
          border-radius: 14px;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08);
          background: linear-gradient(135deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 18%);
        }
        .demo-phone-iframe {
          display: block;
          width: 100%;
          height: 100%;
          border: none;
        }
        .demo-phone-intro {
          position: absolute;
          inset: 0;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 32px 26px;
          box-sizing: border-box;
          line-height: normal;
          background: radial-gradient(120% 90% at 50% 20%, #1c1c1e 0%, #0a0a0b 70%);
        }
        .demo-intro-eyebrow {
          margin: 0;
          font: 800 10.5px var(--font);
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.4);
        }
        .demo-intro-title {
          margin: 14px 0 0;
          font: 900 22px var(--font);
          letter-spacing: -0.01em;
          line-height: 1.2;
          color: #fff;
        }
        .demo-intro-body {
          margin: 14px 0 0;
          max-width: 280px;
          font: 400 13px var(--font);
          line-height: 1.55;
          color: rgba(255,255,255,0.7);
        }
        .demo-intro-body-muted { color: rgba(255,255,255,0.45); font-size: 12px; }
        .demo-intro-btn {
          margin-top: 26px;
          padding: 13px 22px;
          border: none;
          border-radius: 999px;
          background: #fff;
          color: #000;
          font: 800 14px var(--font);
          cursor: pointer;
        }
        .demo-intro-btn:hover { opacity: 0.85; }
        .demo-frame-caption {
          max-width: 380px;
          margin: 0;
          text-align: center;
          font: 500 12.5px var(--font);
          line-height: 1.55;
          color: rgba(0,0,0,0.45);
        }
      `}</style>
    </div>
  );
}
