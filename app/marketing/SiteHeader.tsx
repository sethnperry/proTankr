"use client";
// app/marketing/SiteHeader.tsx
// Shared header for the marketing site (/, /pricing, /get-the-app, and
// eventually /about) -- pulled out of app/page.tsx so the nav, logo, and
// "Get the App" CTA stay in sync everywhere instead of three copies
// drifting apart. Same light theme/typography as the landing page (white
// bg, Outfit font, black wordmark) -- see app/page.tsx's own header
// comment for why this site is light, not the app's dark #111111 theme.

import Link from "next/link";
import { useState } from "react";

const LOGO_PATH =
  "m -50.568768,-33.479618 c -0.379508,0 -0.747403,0.04834 -1.09766,0.139414 -0.241358,0.06276 -0.287389,0.279561 -0.110962,0.455988 l 2.762871,2.762871 a 1.1791924,1.1791924 22.5 0 0 0.833814,0.345377 h 4.240473 3.803385 4.844666 c 0.320197,0 0.577742,0.257545 0.577742,0.577742 0,0.320197 -0.257545,0.578259 -0.577742,0.578259 h -4.844666 -3.259536 a 0.54384869,0.54384869 135 0 0 -0.543849,0.543849 v 3.02906 0.19637 10.722212 a 0.21369808,0.21369808 22.501943 0 0 0.364795,0.151117 l 3.05794,-3.057525 a 1.2994077,1.2994077 112.50194 0 0 0.38065,-0.918882 v -3.289907 -3.607015 h 4.877222 c 2.390258,0 4.314982,-1.924207 4.314982,-4.314465 0,-2.390258 -1.924724,-4.314465 -4.314982,-4.314465 h -4.877222 -3.803385 z";

