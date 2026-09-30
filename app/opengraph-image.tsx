// app/opengraph-image.tsx
//
// Generates the og:image (and, since no separate twitter-image.tsx exists,
// the twitter:image too -- Next.js's file-convention fallback) shown when a
// link to protankr.com is shared: iMessage, WhatsApp, Slack, Discord, and
// most RCS implementations all fetch this route and render it in the
// message/post preview instead of the raw page.
//
// Why this exists: without it, sharing the bare domain had no og:image/
// og:title/og:description at all to fall back on -- on at least one real
// device (Android, PWA installed), the resulting "preview" ended up showing
// a live snapshot of the installed app's own last-open screen (real account
// data) rather than anything resembling the marketing site. A proper,
// static OG card is the standards-based fix: every conforming previewer now
// has a real, branded image/title/description to show regardless of
// whether the recipient has the app installed.
//
// Deliberately no external font fetch (Satori/ImageResponse's default) --
// keeps this route free of any build-/request-time network dependency.
// Size/weight/letter-spacing carry the branding instead of a custom
// typeface.

import { ImageResponse } from "next/og";

// No per-request variation in this image, so no runtime export -- lets
// Next prerender it once at build time (static) instead of invoking an
// edge function on every share.
export const alt = "ProTankr";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#111111",
          position: "relative",
        }}
      >
        {/* Faint corner glow -- keeps the card from reading as a flat,
            placeholder-style black rectangle. */}
        <div
          style={{
            position: "absolute",
            top: -180,
            right: -180,
            width: 560,
            height: 560,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 70%)",
            display: "flex",
          }}
        />
        <div
          style={{
            fontSize: 96,
            color: "#ffffff",
            letterSpacing: -2,
            display: "flex",
          }}
        >
          ProTankr
        </div>
        <div
          style={{
            marginTop: 22,
            fontSize: 32,
            color: "rgba(255,255,255,0.55)",
            letterSpacing: 0.5,
            display: "flex",
          }}
        >
          Verify your load before you cross the scale.
        </div>
        <div
          style={{
            marginTop: 44,
            padding: "10px 22px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.18)",
            fontSize: 22,
            color: "rgba(255,255,255,0.7)",
            letterSpacing: 1,
            display: "flex",
          }}
        >
          www.protankr.com
        </div>
      </div>
    ),
    { ...size }
  );
}
