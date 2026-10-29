"use client";
// app/planner/components/MessageTicker.tsx
//
// Generic single-line scrolling ticker: cycles through `messages` one at a
// time, each entering from the right at a CONSTANT speed, pausing once its
// beginning arrives at a fixed readable position, then continuing off-
// screen to the left before the next message starts -- per explicit
// follow-up on TerminalOutageBanner.tsx's own scrolling behavior ("it
// should stay the same speed when traveling. pause at the beginning of
// each message. if more than one message.").
//
// Deliberately NOT a CSS @keyframes animation (that was the original
// implementation) -- percentage-based keyframes can't express "constant
// pixels/second regardless of message length" or "N messages, each with
// its own enter/pause/exit cycle" without hardcoding a message count. This
// runs one requestAnimationFrame loop per mount, driving the moving text
// element's transform directly (not React state, so it isn't re-rendering
// 60x/sec) -- the only React state involved is which message index is
// showing, and even that lives in a ref/DOM write inside the loop rather
// than component state, so the loop can restart itself for a repeating
// single message without needing an external re-trigger.

import React, { useEffect, useRef } from "react";
import { parseTicker, TICKER_TONE_COLOR } from "../utils/tickerMarkup";

const SPEED_PX_PER_SEC = 55;
const PAUSE_MS = 1400;
const HOME_INSET_PX = 14;

// Colored runs (see utils/tickerMarkup.ts); unmarked text keeps the ticker's color.
function setRich(el: HTMLElement, text: string) {
  el.textContent = "";
  for (const part of parseTicker(text)) {
    if (part.tone === "base") { el.appendChild(document.createTextNode(part.text)); continue; }
    const span = document.createElement("span");
    span.textContent = part.text;
    span.style.color = TICKER_TONE_COLOR[part.tone];
    el.appendChild(span);
  }
}

export default function MessageTicker({ messages, color }: { messages: string[]; color: string }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);

  // Stable key (U+241F, won't collide with real message text) so the loop
  // only restarts when the actual set of active messages changes -- not on
  // every parent re-render.
  const messagesKey = messages.join("␟");

  useEffect(() => {
    const track = trackRef.current;
    const el = textRef.current;
    if (!track || !el || messages.length === 0) return;

    let cancelled = false;
    let raf = 0;
    let pauseTimer: ReturnType<typeof setTimeout> | null = null;
    let msgIndex = 0;
    let phase: "enter" | "pause" | "exit" = "enter";
    let x = track.clientWidth;
    let lastTs: number | null = null;

    function startMessage(i: number) {
      msgIndex = i;
      setRich(el!, messages[msgIndex]);
      x = track!.clientWidth;
      phase = "enter";
      lastTs = null;
    }
    startMessage(0);
    el.style.transform = `translateX(${x}px)`;

    function frame(ts: number) {
      if (cancelled) return;
      if (lastTs == null) lastTs = ts;
      // Clamped so a backgrounded tab regaining focus doesn't jump the
      // ticker forward by however long it was hidden.
      const dt = Math.min((ts - lastTs) / 1000, 0.1);
      lastTs = ts;

      if (phase === "enter") {
        x -= SPEED_PX_PER_SEC * dt;
        if (x <= HOME_INSET_PX) {
          x = HOME_INSET_PX;
          phase = "pause";
          pauseTimer = setTimeout(() => { if (!cancelled) phase = "exit"; }, PAUSE_MS);
        }
      } else if (phase === "exit") {
        x -= SPEED_PX_PER_SEC * dt;
        const textW = el!.offsetWidth;
        if (x <= -textW) {
          startMessage((msgIndex + 1) % messages.length);
        }
      }
      // phase === "pause": x unchanged, holds at HOME_INSET_PX.
      el!.style.transform = `translateX(${x}px)`;
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      if (pauseTimer) clearTimeout(pauseTimer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messagesKey]);

  if (messages.length === 0) return null;

  return (
    <div ref={trackRef} style={{ position: "relative", height: 26, overflow: "hidden", flex: 1 }}>
      <div
        ref={textRef}
        style={{
          position: "absolute", top: 0, bottom: 0, left: 0,
          display: "flex", alignItems: "center", whiteSpace: "nowrap",
          fontSize: 14, fontWeight: 800, letterSpacing: 0.3, color,
          willChange: "transform",
        }}
      />
    </div>
  );
}
