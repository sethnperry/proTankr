"use client";
// app/about/videos/page.tsx
// Public marketing counterpart to app/learn/page.tsx's "Guided tours"
// accordion -- same TUTORIAL_VIDEOS list, same clips, just laid out as a
// full light-themed page (matching app/about/[slug]/page.tsx's pattern)
// instead of a dark in-app accordion, so a prospective user who isn't
// signed in yet can still watch them from the marketing site.

import Link from "next/link";
import SiteHeader from "../../marketing/SiteHeader";
import FitHeading from "../../marketing/FitHeading";
import { TUTORIAL_VIDEOS } from "@/lib/content/tutorialVideos";

export default function AboutVideosPage() {
  return (
    <div className="page">
      <SiteHeader active="about" />

      <section className="hero">
        <div className="hero-inner">
          <Link href="/about" className="back-link">&larr; How ProTankr Works</Link>
          <FitHeading className="hero-h1" maxSize={40} minSize={16}>Video Walkthroughs</FitHeading>
          <div className="hero-marketing">
            Short, recorded clips of ProTankr in real use -- no narration
            needed, just watch what actually happens on screen.
          </div>
        </div>
      </section>

      <section className="detail-section">
        <div className="detail-inner">
          {TUTORIAL_VIDEOS.length === 0 ? (
            <p className="empty-note">
              New walkthroughs are on the way — check back soon.
            </p>
          ) : (
            TUTORIAL_VIDEOS.map((v) => (
              <div key={v.id} className="video-card">
                <div className="video-title">{v.title}</div>
                {v.description && <div className="video-desc">{v.description}</div>}
                <video
                  src={v.src}
                  controls
                  preload="metadata"
                  playsInline
                  className="video-el"
                />
              </div>
            ))
          )}

          <Link href="/get-the-app" className="cta-link">
            Request Early Access <span>&rarr;</span>
          </Link>
        </div>
      </section>

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

        .hero { padding: 40px 48px 0; }
        .hero-inner { max-width: 680px; margin: 0 auto; }
        .back-link {
          display: inline-block;
          font: 700 13px var(--font);
          color: rgba(0,0,0,0.45);
          text-decoration: none;
          margin-bottom: 18px;
        }
        .back-link:hover { color: rgba(0,0,0,0.75); }
        .hero-h1 {
          margin: 12px 0 0;
          font-weight: 900;
          font-family: var(--font);
          letter-spacing: -0.02em;
          color: #111;
        }
        .hero-marketing { margin: 16px 0 0; font: 400 16px var(--font); color: rgba(0,0,0,0.62); line-height: 1.6; }

        .detail-section { padding: 36px 48px 100px; }
        .detail-inner {
          max-width: 680px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 28px;
        }

        .video-card {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .video-title { font: 800 17px var(--font); color: #111; }
        .video-desc { font: 400 14px var(--font); color: rgba(0,0,0,0.55); line-height: 1.55; }
        .video-el {
          width: 100%;
          border-radius: 14px;
          background: #000;
          display: block;
          margin-top: 4px;
        }

        .empty-note {
          margin: 0;
          padding: 28px 24px;
          border-radius: 14px;
          background: #f6f6f5;
          border: 1px solid rgba(0,0,0,0.08);
          font: 500 14px var(--font);
          color: rgba(0,0,0,0.5);
          text-align: center;
        }

        .cta-link {
          display: inline-flex;
          align-self: flex-start;
          align-items: center;
          gap: 6px;
          margin-top: 4px;
          padding: 13px 22px;
          border-radius: 999px;
          background: #111;
          color: #fff;
          font: 700 14px var(--font);
          text-decoration: none;
        }
        .cta-link:hover { opacity: 0.85; }

        @media (max-width: 760px) {
          .hero { padding: 28px 24px 0; }
          .detail-section { padding: 28px 24px 64px; }
        }
      `}</style>
    </div>
  );
}
