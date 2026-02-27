"use client";
import NavMenu from "@/lib/ui/NavMenu";

/**
 * page.tsx — CalculatorPage
 *
 * This file is intentionally thin: it wires hooks together and renders JSX.
 * Business logic lives in:
 *   hooks/useEquipment.ts   — combos, selectedComboId, persistence
 *   hooks/useLocation.ts    — states/cities, ambient temp, persistence
 *   hooks/useTerminals.ts   — my terminals, catalog, get_carded
 *   hooks/usePlanSlots.ts   — plan snapshot save/load, Supabase sync
 *   hooks/useLoadWorkflow.ts — begin_load / complete_load RPCs
 *   hooks/usePlanRows.ts    — binary search for weight-constrained max gallons
 *   utils/planMath.ts       — lbsPerGallonAtTemp, planForGallons, allocateWithCaps
 *   types.ts                — all shared types
 */



import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase/client";

// ── Hooks ──────────────────────────────────────────────────────────────────────
import { useEquipment } from "./hooks/useEquipment";
import { useLocation } from "./hooks/useLocation";
import { useTerminals } from "./hooks/useTerminals";
import { usePlanSlots } from "./hooks/usePlanSlots";
import { useLoadWorkflow } from "./hooks/useLoadWorkflow";
import { usePlanRows } from "./hooks/usePlanRows";
import { useTerminalFilters } from "./hooks/useTerminalFilters";
import { useFuelTempPrediction } from "./hooks/useFuelTempPrediction";
import { useLoadHistory } from "./hooks/useLoadHistory";

// ── Sections ───────────────────────────────────────────────────────────────────
import LocationBar from "./sections/LocationBar";
import PlannerControls from "./sections/PlannerControls";

// ── Modals ─────────────────────────────────────────────────────────────────────
import EquipmentModal from "./modals/EquipmentModal";
import LocationModal from "./modals/LocationModal";
import MyTerminalsModal from "./modals/MyTerminalsModal";
import TerminalCatalogModal from "./modals/TerminalCatalogModal";
import LoadingModal from "./modals/LoadingModal";
import MyLoadsModal from "./modals/MyLoadsModal";
import ProductTempModal from "./modals/ProductTempModal";
import TempDialModal from "./modals/TempDialModal";

// ── UI ─────────────────────────────────────────────────────────────────────────
import { styles } from "./ui/styles";

// ── Utils ──────────────────────────────────────────────────────────────────────
import { addDaysISO_, formatMDYWithCountdown_, isPastISO_ } from "./utils/dates";
import { normCity, normState } from "./utils/normalize";
import { cgSliderToBias, bestLbsPerGallon, planForGallons, CG_NEUTRAL } from "./utils/planMath";
import { worstCasePlacard, svgToDataUri, generatePlacardSvg } from "./utils/placardUtils";

// ── Types ──────────────────────────────────────────────────────────────────────
import type { ActiveComp, CompPlanInput, CompRow, ProductRow, TerminalProductMetaRow } from "./types";

