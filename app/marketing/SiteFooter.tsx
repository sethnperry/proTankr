// app/marketing/SiteFooter.tsx
// Shared footer for the marketing site, same reasoning as SiteHeader.tsx --
// one place to edit so it can't drift between pages. Deliberately minimal:
// this is a pre-launch site with no blog/careers/social accounts to link
// to yet, so a single nav row + copyright is honest, not sparse-for-no-reason.

import Link from "next/link";

export default function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="footer-row">
        <div className="footer-brand">
          <span className="footer-wordmark">PROTANKR</span>
          <span className="footer-tagline">Payload optimization for bulk fuel fleets.</span>
        </div>

        <nav className="footer-links">
          <Link href="/for-drivers">For Drivers</Link>
          <Link href="/for-fleets">For Fleets</Link>
          <Link href="/about">Why ProTankr</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/get-the-app">Get Early Access</Link>
          <Link href="/login">Login</Link>
        </nav>
      </div>

      <div className="footer-copyright">&copy; {year} ProTankr. All rights reserved.</div>

      <style jsx global>{`
        .site-footer {
          border-top: 1px solid rgba(0,0,0,0.08);
          padding: 32px 48px 28px;
          font-family: var(--font-outfit), "Outfit", Helvetica, Arial, sans-serif;
        }
        .footer-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 24px;
          flex-wrap: wrap;
          max-width: 1400px;
          margin: 0 auto;
        }
        .footer-brand { display: flex; flex-direction: column; gap: 6px; }
        .footer-wordmark { font: 800 14px inherit; letter-spacing: 0.04em; color: #111; }
        .footer-tagline { font: 400 13px inherit; color: rgba(0,0,0,0.45); }

        .footer-links { display: flex; align-items: center; gap: 22px; flex-wrap: wrap; }
        .footer-links a {
          font: 600 13px inherit;
          color: rgba(0,0,0,0.55);
          text-decoration: none;
        }
        .footer-links a:hover { color: #111; }

        .footer-copyright {
          max-width: 1400px;
          margin: 20px auto 0;
          font: 400 12px inherit;
          color: rgba(0,0,0,0.3);
        }

        @media (max-width: 980px) {
          .site-footer { padding: 28px 24px 24px; }
          .footer-row { flex-direction: column; gap: 16px; }
        }
      `}</style>
    </footer>
  );
}
