// app/marketing/PhoneScreen.tsx
// Shared phone-frame illustration for marketing pages -- extracted out of
// app/page.tsx so app/for-drivers/page.tsx can reuse the same real
// screenshot + frame instead of duplicating ~80 lines of device styling.
// Shaped to match a real Galaxy S25 (thin bezel, small screen-corner
// radius, centered punch-hole camera, buttons on the right edge only)
// rather than an iPhone-style silhouette, since the screenshot itself is
// a real, uncropped capture off that device.

const DEFAULT_SRC_VERSION = "20260905c-s25frame";

export default function PhoneScreen({
  src = `/app-screens/planner.jpg?v=${DEFAULT_SRC_VERSION}`,
  alt = "ProTankr planner screen, showing a real compartment load plan",
}: {
  src?: string;
  alt?: string;
}) {
  return (
    <div className="phone">
      <div className="phone-btn phone-btn-power" />
      <div className="phone-btn phone-btn-vol-up" />
      <div className="phone-btn phone-btn-vol-down" />
      <div className="screen">
        {/* eslint-disable-next-line @next/next/no-img-element -- a real
            app screenshot, not a Next/Image candidate: static marketing
            asset, not content that benefits from remote optimization. */}
        <img src={src} alt={alt} className="screen-img" />
        <div className="screen-camera" />
      </div>

      <style jsx global>{`
        .phone {
          position: relative;
          width: 320px;
          background: linear-gradient(160deg, #4a4a4d 0%, #232326 40%, #0c0c0d 100%);
          border-radius: 34px;
          padding: 7px;
          box-shadow:
            0 32px 60px rgba(0,0,0,0.28),
            0 10px 22px rgba(0,0,0,0.18),
            inset 0 0 0 1px rgba(255,255,255,0.10),
            inset 0 1px 1px rgba(255,255,255,0.18);
        }
        .phone-btn {
          position: absolute;
          right: -3px;
          background: linear-gradient(90deg, #3d3d40, #1c1c1e);
          border-radius: 2px;
          z-index: 0;
        }
        .phone-btn-power { top: 15%; width: 3px; height: 6.5%; }
        .phone-btn-vol-up { top: 23%; width: 3px; height: 5.5%; }
        .phone-btn-vol-down { top: 29.5%; width: 3px; height: 5.5%; }
        .screen { position: relative; background: #111111; border-radius: 16px; overflow: hidden; line-height: 0; }
        .screen-img { display: block; width: 100%; height: auto; }
        .screen-camera {
          position: absolute;
          top: 1.6%;
          left: 50%;
          transform: translateX(-50%);
          width: 11px;
          height: 11px;
          border-radius: 50%;
          background: #000;
          z-index: 2;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06);
        }

        @media (max-width: 980px) {
          .phone { width: min(340px, 84vw); }
        }
      `}</style>
    </div>
  );
}