// ── ERG 2024 + DOT proper shipping descriptions (49 CFR 172.101) ─────────────
const ERG_DATA: Record<string, { guide: number; name: string; shipping: string; fire: string; health: string; isolation_small: string; isolation_large: string }> = {
  "UN1203": { guide: 128, name: "Gasoline",              shipping: "Gasoline, 3, UN1203, PG II",                                 fire: "Highly flammable. Vapors may travel to ignition source and flash back.", health: "Vapors may cause dizziness or suffocation. Low toxicity.",        isolation_small: "60 m (200 ft) all directions",  isolation_large: "300 m (1000 ft) all directions" },
  "UN1202": { guide: 128, name: "Diesel Fuel",           shipping: "Diesel fuel, 3, UN1202, PG III",                              fire: "Flammable liquid. Flash point 52–96°C (126–205°F).",                 health: "Low acute toxicity. Vapors may cause irritation.",               isolation_small: "60 m (200 ft) all directions",  isolation_large: "300 m (1000 ft) all directions" },
  "UN1993": { guide: 128, name: "Flammable Liquid NOS",  shipping: "Flammable liquid, n.o.s., 3, UN1993, PG II",                  fire: "Highly flammable. Vapors heavier than air — may accumulate in low areas.", health: "Vapors may cause dizziness. Avoid prolonged skin contact.",  isolation_small: "60 m (200 ft) all directions",  isolation_large: "300 m (1000 ft) all directions" },
  "NA1993": { guide: 128, name: "Combustible Liquid NOS",shipping: "Combustible liquid, n.o.s., Combustible liquid, NA1993, PG III",fire: "Combustible. May ignite if heated above flash point.",             health: "Low hazard at ambient temps. Vapors may cause irritation.",      isolation_small: "60 m (200 ft) all directions",  isolation_large: "300 m (1000 ft) all directions" },
  "UN1863": { guide: 128, name: "Aviation Turbine Fuel", shipping: "Fuel, aviation, turbine engine, 3, UN1863, PG I/II/III",      fire: "Flammable. Vapors may travel to ignition source and flash back.",    health: "Vapors may cause CNS depression. Low acute oral toxicity.",      isolation_small: "60 m (200 ft) all directions",  isolation_large: "300 m (1000 ft) all directions" },
  "UN1075": { guide: 115, name: "Petroleum Gases",       shipping: "Petroleum gases, liquefied, 2.1, UN1075",                     fire: "Extremely flammable gas. May form explosive mixtures with air.",     health: "Asphyxiant. High concentrations may cause rapid suffocation.",   isolation_small: "100 m (330 ft) all directions", isolation_large: "800 m (0.5 mi) all directions"  },
  "UN1978": { guide: 115, name: "Propane",               shipping: "Propane, 2.1, UN1978",                                        fire: "Extremely flammable gas. May explode if container heated.",          health: "Simple asphyxiant. No significant toxicity.",                   isolation_small: "100 m (330 ft) all directions", isolation_large: "800 m (0.5 mi) all directions"  },
};


// ─── Local UI helpers ─────────────────────────────────────────────────────────

const clampNum = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));



// SVG arc helpers
function polarToCartesian(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg - 90) * (Math.PI / 180);
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}
function describeArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const start = polarToCartesian(cx, cy, r, endDeg);
  const end = polarToCartesian(cx, cy, r, startDeg);
  const largeArcFlag = endDeg - startDeg <= 180 ? "0" : "1";
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

// TempDial component (unchanged, kept local — can be moved to sections/ if it grows)
type TempDialProps = { value: number; min: number; max: number; step: number; onChange: (v: number) => void };

function TempDial({ value, min, max, step, onChange }: TempDialProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const sweepStart = -135;
  const sweepEnd = 135;
  const sweep = sweepEnd - sweepStart;

  const valueToAngle = useCallback((v: number) => {
    const anchorAngle = -90;
    const degPerUnit = sweep / (max - min || 1);
    return clampNum(anchorAngle + (clampNum(v, min, max) - 60) * degPerUnit, sweepStart, sweepEnd);
  }, [min, max, sweep, sweepStart, sweepEnd]);

  const angleToValue = useCallback((deg: number) => {
    const anchorAngle = -90;
    const degPerUnit = sweep / (max - min || 1);
    const raw = 60 + (clampNum(deg, sweepStart, sweepEnd) - anchorAngle) / (degPerUnit || 1);
    return clampNum(Math.round((Math.round(raw / step) * step) * 10) / 10, min, max);
  }, [min, max, step, sweep, sweepStart, sweepEnd]);

  const setFromPointer = useCallback((clientX: number, clientY: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = clientX - (r.left + r.width / 2);
    const dy = clientY - (r.top + r.height / 2);
    onChange(angleToValue(clampNum((Math.atan2(dy, dx) * 180) / Math.PI, sweepStart, sweepEnd)));
  }, [angleToValue, onChange, sweepStart, sweepEnd]);

  const angle = valueToAngle(value);
  const rad = (angle * Math.PI) / 180;
  const knobX = 120 + Math.cos(rad) * 92;
  const knobY = 120 + Math.sin(rad) * 92;

  return (
    <div ref={ref} style={{ width: "100%", maxWidth: 420, margin: "0 auto", aspectRatio: "1/1", borderRadius: 24, background: "transparent", position: "relative", touchAction: "none" }}
      onPointerDown={(e) => { (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId); setDragging(true); setFromPointer(e.clientX, e.clientY); }}
      onPointerMove={(e) => { if (!dragging) return; setFromPointer(e.clientX, e.clientY); }}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
    >
      <svg viewBox="0 0 240 240" style={{ width: "100%", height: "100%" }}>
        <circle cx="120" cy="120" r="106" fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="2" />
        <circle cx="120" cy="120" r="100" fill="none" stroke="rgb(0,194,216)" strokeWidth="2" />
        <path d={describeArc(120, 120, 92, sweepStart, sweepEnd)} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="10" strokeLinecap="round" />
        <circle cx={knobX} cy={knobY} r="9" fill="rgba(255,255,255,0.88)" />
        <circle cx={knobX} cy={knobY} r="4" fill="rgb(0,194,216)" />
      </svg>
      <div style={{ position: "absolute", top: 14, left: 0, right: 0, textAlign: "center", fontWeight: 900, fontSize: 14, color: "rgba(255,255,255,0.72)", pointerEvents: "none" }}>60°F</div>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center", pointerEvents: "none" }}>
        <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: -0.6 }}>{value.toFixed(1)}°F</div>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

