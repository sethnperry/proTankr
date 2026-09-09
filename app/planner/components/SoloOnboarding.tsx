"use client";
// app/planner/components/SoloOnboarding.tsx
//
// Guided first-run setup for a SOLO (independent) driver. A full-screen gate
// (z-index 45 -- above SetupGate's 40, below FullscreenModal's z-50 so the
// reused LocationModal/MyTerminalsModal render on top) that walks a brand-new
// driver from "just signed in" to "usable planner + one saved plan" by asking
// only what the planner actually needs to compute a load.
//
// It is a SHELL around the existing equipment/planner logic, not a parallel
// system: truck/trailer/compartment creation reuse the same inserts
// EquipmentDetails.tsx uses; coupling + tare + target go through the existing
// couple_combo RPC; the driver name goes through upsert_driver_profile; the
// location/terminal steps drive the app's real pickers (LocationModal /
// MyTerminalsModal) via the shell. See docs plan snug-petting-starlight.
//
// Resumable: the starting step is derived from real DB state on mount (so a
// cold reopen resumes where the driver left off), plus a small localStorage
// draft for the trailer/compartment sub-steps (which aren't committed to the
// DB until every capacity is entered). See utils/onboardingProgress.ts.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase/client";
import {
  isTutorialSeen, markTutorialSeen, markOnboardingComplete,
  readTrailerDraft, writeTrailerDraft, clearTrailerDraft,
} from "../utils/onboardingProgress";

// ── Types ────────────────────────────────────────────────────────────────────

type Step =
  | "welcome"
  | "identity"
  | "truck"
  | "trailer"
  | "caps"
  | "safety"
  | "tare"
  | "target"
  | "location"
  | "terminal"
  | "ready"
  | "tutorial"
  | "done"
  | "resolving";

export type SoloOnboardingProps = {
  userId: string;
  companyId: string;
  displayName?: string | null;

  // location state (read) -- from shell.location
  selectedState: string;
  selectedCity: string;
  selectedTerminalId: string;

  // open the app's real pickers (shell.setLocOpen / shell.setTermOpen)
  onOpenLocation: () => void;
  onOpenTerminal: () => void;

  // equipment (shell.equipment)
  fetchCombos: () => Promise<void> | void;
  setSelectedComboId: (id: string) => void;

  // called once onboarding is fully complete -- lets the page stop rendering us
  onComplete: () => void;
};

const DEFAULT_TARGET_LBS = 79500;
const MAX_PLAUSIBLE_CAP_GAL = 20000;
const MAX_PLAUSIBLE_TARE_LBS = 60000;
const SAFETY_BUFFER_GAL = 50;

// Steps that get a progress dot (the "build" steps). welcome/ready/tutorial/
// done are outside the counter.
const DOT_STEPS: Step[] = ["identity", "truck", "trailer", "caps", "safety", "tare", "target", "location", "terminal"];

// ── Styling (inherits the app-wide Outfit font; never overrides font-family) ──

const S = {
  screen: {
    position: "fixed" as const, inset: 0, zIndex: 45,
    background: "#111111", color: "#fff",
    display: "flex", flexDirection: "column" as const,
    alignItems: "center", justifyContent: "center",
    padding: "24px 22px",
    paddingTop: "calc(env(safe-area-inset-top, 0px) + 24px)",
    overflowY: "auto" as const,
  },
  card: {
    width: "100%", maxWidth: 380, display: "flex", flexDirection: "column" as const, gap: 18,
  },
  h1: { fontSize: 26, fontWeight: 800, lineHeight: 1.2, margin: 0 },
  h2: { fontSize: 22, fontWeight: 800, lineHeight: 1.25, margin: 0 },
  sub: { fontSize: 14, lineHeight: 1.5, color: "rgba(255,255,255,0.55)" },
  label: { fontSize: 12, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase" as const, color: "rgba(255,255,255,0.45)", marginBottom: 6 },
  input: {
    width: "100%", padding: "14px 14px", fontSize: 20, fontWeight: 700,
    color: "#fff", background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10,
  } as React.CSSProperties,
  example: { fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 6 },
  primary: {
    width: "100%", padding: "15px 0", borderRadius: 10, border: "none",
    background: "#fff", color: "#000", fontSize: 16, fontWeight: 800, cursor: "pointer",
  } as React.CSSProperties,
  secondary: {
    width: "100%", padding: "13px 0", borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.15)", background: "transparent",
    color: "rgba(255,255,255,0.7)", fontSize: 14, fontWeight: 600, cursor: "pointer",
  } as React.CSSProperties,
  back: {
    position: "absolute" as const, top: "calc(env(safe-area-inset-top,0px) + 14px)", left: 16,
    background: "none", border: "none", cursor: "pointer",
    fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.3)", padding: "6px 10px",
  },
  err: { fontSize: 13, color: "#f87171", lineHeight: 1.4 },
  warn: {
    fontSize: 13, color: "#fbbf24", lineHeight: 1.5,
    background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)",
    borderRadius: 10, padding: "12px 14px",
  } as React.CSSProperties,
};

