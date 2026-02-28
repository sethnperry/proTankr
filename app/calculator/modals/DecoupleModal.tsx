"use client";
// modals/DecoupleModal.tsx

import React, { useState, useCallback } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { supabase } from "@/lib/supabase/client";

// ─── Status codes ─────────────────────────────────────────────────────────────

export type TruckStatus   = "AVAIL" | "PARK" | "BOBTAIL" | "MAINT" | "INSP" | "OOS";
export type TrailerStatus = "AVAIL" | "PARK" | "MAINT" | "INSP" | "CLEAN" | "LOAD" | "OOS";

const TRUCK_STATUSES: { code: TruckStatus; label: string; sub: string; warn?: boolean }[] = [
  { code: "BOBTAIL", label: "Bobtailing",      sub: "Truck is moving without a trailer" },
  { code: "AVAIL",   label: "Available",       sub: "Ready to couple and run" },
  { code: "PARK",    label: "Parked",          sub: "Stored, no known issues" },
  { code: "MAINT",   label: "Maintenance",     sub: "Down for repairs — do not couple", warn: true },
  { code: "INSP",    label: "Inspection",      sub: "Under DOT or internal inspection" },
  { code: "OOS",     label: "Out of Service",  sub: "Deadlined — do not operate", warn: true },
];

const TRAILER_STATUSES: { code: TrailerStatus; label: string; sub: string; warn?: boolean }[] = [
  { code: "AVAIL",  label: "Available",        sub: "Ready to couple and load" },
  { code: "PARK",   label: "Parked / Stored",  sub: "No issues, available when needed" },
  { code: "LOAD",   label: "Loaded / Staged",  sub: "Product on board, awaiting driver" },
  { code: "CLEAN",  label: "Cleaning / Purge", sub: "Being cleaned or purged" },
  { code: "MAINT",  label: "Maintenance",      sub: "Down for repairs — do not couple", warn: true },
  { code: "INSP",   label: "Inspection",       sub: "Under DOT or internal inspection" },
  { code: "OOS",    label: "Out of Service",   sub: "Deadlined — do not use", warn: true },
];

// ─── Shared styles ────────────────────────────────────────────────────────────

const D = {
  label: {
    fontSize: 12, fontWeight: 800, letterSpacing: 0.5,
    color: "rgba(255,255,255,0.45)", textTransform: "uppercase",
    marginBottom: 6, display: "block",
  } as React.CSSProperties,
  input: {
    width: "100%", borderRadius: 8, padding: "10px 12px",
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(0,0,0,0.35)", color: "rgba(255,255,255,0.92)",
    fontSize: 14, outline: "none", boxSizing: "border-box",
  } as React.CSSProperties,
  inputErr: {
    border: "1px solid rgba(248,113,113,0.55)",
    backgroundColor: "rgba(180,30,30,0.15)",
  } as React.CSSProperties,
  select: {
    width: "100%", borderRadius: 8, padding: "10px 12px",
    border: "1px solid rgba(255,255,255,0.14)",
    backgroundColor: "rgba(0,0,0,0.40)", color: "rgba(255,255,255,0.92)",
    fontSize: 14, outline: "none", boxSizing: "border-box",
    appearance: "none",
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='rgba(255,255,255,0.4)' stroke-width='1.8' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 14px center",
    paddingRight: 36,
  } as React.CSSProperties,
  textarea: {
    width: "100%", borderRadius: 12, padding: "12px 14px",
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(0,0,0,0.35)", color: "rgba(255,255,255,0.92)",
    fontSize: 14, outline: "none", boxSizing: "border-box",
    resize: "vertical", minHeight: 72,
  } as React.CSSProperties,
  btn: {
    borderRadius: 8, padding: "10px 16px", fontWeight: 900,
    fontSize: 13, letterSpacing: 0.5, cursor: "pointer",
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.09)",
    color: "rgba(255,255,255,0.92)", whiteSpace: "nowrap",
  } as React.CSSProperties,
  btnPrimary: {
    background: "rgba(255,255,255,0.13)",
    border: "1px solid rgba(255,255,255,0.22)",
  } as React.CSSProperties,
  btnDestructive: {
    background: "rgba(180,50,20,0.22)",
    border: "1px solid rgba(220,80,40,0.40)",
    color: "rgba(255,180,140,0.95)",
  } as React.CSSProperties,
  err: {
    borderRadius: 12, padding: "10px 14px",
    background: "rgba(180,40,40,0.18)",
    border: "1px solid rgba(180,40,40,0.32)",
    color: "rgba(255,255,255,0.88)", fontSize: 13, marginBottom: 12,
  } as React.CSSProperties,
  divider: { height: 1, background: "rgba(255,255,255,0.08)", margin: "16px 0 20px" },
  sectionTitle: {
    fontSize: 11, fontWeight: 800, letterSpacing: 0.8,
    color: "rgba(255,255,255,0.35)", textTransform: "uppercase",
    marginBottom: 6,
  } as React.CSSProperties,
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      style={{ ...D.btn, background: "transparent", border: "none", padding: "0 0 16px", fontSize: 13, color: "rgba(255,255,255,0.45)" }}>
      ← Back
    </button>
  );
}