// ── PlacardDiamond portal component ──────────────────────────────────────────
// Renders the diamond via a React portal into document.body so it's never
// clipped by any ancestor overflow or stacking context.
// Size is derived from the anchor card's rendered height so it scales
// naturally across all screen widths — no hardcoded size needed.
function PlacardDiamond({ anchorRef, svgUri, unNumber, onClick, hidden }: {
  anchorRef: React.RefObject<HTMLDivElement | null>;
  svgUri: string;
  unNumber: string;
  onClick?: () => void;
  hidden?: boolean;
}) {
  const [layout, setLayout] = useState<{ x: number; y: number; size: number } | null>(null);

  const update = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Diamond is 85% of card height, clamped 80–140px — stays within the left padding zone
    const size = Math.min(140, Math.max(80, Math.round(r.height * 0.85)));
    setLayout({
      // Center diamond horizontally in the left-padding zone (paddingLeft = clamp(88,30vw,160))
      // Use half the paddingLeft as the center point so the diamond fits within it
      x: r.left + size * 0.5 + 4,
      // Vertically centered on the card
      y: r.top + r.height * 0.5,
      size,
    });
  }, [anchorRef]);

  useEffect(() => {
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    const ro = new ResizeObserver(update);
    if (anchorRef.current) ro.observe(anchorRef.current);
    ro.observe(document.body);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
      ro.disconnect();
    };
  }, [update, anchorRef]);

  if (!layout || typeof document === "undefined" || hidden) return null;

  const { x, y, size } = layout;

  return createPortal(
    <img
      src={svgUri}
      alt={unNumber + " placard"}
      onClick={onClick}
      style={{
        position: "fixed",
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        zIndex: 9999,
        filter: "drop-shadow(0 8px 24px rgba(0,0,0,0.85))",
        pointerEvents: "auto",
        cursor: "pointer",
      }}
    />,
    document.body
  );
}

