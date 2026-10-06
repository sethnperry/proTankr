"use client";
// app/learn/page.tsx

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LEARN_TOPICS, Icon, type LearnBlock } from "@/lib/content/learnTopics";
import { TUTORIAL_VIDEOS } from "@/lib/content/tutorialVideos";
import { supabase } from "@/lib/supabase/client";
import { isSetupGuideAcknowledged } from "@/app/planner/utils/tourProgress";

function Section({ emoji, title, children }: { emoji: string; title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: "14px 16px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.80)", marginBottom: 6 }}>
        <Icon value={emoji} size={14} />&nbsp;&nbsp;{title}
      </div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.50)", lineHeight: 1.65 }}>{children}</div>
    </div>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0" }}>
      <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: "rgba(255,255,255,0.25)" }}>{label}</div>
      <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
    </div>
  );
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.65, color: "#fdba74", background: "rgba(251,146,60,0.08)", border: "1px solid rgba(251,146,60,0.22)", borderLeft: "3px solid #fb923c", borderRadius: "0 10px 10px 0", padding: "10px 14px" }} className="lt-callout">
      {children}
    </div>
  );
}

function Accordion({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)", overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "none", border: "none", cursor: "pointer", textAlign: "left" as const }}
      >
        <span style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>{title}</span>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", transform: open ? "rotate(180deg)" : "none", transition: "transform 200ms" }}>▼</span>
      </button>
      {open && (
        <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column" as const, gap: 10 }}>
          {children}
        </div>
      )}
    </div>
  );
}

function renderBlock(block: LearnBlock, i: number) {
  if (block.type === "divider") return <Divider key={i} label={block.label} />;
  if (block.type === "callout") return <Callout key={i}>{block.body}</Callout>;
  return (
    <Section key={i} emoji={block.emoji} title={block.title}>
      {block.body}
    </Section>
  );
}

export default function LearnPage() {
  const router = useRouter();

  // Only needed to key the Setup Guide recap's own one-time "acknowledged"
  // flag (tourProgress.ts, per-user localStorage) -- same lightweight
  // client-side lookup pattern this app already uses on other simple
  // pages, no server-side gate needed here.
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAuthUserId(data.user?.id ?? null));
  }, []);
  const setupGuideDone = isSetupGuideAcknowledged(authUserId);

  return (
    <div style={{ minHeight: "100dvh", background: "#111111", color: "rgba(255,255,255,0.85)", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      {/* Shared content (lib/content/learnTopics.tsx) marks emphasis with a
          bare <strong className="lt-em">, colored here for this page's dark
          background -- app/about/[slug]/page.tsx defines its own .lt-em
          rule for its light background instead. */}
      <style>{`.lt-em { color: rgba(255,255,255,0.70); }`}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 18px 12px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <button
          type="button"
          onClick={() => router.back()}
          style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.55)", fontSize: 20, lineHeight: 1, padding: "4px 8px 4px 0" }}
        >
          ‹
        </button>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: 0.2 }}>Learn</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 1 }}>How ProTankr works</div>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: "20px 18px", display: "flex", flexDirection: "column" as const, gap: 12, maxWidth: 600, margin: "0 auto" }}>

        {/* Setup Guide recap -- only shown once the driver has actually
            gone through (and acknowledged) the Planner's own in-app
            checklist (app/planner/components/SetupChecklist.tsx). Static
            recap text, not derived from live plan/location state the way
            the checklist itself is -- this page has no access to that
            state (not inside the Planner's equipment/location context),
            and a reminder of what the three steps covered doesn't need
            live data, just the same flag the checklist's own closing
            message writes on dismissal (tourProgress.ts). */}
        {setupGuideDone && (
          <Accordion title="✓ Setup guide">
            <Section emoji="📍" title="1. Set up your location">
              Starred your home city and switched to a terminal in a different one, so the star-to-favorite/hide-the-rest system makes sense the next time you need it.
            </Section>
            <Section emoji="🅰️" title="2. Set up Plan A">
              Picked a product (or MT for empty) for every compartment, then saved it as Preset A.
            </Section>
            <Section emoji="🅱️" title="3. Set up Plan B">
              Picked at least one different product than Plan A for every compartment, then saved it as Preset B.
            </Section>
          </Accordion>
        )}

        {/* ── Guided Tours ──
            The old interactive in-app tour (pulsing-ring, tap-to-advance,
            /planner?tour=setup) is retired -- unreliable tap-zone targeting,
            and it forced the user to actually perform each step instead of
            just watching one. Replaced with short video walkthroughs
            (recorded, not interactive), sourced from the shared
            TUTORIAL_VIDEOS list (also read by app/about/videos) so this
            grows to "a bunch of them" by just adding entries there, not
            restructuring this page. preload="metadata" per clip -- enough
            for the browser to show a real first-frame poster and duration
            without downloading the whole file, which matters once there
            are many of these stacked in one page. */}
        <Accordion title="▶ Guided tours">
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 14, padding: "4px 0 8px" }}>
            {TUTORIAL_VIDEOS.length === 0 ? (
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", lineHeight: 1.6, textAlign: "center" as const, padding: "8px 4px" }}>
                New walkthroughs are on the way — check back soon.
              </div>
            ) : (
              TUTORIAL_VIDEOS.map((v) => (
                <div key={v.id}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.80)", marginBottom: v.description ? 3 : 8 }}>
                    {v.title}
                  </div>
                  {v.description && (
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.5, marginBottom: 8 }}>
                      {v.description}
                    </div>
                  )}
                  <video
                    src={v.src}
                    controls
                    preload="metadata"
                    playsInline
                    style={{ width: "100%", borderRadius: 10, background: "#000", display: "block" }}
                  />
                </div>
              ))
            )}
          </div>
        </Accordion>

        {/* ── Shared topics (also power app/about) ── */}
        {LEARN_TOPICS.map((topic) => (
          <Accordion
            key={topic.slug}
            title={
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <Icon value={topic.emoji} size={16} />
                {topic.title}
              </span>
            }
          >
            {topic.blocks.map(renderBlock)}
          </Accordion>
        ))}

        <div style={{ height: 40 }} />
      </div>
    </div>
  );
}
