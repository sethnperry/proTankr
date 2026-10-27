"use client";
// app/planner/components/tour/DashboardTour.tsx
//
// First-use walk-through of the Driver Dashboard. Each step shows the piece with
// demo data, says what it does and why it is useful. It never touches the real
// trip. Opens by itself once (when nothing else is on screen) and again from
// Learn, or /planner/home?tour=1.

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  DemoAccess, DemoAlertCard, DemoBigButton, DemoChips, DemoHours, DemoRecentDeliveries, DemoTerminalCard, DemoTools, DemoTripCard,
} from "./tourDemo";

type Step = { title: string; what: string; why: string; demo: React.ReactNode };

const STEPS: Step[] = [
  {
    title: "Your Driver Dashboard",
    what: "One screen for the whole trip: four chips and your hours at the top, the trip card, one big button for the next step, then readouts and tools. Nothing here is typed twice.",
    why: "The numbers and cards are live. They update themselves as you drive, so you can check in at a glance instead of calling dispatch.",
    demo: <div style={{ display: "grid", gap: 10 }}><DemoChips hot={null} /><DemoHours /><DemoTripCard /><DemoBigButton /></div>,
  },
  {
    title: "Expiration chip",
    what: "Everything expiring in the next 30 days, grouped by type: terminal access cards, your license and medical card, badges, and your truck and trailer permits. Yellow is 30 days out, orange is a week, red is expired.",
    why: "You hear about an expiring card before a terminal turns you away. Tap the chip to see each item.",
    demo: <DemoChips hot="expiration" />,
  },
  {
    title: "Loads chip",
    what: "How many loads dispatch has sent you that you haven't begun. Tap it to see them and pick which one to run first, even out of order.",
    why: "You always know what is coming next, and you choose the order that fits your clock and your location.",
    demo: <DemoChips hot="loads" />,
  },
  {
    title: "To Rack chip",
    what: "Company trucks heading to the same terminal as your next pickup, you included. One is just you. More than one turns it red.",
    why: "If three trucks are headed to the same rack, expect a line. You can decide where to eat, fuel, or go first.",
    demo: <DemoChips hot="rack" />,
  },
  {
    title: "To Drop chip",
    what: "Every company load headed to the same delivery location as your next drop, loaded or still on its way. It reads To Pump on a pump off.",
    why: "If other trucks are loaded and headed to the same store, you know before you get there, and can plan around a busy drop.",
    demo: <DemoChips hot="drop" />,
  },
  {
    title: "Your hours",
    what: "Time used, from your ELD: Break counts up once you stop, then shows a check at 30 minutes. Driving is out of 11 hours, Working out of 14, Cycle out of 70. They turn orange and red as the limit gets close. Tap for the cycle recap and your current status.",
    why: "It tells you if you can cover the rest of the trip and warns you early. ProTankr also pushes a warning if your hours won't reach the last stop.",
    demo: <DemoHours />,
  },
  {
    title: "The trip card",
    what: "The trailer on top, one segment per compartment in the product's color (an outline means empty, and the color is what it last held). The gross weight sits beside the trip label, colored against your target and the legal limit. Below are your stops: Pickup, Arrived, Loaded. The order number is above the card; tap it for the PTD.",
    why: "At a glance you see what is in which compartment, how heavy you are, and where you are in the trip. No cross-drops.",
    demo: <DemoTripCard />,
  },
  {
    title: "The big button",
    what: "One button for the next step: Arrive, Begin Loading, Finish Delivery. It changes as you go. Under it are Park preloaded, Delay and the consignee signature when they apply.",
    why: "No menus. Whatever you need to do next is the only thing that is big.",
    demo: <DemoBigButton text="Arrive" />,
  },
  {
    title: "Where alerts show up",
    what: "Three places. A card above the big button when your ELD shows you stopped (\"Did you arrive?\"), when your truck changes, or when hours are tight. A push notification when your phone is closed. And the Terminal card when other drivers report a long line, out of product, or no allocation.",
    why: "If you forget to tap Arrive, your ELD's time is used instead of the time you tapped, and you only answer yes or no. Nothing is stamped without you.",
    demo: <div style={{ display: "grid", gap: 10 }}><DemoAlertCard /><DemoTerminalCard /></div>,
  },
  {
    title: "Last five deliveries",
    what: "Under your next drop, a recap of the last five deliveries at that store: who delivered, when, how many gallons of each product, and where the tanks ended up. Other companies' drivers are included.",
    why: "You can see how recently the store was filled and how much it takes, so you spot a store that is full, slow, or busy before you get there, without asking dispatch. Fewer calls, fewer surprises.",
    demo: <DemoRecentDeliveries />,
  },
  {
    title: "Terminal access and tools",
    what: "The access strip shows every terminal in the city: filled means you have access, the bar is how long it lasts, an empty box means none. Tap an empty one to work through the steps to get it. The tools below open Plan, Equipment, Fuel, Cards, Trips, Reports and the rest.",
    why: "You know where you can load today, and everything else is one tap away.",
    demo: <div style={{ display: "grid", gap: 10 }}><DemoAccess /><DemoTools /></div>,
  },
];

