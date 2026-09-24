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
//
// The phone's width AND height are both computed in JS -- not CSS
// percentages, not aspect-ratio, and not a measurement of this
// component's OWN rendered elements. Three earlier approaches were tried
// and each failed live on a real device in a different way (collapsed to
// ~0 height; then, once height was instead measured via
// getBoundingClientRect + ResizeObserver on the screen div itself,
// ballooned to an extremely tall, narrow bar) despite each looking
// correct in every static build/HTML check from this session. The
// getBoundingClientRect approach's own likely failure mode, in
// hindsight: it observed the SAME element it was resizing (ResizeObserver
// on screenEl, whose own height it then set from that observation) --
// a self-referential measure-then-resize-the-same-node loop, which is
// exactly the anti-pattern ResizeObserver's own spec warns can misbehave.
//
// Explicit design direction after seeing it live (not guessed at):
// in portrait, the phone should be close to full device width/natural
// height -- even if that's taller than one screen, scrolling to see the
// rest is fine and expected, not a bug to fix. And rotating the device
// to landscape should NOT shrink the mockup at all -- it should render
// at the exact same size it would in portrait, so a wide-but-short
// landscape view scrolls to see it too, rather than the whole thing
// awkwardly shrinking to fit the now-short viewport height. This is why
// sizing is driven by Math.min(innerWidth, innerHeight) -- a phone's own
// short (portrait-width) axis -- rather than raw innerWidth, which would
// grow (and so re-inflate the mockup) the moment the device rotates.

import { useEffect, useState } from "react";

const PHONE_WIDTH = 390;
const PHONE_HEIGHT = 844;
const MAX_PHONE_W = PHONE_WIDTH + 18;
// Confirmed live 2026-09: "beta" is the solo account, renamed
// "ProTankr Trucking" specifically for this purpose.
const DEMO_PERSONA = "beta";

// .demo-phone's own CSS padding (the chassis bezel around the screen) --
// a fixed 9px on every side, added on top of the inner screen's own
// PHONE_WIDTH x PHONE_HEIGHT, regardless of what size the phone renders
// at. MAX_PHONE_W bakes this in already (PHONE_WIDTH + 18) for the
// "as big as it can be" case; BEZEL pulls it back out so a smaller
// rendered size still keeps the INNER screen at exactly the 390:844
// ratio, rather than (incorrectly) applying that ratio to the OUTER
// chassis width, which would skew proportions slightly at any size below
// the max (the fixed bezel becomes proportionally larger the smaller the
// phone renders).
const BEZEL = MAX_PHONE_W - PHONE_WIDTH;

function dimsForPortraitWidth(portraitVw: number) {
  // Reserve some margin for this page's own side gutters (24-48px
  // depending on breakpoint) -- approximate on purpose, a few px of
  // slack either side is cosmetic, not a functional problem the way the
  // earlier approaches' failures were.
  const outerW = Math.max(180, Math.min(MAX_PHONE_W, portraitVw - 32));
  const innerW = outerW - BEZEL;
  const innerH = Math.round((innerW * PHONE_HEIGHT) / PHONE_WIDTH);
  return { w: outerW, h: innerH + BEZEL };
}

// A fixed, SSR-safe default -- identical on the server and the client's
// very first render, so there's nothing for React to reconcile a mismatch
// on. The real size is resolved from the real viewport only inside the
// client-only effect below, same pattern this codebase already
// established for "the real value needs the browser, but must match on
// first paint" (see useNow()/useTheme.ts's own history: start neutral,
// resolve for real post-mount, accept a brief flash of the default rather
// than risk a hydration mismatch).
const SSR_SAFE_DIMS = dimsForPortraitWidth(360);

export default function DemoPlannerFrame() {
  const [started, setStarted] = useState(false);
  const [dims, setDims] = useState(SSR_SAFE_DIMS);

  useEffect(() => {
    const onResize = () =>
      setDims(dimsForPortraitWidth(Math.min(window.innerWidth, window.innerHeight)));
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <div className="demo-frame-wrap">
      <div className="demo-phone" style={{ width: dims.w }}>
        <div className="demo-phone-notch" />
        <div className="demo-phone-btn demo-phone-btn-power" />
        <div className="demo-phone-btn demo-phone-btn-vol-up" />
        <div className="demo-phone-btn demo-phone-btn-vol-down" />
        <div className="demo-phone-screen" style={{ height: dims.h }}>
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
          width: 100%;
          background: #000;
          border-radius: 14px;
          overflow: hidden;
          line-height: 0;
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
