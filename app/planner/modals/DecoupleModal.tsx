"use client";
// modals/DecoupleModal.tsx




// ─── Status codes ─────────────────────────────────────────────────────────────
// Fleet status is now a single 3-value vocabulary shared with the Equipment
// modal's own Update Status button (app/planner/modals/EquipmentStatusModal.tsx)
// and set_equipment_status -- this used to be a separate, richer 8-value
// scheme (AVAIL/PARK/BOBTAIL/MAINT/INSP/OOS/LOAD/CLEAN); that detail now
// lives in the Notes field instead of the status code itself (see
// 20260919000000_equipment_fleet_status.sql's own backfill mapping for the
// exact old-code -> new-status table).

import React, { useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { supabase } from "@/lib/supabase/client";

import type { TruckStatus, TrailerStatus, Scenario, Step, Props } from "./decouple/types";
import { TRUCK_STATUSES, TRAILER_STATUSES, D, useGeoTag } from "./decouple/helpers";
import { BackBtn } from "./decouple/BackBtn";
import { ScenarioCard } from "./decouple/ScenarioCard";
import { FieldLabel } from "./decouple/FieldLabel";
import { LocationField } from "./decouple/LocationField";
import { StatusPicker } from "./decouple/StatusPicker";
import { SummaryRow } from "./decouple/SummaryRow";
export type { TruckStatus } from "./decouple/types";
export type { TrailerStatus } from "./decouple/types";

export default function DecoupleModal({
  open, onClose, comboId, truckId, trailerId, truckName, trailerName,
  companyId, uncoupledTrucks, uncoupledTrailers, onDecoupled,
}: Props) {
  const [step,     setStep]     = useState<Step>("scenario");
  const [scenario, setScenario] = useState<Scenario>(null);
  const [busy,     setBusy]     = useState(false);
  const [err,      setErr]      = useState<string | null>(null);
  const [reviewAttempted, setReviewAttempted] = useState(false);

  // Shared location (used by park_both)
  const [sharedLocation, setSharedLocation] = useState("");
  const [sharedLat,      setSharedLat]      = useState<number | null>(null);
  const [sharedLon,      setSharedLon]      = useState<number | null>(null);

  // Truck fields
  const [truckStatus,   setTruckStatus]   = useState("readyline");
  const [truckLocation, setTruckLocation] = useState("");
  const [truckLat,      setTruckLat]      = useState<number | null>(null);
  const [truckLon,      setTruckLon]      = useState<number | null>(null);
  const [truckNotes,    setTruckNotes]    = useState("");

  // Trailer fields
  const [trailerStatus,   setTrailerStatus]   = useState("readyline");
  const [trailerLocation, setTrailerLocation] = useState("");
  const [trailerLat,      setTrailerLat]      = useState<number | null>(null);
  const [trailerLon,      setTrailerLon]      = useState<number | null>(null);
  const [trailerNotes,    setTrailerNotes]    = useState("");

  // New unit pickers (for swap scenarios)
  const [newTruckId,   setNewTruckId]   = useState("");
  const [newTrailerId, setNewTrailerId] = useState("");

  function reset() {
    setStep("scenario"); setScenario(null); setBusy(false); setErr(null);
    setReviewAttempted(false);
    setNeedsTare(false); setNewTareLbs("");
    setSharedLocation(""); setSharedLat(null); setSharedLon(null);
    setTruckStatus("readyline"); setTruckLocation(""); setTruckLat(null); setTruckLon(null); setTruckNotes("");
    setTrailerStatus("readyline"); setTrailerLocation(""); setTrailerLat(null); setTrailerLon(null); setTrailerNotes("");
    setNewTruckId(""); setNewTrailerId("");
  }

  function handleClose() { reset(); onClose(); }

  function pickScenario(s: Scenario) {
    setScenario(s);
    setReviewAttempted(false);
    if (s === "drop_trailer") { setTrailerStatus("readyline"); setTruckStatus("in_use"); }
    if (s === "swap_truck")   { setTruckStatus("readyline"); setTrailerStatus("readyline"); }
    if (s === "swap_trailer") { setTrailerStatus("readyline"); setTruckStatus("readyline"); }
    if (s === "park_both")    { setTruckStatus("readyline"); setTrailerStatus("readyline"); }
    setStep("details");
  }

  // ── Geo hooks per field ──
  const truckGeo = useGeoTag((loc, lat, lon) => { setTruckLocation(loc); setTruckLat(lat); setTruckLon(lon); });
  const trailerGeo = useGeoTag((loc, lat, lon) => { setTrailerLocation(loc); setTrailerLat(lat); setTrailerLon(lon); });
  const sharedGeo = useGeoTag((loc, lat, lon) => { setSharedLocation(loc); setSharedLat(lat); setSharedLon(lon); });

  // ── Validation per scenario ──
  function canProceed(): boolean {
    switch (scenario) {
      case "drop_trailer":  return trailerLocation.trim().length > 0;
      case "swap_truck":    return truckLocation.trim().length > 0 && newTruckId.length > 0;
      case "swap_trailer":  return trailerLocation.trim().length > 0 && newTrailerId.length > 0;
      case "park_both":     return sharedLocation.trim().length > 0;
      default: return false;
    }
  }

  // ── Submit ──
  const [needsTare,  setNeedsTare]  = useState(false);
  const [newTareLbs, setNewTareLbs] = useState("");

  async function handleConfirm() {
    if (busy) return;
    setErr(null); setBusy(true);
    try {
      // On tare retry, decouple already happened — skip straight to recouple
      if (!needsTare) {
        const finalTruckStatus   = scenario === "drop_trailer" ? "in_use" : truckStatus;
        const finalTrailerStatus = trailerStatus;
        const finalTruckLoc   = scenario === "park_both" ? sharedLocation : truckLocation;
        const finalTruckLat   = scenario === "park_both" ? sharedLat : truckLat;
        const finalTruckLon   = scenario === "park_both" ? sharedLon : truckLon;
        const finalTrailerLoc = scenario === "park_both" ? sharedLocation : trailerLocation;
        const finalTrailerLat = scenario === "park_both" ? sharedLat : trailerLat;
        const finalTrailerLon = scenario === "park_both" ? sharedLon : trailerLon;

        const { error } = await supabase.rpc("decouple_combo", {
          p_combo_id:         comboId,
          p_scenario:         scenario!,
          p_truck_status:     finalTruckStatus,
          p_truck_location:   finalTruckLoc.trim() || null,
          p_truck_lat:        finalTruckLat,
          p_truck_lon:        finalTruckLon,
          p_truck_notes:      truckNotes.trim() || null,
          p_trailer_status:   finalTrailerStatus,
          p_trailer_location: finalTrailerLoc.trim() || null,
          p_trailer_lat:      finalTrailerLat,
          p_trailer_lon:      finalTrailerLon,
          p_trailer_notes:    trailerNotes.trim() || null,
        });
        if (error) throw error;

        // Write status/location directly — decouple_combo RPC doesn't update truck/trailer rows
        await Promise.all([
          supabase.from("trucks").update({
            status_code:     finalTruckStatus,
            status_location: finalTruckLoc.trim() || null,
          }).eq("truck_id", truckId).eq("company_id", companyId),
          supabase.from("trailers").update({
            status_code:     finalTrailerStatus,
            status_location: finalTrailerLoc.trim() || null,
          }).eq("trailer_id", trailerId).eq("company_id", companyId),
        ]);
      }

      // For swap scenarios, recouple with the new unit (runs on first attempt and tare retry)
      let newComboId: string | undefined;

      if (scenario === "swap_truck" && newTruckId) {
        const tare = newTareLbs ? Number(newTareLbs) : undefined;
        if (needsTare) {
          if (!tare || !Number.isFinite(tare) || tare <= 0) {
            throw new Error("Enter a valid tare weight to continue.");
          }
        }
        const params: Record<string, any> = { p_truck_id: newTruckId, p_trailer_id: trailerId };
        if (tare && tare > 0) params.p_tare_lbs = tare;
        const { data: coupleData, error: coupleErr } = await supabase.rpc("couple_combo", params);
        if (coupleErr) {
          if (coupleErr.message?.toLowerCase().includes("tare") || coupleErr.message?.toLowerCase().includes("historical") || coupleErr.message?.toLowerCase().includes("provide")) {
            setNeedsTare(true);
            throw new Error("This is a new truck/trailer pairing. Enter the tare weight from a certified scale ticket.");
          }
          throw coupleErr;
        }
        newComboId = String((coupleData as any)?.combo_id ?? "");
        // Auto-claim the new combo so it's selected in the planner
        if (newComboId) {
          await supabase.rpc("claim_combo", { p_combo_id: newComboId });
        }
      }

      if (scenario === "swap_trailer" && newTrailerId) {
        const tare = newTareLbs ? Number(newTareLbs) : undefined;
        if (needsTare) {
          if (!tare || !Number.isFinite(tare) || tare <= 0) {
            throw new Error("Enter a valid tare weight to continue.");
          }
        }
        const params: Record<string, any> = { p_truck_id: truckId, p_trailer_id: newTrailerId };
        if (tare && tare > 0) params.p_tare_lbs = tare;
        const { data: coupleData, error: coupleErr } = await supabase.rpc("couple_combo", params);
        if (coupleErr) {
          if (coupleErr.message?.toLowerCase().includes("tare") || coupleErr.message?.toLowerCase().includes("historical") || coupleErr.message?.toLowerCase().includes("provide")) {
            setNeedsTare(true);
            throw new Error("This is a new truck/trailer pairing. Enter the tare weight from a certified scale ticket.");
          }
          throw coupleErr;
        }
        newComboId = String((coupleData as any)?.combo_id ?? "");
        // Auto-claim the new combo so it's selected in the planner
        if (newComboId) {
          await supabase.rpc("claim_combo", { p_combo_id: newComboId });
        }
      }

      onDecoupled(newComboId);
      reset();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to decouple.");
    } finally {
      setBusy(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ── STEP: SCENARIO ────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────

  const scenarioStep = (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ fontSize: 14, color: "rgba(255,255,255,0.50)", marginBottom: 4, lineHeight: 1.55 }}>
        In order to decouple{" "}
        <strong style={{ color: "rgba(255,255,255,0.85)" }}>{truckName} / {trailerName}</strong>,
        please choose an action and update the status.
      </div>
      <ScenarioCard emoji="🔄" title="Swap the truck"
        sub="Switching to a different power unit. Keeping the same trailer to couple with a new truck at this location."
        onClick={() => pickScenario("swap_truck")} />
      <ScenarioCard emoji="🔁" title="Swap the trailer"
        sub="Switching to a different trailer. Keeping the same power unit to couple with a new trailer at this location."
        onClick={() => pickScenario("swap_trailer")} />
      <ScenarioCard emoji="🔓" title="Drop the trailer"
        sub="I'm bobtailing away. The trailer stays at this location."
        onClick={() => pickScenario("drop_trailer")} />
      <ScenarioCard emoji="🅿️" title="Park both units"
        sub="Drop the trailer, park the truck and take the Nike express."
        onClick={() => pickScenario("park_both")} />
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // ── STEP: DETAILS — branches per scenario ────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────

  const scenarioColors: Record<NonNullable<Scenario>, string> = {
    swap_truck:    "#fbbf24",
    swap_trailer:  "#a78bfa",
    drop_trailer:  "#67e8f9",
    park_both:     "#86efac",
  };
  const scenarioLabels: Record<NonNullable<Scenario>, string> = {
    swap_truck:   "🔄 Swap the truck",
    swap_trailer: "🔁 Swap the trailer",
    drop_trailer: "🚚 Drop the trailer",
    park_both:    "🅿️ Park both units",
  };

  let detailsBody: React.ReactNode = null;

  // ── SWAP TRUCK: park old truck (location + status + notes), pick new truck, recouple
  if (scenario === "swap_truck") {
    detailsBody = (
      <>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 16, lineHeight: 1.5 }}>
          Park <strong style={{ color: "rgba(255,255,255,0.75)" }}>{truckName}</strong> and
          select the new truck to couple with <strong style={{ color: "rgba(255,255,255,0.75)" }}>{trailerName}</strong>.
          The trailer's status stays unchanged.
        </div>

        {/* Old truck — location + status + notes */}
        <div style={D.sectionTitle}>Parking {truckName}</div>
        <LocationField value={truckLocation} onChange={setTruckLocation}
          onGeoTag={truckGeo.trigger} geoLoading={truckGeo.geoLoading}
          isError={reviewAttempted && !truckLocation.trim()} />
        <div style={{ marginBottom: 14 }}>
          <FieldLabel>Truck status</FieldLabel>
          <StatusPicker
            options={TRUCK_STATUSES as any}
            value={truckStatus as TruckStatus}
            onChange={(v) => setTruckStatus(v)}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Notes (optional)</FieldLabel>
          <textarea style={D.textarea} placeholder="Repair ticket #, contact, ETA…"
            value={truckNotes} onChange={(e) => setTruckNotes(e.target.value)} />
        </div>

        <div style={D.divider} />

        {/* New truck picker */}
        <div style={D.sectionTitle}>New truck</div>
        <div style={{ marginBottom: 4 }}>
          <FieldLabel>Select truck to couple</FieldLabel>
          <select style={{ ...D.select, ...(reviewAttempted && !newTruckId ? D.inputErr : {}) }}
            value={newTruckId} onChange={(e) => setNewTruckId(e.target.value)}>
            <option value="">Select truck…</option>
            {uncoupledTrucks.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          {uncoupledTrucks.length === 0 && (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>
              No uncoupled trucks available.
            </div>
          )}
        </div>
      </>
    );
  }

  // ── SWAP TRAILER: park old trailer (location + status + notes), pick new trailer, recouple
  if (scenario === "swap_trailer") {
    detailsBody = (
      <>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 16, lineHeight: 1.5 }}>
          Park <strong style={{ color: "rgba(255,255,255,0.75)" }}>{trailerName}</strong> and
          select the new trailer to couple with <strong style={{ color: "rgba(255,255,255,0.75)" }}>{truckName}</strong>.
          The truck's status stays unchanged.
        </div>

        {/* Old trailer — location + status + notes */}
        <div style={D.sectionTitle}>Parking {trailerName}</div>
        <LocationField value={trailerLocation} onChange={setTrailerLocation}
          onGeoTag={trailerGeo.trigger} geoLoading={trailerGeo.geoLoading}
          isError={reviewAttempted && !trailerLocation.trim()} />
        <div style={{ marginBottom: 14 }}>
          <FieldLabel>Trailer status</FieldLabel>
          <StatusPicker
            options={TRAILER_STATUSES as any}
            value={trailerStatus as TrailerStatus}
            onChange={(v) => setTrailerStatus(v)}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Notes (optional)</FieldLabel>
          <textarea style={D.textarea} placeholder="Repair ticket #, contact, ETA…"
            value={trailerNotes} onChange={(e) => setTrailerNotes(e.target.value)} />
        </div>

        <div style={D.divider} />

        {/* New trailer picker */}
        <div style={D.sectionTitle}>New trailer</div>
        <div style={{ marginBottom: 4 }}>
          <FieldLabel>Select trailer to couple</FieldLabel>
          <select style={{ ...D.select, ...(reviewAttempted && !newTrailerId ? D.inputErr : {}) }}
            value={newTrailerId} onChange={(e) => setNewTrailerId(e.target.value)}>
            <option value="">Select trailer…</option>
            {uncoupledTrailers.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          {uncoupledTrailers.length === 0 && (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>
              No uncoupled trailers available.
            </div>
          )}
        </div>
      </>
    );
  }

  // ── DROP TRAILER: STUD the trailer only (truck is bobtailing away)
  if (scenario === "drop_trailer") {
    detailsBody = (
      <>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 16, lineHeight: 1.5 }}>
          Set the status for <strong style={{ color: "rgba(255,255,255,0.75)" }}>{trailerName}</strong> so
          others know where it is and whether it's available.
          <strong style={{ color: "#67e8f9" }}> {truckName}</strong> will be marked <strong style={{ color: "#67e8f9" }}>IN USE</strong> automatically (bobtailing away).
        </div>

        <div style={D.sectionTitle}>Trailer status — {trailerName}</div>
        <LocationField value={trailerLocation} onChange={setTrailerLocation}
          onGeoTag={trailerGeo.trigger} geoLoading={trailerGeo.geoLoading}
          isError={reviewAttempted && !trailerLocation.trim()} />
        <div style={{ marginBottom: 14 }}>
          <FieldLabel>Status</FieldLabel>
          <StatusPicker
            options={TRAILER_STATUSES as any}
            value={trailerStatus as TrailerStatus}
            onChange={(v) => setTrailerStatus(v)}
          />
        </div>
        <div style={{ marginBottom: 4 }}>
          <FieldLabel>Notes (optional)</FieldLabel>
          <textarea style={D.textarea} placeholder="Loaded? Empty? Repair needed? ETA pickup…"
            value={trailerNotes} onChange={(e) => setTrailerNotes(e.target.value)} />
        </div>
      </>
    );
  }

  // ── PARK BOTH: one shared location, one reason per unit
  if (scenario === "park_both") {
    detailsBody = (
      <>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 16, lineHeight: 1.5 }}>
          Both units are being parked at the same location.
          Enter the location once, then add a reason for each unit.
        </div>

        {/* Shared location */}
        <div style={D.sectionTitle}>Location (both units)</div>
        <LocationField value={sharedLocation} onChange={setSharedLocation}
          onGeoTag={sharedGeo.trigger} geoLoading={sharedGeo.geoLoading}
          isError={reviewAttempted && !sharedLocation.trim()} />

        <div style={D.divider} />

        {/* Truck status + reason */}
        <div style={D.sectionTitle}>Truck — {truckName}</div>
        <div style={{ marginBottom: 14 }}>
          <FieldLabel>Status</FieldLabel>
          <StatusPicker
            options={TRUCK_STATUSES as any}
            value={truckStatus as TruckStatus}
            onChange={(v) => setTruckStatus(v)}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <FieldLabel>Reason / Notes (optional)</FieldLabel>
          <textarea style={D.textarea} placeholder="Why is this truck being parked? Repair ticket, end of shift, etc."
            value={truckNotes} onChange={(e) => setTruckNotes(e.target.value)} />
        </div>

        <div style={D.divider} />

        {/* Trailer status + reason */}
        <div style={D.sectionTitle}>Trailer — {trailerName}</div>
        <div style={{ marginBottom: 14 }}>
          <FieldLabel>Status</FieldLabel>
          <StatusPicker
            options={TRAILER_STATUSES as any}
            value={trailerStatus as TrailerStatus}
            onChange={(v) => setTrailerStatus(v)}
          />
        </div>
        <div style={{ marginBottom: 4 }}>
          <FieldLabel>Reason / Notes (optional)</FieldLabel>
          <textarea style={D.textarea} placeholder="Empty? Loaded? Scheduled for cleaning? Inspection pending?"
            value={trailerNotes} onChange={(e) => setTrailerNotes(e.target.value)} />
        </div>
      </>
    );
  }

  const detailsStep = scenario ? (
    <div>
      <BackBtn onClick={() => setStep("scenario")} />
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.5,
        color: scenarioColors[scenario], textTransform: "uppercase" as const, marginBottom: 14 }}>
        {scenarioLabels[scenario]}
      </div>

      {detailsBody}

      {err && <div style={{ ...D.err, marginTop: 12 }}>{err}</div>}

      {/* Validation messages — only shown after first tap attempt */}
      {reviewAttempted && !canProceed() && (() => {
        const msgs: string[] = [];
        if (scenario === "swap_truck")   { if (!truckLocation.trim()) msgs.push("Truck location is required"); if (!newTruckId) msgs.push("Select a new truck"); }
        if (scenario === "swap_trailer") { if (!trailerLocation.trim()) msgs.push("Trailer location is required"); if (!newTrailerId) msgs.push("Select a new trailer"); }
        if (scenario === "drop_trailer") { if (!trailerLocation.trim()) msgs.push("Trailer location is required"); }
        if (scenario === "park_both")    { if (!sharedLocation.trim()) msgs.push("Location is required"); }
        return (
          <div style={{ marginTop: 10, display: "grid", gap: 4 }}>
            {msgs.map((m, i) => (
              <div key={i} style={{ fontSize: 12, fontWeight: 700, color: "#f87171",
                display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 14 }}>⚠</span> {m}
              </div>
            ))}
          </div>
        );
      })()}

      <button type="button"
        onClick={() => {
          setReviewAttempted(true);
          if (!canProceed()) return;
          setErr(null);
          setStep("confirm");
        }}
        style={{
          ...D.btn, ...D.btnPrimary, width: "100%", textAlign: "center" as const,
          padding: "14px 0", fontSize: 15, marginTop: 14,
          opacity: reviewAttempted && !canProceed() ? 0.5 : 1,
          transform: reviewAttempted && !canProceed() ? "scale(0.98)" : "scale(1)",
          transition: "opacity 150ms ease, transform 150ms ease",
          borderColor: reviewAttempted && !canProceed() ? "rgba(248,113,113,0.35)" : undefined,
        }}>
        Review & Confirm →
      </button>
    </div>
  ) : null;

  // ─────────────────────────────────────────────────────────────────────────
  // ── STEP: CONFIRM ─────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────

  const truckWarn   = truckStatus === "deadline";
  const trailerWarn = trailerStatus === "deadline";

  const newTruckName   = uncoupledTrucks.find(t => t.id === newTruckId)?.name ?? "";
  const newTrailerName = uncoupledTrailers.find(t => t.id === newTrailerId)?.name ?? "";

  const confirmStep = scenario ? (
    <div>
      <BackBtn onClick={() => setStep("details")} />
      <div style={{ fontSize: 17, fontWeight: 900, marginBottom: 4 }}>Confirm Decouple</div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 14, lineHeight: 1.5 }}>
        Review before confirming. This will deactivate the combo and update each unit's status.
      </div>

      {/* Scenario-specific summary */}
      {scenario === "swap_truck" && (
        <>
          <SummaryRow label={`Parking — ${truckName}`} code={truckStatus}
            location={truckLocation} notes={truckNotes} />
          <div style={{ padding: "10px 13px", borderRadius: 2, marginBottom: 8,
            border: needsTare ? "1px solid rgba(251,191,36,0.40)" : "1px solid rgba(64,180,255,0.25)",
            background: needsTare ? "rgba(180,120,0,0.12)" : "rgba(32,100,200,0.12)" }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.35)", letterSpacing: 0.5, textTransform: "uppercase" as const, marginBottom: 4 }}>
              New combo
            </div>
            <div style={{ fontSize: 14, fontWeight: 900, color: "rgba(255,255,255,0.85)", marginBottom: 2 }}>
              {newTruckName} / {trailerName}
            </div>
            {!needsTare && (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.40)" }}>
                {trailerName} status unchanged · will be recoupled immediately
              </div>
            )}
            {needsTare && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 12, color: "#fbbf24", fontWeight: 700, marginBottom: 6 }}>
                  ⚠ New pairing — tare weight required
                </div>
                <label style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.40)", letterSpacing: 0.5, textTransform: "uppercase" as const, display: "block", marginBottom: 5 }}>
                  Tare weight (lbs) *
                </label>
                <input type="number" inputMode="numeric" placeholder="e.g. 34800"
                  value={newTareLbs} onChange={(e) => setNewTareLbs(e.target.value)}
                  style={{ ...D.input, fontSize: 16, fontWeight: 700, marginBottom: 8 }}
                  autoFocus />
                <div style={{ padding: "8px 10px", borderRadius: 2, background: "rgba(255,185,0,0.07)", border: "1px solid rgba(255,185,0,0.18)", marginBottom: 6 }}>
                  <div style={{ fontSize: 10, fontWeight: 900, color: "#fbbf24", letterSpacing: 0.8, marginBottom: 3 }}>⛽ WEIGH-IN REMINDER</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.60)", lineHeight: 1.5 }}>
                    Ensure saddle tank(s) are <strong style={{ color: "rgba(255,255,255,0.82)" }}>completely full</strong> before weighing. Enter from a <strong style={{ color: "rgba(255,255,255,0.82)" }}>certified scale ticket</strong>.
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {scenario === "swap_trailer" && (
        <>
          <SummaryRow label={`Parking — ${trailerName}`} code={trailerStatus}
            location={trailerLocation} notes={trailerNotes} />
          <div style={{ padding: "10px 13px", borderRadius: 2, marginBottom: 8,
            border: needsTare ? "1px solid rgba(251,191,36,0.40)" : "1px solid rgba(167,139,250,0.25)",
            background: needsTare ? "rgba(180,120,0,0.12)" : "rgba(100,70,200,0.12)" }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.35)", letterSpacing: 0.5, textTransform: "uppercase" as const, marginBottom: 4 }}>
              New combo
            </div>
            <div style={{ fontSize: 14, fontWeight: 900, color: "rgba(255,255,255,0.85)", marginBottom: 2 }}>
              {truckName} / {newTrailerName}
            </div>
            {!needsTare && (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.40)" }}>
                {truckName} status unchanged · will be recoupled immediately
              </div>
            )}
            {needsTare && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 12, color: "#fbbf24", fontWeight: 700, marginBottom: 6 }}>
                  ⚠ New pairing — tare weight required
                </div>
                <label style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.40)", letterSpacing: 0.5, textTransform: "uppercase" as const, display: "block", marginBottom: 5 }}>
                  Tare weight (lbs) *
                </label>
                <input type="number" inputMode="numeric" placeholder="e.g. 34800"
                  value={newTareLbs} onChange={(e) => setNewTareLbs(e.target.value)}
                  style={{ ...D.input, fontSize: 16, fontWeight: 700, marginBottom: 8 }}
                  autoFocus />
                <div style={{ padding: "8px 10px", borderRadius: 2, background: "rgba(255,185,0,0.07)", border: "1px solid rgba(255,185,0,0.18)", marginBottom: 6 }}>
                  <div style={{ fontSize: 10, fontWeight: 900, color: "#fbbf24", letterSpacing: 0.8, marginBottom: 3 }}>⛽ WEIGH-IN REMINDER</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.60)", lineHeight: 1.5 }}>
                    Ensure saddle tank(s) are <strong style={{ color: "rgba(255,255,255,0.82)" }}>completely full</strong> before weighing. Enter from a <strong style={{ color: "rgba(255,255,255,0.82)" }}>certified scale ticket</strong>.
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {scenario === "drop_trailer" && (
        <>
          <SummaryRow label={`Trailer staying — ${trailerName}`} code={trailerStatus}
            location={trailerLocation} notes={trailerNotes} />
          <div style={{ padding: "10px 13px", borderRadius: 2, marginBottom: 8,
            border: "1px solid rgba(103,232,249,0.20)", background: "rgba(0,150,180,0.10)" }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.35)", letterSpacing: 0.5, textTransform: "uppercase" as const, marginBottom: 4 }}>Truck</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 900, padding: "2px 7px", borderRadius: 2,
                background: "rgba(103,232,249,0.15)", color: "#67e8f9" }}>IN USE</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.75)" }}>{truckName}</span>
            </div>
          </div>
        </>
      )}

      {scenario === "park_both" && (
        <>
          <div style={{ padding: "10px 13px", borderRadius: 2, marginBottom: 8,
            border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.04)" }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.35)", letterSpacing: 0.5, textTransform: "uppercase" as const, marginBottom: 4 }}>Shared location</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.70)" }}>📍 {sharedLocation}</div>
          </div>
          <SummaryRow label={`Truck — ${truckName}`} code={truckStatus} location="" notes={truckNotes} />
          <SummaryRow label={`Trailer — ${trailerName}`} code={trailerStatus} location="" notes={trailerNotes} />
        </>
      )}

      {(truckWarn || trailerWarn) && (
        <div style={{ ...D.err, background: "rgba(180,80,20,0.18)", border: "1px solid rgba(220,120,40,0.35)", color: "rgba(255,200,140,0.95)", marginTop: 4 }}>
          ⚠ One or more units will be marked{" "}
          <strong>{[truckWarn && truckStatus, trailerWarn && trailerStatus].filter(Boolean).join(" / ")}</strong>.
          Others will see a warning before coupling them.
        </div>
      )}

      {err && <div style={{ ...D.err, marginTop: 8 }}>{err}</div>}

      <button type="button" onClick={handleConfirm} disabled={busy}
        style={{ ...D.btn, ...D.btnDestructive, width: "100%", textAlign: "center" as const,
          padding: "15px 0", fontSize: 16, marginTop: 10, opacity: busy ? 0.55 : 1 }}>
        {busy ? (scenario === "swap_truck" || scenario === "swap_trailer" ? "Swapping…" : "Decoupling…") : needsTare ? "Submit Tare & Confirm" : "Confirm"}
      </button>
    </div>
  ) : null;

  return (
    <FullscreenModal open={open} title="Decouple" onClose={handleClose} footer={null}>
      {step === "scenario" && scenarioStep}
      {step === "details"  && detailsStep}
      {step === "confirm"  && confirmStep}
    </FullscreenModal>
  );
}
