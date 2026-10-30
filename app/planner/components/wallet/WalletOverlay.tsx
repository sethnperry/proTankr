"use client";
// app/planner/components/wallet/WalletOverlay.tsx
//
// A wallet card opened full size, floating over the others (not a separate window). Tap outside to close.

import React from "react";
import { createPortal } from "react-dom";

export function WalletOverlay({ open, onClose, children, maxWidth = 420 }: { open: boolean; onClose: () => void; children: React.ReactNode; maxWidth?: number }) {
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 700, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "calc(env(safe-area-inset-top, 0px) + 14px) 14px 20px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth }}>{children}</div>
    </div>, document.body);
}
