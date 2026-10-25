"use client";
// app/planner/components/SetupSessionBanner.tsx
//
// Shown while an admin is setting up the Planner for another driver. The exit
// button clears the session and hard-navigates, because the layout's shell
// provider only reads the session from storage when it mounts.

import { clearSetupSession } from "@/lib/setupSession";

export default function SetupSessionBanner({ targetDisplayName, returnTo }: { targetDisplayName: string; returnTo?: string | null }) {
  return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", marginBottom: 8, borderRadius: 2, background: "rgba(251,146,60,0.12)", border: "1px solid rgba(251,146,60,0.30)" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#fb923c", letterSpacing: "0.08em", textTransform: "uppercase" as const }}>Setting up planner for</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.90)", marginTop: 1 }}>{targetDisplayName}</div>
          </div>
          <button type="button"
            onClick={() => {
              clearSetupSession();
              // Hard navigation -- when returnTo stays inside the
              // /planner layout (e.g. "/planner/dispatch"),
              // CalculatorShellProvider never unmounts on a router.push, so
              // it never re-reads sessionStorage and the just-cleared
              // session would silently stick (confirmed live: the "Setting
              // up planner for" banner stayed visible after this click).
              // Same fix as the Dispatch tab's own "Use app as X" entry
              // point, applied symmetrically to the exit.
              window.location.href = returnTo ?? "/admin";
            }}
            style={{ fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 2, border: "1px solid rgba(251,146,60,0.40)", background: "rgba(251,146,60,0.15)", color: "#fb923c", cursor: "pointer", whiteSpace: "nowrap" as const }}>
            ← Return to {returnTo === "/planner/dispatch" ? "Dispatch" : "Admin"}
          </button>
        </div>
      
  );
}
