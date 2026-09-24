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
// a visitor reads what they're about to open -- a shared, live account,
// on a REAL session that shares this browser's cookies -- before it
// silently signs them into one; (2) it avoids spending a fresh
// /api/demo/start magic-link token for every page view, most of which
// never actually interact with the phone at all.
//
// Real, confirmed gap the gate alone does NOT fix (found live 2026-09, by
// the operator's own installed app getting signed out): starting the demo
// is a genuine Supabase auth session change -- cookies are shared by
// every tab/window/installed-PWA instance in the same browser profile, so
// tapping the button used to sign the whole browser (including an
// installed ProTankr app on the same device) into the demo account.
//
// Fixed by isolating the login to its own domain: demoIframeSrc() below
// points the iframe at https://demo.protankr.com (a second domain on this
// same Vercel project, added 2026-09 specifically for this) instead of a
// same-origin relative path, whenever the page itself is being served
// from a real protankr.com host. A different domain means a different
// cookie jar entirely -- the demo login can no longer touch protankr.com's
// own session at all. Falls back to the old same-origin relative path on
// any other host (localhost, Vercel preview URLs), where that subdomain
// doesn't exist -- collision risk still applies there, which is fine
// since only internal testing ever happens on those hosts, never a real
// visitor's own account.
//
// The on-page warning below is left in place (not yet softened to "this
// is isolated, don't worry") until the domain + Supabase redirect-URL
// config are confirmed live -- see /api/demo/start's own header comment
// for the other half of this fix and exactly what needs configuring
// before this is actually true in production.
//
// Styling: a real CSS Module (DemoPlannerFrame.module.css), not
// <style jsx global>. Confirmed live (fetched the deployed page's raw
// SSR HTML directly) that for a "use client" component, a styled-jsx
// block's rules are NOT present in the server-rendered HTML at all --
// they're injected by JavaScript after hydration. On a slow mobile
// connection that's a real window where this phone frame has no padding,
// no position:relative for its absolutely-positioned children (the intro
// screen, the sheen overlay), and nothing holding its shape -- which is
// exactly the "phone disappeared" bug reported twice. A CSS Module is
// compiled into a real stylesheet Next.js references via a <link> tag in
// the page's <head>, applied by the browser before/during first paint --
// zero JS dependency, so this class of bug can't recur here regardless of
// connection speed or hydration timing.
//
// The one style kept INLINE rather than moved into the module:
// aspectRatio on .demoPhoneScreen (390:844, the phone's real design
// ratio). Not because inline is required anymore (the module load isn't
// hydration-gated either) -- it's redundant defense specifically because
// this value also feeds the intro screen's own absolutely-positioned
// children, and an inline style is guaranteed present in the very first
// byte of HTML with zero indirection at all. Harmless belt-and-suspenders,
// not load-bearing the way it was before this file used a CSS Module.

import { useState } from "react";
import styles from "./DemoPlannerFrame.module.css";

const PHONE_WIDTH = 390;
const PHONE_HEIGHT = 844;
// Confirmed live 2026-09: "beta" is the solo account, renamed
// "ProTankr Trucking" specifically for this purpose.
const DEMO_PERSONA = "beta";

// demo.protankr.com is a second domain on the SAME Vercel project (added
// 2026-09), specifically so this login's cookies land on an isolated host
// instead of protankr.com's own -- see /api/demo/start's header comment
// for the real collision this fixes (the operator's own installed app
// getting signed out). Only used on the real production hosts; dev/
// preview deployments (where that subdomain doesn't exist/resolve) fall
// back to the same-origin relative path exactly as before.
const PROD_HOSTS = new Set(["protankr.com", "www.protankr.com"]);
const DEMO_HOST = "https://demo.protankr.com";

function demoIframeSrc() {
  const path = `/api/demo/start?persona=${DEMO_PERSONA}`;
  if (typeof window !== "undefined" && PROD_HOSTS.has(window.location.hostname)) {
    return `${DEMO_HOST}${path}`;
  }
  return path;
}

export default function DemoPlannerFrame() {
  const [started, setStarted] = useState(false);

  return (
    <div className={styles.demoFrameWrap}>
      <div className={styles.demoPhone} style={{ width: `min(${PHONE_WIDTH + 18}px, 100%)` }}>
        <div className={styles.demoPhoneNotch} />
        <div className={`${styles.demoPhoneBtn} ${styles.demoPhoneBtnPower}`} />
        <div className={`${styles.demoPhoneBtn} ${styles.demoPhoneBtnVolUp}`} />
        <div className={`${styles.demoPhoneBtn} ${styles.demoPhoneBtnVolDown}`} />
        <div
          className={styles.demoPhoneScreen}
          style={{ width: "100%", aspectRatio: `${PHONE_WIDTH} / ${PHONE_HEIGHT}` }}
        >
          <div className={styles.demoPhoneSheen} />
          {started ? (
            <iframe
              src={demoIframeSrc()}
              title="ProTankr Planner — live interactive demo"
              className={styles.demoPhoneIframe}
            />
          ) : (
            <div className={styles.demoPhoneIntro}>
              <p className={styles.demoIntroEyebrow}>Live interactive demo</p>
              <h3 className={styles.demoIntroTitle}>
                This is the real
                <br />
                ProTankr Planner
              </h3>
              <p className={styles.demoIntroBody}>
                Anything you do here is real and shared with other
                visitors — a good place to experiment, not to store
                anything you need to keep.
              </p>
              <p className={styles.demoIntroWarning}>
                On a phone or computer where you&apos;re already signed
                into your own ProTankr account (including the installed
                app) — starting this will sign that out too, since it's
                the same site. Sign back in afterward with a fresh link
                from the login page.
              </p>
              <button
                type="button"
                className={styles.demoIntroBtn}
                onClick={() => setStarted(true)}
              >
                Start Demo Session &rarr;
              </button>
            </div>
          )}
        </div>
      </div>
      {started && (
        <p className={styles.demoFrameCaption}>
          This is the real ProTankr Planner, logged into our public demo
          account. Anything you do here is real and shared with other
          visitors — a good place to experiment, not to store anything you
          need to keep.
        </p>
      )}
    </div>
  );
}
