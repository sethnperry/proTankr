"use client";
// app/planner/components/wallet/IdCardFace.tsx
//
// The front of a badge or credential: black header with the name, the photo (or a plain panel) in the
// middle, black footer with the expiration date. Tall by default; `landscape` lays it on its side.

import React from "react";
import { useSignedUrl } from "./walletPhoto";
import { CARD_BG, CARD_BORDER } from "../../cards/cardTheme";

export function IdCardFace({ header, sub, footer, footerColor, imagePath, landscape, inactive, onClick, empty }: {
  header: string; sub?: string | null; footer: string; footerColor: string; imagePath?: string | null;
  landscape?: boolean; inactive?: boolean; onClick?: () => void; empty?: boolean;
}) {
  const src = useSignedUrl(imagePath);
  return (
    <button type="button" onClick={onClick} disabled={!onClick}
      style={{ width: "100%", aspectRatio: landscape ? "1.586 / 1" : "3 / 5", display: "flex", flexDirection: "column", padding: 0, overflow: "hidden", textAlign: "left", color: "#fff",
        borderRadius: 3, border: CARD_BORDER, background: CARD_BG, cursor: onClick ? "pointer" : "default", opacity: inactive ? 0.6 : 1 }}>
      <div style={{ background: "#000", padding: "7px 8px", minHeight: 34, boxSizing: "border-box" }}>
        <div style={{ fontSize: 12, fontWeight: 800, lineHeight: 1.15, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{header}</div>
        {sub && <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: 0.4, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>}
      </div>
      <div style={{ flex: 1, minHeight: 0, background: "rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {src ? <img src={src} alt={header} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          : <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.28)", textAlign: "center", padding: 6 }}>{empty ? "Not on file · tap to add" : "No photo"}</span>}
      </div>
      <div style={{ background: "#000", padding: "7px 8px", fontSize: 13, fontWeight: 800, color: footerColor }}>{footer}</div>
    </button>
  );
}
