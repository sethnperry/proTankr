"use client";
// app/planner/components/SetupGate.tsx
//
// Blank-screen, hard-gated setup sequence for first-run (and any-time-unset)
// equipment -> location -> terminal selection.
//
// Mechanic: each step renders a large centered CTA using a framer-motion
// layoutId that matches the *real* button sitting in its normal resting
// position in the page header/card (see integration notes -- those buttons
// need the same layoutId added). When a step's condition becomes satisfied,
// this component stops rendering that step's centered clone; framer-motion
// automatically animates the shared element from its last known center
// position to wherever the real button currently sits. No manual FLIP math.
//
// z-index: 40. The real modals (FullscreenModal) use Tailwind's z-50, so they
// correctly render on top of this gate when the centered button opens them.

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";

export type SetupGateStep = "equipment" | "location" | "terminal";

export type SetupGateProps = {
  comboSelected: boolean;
  locationSelected: boolean;
  terminalSelected: boolean;

  equipmentLabel?: string | null;
  locationLabel?: string | null;
  terminalLabel?: string | null;

  onOpenEquipment: () => void;
  onOpenLocation: () => void;
  onOpenTerminal: () => void;
};

const STEP_COPY: Record<SetupGateStep, { title: string; sub: string; layoutId: string }> = {
  equipment: {
    title: "Select Equipment",
    sub: "Pick the truck and trailer you're running today.",
    layoutId: "setup-equipment-btn",
  },
  location: {
    title: "Set Location",
    sub: "Choose the state and city you're loading in.",
    layoutId: "setup-location-btn",
  },
  terminal: {
    title: "Select Terminal",
    sub: "Choose the terminal you're loading at.",
    layoutId: "setup-terminal-btn",
  },
};

export default function SetupGate(props: SetupGateProps) {
  const {
    comboSelected, locationSelected, terminalSelected,
    equipmentLabel, locationLabel, terminalLabel,
    onOpenEquipment, onOpenLocation, onOpenTerminal,
  } = props;

  // typeof document === "undefined" is only ever true on the server -- on the
  // client's very first (hydration) render document is already defined, so
  // without this mount-guard the server would render null while the client's
  // first pass immediately portals real content, a guaranteed hydration
  // mismatch every time the gate is actually needed. Waiting for a post-mount
  // effect keeps the client's first render identical to the server's (null),
  // deferring the portal to a normal client-only re-render.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Derived, not stored -- the gate always reflects real selection state, so
  // resetting equipment mid-session correctly re-opens the gate at that step.
  const step: SetupGateStep | null = !comboSelected
    ? "equipment"
    : !locationSelected
    ? "location"
    : !terminalSelected
    ? "terminal"
    : null;

  if (!mounted || step === null) return null;

  const copy = STEP_COPY[step];
  const onOpen = step === "equipment" ? onOpenEquipment : step === "location" ? onOpenLocation : onOpenTerminal;

  // Back steps to a prior selection without clearing it -- just re-opens that
  // step's picker so the user can change their mind. Nothing is destructive;
  // the gate naturally reflects whatever they end up choosing.
  const showBack = step !== "equipment";
  const onBack = step === "location" ? onOpenEquipment : step === "terminal" ? onOpenLocation : undefined;

  return createPortal(
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 40,
        background: "#111111",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
      }}
    >
      {showBack && (
        <button
          type="button"
          onClick={onBack}
          style={{
            position: "absolute", top: 16, left: 16,
            background: "none", border: "none", cursor: "pointer",
            fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.28)",
            padding: "6px 10px",
          }}
          aria-label="Back to previous step"
        >
          ‹ Back
        </button>
      )}

      <AnimatePresence mode="wait">
        <motion.button
          key={step}
          layoutId={copy.layoutId}
          type="button"
          onClick={onOpen}
          transition={{ type: "spring", stiffness: 300, damping: 28 }}
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.18)",
            borderRadius: 2,
            padding: "22px 36px",
            cursor: "pointer",
            color: "rgba(255,255,255,0.95)",
            fontWeight: 900,
            fontSize: "clamp(20px, 5vw, 30px)",
            letterSpacing: 0.2,
            boxShadow: "0 0 0 4px rgba(255,255,255,0.04)",
          }}
        >
          {step === "equipment" && (equipmentLabel || copy.title)}
          {step === "location" && (locationLabel || copy.title)}
          {step === "terminal" && (terminalLabel || copy.title)}
        </motion.button>
      </AnimatePresence>

      <div style={{ marginTop: 18, fontSize: 13, color: "rgba(255,255,255,0.40)", textAlign: "center", maxWidth: 280, lineHeight: 1.5 }}>
        {copy.sub}
      </div>
    </div>,
    document.body
  );
}
