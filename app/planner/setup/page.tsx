"use client";
// app/planner/setup/page.tsx
//
// Driver Setup: every personal setting in one checklist. A fleet driver mostly confirms what the admin preset;
// a solo driver fills it in. Required steps (name, region, license, equipment, a plan) can't be skipped.
// The rows open the real screens, so nothing here is a second copy of a setting.

import React, { useEffect, useState } from "react";
import { useCalculatorShell } from "../CalculatorShellContext";
import { useDashLook, DashStyles } from "../home/dashLook";
import { BackToDashboard } from "../components/dash/BackToDashboard";
import { useDriverSetup } from "@/lib/setup/useDriverSetup";
import { counterText, type SetupStep, type StepId } from "@/lib/setup/driverSetup";
import { SelfProfileView } from "@/lib/ui/driver/SelfProfileView";
import FuelPinsView from "../components/FuelPinsView";
import TelematicsLoginView from "../components/TelematicsLoginView";
import { enablePush } from "@/lib/push/subscribe";
import { usePending, Spinner } from "@/lib/ui/pending";

const MARK: Record<SetupStep["status"], string> = { needs: "#f87171", confirm: "#fbbf24", open: "rgba(255,255,255,0.3)", done: "#4ade80", na: "transparent" };

export default function SetupPage() {
  const shell = useCalculatorShell();
  const L = useDashLook();
  const nav = usePending();
  const userId = shell.effectiveUserId || null;
  const companyId = shell.companyId || null;
  const { summary, facts, loading, error, reload, confirm } = useDriverSetup(userId, companyId);
  const [openId, setOpenId] = useState<StepId | null>(null);
  const [editProfile, setEditProfile] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // Coming back from the equipment or terminal sheets: the answer may have changed.
  useEffect(() => { if (!shell.equipOpen && !shell.termOpen && !shell.locOpen) void reload(); }, [shell.equipOpen, shell.termOpen, shell.locOpen, reload]);

  const muted = "rgba(255,255,255,0.55)";
  const btn: React.CSSProperties = { padding: "10px 14px", fontSize: 13, fontWeight: 800, cursor: "pointer", border: "1px solid rgba(255,255,255,0.25)", background: "transparent", color: "#fff", borderRadius: 2 };
  const primary: React.CSSProperties = { ...btn, background: "#fff", color: "#000", border: "none", textTransform: "uppercase", letterSpacing: "0.06em" };

  // What "Open" does for each step. Inline panels are opened under the row; the rest go to the real screen.
  const open = async (id: StepId) => {
    setMsg(null);
    switch (id) {
      case "you": case "license": return setEditProfile(true);
      case "equipment": return shell.setEquipOpen(true);
      case "plans": return nav.go("plans", "/planner?plan=1");
      case "terminals": return shell.location.selectedCity ? shell.setTermOpen(true) : shell.setLocOpen(true);
      case "locations": return nav.go("locations", "/planner/locations");
      case "per_diem": return nav.go("per_diem", "/planner/home?open=perdiem");
      case "vault": return nav.go("vault", "/planner/vault");
      case "alerts": {
        if (!companyId) return;
        setBusy("alerts");
        const r = await enablePush(companyId);
        setBusy(null);
        if (!r.ok && r.reason) setMsg(r.reason);
        return void reload();
      }
      case "fuel_pin": case "hours": return setOpenId(openId === id ? null : id);
      case "schedule": return setMsg("Your schedule is set by your admin. Ask them to change it.");
    }
  };

  const confirmIt = async (id: StepId) => { setBusy(id); const e = await confirm(id); setBusy(null); if (e) setMsg(e); };

  const nextStep = summary?.steps.find((s) => s.id === summary.next) ?? null;
  const solo = facts?.tier === "solo";

  return (
    <div style={{ padding: "12px 16px 40px", maxWidth: 640, margin: "0 auto", color: "#fff" }}>
      <DashStyles />
      <BackToDashboard />
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "6px 0 4px" }}>Setup</h1>
      <div style={{ fontSize: 14, color: muted, marginBottom: 14, lineHeight: 1.4 }}>
        {solo ? "Set up your account once and the app does the rest." : "Your company set up a lot of this. Check each one and confirm it's right."}
      </div>

      {!summary && !error && <div style={{ color: muted, fontSize: 14 }}>Loading…</div>}
      {error && <div style={{ color: "#f87171", fontSize: 14, marginBottom: 10 }}>{error}</div>}

      {summary && (
        <>
          <div style={{ ...L.secondary, padding: 14, marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span className="dash-num" style={{ fontSize: 28, fontWeight: 800 }}>{counterText(summary)}</span>
              <span style={{ fontSize: 13, color: muted }}>complete</span>
              {loading && <span style={{ marginLeft: "auto" }}><Spinner size={12} /></span>}
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.12)", marginTop: 10 }}>
              <div style={{ height: "100%", width: `${summary.total ? (summary.done / summary.total) * 100 : 0}%`, background: summary.requiredLeft ? "#fbbf24" : "#4ade80" }} />
            </div>
            {summary.requiredLeft > 0 && <div style={{ fontSize: 13, color: "#fbbf24", marginTop: 8 }}>{summary.requiredLeft} required {summary.requiredLeft === 1 ? "step" : "steps"} left. The app needs these to work properly.</div>}
            {summary.complete && <div style={{ fontSize: 13, color: "#4ade80", marginTop: 8 }}>You're all set.</div>}
            {nextStep && (
              <button type="button" className="dash-press" style={{ ...primary, width: "100%", marginTop: 12, padding: "14px 0" }}
                onClick={() => (nextStep.status === "confirm" ? void confirmIt(nextStep.id) : void open(nextStep.id))}>
                {nextStep.status === "confirm" ? `Confirm ${nextStep.label}` : `Next: ${nextStep.label}`}
              </button>
            )}
          </div>
          {msg && <div style={{ fontSize: 13, color: "#fbbf24", marginBottom: 10 }}>{msg}</div>}

          {summary.steps.filter((s) => s.status !== "na").map((s) => (
            <div key={s.id} style={{ ...L.secondary, marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 14 }}>
                <span aria-hidden style={{ width: 10, height: 10, background: MARK[s.status], flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800 }}>{s.label}{s.required && s.status !== "done" ? <span style={{ fontSize: 11, color: "#f87171", marginLeft: 8, letterSpacing: "0.1em" }}>REQUIRED</span> : null}</div>
                  <div style={{ fontSize: 12, color: s.status === "needs" ? "#f87171" : s.status === "confirm" ? "#fbbf24" : muted, marginTop: 2 }}>{s.detail}</div>
                </div>
                {s.status !== "confirm" && s.id !== "schedule" && (
                  <button type="button" className="dash-press" style={btn} {...(busy === s.id ? { disabled: true, "aria-busy": true } : {})} onClick={() => void open(s.id)}>
                    {s.status === "done" ? "Edit" : s.status === "needs" ? "Fix" : "Set up"}
                  </button>
                )}
              </div>
              {s.status === "confirm" && (
                <div style={{ display: "flex", gap: 8, padding: "0 14px 14px 36px" }}>
                  <button type="button" className="dash-press" style={{ ...primary, flex: 1 }} {...(busy === s.id ? { disabled: true, "aria-busy": true } : {})} onClick={() => void confirmIt(s.id)}>Looks right</button>
                  {s.id !== "schedule" && <button type="button" className="dash-press" style={btn} onClick={() => void open(s.id)}>Edit</button>}
                </div>
              )}
              {openId === s.id && s.id === "fuel_pin" && companyId && userId && <div style={{ padding: "0 14px 14px" }}><FuelPinsView companyId={companyId} userId={userId} /></div>}
              {openId === s.id && s.id === "hours" && companyId && <div style={{ padding: "0 14px 14px" }}><TelematicsLoginView companyId={companyId} /></div>}
            </div>
          ))}
        </>
      )}

      {editProfile && <SelfProfileView direct onExit={() => { setEditProfile(false); void reload(); }} />}
    </div>
  );
}