export default function CalculatorPage() {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const [authEmail, setAuthEmail] = useState("");
  const [authUserId, setAuthUserId] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setAuthEmail(data.user?.email ?? "");
      setAuthUserId(data.user?.id ?? "");
    })();
  }, []);

  // ── Modal open/close flags ─────────────────────────────────────────────────
  const [equipOpen, setEquipOpen] = useState(false);
  const [locOpen, setLocOpen] = useState(false);
  const [termOpen, setTermOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogExpandedId, setCatalogExpandedId] = useState<string | null>(null);
  const [catalogEditingDateId, setCatalogEditingDateId] = useState<string | null>(null);
  const [expandedTerminalId, setExpandedTerminalId] = useState<string | null>(null);
  const [statePickerOpen, setStatePickerOpen] = useState(false);
  const [compModalOpen, setCompModalOpen] = useState(false);
  const [compModalComp, setCompModalComp] = useState<number | null>(null);
  const [tempDialOpen, setTempDialOpen] = useState(false);
  const [tempDial2Open, setTempDial2Open] = useState(false);
  const [tempDial2ProductId, setTempDial2ProductId] = useState<string | null>(null);

  // ── Feature hooks ──────────────────────────────────────────────────────────
  const equipment = useEquipment(authUserId);
  const location = useLocation(authUserId);

  // selectedTerminalTimeZone removed — use selectedTerminalTimeZoneResolved below

  const terminals = useTerminals(
    authUserId,
    location.selectedTerminalId,
    location.setSelectedTerminalId,
    null // timezone resolved below
  );

  // Resolve timezone after both hooks exist
  const selectedTerminalTimeZoneResolved = useMemo(() => {
    const tid = String(location.selectedTerminalId ?? "");
    if (!tid) return null;
    // timezone lives in terminalCatalog (from terminals table), not in my_terminals_with_status view
    return (terminals.terminalCatalog as any[])?.find((x) => String(x.terminal_id) === tid)?.timezone ?? null;
  }, [location.selectedTerminalId, terminals.terminalCatalog]);

  // ── Compartments ───────────────────────────────────────────────────────────
  const [compartments, setCompartments] = useState<CompRow[]>([]);
  const [compLoading, setCompLoading] = useState(false);
  const [compError, setCompError] = useState<string | null>(null);

  const selectedTrailerId = equipment.selectedCombo?.trailer_id ?? null;

  useEffect(() => {
    (async () => {
      setCompError(null);
      setCompartments([]);
      if (!selectedTrailerId) return;
      setCompLoading(true);
      const { data, error } = await supabase
        .from("trailer_compartments")
        .select("trailer_id, comp_number, max_gallons, position, active")
        .eq("trailer_id", selectedTrailerId)
        .order("comp_number", { ascending: true });
      if (error) { setCompError(error.message); setCompartments([]); }
      else { setCompartments(((data ?? []) as CompRow[]).filter((c) => c.active !== false)); }
      setCompLoading(false);
    })();
  }, [selectedTrailerId]);

  // ── Terminal products ──────────────────────────────────────────────────────
  const [terminalProducts, setTerminalProducts] = useState<ProductRow[]>([]);
  const [terminalProductMetaRows, setTerminalProductMetaRows] = useState<TerminalProductMetaRow[]>([]);

  // Extract terminal products fetch as a named callback so it can be called post-load
  const fetchTerminalProducts = useCallback(async () => {
    if (!location.selectedTerminalId) { setTerminalProducts([]); return; }
    const { data, error } = await supabase
      .from("terminal_products")
      .select(`active, last_api, last_api_updated_at, last_temp_f, last_loaded_at,
        products (product_id, product_name, display_name, description, product_code, button_code, hex_code, api_60, alpha_per_f, un_number)`)
      .eq("terminal_id", location.selectedTerminalId);
    if (error) { setTerminalProducts([]); return; }
    const products = (data ?? []).filter((row: any) => row.active !== false)
      .map((row: any) => row.products ? { ...row.products, last_api: row.last_api ?? null, last_api_updated_at: row.last_api_updated_at ?? null, last_temp_f: row.last_temp_f ?? null, last_loaded_at: row.last_loaded_at ?? null } : null)
      .filter(Boolean);
    setTerminalProducts(products as ProductRow[]);
  }, [location.selectedTerminalId]);

  useEffect(() => { fetchTerminalProducts(); }, [fetchTerminalProducts]);

  useEffect(() => {
    if (!location.selectedTerminalId) { setTerminalProductMetaRows([]); return; }
    (async () => {
      const { data, error } = await supabase
        .from("terminal_products")
        .select("terminal_id, product_id, last_api, last_api_updated_at, last_temp_f, last_loaded_at")
        .eq("terminal_id", location.selectedTerminalId);
      if (!error) setTerminalProductMetaRows((data ?? []) as any);
    })();
  }, [location.selectedTerminalId]);

  // ── Planning inputs ────────────────────────────────────────────────────────
  const [tempF, setTempF] = useState<number>(60);
  const [cgSlider, setCgSlider] = useState<number>(0.5);
  const [compPlan, setCompPlan] = useState<Record<number, CompPlanInput>>({});
  const [ergModalOpen, setErgModalOpen] = useState(false);
  const [myLoadsOpen, setMyLoadsOpen]   = useState(false);

  const loadHistory = useLoadHistory(authUserId ?? "");
  const [compHeadspacePct, setCompHeadspacePct] = useState<Record<number, number>>({});
  const [productInputs, setProductInputs] = useState<Record<string, { api?: string; tempF?: number }>>({});

  // Fuel temp prediction — drives temp button border color and pre-fills ProductTempModal
  const { predictedFuelTempF, confidence: fuelTempConfidence, loading: fuelTempLoading } = useFuelTempPrediction({
    city: location.selectedCity || null,
    state: location.selectedState || null,
    lat: location.locationLat ?? null,
    lon: location.locationLon ?? null,
    ambientNowF: location.ambientTempF ?? null,
    terminalId: location.selectedTerminalId || null,
  });

  // Auto-apply prediction to the slider when it first arrives.
  // userAdjustedTempRef = true means the driver has manually moved the slider.
  // Resets whenever city/state changes so a new terminal gets a fresh auto-apply.
  const predAppliedForRef = useRef<string>("");
  const userAdjustedTempRef = useRef<boolean>(false);

  // Mark as user-adjusted whenever tempF changes AFTER a prediction has been applied
  const prevTempFRef = useRef<number>(tempF);
  useEffect(() => {
    if (Math.abs(tempF - prevTempFRef.current) > 0.1) {
      // Only mark as user-adjusted if a prediction has already been applied
      if (predAppliedForRef.current !== "") {
        userAdjustedTempRef.current = true;
      }
    }
    prevTempFRef.current = tempF;
  }, [tempF]);

  // Reset on city/state change
  useEffect(() => {
    predAppliedForRef.current = "";
    userAdjustedTempRef.current = false;
    prevTempFRef.current = tempF;
  }, [location.selectedCity, location.selectedState]);

  // Apply prediction to slider when it arrives — skip if user already adjusted
  useEffect(() => {
    if (predictedFuelTempF == null) return;
    const key = `${location.selectedCity}|${location.selectedState}`;
    if (predAppliedForRef.current === key) return;
    if (userAdjustedTempRef.current) return;
    setTempF(predictedFuelTempF);
    predAppliedForRef.current = key;
  }, [predictedFuelTempF, location.selectedCity, location.selectedState]);

  // Initialize compPlan entries when compartments change
  useEffect(() => {
    setCompPlan((prev) => {
      const next = { ...prev };
      for (const c of compartments) {
        const n = Number(c.comp_number);
        if (!Number.isFinite(n)) continue;
        if (!next[n]) next[n] = { empty: false, productId: "" };
      }
      for (const key of Object.keys(next)) {
        const n = Number(key);
        if (!compartments.some((c) => Number(c.comp_number) === n)) delete next[n];
      }
      return next;
    });
  }, [compartments]);

  // ── CG bias ────────────────────────────────────────────────────────────────
  const cgBias = useMemo(() => cgSliderToBias(cgSlider), [cgSlider]);
  const unstableLoad = cgSlider < CG_NEUTRAL;

  // ── Headspace helpers ──────────────────────────────────────────────────────
  const headspacePctForComp = useCallback((compNumber: number) => {
    const raw = Number(compHeadspacePct[compNumber] ?? 0);
    return Number.isFinite(raw) ? Math.max(0, Math.min(0.3, raw)) : 0;
  }, [compHeadspacePct]);

  const effectiveMaxGallonsForComp = useCallback((compNumber: number, trueMaxGallons: number) => {
    return Math.max(0, Math.floor(trueMaxGallons * (1 - headspacePctForComp(compNumber))));
  }, [headspacePctForComp]);

  // ── lbs/gal helper ────────────────────────────────────────────────────────
  const lbsPerGalForProductId = useCallback((productId: string): number | null => {
    const p = terminalProducts.find((x) => x.product_id === productId);
    if (!p || p.api_60 == null || p.alpha_per_f == null) return null;
    // Use driver-observed API (last_api @ last_temp_f) when available — more accurate
    // than the static api_60 reference. bestLbsPerGallon back-corrects to 60°F first.
    return bestLbsPerGallon(
      Number(p.api_60),
      Number(p.alpha_per_f),
      tempF,
      p.last_api     != null ? Number(p.last_api)     : null,
      p.last_temp_f  != null ? Number(p.last_temp_f)  : null,
    );
  }, [terminalProducts, tempF]);

  // ── Active compartments ────────────────────────────────────────────────────
  const activeComps = useMemo<ActiveComp[]>(() => {
    if (!selectedTrailerId || compartments.length === 0 || terminalProducts.length === 0) return [];
    const out: ActiveComp[] = [];
    for (const c of compartments) {
      const compNumber = Number(c.comp_number);
      const trueMaxGallons = Number(c.max_gallons ?? 0);
      const maxGallons = effectiveMaxGallonsForComp(compNumber, trueMaxGallons);
      const position = -(Number(c.position ?? 0)); // DB +position = REAR → flip to FRONT
      if (!Number.isFinite(compNumber) || maxGallons <= 0) continue;
      const sel = compPlan[compNumber];
      if (!sel || sel.empty || !sel.productId) continue;
      const lbsPerGal = lbsPerGalForProductId(sel.productId);
      if (lbsPerGal == null || !(lbsPerGal > 0)) continue;
      out.push({ compNumber, maxGallons, position: Number.isFinite(position) ? position : 0, productId: sel.productId, lbsPerGal });
    }
    out.sort((a, b) => a.position - b.position);
    return out;
  }, [selectedTrailerId, compartments, terminalProducts, compPlan, tempF]);

  // ── Weight limits ──────────────────────────────────────────────────────────
  // target_weight = the gross weight the driver is trying to hit (renamed from gross_limit_lbs)
  const targetWeight = Number((equipment.selectedCombo as any)?.target_weight ?? 0);
  const tare = Number(equipment.selectedCombo?.tare_lbs ?? 0);
  const allowedLbs = Math.max(0, targetWeight - tare);  // payload = target - tare

  const capacityGallonsActive = useMemo(
    () => activeComps.reduce((s, c) => s + Number(c.maxGallons || 0), 0),
    [activeComps]
  );

  // ── Plan rows (binary search) ──────────────────────────────────────────────
  const plannedResult = usePlanRows({ selectedTrailerId, activeComps, allowedLbs, cgBias, capacityGallonsActive, planForGallons });
  const planRows = plannedResult.planRows;

  const plannedGallonsByComp = useMemo<Record<number, number>>(() => {
    const m: Record<number, number> = {};
    for (const r of planRows as any[]) {
      const n = Number(r.comp_number ?? r.compNumber ?? 0);
      if (Number.isFinite(n)) m[n] = Number(r.planned_gallons ?? r.plannedGallons ?? 0);
    }
    return m;
  }, [planRows]);

  const plannedWeightLbs = useMemo(
    () => planRows.reduce((sum, r: any) => sum + Number(r.planned_gallons ?? 0) * Number(r.lbsPerGal ?? 0), 0),
    [planRows]
  );

  const plannedGallonsTotal = planRows.reduce((s, r) => s + r.planned_gallons, 0);

  // Ref for placard diamond portal positioning
  const placardAnchorRef = useRef<HTMLDivElement | null>(null);

  // ── Plan slots ─────────────────────────────────────────────────────────────
  // Must be declared BEFORE loadWorkflow so planSlots.refreshLastLoad is defined
  const planSlots = usePlanSlots({
    authUserId, selectedTerminalId: location.selectedTerminalId, selectedComboId: equipment.selectedComboId,
    tempF, cgSlider, compPlan, setCgSlider, setCompPlan,
    compartmentsLoaded: compartments.length > 0,
  });

  // ── Load workflow ──────────────────────────────────────────────────────────
  const productNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of terminalProducts) { if (p.product_id) m.set(p.product_id, p.product_name ?? p.product_id); }
    return m;
  }, [terminalProducts]);

  const loadWorkflow = useLoadWorkflow({
    authUserId: authUserId ?? null,
    selectedComboId: equipment.selectedComboId,
    selectedTerminalId: location.selectedTerminalId,
    selectedState: location.selectedState,
    selectedCity: location.selectedCity,
    selectedCityId: location.selectedCityId,
    tare, cgBias,
    ambientTempF: location.ambientTempF,
    tempF, planRows, plannedGallonsTotal, plannedWeightLbs,
    terminalProducts, productNameById,
    productInputs, setProductInputs,
    onRefreshTerminalProducts: fetchTerminalProducts,
    onRefreshTerminalAccess: terminals.refreshTerminalAccessForUser,
    onPostLoadComplete: planSlots.refreshLastLoad,
  });

  // ── Terminal filters ───────────────────────────────────────────────────────
  const myTerminalIdSet = useMemo(
    () => new Set((terminals.terminals ?? []).map((x) => String(x.terminal_id))),
    [terminals.terminals]
  );

  const { terminalsFiltered, catalogTerminalsInCity } = useTerminalFilters({
    terminals: terminals.terminals,
    terminalCatalog: terminals.terminalCatalog,
    selectedState: location.selectedState,
    selectedCity: location.selectedCity,
    myTerminalIdSet,
  });

  // Fetch terminal access dates for city terminals
  useEffect(() => {
    (async () => {
      if (!authUserId || !location.selectedState || !location.selectedCity) return;
      const ids = catalogTerminalsInCity.map((t) => String(t.terminal_id));
      if (ids.length === 0) return;
      const { data, error } = await supabase
        .from("terminal_access").select("terminal_id, carded_on")
        .eq("user_id", authUserId).in("terminal_id", ids);
      if (error) return;
      const map: Record<string, string> = {};
      (data ?? []).forEach((r: any) => { if (r?.terminal_id && r?.carded_on) map[String(r.terminal_id)] = String(r.carded_on); });
      // Note: access date map lives in useTerminals; this local fetch augments the catalog view
    })();
  }, [authUserId, location.selectedState, location.selectedCity, catalogTerminalsInCity]);

  // ── Derived labels ─────────────────────────────────────────────────────────
  const terminalLabel = useMemo(() => {
    const t = terminals.terminals.find((t) => String(t.terminal_id) === String(location.selectedTerminalId));
    return t?.terminal_name ? String(t.terminal_name) : location.selectedTerminalId ? "Terminal" : undefined;
  }, [terminals.terminals, location.selectedTerminalId]);

  const selectedTerminal = useMemo(
    () => terminals.terminals.find((t) => String(t.terminal_id) === String(location.selectedTerminalId)) ?? null,
    [terminals.terminals, location.selectedTerminalId]
  );

  const terminalDisplayISO = useMemo(() => {
    if (!selectedTerminal) return null;
    return terminals.terminalDisplayInfo(selectedTerminal, location.selectedTerminalId);
  }, [selectedTerminal, terminals, location.selectedTerminalId]);

  const terminalCardedText = terminalDisplayISO ? formatMDYWithCountdown_(terminalDisplayISO) : undefined;
  const terminalCardedClass = terminalCardedText
    ? (isPastISO_(terminalDisplayISO!) ? "text-red-500" : "text-white/50") : undefined;

  // ── lastProductInfoById ────────────────────────────────────────────────────
  const lastProductInfoById = useMemo(() => {
    const out: Record<string, { last_api: number | null; last_api_updated_at: string | null }> = {};
    for (const tp of terminalProductMetaRows) {
      const pid = String(tp.product_id ?? "");
      if (!pid) continue;
      out[pid] = { last_api: tp.last_api ?? null, last_api_updated_at: tp.last_api_updated_at ?? null };
    }
    return out;
  }, [terminalProductMetaRows]);

  // ── Placard data ──────────────────────────────────────────────────────────
  const productUnNumberById = useMemo(() => {
    const rec: Record<string, string | null> = {};
    for (const p of terminalProducts) {
      if (p.product_id) rec[p.product_id] = (p as any).un_number ?? null;
    }
    return rec;
  }, [terminalProducts]);


  // Residue: for each empty compartment, track the last known product via DB lookup
  const [residueByComp, setResidueByComp] = useState<Record<number, { product_id: string; un_number: string | null }>>({});

  useEffect(() => {
    if (!equipment.selectedComboId) { setResidueByComp({}); return; }
    const emptyComps = Object.entries(compPlan)
      .filter(([, v]) => v.empty || !v.productId)
      .map(([k]) => Number(k));
    if (emptyComps.length === 0) { setResidueByComp({}); return; }
    planSlots.fetchLastProductPerComp(emptyComps).then(setResidueByComp);
  }, [compPlan, equipment.selectedComboId]);

  const { placardDef, placardIsResidue } = useMemo(() => {
    const activeUns = new Set<string>();
    const residueUns = new Set<string>();

    // Current loaded compartments
    for (const [, plan] of Object.entries(compPlan)) {
      if (plan.empty || !plan.productId) continue;
      const un = productUnNumberById[plan.productId];
      if (un) activeUns.add(un.toUpperCase());
    }
    // Empty compartments — residue from last known product
    for (const [, residue] of Object.entries(residueByComp)) {
      if (residue.un_number) residueUns.add(residue.un_number.toUpperCase());
    }

    const allUns = Array.from(new Set([...activeUns, ...residueUns]));
    if (allUns.length === 0) return { placardDef: null, placardIsResidue: false };

    const def = worstCasePlacard(allUns);
    // Residue-driven: the worst-case placard UN comes from a residue comp, not active load
    const isResidue = !!def && !activeUns.has(def.unNumber.toUpperCase()) && residueUns.has(def.unNumber.toUpperCase());
    return { placardDef: def, placardIsResidue: isResidue };
  }, [compPlan, productUnNumberById, residueByComp]);

  const placardSvgUri = useMemo(() => {
    if (!placardDef) return null;
    // Large size — card will clip/overflow to fill; showUnNumber=false, shown as card text
    return svgToDataUri(generatePlacardSvg(placardDef, { width: 160, height: 160 }));
  }, [placardDef]);

  const productButtonCodeById = useMemo(() => {
    const rec: Record<string, string> = {};
    for (const p of terminalProducts) { if (p.product_id && p.button_code) rec[p.product_id] = String(p.button_code); }
    return rec;
  }, [terminalProducts]);

  const productHexCodeById = useMemo(() => {
    const rec: Record<string, string> = {};
    for (const p of terminalProducts) { if (p.product_id && p.hex_code) rec[p.product_id] = String(p.hex_code); }
    return rec;
  }, [terminalProducts]);

  // ── City starring ──────────────────────────────────────────────────────────
  const CITY_STARS_KEY_PREFIX = "protankr_city_stars_v1::";
  const [starredCitySet, setStarredCitySet] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`${CITY_STARS_KEY_PREFIX}${authUserId || "anon"}`);
      const parsed = raw ? JSON.parse(raw) : [];
      setStarredCitySet(new Set(Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : []));
    } catch { setStarredCitySet(new Set()); }
  }, [authUserId]);

  const cityKey = (state: string, city: string) => `${normState(state)}||${normCity(city)}`;
  const isCityStarred = (state: string, city: string) => starredCitySet.has(cityKey(state, city));
  const toggleCityStar = (state: string, city: string) => {
    const key = cityKey(state, city);
    setStarredCitySet((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      try { localStorage.setItem(`${CITY_STARS_KEY_PREFIX}${authUserId || "anon"}`, JSON.stringify(Array.from(next))); } catch {}
      return next;
    });
  };

  // ── Location option lists ──────────────────────────────────────────────────
  const stateOptions = useMemo(() => {
    if (location.statesCatalog.length > 0) {
      return location.statesCatalog.map((r) => ({ code: normState(r.state_code), name: String(r.state_name || "").trim() })).filter((r) => r.code);
    }
    const codes = Array.from(new Set(terminals.terminalCatalog.map((t) => normState(t.state ?? "")))).filter(Boolean);
    return codes.map((code) => ({ code, name: code }));
  }, [location.statesCatalog, terminals.terminalCatalog]);

  const stateNameByCode = useMemo(() => {
    const m = new Map<string, string>();
    stateOptions.forEach((s) => m.set(s.code, s.name || s.code));
    return m;
  }, [stateOptions]);

  const selectedStateLabel = useMemo(() => {
    if (!location.selectedState) return "";
    const code = normState(location.selectedState);
    return `${code} — ${stateNameByCode.get(code) || code}`;
  }, [location.selectedState, stateNameByCode]);

  const cities = useMemo(() => {
    const st = normState(location.selectedState);
    return Array.from(new Set(
      location.citiesCatalog.filter((c) => normState(c.state_code ?? "") === st && c.active !== false)
        .map((c) => normCity(c.city_name ?? ""))
    )).filter(Boolean).sort();
  }, [location.citiesCatalog, location.selectedState]);

  const topCities = useMemo(() => {
    if (!location.selectedState || cities.length === 0) return [];
    const st = normState(location.selectedState);
    return cities.filter((c) => starredCitySet.has(cityKey(st, c))).sort();
  }, [location.selectedState, cities, starredCitySet]);

  const allCities = useMemo(() => {
    if (!location.selectedState) return cities;
    const st = normState(location.selectedState);
    return cities.filter((c) => !starredCitySet.has(cityKey(st, c)));
  }, [location.selectedState, cities, starredCitySet]);

  const starBtnClass = (active: boolean) =>
    ["h-8 w-8 flex items-center justify-center rounded-lg border transition",
      active ? "border-yellow-400/40 text-yellow-300 hover:bg-yellow-400/10"
        : "border-white/10 text-white/40 hover:bg-white/5 hover:text-white/80"].join(" ");

