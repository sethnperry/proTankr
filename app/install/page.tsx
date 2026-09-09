"use client";
// app/install/page.tsx
// The install landing page invite emails point to: platform-aware guidance to
// add ProTankr to the phone's home screen, then sign in inside the installed
// app with the code from the email. See app/components/InstallGuide.tsx.

import Link from "next/link";
import SiteHeader from "../marketing/SiteHeader";
import InstallGuide from "../components/InstallGuide";

export default function InstallPage() {
  return (
    <div className="page">
      <SiteHeader active="get-the-app" />

      <section className="hero">
        <h1 className="hero-h1">Add ProTankr to your phone</h1>
        <p className="hero-sub">
          ProTankr runs from your home screen like any other app. Add it once,
          then open it and sign in with the code from your email.
        </p>
      </section>

      <section className="guide-section">
        <InstallGuide />
        <p className="login-note">
          Already added it? <Link href="/login">Sign in</Link>
        </p>
      </section>

      <style jsx global>{`
        .page {
          --ink: #0d0d0c;
          --font: var(--font-outfit), "Outfit", Helvetica, Arial, sans-serif;
          min-height: 100dvh; background: #ffffff; color: var(--ink);
          font-family: var(--font); overflow-x: hidden;
        }
        .hero { padding: 40px 48px 0; max-width: 620px; }
        .hero-h1 { margin: 0; font: 900 44px var(--font); letter-spacing: -0.02em; color: #111; }
        .hero-sub { margin: 14px 0 0; font: 400 16px var(--font); color: rgba(0,0,0,0.6); line-height: 1.55; }
        .guide-section { padding: 32px 48px 100px; }
        .login-note { margin: 20px 0 0; font: 500 13px var(--font); color: rgba(0,0,0,0.5); }
        .login-note a { color: #111; text-decoration: underline; }
        @media (max-width: 760px) {
          .hero { padding: 28px 24px 0; }
          .hero-h1 { font-size: 34px; }
          .guide-section { padding: 24px 24px 64px; }
        }
      `}</style>
    </div>
  );
}
