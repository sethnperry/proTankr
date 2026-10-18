"use client";
// modals/TerminalCardsReportModal.tsx
//
// Plain-text share sheet for the Terminal Cards city report -- same bottom-
// sheet chrome and Copy/Text/Email pattern as LoadReportModal, just showing
// a pre-built report string instead of rendering compartment lines.

import React, { useState } from "react";
import { createPortal } from "react-dom";
import { shareViaClipboard, shareViaSMS, shareViaEmail } from "../utils/share";

const BTN: React.CSSProperties = {
  flex: 1, padding: "11px 0", borderRadius: 2,
  border: "1px solid rgba(255,255,255,0.15)",
  background: "rgba(255,255,255,0.07)",
  color: "rgba(255,255,255,0.82)",
  fontSize: 13, fontWeight: 700, cursor: "pointer", letterSpacing: 0.3,
};

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  body: string;
};

export default function TerminalCardsReportModal({ open, onClose, title, body }: Props) {
  const [copied, setCopied] = useState(false);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 10200, background: "rgba(0,0,0,0.80)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#111518", borderRadius: "2px 2px 0 0", border: "1px solid rgba(255,255,255,0.08)", borderBottom: "none", width: "100%", maxHeight: "80dvh", display: "flex", flexDirection: "column", overflow: "hidden" }}
      >
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 4px" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)" }} />
        </div>

        <div style={{ display: "flex", alignItems: "center", padding: "4px 18px 12px", gap: 10 }}>
          <div style={{ flex: 1, fontSize: 18, fontWeight: 900, color: "rgba(255,255,255,0.92)" }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.85)", fontSize: 22, fontWeight: 900, cursor: "pointer", lineHeight: 1, padding: "0 2px", flexShrink: 0 }}>×</button>
        </div>

        <div style={{ height: 1, background: "rgba(255,255,255,0.07)", flexShrink: 0 }} />

        <div style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain", padding: "16px 18px" }}>
          <div style={{ fontFamily: "monospace", fontSize: 12.5, lineHeight: 1.7, color: "rgba(255,255,255,0.80)", whiteSpace: "pre-wrap" as const, wordBreak: "break-word" as const }}>
            {body}
          </div>
        </div>

        <div style={{ padding: "12px 18px 28px", borderTop: "1px solid rgba(255,255,255,0.07)", display: "flex", gap: 8 }}>
          <button type="button" onClick={() => shareViaClipboard(body, () => { setCopied(true); setTimeout(() => setCopied(false), 1800); })} style={BTN}>{copied ? "✓ Copied" : "Copy"}</button>
          <button type="button" onClick={() => shareViaSMS(body)} style={BTN}>Text</button>
          <button type="button" onClick={() => shareViaEmail(title, body)} style={BTN}>Email</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