function PhoneIcon() {
  return (
    <svg width="11" height="16" viewBox="0 0 11 16" fill="none" aria-hidden="true">
      <rect x="0.6" y="0.6" width="9.8" height="14.8" rx="1.8" stroke="currentColor" strokeWidth="0.9" />
      <line x1="4.1" y1="2.3" x2="6.9" y2="2.3" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" />
      <circle cx="5.5" cy="13.4" r="0.75" fill="currentColor" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="20" height="14" viewBox="0 0 20 14" fill="none" aria-hidden="true">
      <line x1="0" y1="1" x2="20" y2="1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="0" y1="7" x2="20" y2="7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="0" y1="13" x2="20" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export type ActiveNav =
  | "for-drivers"
  | "for-fleets"
  | "about"
  | "pricing"
  | "get-the-app"
  | undefined;

export default function SiteHeader({ active }: { active?: ActiveNav }) {
  // Small screens collapse About/Pricing/Login behind this menu; the
  // primary CTA stays visible beside it rather than being buried. There is
  // only ever ONE "Get the App" element in the DOM -- it used to be two
  // (one embedded in the desktop nav-links, one a separate mobile-only
  // "compact" copy), toggled by non-overlapping media queries. At a
  // viewport in between (tablets, or a desktop browser's mobile-emulation
  // mode) both queries could end up true at once, which is exactly what
  // produced the "two Get the App pills" bug -- a single shared element
  // can't duplicate itself that way.
  const [menuOpen, setMenuOpen] = useState(false);
  const close = () => setMenuOpen(false);

  return (
    <header className="site-header">
      <div className="nav-row">
        <button
          type="button"
          className="nav-menu-btn"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <MenuIcon />
        </button>

        <Link href="/" className="brand">
          <svg className="mark" width="58" height="54" viewBox="-53.56 -35.05 24.29 22.70" aria-hidden="true">
            <path d={LOGO_PATH} fill="#111111" />
          </svg>
          <span className="wordmark">PROTANKR</span>
        </Link>

        <nav className="nav-links">
          <Link href="/for-drivers" className={active === "for-drivers" ? "is-active" : undefined}>For Drivers</Link>
          <Link href="/for-fleets" className={active === "for-fleets" ? "is-active" : undefined}>For Fleets</Link>
          <Link href="/about" className={active === "about" ? "is-active" : undefined}>Why ProTankr</Link>
          <Link href="/pricing" className={active === "pricing" ? "is-active" : undefined}>Pricing</Link>
          <Link href="/login" className="nav-login">Login</Link>
        </nav>

        <Link href="/get-the-app" className="nav-cta">
          Get Early Access <PhoneIcon />
        </Link>
      </div>

      {menuOpen && (
        <>
          <div className="nav-backdrop" onClick={close} aria-hidden="true" />
          <div className="nav-panel">
            <Link href="/for-drivers" onClick={close} className={active === "for-drivers" ? "is-active" : undefined}>For Drivers</Link>
            <Link href="/for-fleets" onClick={close} className={active === "for-fleets" ? "is-active" : undefined}>For Fleets</Link>
            <Link href="/about" onClick={close} className={active === "about" ? "is-active" : undefined}>Why ProTankr</Link>
            <Link href="/pricing" onClick={close} className={active === "pricing" ? "is-active" : undefined}>Pricing</Link>
            <Link href="/login" onClick={close}>Login</Link>
          </div>
        </>
      )}

      {/*
        Deliberately `jsx global`, not scoped `jsx` -- scoped styled-jsx
        requires a `jsx-<hash>` class to be attached to every styled
        element, and that attachment silently failed to happen under this
        project's dev setup (confirmed live: the generated CSS rules were
        present in a <style> tag, but the DOM elements only ever carried
        their plain className, with no matching hash class, so none of the
        rules could ever match -- nav rendered completely unstyled). Global
        mode sidesteps the hash-matching step entirely, which is also the
        exact pattern app/page.tsx's own original inline header already
        used successfully before this file existed. Class names below are
        deliberately specific (site-header, nav-cta, etc.) to avoid
        colliding with any other page's own global styles.
      */}
      <style jsx global>{`
        .site-header { padding: 28px 48px 0; position: relative; }
        .site-header .nav-row { display: flex; align-items: center; gap: 16px; }
        /* Hidden on desktop by default so nothing regresses if the
           breakpoint below ever fails to apply. */
        .site-header .nav-menu-btn { display: none; }
        .site-header .brand { display: flex; align-items: flex-start; gap: 14px; flex-shrink: 0; text-decoration: none; }
        .site-header .wordmark { margin-top: 14px; font: 800 24px var(--font-outfit), sans-serif; letter-spacing: 0.02em; color: #111; }
        .site-header .nav-links { display: flex; align-items: center; gap: 22px; flex-shrink: 0; margin-left: auto; }
        .site-header .nav-links a {
          font: 600 16px var(--font-outfit), sans-serif;
          color: #111;
          text-decoration: none;
          white-space: nowrap;
        }
        .site-header .nav-links a:hover { opacity: 0.6; }
        .site-header .nav-links a.is-active { opacity: 0.45; }
        .site-header .nav-login { opacity: 0.65; }
        .site-header .nav-cta {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          background: #111;
          color: #fff !important;
          padding: 12px 20px;
          border-radius: 999px;
          flex-shrink: 0;
          text-decoration: none;
          white-space: nowrap;
        }
        .site-header .nav-cta:hover { opacity: 0.85 !important; }

        @media (max-width: 980px) {
          .site-header { padding: 20px 24px 0; }
          .site-header .brand { gap: 10px; }
          .site-header .mark { width: 46px; height: 43px; }
          .site-header .wordmark { margin-top: 10px; font-size: 19px; }
          .site-header .nav-links { gap: 18px; }
          .site-header .nav-links a { font-size: 15px; }
        }

        /* Phone: About/Pricing/Login collapse behind the hamburger, but the
           logo and the single "Get the App" pill both stay on this one row
           at every width below this -- no more stacking the logo onto its
           own row, which read as "in a weird spot" once tried. The logo
           itself shrinks further (a smaller mark + smaller wordmark) so
           hamburger + logo + CTA reliably fit a 375px phone (measured:
           ~286px of content against ~327px of available width after
           padding, leaving real headroom, not a razor-thin fit). 700px
           clears every common phone width in landscape and portrait while
           leaving tablets (768+) on the full nav, which still fits there. */
        @media (max-width: 700px) {
          .site-header .nav-row { flex-wrap: nowrap; gap: 10px; }
          .site-header .nav-links { display: none; }
          .site-header .brand { gap: 6px; }
          .site-header .mark { width: 32px; height: 30px; }
          .site-header .wordmark { margin-top: 0; font-size: 15px; }
          .site-header .nav-menu-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
            padding: 0;
            border: none;
            background: none;
            color: #111;
            cursor: pointer;
            flex-shrink: 0;
          }
          .site-header .nav-menu-btn:hover { opacity: 0.6; }
          .site-header .nav-cta {
            margin-left: auto;
            font-size: 13px;
            padding: 9px 14px;
            gap: 5px;
          }
          .site-header .nav-cta svg { width: 9px; height: 13px; }
          .site-header .nav-backdrop {
            position: fixed;
            inset: 0;
            z-index: 40;
          }
          .site-header .nav-panel {
            position: absolute;
            top: 100%;
            left: 24px;
            z-index: 41;
            margin-top: 8px;
            min-width: 168px;
            display: flex;
            flex-direction: column;
            padding: 8px;
            border-radius: 14px;
            background: #fff;
            border: 1px solid rgba(0,0,0,0.12);
            box-shadow: 0 12px 32px rgba(0,0,0,0.14);
          }
          .site-header .nav-panel a {
            padding: 11px 12px;
            border-radius: 9px;
            font: 600 16px var(--font-outfit), sans-serif;
            color: #111;
            text-decoration: none;
          }
          .site-header .nav-panel a:hover { background: rgba(0,0,0,0.05); }
          .site-header .nav-panel a.is-active { opacity: 0.45; }
        }
      `}</style>
    </header>
  );
}