function disabledPrimary(disabled: boolean): React.CSSProperties {
  return disabled ? { ...S.primary, opacity: 0.4, cursor: "not-allowed" } : S.primary;
}

function fmt(n: number): string {
  return n.toLocaleString();
}
function digits(raw: string): string {
  return raw.replace(/[^0-9]/g, "");
}

// ── Component ────────────────────────────────────────────────────────────────

export default function SoloOnboarding(props: SoloOnboardingProps) {
  const {
    userId, companyId,
    selectedState, selectedCity, selectedTerminalId,
    onOpenLocation, onOpenTerminal,
    fetchCombos, setSelectedComboId, onComplete,
  } = props;

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [step, setStep] = useState<Step>("resolving");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Form state ──
  const [name, setName] = useState(props.displayName ?? "");
  const [company, setCompany] = useState("");
  const [truckNumber, setTruckNumber] = useState("");
  const [trailerNumber, setTrailerNumber] = useState("");
  const [compCount, setCompCount] = useState<number>(3);
  const [caps, setCaps] = useState<(number | undefined)[]>([]);
  const [capIdx, setCapIdx] = useState(0);
  const [capInput, setCapInput] = useState("");
  const [tareInput, setTareInput] = useState("");
  const [tareLbs, setTareLbs] = useState<number | null>(null);
  const [targetInput, setTargetInput] = useState(String(DEFAULT_TARGET_LBS));

  // ── Resolved equipment ids (created here, or loaded on resume) ──
  const truckIdRef = useRef<string | null>(null);
  const trailerIdRef = useRef<string | null>(null);
  // True once we've actually built anything this session -- gates whether the
  // tutorial shows. An already-fully-set-up solo user (e.g. the existing
  // operator/demo company) is silently marked complete with no UI.
  const builtRef = useRef(false);

  const locationSet = Boolean(selectedState && selectedCity);
  const terminalSet = Boolean(selectedTerminalId);

  // ── Resolve the starting step from real DB state (resume-safe) ──
  useEffect(() => {
    let cancelled = false;
    if (!userId || !companyId) return;
    (async () => {
      try {
        const [{ data: prof }, { data: truckRows }, { data: trailerRows }, { data: comboRows }] = await Promise.all([
          supabase.from("profiles").select("display_name").eq("user_id", userId).maybeSingle(),
          supabase.from("trucks").select("truck_id, truck_name").eq("company_id", companyId).eq("active", true).order("truck_name"),
          supabase.from("trailers").select("trailer_id, trailer_name").eq("company_id", companyId).eq("active", true).order("trailer_name"),
          supabase.from("equipment_combos").select("combo_id, tare_lbs, truck_id, trailer_id").eq("company_id", companyId).eq("active", true),
        ]);
        if (cancelled) return;

        const nameDone = Boolean(prof?.display_name && String(prof.display_name).trim());
        if (prof?.display_name) setName(String(prof.display_name));

        const firstTruck = (truckRows ?? [])[0] as { truck_id: string } | undefined;
        const firstTrailer = (trailerRows ?? [])[0] as { trailer_id: string } | undefined;
        truckIdRef.current = firstTruck?.truck_id ?? null;
        trailerIdRef.current = firstTrailer?.trailer_id ?? null;

        const truckExists = Boolean(firstTruck);
        const trailerExists = Boolean(firstTrailer);
        const comboReady = (comboRows ?? []).some((c: any) => Number(c?.tare_lbs ?? 0) > 0);

        // Already-onboarded (existing solo user): everything the planner needs
        // exists AND they have a name. Silently complete, no UI, no tutorial.
        if (nameDone && comboReady && locationSet && terminalSet) {
          markOnboardingComplete(userId);
          onComplete();
          return;
        }

        // A prior in-progress trailer draft (compartments not yet committed)?
        const draft = !trailerExists ? readTrailerDraft(userId) : null;

        // First incomplete step, in order.
        let start: Step;
        if (!nameDone && !truckExists && !trailerExists && !comboReady) {
          start = "welcome"; // truly fresh
        } else if (!nameDone) {
          start = "identity";
        } else if (!truckExists) {
          start = "truck";
        } else if (!trailerExists) {
          if (draft) {
            setTrailerNumber(draft.trailerNumber);
            setCompCount(draft.compCount);
            setCaps(draft.caps);
            const nextIdx = draft.caps.findIndex((c) => c == null);
            if (nextIdx === -1) { start = "safety"; setCapIdx(draft.compCount); }
            else { start = "caps"; setCapIdx(nextIdx); }
            builtRef.current = true;
          } else {
            start = "trailer";
          }
        } else if (!comboReady) {
          start = "tare";
        } else if (!locationSet) {
          start = "location";
        } else if (!terminalSet) {
          start = "terminal";
        } else {
          start = "tutorial"; // everything built this/last session; finish with tutorial
        }

        if (truckExists || trailerExists || comboReady) builtRef.current = true;
        setStep(start);
      } catch (e: any) {
        if (!cancelled) { setStep("welcome"); }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, companyId]);

  // ── Auto-advance the location/terminal steps as the shared pickers resolve ──
  useEffect(() => {
    if (step === "location" && locationSet) setStep("terminal");
  }, [step, locationSet]);
  useEffect(() => {
    if (step === "terminal" && terminalSet) setStep("ready");
  }, [step, terminalSet]);

  // ── Writes ──

  const saveIdentity = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) { setError("Please enter your name."); return; }
    setBusy(true); setError(null);
    try {
      const { error: e1 } = await supabase.rpc("upsert_driver_profile", {
        p_user_id: userId, p_company_id: companyId, p_data: { display_name: trimmed },
      });
      if (e1) throw e1;
      const co = company.trim();
      if (co) {
        const { error: e2 } = await supabase.rpc("set_solo_company_name", { p_company_id: companyId, p_name: co });
        if (e2) throw e2;
      }
      builtRef.current = true;
      setStep("truck");
    } catch (e: any) {
      setError("Couldn't save that. Check your connection and try again.");
    } finally { setBusy(false); }
  }, [name, company, userId, companyId]);

  const saveTruck = useCallback(async () => {
    const num = truckNumber.trim();
    if (!num) { setError("Enter your truck number."); return; }
    setBusy(true); setError(null);
    try {
      const { data, error: e } = await supabase
        .from("trucks")
        .insert({ truck_name: num, active: true, company_id: companyId })
        .select("truck_id").single();
      if (e) throw e;
      truckIdRef.current = String((data as any).truck_id);
      builtRef.current = true;
      setStep("trailer");
    } catch (e: any) {
      setError("Couldn't save the truck. Check your connection and try again.");
    } finally { setBusy(false); }
  }, [truckNumber, companyId]);

  const startTrailer = useCallback(() => {
    const num = trailerNumber.trim();
    if (!num) { setError("Enter your trailer number."); return; }
    if (!(compCount >= 1 && compCount <= 12)) { setError("Choose how many compartments the trailer has."); return; }
    setError(null);
    const nextCaps = Array.from({ length: compCount }, (_, i) => caps[i]);
    setCaps(nextCaps);
    setCapIdx(0);
    setCapInput(nextCaps[0] != null ? String(nextCaps[0]) : "");
    writeTrailerDraft(userId, { trailerNumber: num, compCount, caps: nextCaps });
    builtRef.current = true;
    setStep("caps");
  }, [trailerNumber, compCount, caps, userId]);

  const saveCap = useCallback(() => {
    const val = Number(capInput);
    if (!Number.isFinite(val) || val <= 0) { setError("Enter a capacity in gallons."); return; }
    if (val > MAX_PLAUSIBLE_CAP_GAL) { setError("That capacity looks unusually high. Check the number and try again."); return; }
    setError(null);
    const nextCaps = caps.slice();
    nextCaps[capIdx] = val;
    setCaps(nextCaps);
    writeTrailerDraft(userId, { trailerNumber: trailerNumber.trim(), compCount, caps: nextCaps });
    if (capIdx + 1 < compCount) {
      setCapIdx(capIdx + 1);
      setCapInput(nextCaps[capIdx + 1] != null ? String(nextCaps[capIdx + 1]) : "");
    } else {
      setStep("safety");
    }
  }, [capInput, caps, capIdx, compCount, trailerNumber, userId]);

  const safetyCapFor = useCallback((cap: number) => (cap > SAFETY_BUFFER_GAL ? cap - SAFETY_BUFFER_GAL : Math.max(1, cap)), []);

  const commitTrailer = useCallback(async () => {
    const num = trailerNumber.trim();
    const filled = caps.map((c) => Number(c)).filter((c) => Number.isFinite(c) && c > 0);
    if (filled.length !== compCount) { setError("Please enter every compartment capacity."); return; }
    setBusy(true); setError(null);
    try {
      const { data, error: e } = await supabase
        .from("trailers")
        .insert({ trailer_name: num, active: true, company_id: companyId })
        .select("trailer_id").single();
      if (e) throw e;
      const trailerId = String((data as any).trailer_id);
      trailerIdRef.current = trailerId;

      const rows = caps.map((c, i) => {
        const total = Number(c);
        return {
          trailer_id: trailerId,
          comp_number: i + 1,
          max_gallons: total,
          position: i,
          cap_gallons: safetyCapFor(total),
        };
      });
      const { error: ce } = await supabase.from("trailer_compartments").insert(rows);
      if (ce) throw ce;

      clearTrailerDraft(userId);
      setStep("tare");
    } catch (e: any) {
      setError("Couldn't save the trailer. Check your connection and try again.");
    } finally { setBusy(false); }
  }, [trailerNumber, caps, compCount, companyId, userId, safetyCapFor]);

  const saveTare = useCallback(() => {
    const val = Number(tareInput);
    if (!Number.isFinite(val) || val <= 0) { setError("Enter the combined tare weight (lbs)."); return; }
    if (val > MAX_PLAUSIBLE_TARE_LBS) { setError("That tare looks unusually high. Check the number and try again."); return; }
    setError(null);
    setTareLbs(val);
    setStep("target");
  }, [tareInput]);

  const coupleAndContinue = useCallback(async () => {
    const target = Number(targetInput);
    if (!Number.isFinite(target) || target <= 0) { setError("Enter a target weight (lbs)."); return; }
    const truckId = truckIdRef.current;
    const trailerId = trailerIdRef.current;
    if (!truckId || !trailerId || tareLbs == null) { setError("Something's missing. Go back and re-enter your equipment."); return; }
    setBusy(true); setError(null);
    try {
      const { data, error: e } = await supabase.rpc("couple_combo", {
        p_truck_id: truckId,
        p_trailer_id: trailerId,
        p_tare_lbs: tareLbs,
        p_target_weight: target,
        p_force: true,
      });
      if (e) throw e;
      const comboId = String((data as any)?.combo_id ?? "");
      if (!comboId) throw new Error("No combo returned.");
      await fetchCombos();
      setSelectedComboId(comboId);
      setStep(locationSet ? (terminalSet ? "ready" : "terminal") : "location");
    } catch (e: any) {
      setError("Couldn't pair your equipment. Check your connection and try again.");
    } finally { setBusy(false); }
  }, [targetInput, tareLbs, fetchCombos, setSelectedComboId, locationSet, terminalSet]);

  const finishTutorial = useCallback(() => {
    markTutorialSeen(userId);
    setStep("done");
  }, [userId]);

  const finishAll = useCallback(() => {
    markOnboardingComplete(userId);
    onComplete();
  }, [userId, onComplete]);

  // When we arrive at "ready", decide whether the tutorial is still needed.
  const goFromReady = useCallback(() => {
    if (isTutorialSeen(userId)) { finishAll(); return; }
    setStep("tutorial");
  }, [userId, finishAll]);

  if (!mounted || step === "resolving") return null;

  // ── Progress dots ──
  const dotIndex = DOT_STEPS.indexOf(step);
  const showDots = dotIndex >= 0;

  const backTo = (s: Step) => () => { setError(null); setStep(s); };

  return createPortal(
    <div style={S.screen}>
      {showDots && (
        <div style={{ position: "absolute", top: "calc(env(safe-area-inset-top,0px) + 18px)", left: 0, right: 0, display: "flex", gap: 5, justifyContent: "center" }}>
          {DOT_STEPS.map((s, i) => (
            <div key={s} style={{
              width: i === dotIndex ? 16 : 5, height: 5, borderRadius: 3,
              background: i <= dotIndex ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.15)",
              transition: "all 0.25s ease",
            }} />
          ))}
        </div>
      )}

      {/* ── Welcome ── */}
      {step === "welcome" && (
        <div style={S.card}>
          <h1 style={S.h1}>Welcome to ProTankr</h1>
          <div style={S.sub}>Let's get your truck and planner ready. This only takes a few minutes — you can change anything later in Settings.</div>
          <button style={S.primary} onClick={() => setStep("identity")}>Get Started</button>
        </div>
      )}

      {/* ── Identity ── */}
      {step === "identity" && (
        <div style={S.card}>
          <h2 style={S.h2}>Your info</h2>
          <div>
            <div style={S.label}>Your name</div>
            <input style={S.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoFocus autoComplete="name" />
          </div>
          <div>
            <div style={S.label}>Company <span style={{ textTransform: "none", fontWeight: 500 }}>(optional)</span></div>
            <input style={S.input} value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company or business name" autoComplete="organization" />
          </div>
          {error && <div style={S.err}>{error}</div>}
          <button style={disabledPrimary(busy || !name.trim())} disabled={busy || !name.trim()} onClick={saveIdentity}>{busy ? "Saving…" : "Next"}</button>
        </div>
      )}

      {/* ── Truck ── */}
      {step === "truck" && (
        <div style={S.card}>
          <h2 style={S.h2}>Your truck</h2>
          <div>
            <div style={S.label}>Truck number</div>
            <input style={S.input} value={truckNumber} onChange={(e) => setTruckNumber(e.target.value)} placeholder="1234" autoFocus />
            <div style={S.example}>Example: 1234</div>
          </div>
          {error && <div style={S.err}>{error}</div>}
          <button style={disabledPrimary(busy || !truckNumber.trim())} disabled={busy || !truckNumber.trim()} onClick={saveTruck}>{busy ? "Saving…" : "Next"}</button>
        </div>
      )}

      {/* ── Trailer ── */}
      {step === "trailer" && (
        <div style={S.card}>
          <h2 style={S.h2}>Your trailer</h2>
          <div>
            <div style={S.label}>Trailer number</div>
            <input style={S.input} value={trailerNumber} onChange={(e) => setTrailerNumber(e.target.value)} placeholder="5678" autoFocus />
          </div>
          <div>
            <div style={S.label}>Number of compartments</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <button key={n} onClick={() => setCompCount(n)} style={{
                  width: 52, height: 52, borderRadius: 10, fontSize: 18, fontWeight: 800, cursor: "pointer",
                  border: compCount === n ? "1px solid #fff" : "1px solid rgba(255,255,255,0.15)",
                  background: compCount === n ? "#fff" : "rgba(255,255,255,0.06)",
                  color: compCount === n ? "#000" : "#fff",
                }}>{n}</button>
              ))}
            </div>
          </div>
          {error && <div style={S.err}>{error}</div>}
          <button style={disabledPrimary(!trailerNumber.trim())} disabled={!trailerNumber.trim()} onClick={startTrailer}>Next</button>
        </div>
      )}

      {/* ── Compartment capacities ── */}
      {step === "caps" && (
        <div style={S.card}>
          <div style={S.label}>Compartment {capIdx + 1} of {compCount}</div>
          <h2 style={S.h2}>Compartment {capIdx + 1}</h2>
          <div>
            <div style={S.label}>Total capacity?</div>
            <div style={{ position: "relative" }}>
              <input style={S.input} value={capInput} inputMode="numeric" pattern="[0-9]*"
                onChange={(e) => setCapInput(digits(e.target.value))}
                onFocus={(e) => e.target.select()} placeholder="4000" autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") saveCap(); }} />
              <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.3)" }}>gal</span>
            </div>
            <div style={S.example}>Example: 4,000 gal</div>
          </div>
          {error && <div style={S.err}>{error}</div>}
          <button style={disabledPrimary(!capInput)} disabled={!capInput} onClick={saveCap}>Next</button>
          {capIdx > 0 && (
            <button style={S.secondary} onClick={() => { setCapIdx(capIdx - 1); setCapInput(caps[capIdx - 1] != null ? String(caps[capIdx - 1]) : ""); setError(null); }}>‹ Previous compartment</button>
          )}
        </div>
      )}

      {/* ── Safety caps ── */}
      {step === "safety" && (
        <div style={S.card}>
          <h2 style={S.h2}>Your safety caps</h2>
          <div style={S.sub}>We recommend keeping the product level below the overfill-prevention probes. We've set each compartment {SAFETY_BUFFER_GAL} gallons below its total capacity as a starting point.</div>
          <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", padding: "10px 12px", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.3, borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
              <div>Comp</div><div style={{ textAlign: "right" }}>Total Capacity</div><div style={{ textAlign: "right" }}>Safety Cap</div>
            </div>
            {caps.map((c, i) => {
              const total = Number(c) || 0;
              return (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", padding: "11px 12px", fontSize: 14, borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.06)" }}>
                  <div>Comp {i + 1}</div>
                  <div style={{ textAlign: "right" }}>{fmt(total)} gal</div>
                  <div style={{ textAlign: "right", fontWeight: 700 }}>{fmt(safetyCapFor(total))} gal</div>
                </div>
              );
            })}
          </div>
          <div style={S.sub}>You can adjust the safety cap later in Trailer Settings.</div>
          {error && <div style={S.err}>{error}</div>}
          <button style={disabledPrimary(busy)} disabled={busy} onClick={commitTrailer}>{busy ? "Saving…" : "Next"}</button>
          <button style={S.secondary} onClick={() => { setCapIdx(compCount - 1); setCapInput(caps[compCount - 1] != null ? String(caps[compCount - 1]) : ""); setError(null); setStep("caps"); }}>‹ Edit capacities</button>
        </div>
      )}

      {/* ── Tare ── */}
      {step === "tare" && (
        <div style={S.card}>
          <h2 style={S.h2}>Let's set up your equipment</h2>
          <div style={S.sub}>We're pairing <b style={{ color: "#fff" }}>Truck {truckNumber || "—"}</b> with <b style={{ color: "#fff" }}>Trailer {trailerNumber || "—"}</b>.</div>
          <div>
            <div style={S.label}>Combined tare weight</div>
            <div style={{ position: "relative" }}>
              <input style={S.input} value={tareInput} inputMode="numeric" pattern="[0-9]*"
                onChange={(e) => setTareInput(digits(e.target.value))}
                onFocus={(e) => e.target.select()} placeholder="34800" autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") saveTare(); }} />
              <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.3)" }}>lbs</span>
            </div>
          </div>
          <div style={S.warn}>
            <b>Fill the saddle tank(s) prior to weighing for tare.</b> This gives you a little fuel-burn buffer between the loading terminal and DOT scale.
            <div style={{ marginTop: 8 }}>If unknown, enter an estimate and <b>don't forget to enter the correct tare in Settings prior to loading.</b></div>
          </div>
          {error && <div style={S.err}>{error}</div>}
          <button style={disabledPrimary(!tareInput)} disabled={!tareInput} onClick={saveTare}>Save & Continue</button>
        </div>
      )}

      {/* ── Planner target ── */}
      {step === "target" && (
        <div style={S.card}>
          <h2 style={S.h2}>Your planner target</h2>
          <div>
            <div style={S.label}>Target gross weight</div>
            <div style={{ position: "relative" }}>
              <input style={S.input} value={targetInput} inputMode="numeric" pattern="[0-9]*"
                onChange={(e) => setTargetInput(digits(e.target.value))}
                onFocus={(e) => e.target.select()}
                onKeyDown={(e) => { if (e.key === "Enter") coupleAndContinue(); }} />
              <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.3)" }}>lbs</span>
            </div>
          </div>
          <div style={S.warn}>
            We set a target for the planner at {fmt(DEFAULT_TARGET_LBS)} lbs. You can change this in Settings. We recommend staying ~500 lbs under 80,000 for API drift until more users are verifying the data.
          </div>
          {Number(targetInput) > 80000 && <div style={{ ...S.err, color: "#fbbf24" }}>That's above the 80,000 lb federal limit — double-check this is what you want.</div>}
          {error && <div style={S.err}>{error}</div>}
          <button style={disabledPrimary(busy || !targetInput)} disabled={busy || !targetInput} onClick={coupleAndContinue}>{busy ? "Pairing…" : "Next"}</button>
        </div>
      )}

      {/* ── Location ── */}
      {step === "location" && (
        <div style={S.card}>
          <h2 style={S.h2}>Where do you load?</h2>
          <div style={S.sub}>This is just to initialize your planner. You can change locations later.</div>
          <button style={S.primary} onClick={onOpenLocation}>{locationSet ? `${selectedCity}, ${selectedState} — Change` : "Select State & City"}</button>
        </div>
      )}

      {/* ── Terminal ── */}
      {step === "terminal" && (
        <div style={S.card}>
          <h2 style={S.h2}>Where do you load?</h2>
          <div style={S.sub}>This is just to initialize your planner. You can change terminals later.</div>
          <button style={S.primary} onClick={onOpenTerminal}>Select Terminal</button>
        </div>
      )}

      {/* ── Ready → tutorial ── */}
      {step === "ready" && (
        <div style={S.card}>
          <h2 style={S.h2}>Your truck is ready.</h2>
          <div style={S.sub}>Now let's set up your typical load plans. We'll walk you through it once.</div>
          <button style={S.primary} onClick={goFromReady}>Next</button>
        </div>
      )}

      {/* ── Planner tutorial ── */}
      {step === "tutorial" && (
        <div style={S.card}>
          <h2 style={S.h2}>Set up your typical load plans</h2>
          <div style={S.sub}>Your compartments can carry different products depending on the load. <b style={{ color: "#fff" }}>Plans</b> let you save different load configurations so you don't have to build them every time.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 14, lineHeight: 1.5, color: "rgba(255,255,255,0.75)" }}>
            <div>From the <b style={{ color: "#fff" }}>DROP</b> side profile you'll see your compartments. <b style={{ color: "#fff" }}>Compartment #1 is on the right.</b></div>
            <div>To configure a plan:</div>
            <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 4 }}>
              <li>Tap a compartment</li>
              <li>Tap <b style={{ color: "#fff" }}>Edit Comp</b></li>
              <li>Select a product</li>
            </ol>
            <div>Repeat for each compartment in that configuration, then <b style={{ color: "#fff" }}>Save Plan A</b>.</div>
            <div>A compartment isn't locked to a product — Plan A might put diesel in Compartment 1 while Plan B puts gasoline there. The same compartment is reused across plans.</div>
            <div>Want another? Tap the <b style={{ color: "#fff" }}>A</b> icon, pick <b style={{ color: "#fff" }}>Plan B</b>, and build a second typical load. You can add more plans later.</div>
          </div>
          <button style={S.primary} onClick={finishTutorial}>I'm Done</button>
        </div>
      )}

      {/* ── Completion ── */}
      {step === "done" && (
        <div style={S.card}>
          <h2 style={S.h2}>You're ready.</h2>
          <div style={S.sub}>Your equipment and planner are set up.</div>
          <button style={S.primary} onClick={finishAll}>Pick a plan and load</button>
        </div>
      )}
    </div>,
    document.body
  );
}