export function DashboardTour({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => { if (open) setI(0); }, [open]);
  if (!mounted || !open) return null;
  const s = STEPS[i];
  const last = i === STEPS.length - 1;
  return createPortal(
    <div role="dialog" aria-label="Dashboard tour" style={{ position: "fixed", inset: 0, zIndex: 600, background: "#0b0b0b", display: "flex", flexDirection: "column", color: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "calc(env(safe-area-inset-top, 0px) + 12px) 16px 10px" }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(255,255,255,0.5)" }}>Dashboard tour · {i + 1} of {STEPS.length}</span>
        <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.65)", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Skip</button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 16px 16px" }}>
        <div style={{ maxWidth: 520, margin: "0 auto" }}>
          <div style={{ pointerEvents: "none", marginBottom: 14 }}>{s.demo}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 12 }}>Demo data, not your trip.</div>
          <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1.2 }}>{s.title}</div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.78)", lineHeight: 1.55, marginTop: 8 }}>{s.what}</div>
          <div style={{ fontSize: 13, color: "#93c5fd", lineHeight: 1.5, marginTop: 10 }}><b>Why it helps:</b> {s.why}</div>
        </div>
      </div>
      <div style={{ padding: "10px 16px calc(env(safe-area-inset-bottom, 0px) + 14px)", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
        <div style={{ display: "flex", gap: 5, justifyContent: "center", marginBottom: 10 }}>
          {STEPS.map((_, k) => <span key={k} style={{ width: k === i ? 18 : 6, height: 6, background: k === i ? "#fff" : "rgba(255,255,255,0.18)", transition: "all .2s" }} />)}
        </div>
        <div style={{ display: "flex", gap: 10, maxWidth: 520, margin: "0 auto" }}>
          {i > 0 && <button type="button" onClick={() => setI(i - 1)} style={{ flex: 1, padding: "14px 0", fontSize: 14, fontWeight: 700, cursor: "pointer", background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 2 }}>‹ Back</button>}
          <button type="button" onClick={() => (last ? onClose() : setI(i + 1))} style={{ flex: 2, padding: "14px 0", fontSize: 14, fontWeight: 800, cursor: "pointer", background: "#fff", color: "#000", border: "none", borderRadius: 2, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            {last ? "Got it" : "Next"}
          </button>
        </div>
        {last && <div style={{ textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 8 }}>You can replay this any time from Menu → Learn.</div>}
      </div>
    </div>,
    document.body,
  );
}

const key = (uid: string) => `proTankr:u:${uid}:dashTourSeen`;
export const dashTourSeen = (uid: string | null) => { try { return !!uid && localStorage.getItem(key(uid)) === "1"; } catch { return true; } };
export const markDashTourSeen = (uid: string | null) => { try { if (uid) localStorage.setItem(key(uid), "1"); } catch { /* shows again */ } };
