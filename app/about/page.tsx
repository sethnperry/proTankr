"use client";
// app/about/page.tsx
// Card grid over lib/content/learnTopics.tsx's shared topics -- each card
// shows the marketing "why this matters" pitch; tapping it goes to
// app/about/[slug]/page.tsx for the full technical breakdown, which is the
// SAME detailed content app/learn/page.tsx shows in-app (shared source,
// see that file's own header comment).

import Link from "next/link";
import SiteHeader from "../marketing/SiteHeader";
import FitHeading from "../marketing/FitHeading";
import { LEARN_TOPICS, Icon } from "@/lib/content/learnTopics";
import { TUTORIAL_VIDEOS } from "@/lib/content/tutorialVideos";

export default function AboutPage() {
  return (
    <div className="page">
      <SiteHeader active="about" />

      <section className="hero">
        <div className="hero-inner">
          <FitHeading className="hero-h1" maxSize={52} minSize={22}>How ProTankr Works</FitHeading>
          <div className="hero-sub">
            <p>
              Every truck-and-trailer combination has its own tare weight.
              Every trailer has its own compartment count and capacities.
              Every product has its own API range and density behavior,
              shaped by the terminal, the additives, the blend. Every driver
              has their own read on the road, the terrain, the delivery.
            </p>
            <p>
              The variables stack up fast. So the industry found the
              simplest fix: pick a safe, memorable volume, well under the
              legal limit, and load that same number every time, no matter
              what actually changed.
            </p>
            <p>
              It works, until it doesn't. A temporary shift causes an
              overweight ticket, and the response is to drop the volume
              again, permanently. The event that caused it passes. The
              lower volume stays.
            </p>
            <p>
              This looks complicated. It isn't, not anymore. ProTankr
              handles all of it behind the scenes, so the driver stays
              focused on the road. In fact, we've stripped the input down so
              far that most days, opening the app is the only step: your
              load plan is already updated and waiting. When something does
              need adjusting, it's a few seconds, not a few minutes.
            </p>
            <p>
              So while what the driver sees is simple, here's exactly what
              ProTankr is doing underneath.
            </p>
          </div>
        </div>
      </section>

      <section className="grid-section">
        <div className="topic-grid">
          {LEARN_TOPICS.map((topic) => (
            <Link key={topic.slug} href={`/about/${topic.slug}`} className="topic-card">
              <div className="topic-emoji"><Icon value={topic.emoji} size={28} /></div>
              <div className="topic-name">{topic.shortName}</div>
              <div className="topic-tagline">{topic.tagline}</div>
              <div className="topic-marketing">{topic.marketing}</div>
              <div className="topic-more">Learn more <span>&rarr;</span></div>
            </Link>
          ))}

          {/* Not from LEARN_TOPICS -- a single fixed entry point into
              /about/videos (its own growing list, see
              lib/content/tutorialVideos.ts) rather than trying to cram an
              open-ended, ever-growing set of clips into this fixed grid.
              Styled identically to the topic cards above so it reads as
              part of the same set, not a bolted-on afterthought. */}
          <Link href="/about/videos" className="topic-card">
            <div className="topic-emoji">🎬</div>
            <div className="topic-name">Video Walkthroughs</div>
            <div className="topic-tagline">See it in your hands</div>
            <div className="topic-marketing">
              Short, recorded clips of ProTankr in real use -- planning a
              load, picking equipment, working a terminal. No narration
              needed, just watch what actually happens on screen.
            </div>
            <div className="topic-more">
              {TUTORIAL_VIDEOS.length === 0 ? "Coming soon" : "Watch now"}{" "}
              <span>&rarr;</span>
            </div>
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
        .hero-inner { max-width: 940px; margin: 0 auto; }
        .hero-h1 { margin: 0; font-weight: 900; font-family: var(--font); letter-spacing: -0.02em; color: #111; }
        .hero-sub { margin: 18px 0 0; font: 400 17px var(--font); color: rgba(0,0,0,0.65); line-height: 1.65; }
        .hero-sub p { margin: 0 0 16px; }
        .hero-sub p:last-child { margin-bottom: 0; }

        .grid-section { padding: 44px 48px 100px; }
        .topic-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          align-items: start;
          gap: 20px;
          max-width: 940px;
          margin: 0 auto;
        }

        .topic-card {
          display: flex;
          flex-direction: column;
          height: 420px;
          text-decoration: none;
          color: inherit;
          border-radius: 20px;
          background: #f6f6f5;
          border: 1px solid rgba(0,0,0,0.08);
          padding: 28px;
          transition: border-color 150ms ease, background 150ms ease;
        }
        .topic-card:hover { background: #f0f0ee; border-color: rgba(0,0,0,0.14); }

        .topic-emoji { flex: 0 0 auto; font-size: 28px; line-height: 1; }
        .topic-name { flex: 0 0 auto; margin-top: 14px; font: 800 20px var(--font); }
        .topic-tagline { flex: 0 0 auto; margin-top: 4px; font: 600 13px var(--font); color: rgba(0,0,0,0.45); }

        .topic-marketing {
          flex: 1 1 auto;
          min-height: 0;
          position: relative;
          overflow: hidden;
          margin-top: 14px;
          font: 400 14px var(--font);
          color: rgba(0,0,0,0.62);
          line-height: 1.6;
        }
        .topic-marketing p { margin: 0 0 10px; }
        .topic-marketing p:last-child { margin-bottom: 0; }
        .topic-marketing::after {
          content: "";
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 52px;
          background: linear-gradient(to bottom, rgba(246,246,245,0), rgba(246,246,245,0.94) 65%, #f6f6f5);
          pointer-events: none;
          transition: background 150ms ease;
        }
        .topic-card:hover .topic-marketing::after {
          background: linear-gradient(to bottom, rgba(240,240,238,0), rgba(240,240,238,0.94) 65%, #f0f0ee);
        }

        .topic-more {
          flex: 0 0 auto;
          margin-top: 18px;
          font: 700 13px var(--font);
          color: #111;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .topic-more span { transition: transform 150ms ease; }
        .topic-card:hover .topic-more span { transform: translateX(3px); }

        @media (max-width: 760px) {
          .hero { padding: 28px 24px 0; }
          .grid-section { padding: 32px 24px 64px; }
          .topic-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
