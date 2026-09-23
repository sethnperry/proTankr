"use client";
// app/for-drivers/DemoPlannerFrame.tsx
// Replaces an earlier hand-built recreation of the planner (compartment
// bars, CG math, etc. reimplemented from scratch) with the real thing: a
// live iframe of the actual /planner app, logged into a fixed public demo
// account ("ProTankr Trucking", is_solo) via /api/demo/start. Same
// pattern app/studio/page.tsx already uses (a same-origin iframe shares
// cookies automatically, no separate auth needed) -- just a nicer frame
// for a public marketing page instead of a screen-recording rig.
//
// This is genuinely the app: real compartment bars with real drag-to-cap
// handles, the real terminal/location picker, the real product picker,
// the real Save Plan/preset system. See /api/demo/start's own header
// comment for the current scope (Option A of a staged rollout) -- no
// equipment-switching or real-load-submission restriction exists yet,
// so the on-page caption below says so plainly rather than implying
// guardrails that aren't built.

const PHONE_WIDTH = 390;
const PHONE_HEIGHT = 844;
// Confirmed live 2026-09: "beta" is the solo account, renamed
// "ProTankr Trucking" specifically for this purpose.
const DEMO_PERSONA = "beta";

export default function DemoPlannerFrame() {
  return (
    <div className="demo-frame-wrap">
      <div className="demo-phone">
        <div className="demo-phone-notch" />
        <div className="demo-phone-btn demo-phone-btn-power" />
        <div className="demo-phone-btn demo-phone-btn-vol-up" />
        <div className="demo-phone-btn demo-phone-btn-vol-down" />
        <div className="demo-phone-screen">
          <div className="demo-phone-sheen" />
          <iframe
            src={`/api/demo/start?persona=${DEMO_PERSONA}`}
            title="ProTankr Planner — live interactive demo"
            className="demo-phone-iframe"
          />
        </div>
      </div>
      <p className="demo-frame-caption">
        This is the real ProTankr Planner, logged into our public demo
        account. Anything you do here is real and shared with other
        visitors — a good place to experiment, not to store anything you
        need to keep.
      </p>

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
           on the iframe underneath. */
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