function ScenarioCard({ emoji, title, sub, onClick }: {
  emoji: string; title: string; sub: string; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} style={{
      padding: "12px 14px", borderRadius: 10, cursor: "pointer",
      textAlign: "left" as const, border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(255,255,255,0.05)", transition: "all 120ms ease", width: "100%",
    }}>
      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 3, display: "flex", alignItems: "center", gap: 8 }}><span>{emoji}</span><span>{title}</span></div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.4 }}>{sub}</div>
    </button>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label style={D.label}>{children}</label>;
}

function LocationField({ value, onChange, onGeoTag, geoLoading, isError }: {
  value: string; onChange: (v: string) => void;
  onGeoTag: () => void; geoLoading: boolean; isError?: boolean;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <FieldLabel>Location *</FieldLabel>
        <button type="button" onClick={onGeoTag} disabled={geoLoading} style={{
          fontSize: 11, fontWeight: 800, letterSpacing: 0.4,
          color: geoLoading ? "rgba(255,255,255,0.30)" : "#67e8f9",
          background: "none", border: "none", cursor: geoLoading ? "default" : "pointer", padding: 0,
        }}>
          {geoLoading ? "Getting location…" : "📍 Use my location"}
        </button>
      </div>
      <input type="text" placeholder="e.g. Bay 4, North lot, Shop dock 2"
        value={value} onChange={(e) => onChange(e.target.value)}
        style={{ ...D.input, ...(isError ? D.inputErr : {}) }} />
      <div style={{ fontSize: 11, color: isError ? "#f87171" : "rgba(255,255,255,0.28)", marginTop: 4 }}>
        {isError ? "Please enter a location before continuing." : "Be specific — yard name, bay number, or street address."}
      </div>
    </div>
  );
}

function useGeoTag(onResult: (location: string, lat: number, lon: number) => void) {
  const [geoLoading, setGeoLoading] = useState(false);
  const trigger = useCallback(() => {
    if (!navigator.geolocation) return;
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        try {
          const res  = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`, { headers: { "Accept-Language": "en" } });
          const data = await res.json();
          // Build a short, human-readable address from components
          const addr = data?.address ?? {};
          const parts = [
            addr.house_number && addr.road ? `${addr.house_number} ${addr.road}` : addr.road,
            addr.city || addr.town || addr.village || addr.county,
            addr.state,
          ].filter(Boolean);
          const shortAddr = parts.length >= 2 ? parts.join(", ") : data?.display_name ?? `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
          onResult(shortAddr, lat, lon);
        } catch { onResult(`${lat.toFixed(5)}, ${lon.toFixed(5)}`, lat, lon); }
        setGeoLoading(false);
      },
      () => setGeoLoading(false),
      { timeout: 8000, enableHighAccuracy: true }
    );
  }, [onResult]);
  return { geoLoading, trigger };
}

function StatusPicker<T extends string>({ options, value, onChange }: {
  options: { code: T; label: string; sub: string; warn?: boolean }[];
  value: T; onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 7 }}>
      {options.map((o) => {
        const sel = value === o.code;
        return (
          <button key={o.code} type="button" onClick={() => onChange(o.code)} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "7px 10px",
            borderRadius: 8, cursor: "pointer", textAlign: "left" as const,
            border: sel ? (o.warn ? "1px solid rgba(220,80,40,0.55)" : "1px solid rgba(64,180,255,0.45)") : "1px solid rgba(255,255,255,0.10)",
            background: sel ? (o.warn ? "rgba(180,50,20,0.20)" : "rgba(32,100,200,0.18)") : "rgba(255,255,255,0.04)",
            transition: "all 120ms ease",
          }}>
            <div style={{
              flexShrink: 0, width: 60, textAlign: "center" as const,
              fontSize: 10, fontWeight: 900, letterSpacing: 1, padding: "3px 0", borderRadius: 5,
              background: sel ? (o.warn ? "rgba(220,80,40,0.25)" : "rgba(64,180,255,0.18)") : "rgba(255,255,255,0.08)",
              color: sel ? (o.warn ? "#fb923c" : "#67e8f9") : "rgba(255,255,255,0.50)",
            }}>{o.code}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: o.warn && sel ? "#fb923c" : "rgba(255,255,255,0.88)" }}>{o.label}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.38)", marginTop: 1 }}>{o.sub}</div>
            </div>
            {sel && <div style={{ flexShrink: 0, fontSize: 14, color: o.warn ? "#fb923c" : "#67e8f9" }}>✓</div>}
          </button>
        );
      })}
    </div>
  );
}

