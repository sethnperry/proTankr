"use client";
// app/planner/modals/solo/TakeoverBlockedDialog.tsx
//
// An admin or dispatcher tapped a unit a driver is using. They never take it over; this says why and what they can do.

import React from "react";

export function TakeoverBlockedDialog({ blocked, onClose }: { blocked: { what: string; ownerName: string | null } | null; onClose: () => void }) {
  if (!blocked) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "#151515", border: "1px solid rgba(255,255,255,0.12)", padding: 20, maxWidth: 360, width: "100%" }}>
        <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 8 }}>In use by {blocked.ownerName ?? "a driver"}</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", lineHeight: 1.6, marginBottom: 16 }}>
          This {blocked.what} is being used by a driver, and admins can't take over equipment in use. You can still look at it in Track, and anything you change on it (STUD, Edit, records) is warned about first and sent to the driver.
        </div>
        <button type="button" onClick={onClose} style={{ display: "block", width: "100%", padding: "14px 18px", border: "none", borderRadius: 2, background: "#fff", color: "#000", fontWeight: 900, fontSize: 15, cursor: "pointer" }}>OK</button>
      </div>
    </div>
  );
}