function SummaryRow({ label, code, location, notes }: { label: string; code: string; location: string; notes: string }) {
  const allStatuses = [...TRUCK_STATUSES, ...TRAILER_STATUSES];
  const def = allStatuses.find((s) => s.code === code);
  const isWarn = def?.warn;
  return (
    <div style={{ padding: "9px 11px", borderRadius: 8, marginBottom: 8,
      border: isWarn ? "1px solid rgba(220,80,40,0.35)" : "1px solid rgba(255,255,255,0.10)",
      background: isWarn ? "rgba(180,50,20,0.12)" : "rgba(255,255,255,0.04)" }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.35)", letterSpacing: 0.5, textTransform: "uppercase" as const, marginBottom: 4 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
        <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: 0.8, padding: "2px 7px", borderRadius: 5,
          background: isWarn ? "rgba(220,80,40,0.20)" : "rgba(255,255,255,0.10)",
          color: isWarn ? "#fb923c" : "rgba(255,255,255,0.75)" }}>{code}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: isWarn ? "#fb923c" : "rgba(255,255,255,0.75)" }}>{def?.label ?? code}</span>
      </div>
      {location && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.50)" }}>📍 {location}</div>}
      {notes    && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.38)", marginTop: 2 }}>{notes}</div>}
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Scenario = "swap_truck" | "swap_trailer" | "drop_trailer" | "park_both" | null;
type Step     = "scenario" | "details" | "confirm";

type UnitRow = { id: string; name: string };

type Props = {
  open: boolean;
  onClose: () => void;
  comboId: string;
  truckId: string;
  trailerId: string;
  truckName: string;
  trailerName: string;
  uncoupledTrucks: UnitRow[];
  uncoupledTrailers: UnitRow[];
  onDecoupled: (newComboId?: string) => void;
};

// ─── Main modal ───────────────────────────────────────────────────────────────

export default function DecoupleModal({
  open, onClose, comboId, truckId, trailerId, truckName, trailerName,
  uncoupledTrucks, uncoupledTrailers, onDecoupled,
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
  const [truckStatus,   setTruckStatus]   = useState("PARK");
  const [truckLocation, setTruckLocation] = useState("");
  const [truckLat,      setTruckLat]      = useState<number | null>(null);
  const [truckLon,      setTruckLon]      = useState<number | null>(null);
  const [truckNotes,    setTruckNotes]    = useState("");

  // Trailer fields
  const [trailerStatus,   setTrailerStatus]   = useState("PARK");
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
    setTruckStatus("PARK"); setTruckLocation(""); setTruckLat(null); setTruckLon(null); setTruckNotes("");
    setTrailerStatus("PARK"); setTrailerLocation(""); setTrailerLat(null); setTrailerLon(null); setTrailerNotes("");
    setNewTruckId(""); setNewTrailerId("");
  }

  function handleClose() { reset(); onClose(); }

  function pickScenario(s: Scenario) {
    setScenario(s);
    setReviewAttempted(false);
    if (s === "drop_trailer") { setTrailerStatus("PARK"); setTruckStatus("BOBTAIL"); }
    if (s === "swap_truck")   { setTruckStatus("PARK"); setTrailerStatus("AVAIL"); }
    if (s === "swap_trailer") { setTrailerStatus("PARK"); setTruckStatus("AVAIL"); }
    if (s === "park_both")    { setTruckStatus("PARK"); setTrailerStatus("PARK"); }
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
        const finalTruckStatus   = scenario === "drop_trailer" ? "BOBTAIL" : truckStatus;
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
            options={TRUCK_STATUSES.filter(s => s.code !== "BOBTAIL") as any}
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
          <strong style={{ color: "#67e8f9" }}> {truckName}</strong> will be marked <strong style={{ color: "#67e8f9" }}>BOBTAIL</strong> automatically.
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
            options={TRUCK_STATUSES.filter(s => s.code !== "BOBTAIL") as any}
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

  const truckWarn   = ["MAINT","OOS"].includes(truckStatus);
  const trailerWarn = ["MAINT","OOS"].includes(trailerStatus);

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
          <div style={{ padding: "10px 13px", borderRadius: 12, marginBottom: 8,
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
                <div style={{ padding: "8px 10px", borderRadius: 8, background: "rgba(255,185,0,0.07)", border: "1px solid rgba(255,185,0,0.18)", marginBottom: 6 }}>
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
          <div style={{ padding: "10px 13px", borderRadius: 12, marginBottom: 8,
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
                <div style={{ padding: "8px 10px", borderRadius: 8, background: "rgba(255,185,0,0.07)", border: "1px solid rgba(255,185,0,0.18)", marginBottom: 6 }}>
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
          <div style={{ padding: "10px 13px", borderRadius: 12, marginBottom: 8,
            border: "1px solid rgba(103,232,249,0.20)", background: "rgba(0,150,180,0.10)" }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.35)", letterSpacing: 0.5, textTransform: "uppercase" as const, marginBottom: 4 }}>Truck</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 900, padding: "2px 7px", borderRadius: 5,
                background: "rgba(103,232,249,0.15)", color: "#67e8f9" }}>BOBTAIL</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.75)" }}>{truckName}</span>
            </div>
          </div>
        </>
      )}

      {scenario === "park_both" && (
        <>
          <div style={{ padding: "10px 13px", borderRadius: 12, marginBottom: 8,
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
