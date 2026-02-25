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
import CompleteLoadModal from "./modals/CompleteLoadModal";
import MyLoadsModal from "./modals/MyLoadsModal";
import ProductTempModal from "./modals/ProductTempModal";
import TempDialModal from "./modals/TempDialModal";

// ── UI ─────────────────────────────────────────────────────────────────────────
import { styles } from "./ui/styles";
import { QuickPanel } from "./QuickPanel";
import { TopTiles } from "./TopTiles";

// ── Utils ──────────────────────────────────────────────────────────────────────
import { addDaysISO_, formatMDYWithCountdown_, isPastISO_ } from "./utils/dates";
import { normCity, normState } from "./utils/normalize";
import { cgSliderToBias, lbsPerGallonAtTemp, bestLbsPerGallon, planForGallons, CG_NEUTRAL } from "./utils/planMath";
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


// Thermometer thumb SVG (unchanged from original)
const THERMOMETER_THUMB_URI = svgToDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#00c2d8"/>
      <stop offset="1" stop-color="#e74646"/>
    </linearGradient>
  </defs>
  <path d="M28 10a10 10 0 0 1 20 0v24.5a16 16 0 1 1-20 0V10z" fill="#0b1b22" opacity="0.85"/>
  <path d="M31.5 12a6.5 6.5 0 0 1 13 0v25.7a12 12 0 1 1-13 0V12z" fill="url(#g)"/>
  <circle cx="38" cy="46" r="6.5" fill="#fff" opacity="0.18"/>
</svg>
`);

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
  const effectiveMaxGallons = plannedResult.effectiveMaxGallons;

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

  // ── Plan styles ────────────────────────────────────────────────────────────
  const planStyles = useMemo(() => ({
    ...styles,
    smallBtn: { ...styles.smallBtn, padding: "10px 14px", minWidth: 112, borderRadius: 14, letterSpacing: "0.4px" },
    badge: { ...styles.badge, marginRight: 10 },
  }), []);

  // ── Snapshot slots JSX (injected into PlannerControls) ────────────────────
  const SnapshotSlots = (
    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
        {planSlots.PLAN_SLOTS.map((n) => {
          const has = !!planSlots.slotHas[n];
          const disabled = !location.selectedTerminalId;
          return (
            <button key={n} type="button" disabled={disabled}
              onClick={(e) => { if (e.shiftKey || !has) planSlots.saveToSlot(n); else planSlots.loadFromSlot(n); }}
              style={{ borderRadius: 12, padding: "8px 14px", border: "1px solid rgba(255,255,255,0.12)", background: has ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)", color: "white", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, minWidth: 44, fontSize: 15, fontWeight: 700 }}
              title={!location.selectedTerminalId ? "Select a terminal first" : has ? "Tap to load. Shift+Tap to overwrite." : "Tap to save current plan"}
            >{n}</button>
          );
        })}
      </div>
    </div>
  );

  // ── Derived load state ─────────────────────────────────────────────────────
  const loadDisabled =
    loadWorkflow.beginLoadBusy ||
    !equipment.selectedComboId ||
    !location.selectedTerminalId ||
    !location.selectedState ||
    !location.selectedCity ||
    !location.selectedCityId ||
    planRows.length === 0;

  const loadLabel = loadWorkflow.beginLoadBusy ? "Loading…"
    : loadWorkflow.loadReport ? "RELOAD"
    : loadWorkflow.activeLoadId ? "Load started"
    : "LOAD";

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={styles.page}>
      {/* Equipment header + nav menu on same line */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, gap: 12 }}>
        <button type="button" onClick={() => setEquipOpen(true)}
          style={{ background: "transparent", border: "none", padding: 0, margin: 0, cursor: "pointer", textAlign: "left", color: equipment.selectedCombo ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.45)", fontWeight: 900, fontSize: "clamp(18px, 2.8vw, 28px)", letterSpacing: 0.2, textDecoration: "none" }}
          aria-label="Select equipment"
        >
          {equipment.equipmentLabel ?? "Select Equipment"}
        </button>
        <NavMenu />
      </div>

      <LocationBar
        styles={styles}
        locationTitle={location.locationLabel ?? "City, State"}
        ambientSubtitle={location.locationLabel
          ? `${location.ambientTempLoading ? "…" : location.ambientTempF == null ? "—" : Math.round(location.ambientTempF)}° ambient`
          : undefined}
        terminalTitle={terminalLabel ?? "Terminal"}
        terminalSubtitle={terminalCardedText}
        terminalSubtitleClassName={terminalCardedClass}
        onOpenLocation={() => setLocOpen(true)}
        onOpenTerminal={() => setTermOpen(true)}
        terminalEnabled={Boolean(location.locationLabel)}
        locationSelected={Boolean(location.selectedCity && location.selectedState)}
        terminalSelected={Boolean(location.selectedTerminalId)}
        snapshotSlots={null}
      />

      <PlannerControls
        styles={styles}
        selectedTrailerId={selectedTrailerId}
        compLoading={compLoading}
        compartments={compartments}
        compError={compError}
        headspacePctForComp={headspacePctForComp}
        effectiveMaxGallonsForComp={effectiveMaxGallonsForComp}
        plannedGallonsByComp={plannedGallonsByComp}
        compPlan={compPlan}
        terminalProducts={terminalProducts}
        setCompModalComp={setCompModalComp}
        setCompModalOpen={setCompModalOpen}
        setCompPlan={setCompPlan}
        setCompHeadspacePct={setCompHeadspacePct}
        compModalOpen={compModalOpen}
        compModalComp={compModalComp}
        snapshotSlots={SnapshotSlots}
      />

      {location.selectedTerminalId && (
        <>
          <div style={{ marginTop: 12 }}>
            {unstableLoad && (
              <div style={{ ...styles.error, marginTop: 0, marginBottom: 10, textAlign: "center" }}>
                ⚠️ Unstable load (rear of neutral)
              </div>
            )}

            {/* CG Slider */}
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div style={{ position: "relative", width: "100%", flex: 1 }}>
                <input type="range" className="cgRange" min={0} max={1} step={0.005} value={cgSlider}
                  onChange={(e) => setCgSlider(Number(e.target.value))}
                  style={{ width: "100%" }} disabled={!equipment.selectedCombo}
                />
                <div aria-hidden style={{ position: "absolute", left: `${Math.max(0, Math.min(1, cgSlider)) * 100}%`, top: "50%", transform: "translate(-50%, -50%)", width: 48, height: 48, display: "grid", placeItems: "center", pointerEvents: "none", fontWeight: 800, fontSize: 18, color: "rgba(255,255,255,0.88)", textShadow: "0 2px 10px rgba(0,0,0,0.55)" }}>CG</div>
              </div>
              <button type="button" onClick={() => setCgSlider(CG_NEUTRAL)} style={styles.smallBtn} disabled={!equipment.selectedCombo}>
                {cgBias >= 0 ? "+" : ""}{cgBias.toFixed(2)}
              </button>
            </div>

            {/* Temp Slider */}
            <div style={{ marginTop: 14 }}>
              <style jsx global>{`
                input.tempRange, input.cgRange { -webkit-appearance: none; appearance: none; background: transparent; }
                input.tempRange { height: 40px; }
                input.cgRange { height: 72px; }
                input.tempRange:focus, input.cgRange:focus { outline: none; }
                input.tempRange::-webkit-slider-runnable-track { height: 10px; border-radius: 999px; background: linear-gradient(90deg, rgb(0,194,216) 0%, rgb(0,194,216) 45%, #e74646 55%, #e74646 100%); border: 1px solid rgba(255,255,255,0.10); }
                input.tempRange::-webkit-slider-thumb { -webkit-appearance: none; width: 68px; height: 68px; margin-top: -29px; background: transparent; border: none; }
                input.tempRange::-moz-range-track { height: 10px; border-radius: 999px; background: linear-gradient(90deg, rgb(0,194,216) 0%, rgb(0,194,216) 45%, #e74646 55%, #e74646 100%); }
                input.tempRange::-moz-range-thumb { width: 34px; height: 34px; background: transparent; border: none; }
                input.cgRange::-webkit-slider-runnable-track { height: 10px; border-radius: 999px; background: rgba(255,255,255,0.10); border: 1px solid rgba(255,255,255,0.12); }
                input.cgRange::-webkit-slider-thumb { -webkit-appearance: none; width: 32px; height: 32px; margin-top: -11px; background: transparent; border: none; opacity: 0; }
                input.cgRange::-moz-range-track { height: 10px; border-radius: 999px; background: rgba(255,255,255,0.10); }
                input.cgRange::-moz-range-thumb { width: 32px; height: 32px; background: transparent; border: none; opacity: 0; }
              `}</style>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{ position: "relative", width: "100%", flex: 1 }}>
                  <input type="range" className="tempRange" min={-20} max={140} step={1} value={tempF}
                    onChange={(e) => setTempF(Number(e.target.value))} style={{ width: "100%", flex: 1 }} />
                  <div aria-hidden style={{ position: "absolute", left: `${Math.max(0, Math.min(1, (tempF + 20) / 160)) * 100}%`, top: "50%", transform: "translate(-50%, -50%)", width: 28, height: 28, pointerEvents: "none" }}>
                    <svg viewBox="0 0 64 64" width="28" height="28">
                      <defs><linearGradient id="tAqua" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#00c2d8" stopOpacity="0.95" /><stop offset="1" stopColor="#00a9bd" stopOpacity="0.95" /></linearGradient></defs>
                      <path d="M28 8a10 10 0 0 1 20 0v24.7a18 18 0 1 1-20 0V8z" fill="rgba(0,0,0,0.35)" stroke="rgba(255,255,255,0.22)" strokeWidth="2.5" />
                      <path d="M31 10.5a7 7 0 0 1 14 0v25.9l1.1.8a13.7 13.7 0 1 1-16.2 0l1.1-.8V10.5z" fill="url(#tAqua)" opacity="0.98" />
                      <circle cx="38" cy="48" r="9.5" fill="rgba(231,70,70,0.92)" />
                      <rect x="36.2" y="16" width="3.6" height="30" rx="1.8" fill="rgba(231,70,70,0.92)" />
                    </svg>
                  </div>
                </div>
                <button type="button" onClick={() => setTempDialOpen(true)} style={(() => {
                  // Border color logic:
                  // - Override (user moved away from prediction): amber
                  // - Matches prediction, high confidence: green
                  // - Matches prediction, medium confidence: yellow
                  // - Matches prediction, low confidence: red/orange
                  // - No prediction yet: default smallBtn border
                  const isOverride = predictedFuelTempF != null && Math.abs(tempF - predictedFuelTempF) > 0.5;
                  const borderColor = isOverride
                    ? "#fb923c"
                    : fuelTempConfidence === "high"   ? "#4ade80"
                    : fuelTempConfidence === "medium"  ? "#fbbf24"
                    : fuelTempConfidence === "low"     ? "#f87171"
                    : undefined;
                  return {
                    ...styles.smallBtn,
                    borderColor: borderColor ?? undefined,
                    boxShadow: borderColor ? `0 0 0 1px ${borderColor}22` : undefined,
                    transition: "border-color 400ms ease, box-shadow 400ms ease",
                  };
                })()}>{Math.round(tempF)}°F</button>
              </div>
              <ProductTempModal
                open={tempDialOpen}
                onClose={() => setTempDialOpen(false)}
                styles={styles}
                selectedCity={location.selectedCity}
                selectedState={location.selectedState}
                selectedTerminalId={location.selectedTerminalId}
                locationLat={location.locationLat}
                locationLon={location.locationLon}
                ambientTempLoading={location.ambientTempLoading}
                ambientTempF={location.ambientTempF}
                tempF={tempF}
                setTempF={setTempF}
                predictedFuelTempF={predictedFuelTempF}
                fuelTempConfidence={fuelTempConfidence}
                fuelTempLoading={fuelTempLoading}
                TempDial={TempDial}
              />
            </div>
          </div>
        </>
      )}

      {/* 2×2 action grid */}
      {(() => {
        const { loadReport } = loadWorkflow;
        const plannedGal = loadReport?.planned_total_gal ?? (planRows.length ? plannedGallonsTotal : null);
        const plannedGalText = plannedGal == null ? "—" : `${Math.round(plannedGal).toLocaleString()} gal`;
        const targetText = loadReport?.planned_gross_lbs == null ? "—" : `${Math.round(loadReport.planned_gross_lbs).toLocaleString()} lbs`;
        const actualText = loadReport?.actual_gross_lbs == null ? "—" : `${Math.round(loadReport.actual_gross_lbs).toLocaleString()} lbs`;
        const diff = loadReport?.diff_lbs ?? null;
        const diffText = diff == null ? "—" : `${diff >= 0 ? "+" : ""}${Math.round(diff).toLocaleString()} lbs`;
        const diffColor = diff == null ? "rgba(255,255,255,0.90)" : diff > 0 ? "#ef4444" : "#4ade80";

        const cardBase: CSSProperties = { borderRadius: 20, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)", boxShadow: "0 14px 34px rgba(0,0,0,0.40)", padding: "clamp(12px, 3vw, 18px)" as any, display: "flex", flexDirection: "column", justifyContent: "center" };
        const labelStyle: CSSProperties = { color: "rgba(255,255,255,0.55)", fontWeight: 900, fontSize: "clamp(11px, 2.8vw, 15px)", whiteSpace: "nowrap" as const };
        const bigNum: CSSProperties = { color: "rgba(255,255,255,0.92)", fontWeight: 1000, fontSize: "clamp(15px, 4.5vw, 44px)", lineHeight: 1.05, paddingBottom: 4, whiteSpace: "nowrap" as const };
        const medNum: CSSProperties = { ...bigNum, fontSize: "clamp(13px, 3.8vw, 40px)" };
        const row = (label: string, text: string, numStyle = medNum) => (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6, minWidth: 0 }}>
            <div style={labelStyle}>{label}</div>
            <div style={{ ...numStyle, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", textAlign: "right" as const }}>{text}</div>
          </div>
        );

        return (
          // Grid wrapper: position:relative so diamond can be positioned against it
          <div style={{ marginTop: 14, position: "relative", width: "100%", boxSizing: "border-box" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, alignItems: "stretch", width: "100%" }}>
              {/* LOAD button — My Loads strip at top, primary tap starts load */}
              <div style={{ ...cardBase, padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                {/* My Loads strip — top of card */}
                <button type="button" onClick={(e) => { e.stopPropagation(); setMyLoadsOpen(true); loadHistory.fetch(); }}
                  style={{ background: "rgba(255,255,255,0.04)", cursor: "pointer", padding: "7px 12px", display: "flex", alignItems: "center", gap: 6, border: "none", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}
                >
                  {(() => {
                    const last = loadHistory.rows[0];
                    if (!last) return <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", fontWeight: 600 }}>My Loads ›</span>;
                    const mins = Math.floor((Date.now() - new Date(last.started_at).getTime()) / 60000);
                    const ago = mins < 60 ? `${mins}m ago` : mins < 1440 ? `${Math.floor(mins/60)}h ago` : "yesterday";
                    const gal = last.planned_total_gal != null ? `${Math.round(last.planned_total_gal).toLocaleString()} gal` : "—";
                    return <><span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", fontWeight: 700, flex: 1, textAlign: "left" }}>{ago} · {gal}</span><span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>›</span></>;
                  })()}
                </button>
                {/* Primary tap: LOAD */}
                <button type="button" onClick={loadWorkflow.beginLoadToSupabase} disabled={loadDisabled}
                  style={{ flex: 1, background: "transparent", border: "none", cursor: loadDisabled ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "transform 120ms ease, filter 120ms ease", filter: loadDisabled ? "grayscale(0.2) brightness(0.9)" : "none" }}
                  onMouseDown={(e) => { if (!(e.currentTarget as HTMLButtonElement).disabled) (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.985)"; }}
                  onMouseUp={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}
                >
                  <div style={{ fontWeight: 1000, letterSpacing: 0.6, fontSize: "clamp(28px, 8vw, 70px)", lineHeight: 1.05, paddingBottom: 6, color: loadReport ? "#67e8f9" : "rgba(255,255,255,0.92)" }}>
                    {loadLabel}
                  </div>
                </button>
              </div>

              {/* Planned / Target / Actual */}
              <div style={{ ...cardBase, gap: 10 }}>
                {row("Planned", plannedGalText, bigNum)}
                <div style={{ display: "grid", gap: 8 }}>
                  {row("Target", targetText)}
                  {row("Actual", actualText)}
                </div>
              </div>

              {/* Placard card — ref used by PlacardDiamond portal for positioning */}
              <div ref={placardAnchorRef} onClick={() => setErgModalOpen(true)} style={{ cursor: "pointer", ...cardBase, flexDirection: "row", alignItems: "center", paddingLeft: "clamp(76px, 24vw, 130px)", paddingRight: 18, gap: 0 }}>
                {placardDef ? (() => {
                  const erg = ERG_DATA[placardDef.unNumber.toUpperCase()] ?? null;
                  return (
                  <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 3, minWidth: 0 }}>
                    <div style={{ color: placardIsResidue ? "#ffb400" : "rgba(255,255,255,0.92)", fontWeight: 1000, fontSize: "clamp(14px, 4vw, 26px)", lineHeight: 1.1, letterSpacing: placardIsResidue ? 1.5 : 1, whiteSpace: "nowrap" as const }}>
                      {placardIsResidue ? "RESIDUE" : placardDef.unNumber}
                    </div>
                    {erg && (
                      <div style={{ color: "rgba(255,255,255,0.55)", fontSize: "clamp(9px, 2.2vw, 11px)", fontWeight: 600, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                        {erg.shipping}
                      </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" as const, rowGap: 2 }}>
                      {erg && <div style={{ color: "rgba(255,255,255,0.3)", fontSize: "clamp(8px, 2vw, 10px)", fontWeight: 700, whiteSpace: "nowrap" as const }}>ERG #{erg.guide}</div>}
                      <a
                        href="https://www.ecfr.gov/current/title-49/subtitle-B/chapter-I/subchapter-C/part-172/section-172.504"
                        target="_blank" rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        style={{ color: "rgba(255,255,255,0.3)", fontSize: "clamp(8px, 2vw, 10px)", fontWeight: 700, letterSpacing: 0.3, textDecoration: "none", whiteSpace: "nowrap" as const }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.6)")}
                        onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.3)")}
                      >
                        49 CFR §172.504 ↗
                      </a>
                    </div>
                  </div>
                  );
                })() : (
                  <div style={{ color: "rgba(255,255,255,0.20)", fontWeight: 700, fontSize: 13, letterSpacing: 0.4 }}>
                    {location.selectedTerminalId ? "No placard required" : "Placard"}
                  </div>
                )}
              </div>

              {/* Over/Under */}
              <div style={{ ...cardBase, gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                  <div style={labelStyle}>Over/Under</div>
                  <div style={{ color: diffColor, fontWeight: 1100, fontSize: "clamp(16px, 5.5vw, 56px)", lineHeight: 1.05, paddingBottom: 6, textAlign: "right", marginLeft: "auto", whiteSpace: "nowrap" as const }}>{diffText}</div>
                </div>
              </div>
            </div>

            {/* Diamond rendered via portal — escapes all stacking contexts, adapts to screen size */}
            {placardSvgUri && placardDef && (
              <PlacardDiamond
                anchorRef={placardAnchorRef}
                svgUri={placardSvgUri}
                unNumber={placardDef.unNumber}
                hidden={equipOpen || myLoadsOpen || locOpen || termOpen || catalogOpen || compModalOpen || tempDialOpen || tempDial2Open || statePickerOpen || loadWorkflow.loadingOpen || ergModalOpen}
                onClick={() => setErgModalOpen(true)}
              />
            )}
          </div>
        );
      })()}

      {/* ERG Emergency Info Modal */}
      {ergModalOpen && placardDef && (() => {
        const erg = ERG_DATA[placardDef.unNumber.toUpperCase()] ?? null;
        return createPortal(
          <div onClick={() => setErgModalOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#1a1a1a", borderRadius: 20, width: "100%", maxWidth: 460, border: "1px solid rgba(255,255,255,0.1)", overflow: "hidden" }}>
              {/* Header */}
              <div style={{ background: placardIsResidue ? "#7c4a00" : "#CC2229", padding: "18px 20px 14px", display: "flex", alignItems: "center", gap: 14 }}>
                <img src={placardSvgUri!} width={64} height={64} alt="placard" style={{ flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  {placardIsResidue && (
                    <div style={{ fontSize: 10, fontWeight: 900, color: "#fbbf24", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 3 }}>⚠ Residue</div>
                  )}
                  <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", letterSpacing: 1 }}>{placardDef.unNumber}</div>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", fontWeight: 600, marginTop: 2 }}>{erg?.name ?? placardDef.unNumber}</div>
                  {erg && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", marginTop: 2, lineHeight: 1.3 }}>{erg.shipping}</div>}
                  {erg && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 3 }}>ERG Guide #{erg.guide}</div>}
                </div>
                <button onClick={() => setErgModalOpen(false)} style={{ background: "rgba(0,0,0,0.25)", border: "none", borderRadius: 50, width: 34, height: 34, color: "#fff", fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>×</button>
              </div>
              {/* Body */}
              <div style={{ padding: "16px 20px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
                {erg && <>
                  <div style={{ background: "rgba(204,34,41,0.1)", border: "1px solid rgba(204,34,41,0.3)", borderRadius: 10, padding: "10px 14px" }}>
                    <div style={{ fontSize: 10, fontWeight: 900, color: "#CC2229", textTransform: "uppercase", letterSpacing: 1, marginBottom: 5 }}>🔥 Fire / Explosion</div>
                    <div style={{ fontSize: 14, color: "rgba(255,255,255,0.85)", lineHeight: 1.5 }}>{erg.fire}</div>
                  </div>
                  <div style={{ background: "rgba(255,180,0,0.07)", border: "1px solid rgba(255,180,0,0.2)", borderRadius: 10, padding: "10px 14px" }}>
                    <div style={{ fontSize: 10, fontWeight: 900, color: "#ffb400", textTransform: "uppercase", letterSpacing: 1, marginBottom: 5 }}>⚠ Health</div>
                    <div style={{ fontSize: 14, color: "rgba(255,255,255,0.85)", lineHeight: 1.5 }}>{erg.health}</div>
                  </div>
                  <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "10px 14px" }}>
                    <div style={{ fontSize: 10, fontWeight: 900, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>📍 Initial Isolation</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <div style={{ flex: 1, background: "rgba(255,255,255,0.05)", borderRadius: 8, padding: "8px 10px" }}>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 3 }}>SMALL SPILL</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{erg.isolation_small}</div>
                      </div>
                      <div style={{ flex: 1, background: "rgba(255,255,255,0.05)", borderRadius: 8, padding: "8px 10px" }}>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 3 }}>LARGE SPILL</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{erg.isolation_large}</div>
                      </div>
                    </div>
                  </div>
                </>}

                {/* Actions */}
                <div style={{ display: "flex", gap: 10, marginTop: 2 }}>
                  <a href="tel:18004249300" style={{ flex: 1, background: "#CC2229", borderRadius: 10, padding: "12px 10px", textAlign: "center", textDecoration: "none" }}>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", marginBottom: 2 }}>CHEMTREC 24/7</div>
                    <div style={{ fontSize: 15, fontWeight: 900, color: "#fff" }}>800-424-9300</div>
                  </a>
                  <a href={erg ? `https://www.phmsa.dot.gov/sites/phmsa.dot.gov/files/2024-04/ERG2024-WEB.pdf#page=${erg.guide + 138}` : "https://www.phmsa.dot.gov/sites/phmsa.dot.gov/files/2024-04/ERG2024-WEB.pdf"} target="_blank" rel="noopener noreferrer" style={{ flex: 1, background: "rgba(255,255,255,0.06)", borderRadius: 10, padding: "12px 10px", textAlign: "center", textDecoration: "none" }}>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginBottom: 2 }}>FULL ERG GUIDE</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.8)" }}>{erg ? `Guide #${erg.guide} ↗` : "ERG 2024 ↗"}</div>
                  </a>
                </div>
              </div>
            </div>
          </div>,
          document.body
        );
      })()}

      {/* ── Modals ── */}
      <EquipmentModal
        open={equipOpen} onClose={() => setEquipOpen(false)}
        authUserId={authUserId}
        combos={equipment.combos} combosLoading={equipment.combosLoading} combosError={equipment.combosError}
        selectedComboId={equipment.selectedComboId ?? ""}
        onSelectComboId={(id) => equipment.setSelectedComboId(id)}
        onRefreshCombos={equipment.fetchCombos}
      />

      <MyLoadsModal
        open={myLoadsOpen} onClose={() => setMyLoadsOpen(false)}
        authUserId={authUserId ?? ""}
        rows={loadHistory.rows}
        loading={loadHistory.loading}
        error={loadHistory.error}
        linesCache={loadHistory.linesCache}
        linesLoading={loadHistory.linesLoading}
        onFetchLines={loadHistory.fetchLines}
        onFetchRange={loadHistory.fetch}
        terminalCatalog={[]}
        combos={equipment.combos ?? []}
      />

      <LoadingModal
        open={loadWorkflow.loadingOpen} onClose={() => loadWorkflow.setLoadingOpen(false)}
        styles={styles}
        planRows={planRows as any[]}
        productNameById={productNameById}
        productButtonCodeById={productButtonCodeById}
        productHexCodeById={productHexCodeById}
        productInputs={productInputs}
        terminalTimeZone={selectedTerminalTimeZoneResolved}
        lastProductInfoById={lastProductInfoById}
        setProductApi={(productId, api) => setProductInputs((prev) => ({ ...prev, [productId]: { ...(prev[productId] ?? {}), api } }))}
        onOpenTempDial={(productId) => { setTempDial2ProductId(productId); setTempDial2Open(true); }}
        onLoaded={loadWorkflow.onLoadedFromLoadingModal}
        loadedDisabled={loadWorkflow.completeBusy}
        loadedLabel={loadWorkflow.completeBusy ? "Saving…" : "LOADED"}
      />

      <TempDialModal
        open={tempDial2Open} onClose={() => setTempDial2Open(false)} title="Temp"
        value={tempDial2ProductId ? Number(productInputs[tempDial2ProductId]?.tempF ?? 60) : 60}
        onChange={(v) => { const pid = tempDial2ProductId; if (!pid) return; setProductInputs((prev) => ({ ...prev, [pid]: { ...(prev[pid] ?? {}), tempF: v } })); }}
        TempDial={TempDial}
      />

      <LocationModal
        open={locOpen} onClose={() => setLocOpen(false)}
        selectedState={location.selectedState}
        selectedStateLabel={selectedStateLabel}
        statesError={location.statesError}
        statesLoading={location.statesLoading}
        statePickerOpen={statePickerOpen}
        setStatePickerOpen={setStatePickerOpen}
        stateOptions={stateOptions}
        setSelectedState={location.setSelectedState}
        selectedCity={location.selectedCity}
        citiesLoading={location.citiesLoading}
        citiesError={location.citiesError}
        cities={cities}
        topCities={topCities}
        allCities={allCities}
        setSelectedCity={location.setSelectedCity}
        normState={normState}
        toggleCityStar={toggleCityStar}
        isCityStarred={isCityStarred}
        starBtnClass={starBtnClass}
        setLocOpen={setLocOpen}
      />

      <MyTerminalsModal
        open={termOpen} onClose={() => setTermOpen(false)}
        selectedState={location.selectedState}
        selectedCity={location.selectedCity}
        termError={terminals.termError}
        terminalsFiltered={terminalsFiltered}
        selectedTerminalId={location.selectedTerminalId}
        expandedTerminalId={expandedTerminalId}
        setExpandedTerminalId={setExpandedTerminalId}
        cardingBusyId={terminals.cardingBusyId}
        addDaysISO_={addDaysISO_}
        isPastISO_={isPastISO_}
        formatMDYWithCountdown_={formatMDYWithCountdown_}
        starBtnClass={starBtnClass}
        myTerminalIds={myTerminalIdSet}
        setMyTerminalIds={() => {}}
        setTerminals={terminals.setTerminals}
        toggleTerminalStar={terminals.toggleTerminalStar}
        doGetCardedForTerminal={terminals.doGetCarded}
        setSelectedTerminalId={location.setSelectedTerminalId}
        setTermOpen={setTermOpen}
        setCatalogExpandedId={setCatalogExpandedId}
        setCatalogOpen={setCatalogOpen}
      />

      <TerminalCatalogModal
        open={catalogOpen}
        onClose={() => { setCatalogOpen(false); setTermOpen(true); }}
        selectedState={location.selectedState}
        selectedCity={location.selectedCity}
        termError={terminals.termError}
        catalogError={terminals.catalogError}
        catalogTerminalsInCity={catalogTerminalsInCity}
        myTerminalIds={myTerminalIdSet}
        setMyTerminalIds={() => {}}
        catalogExpandedId={catalogExpandedId}
        setCatalogExpandedId={setCatalogExpandedId}
        catalogEditingDateId={catalogEditingDateId}
        setCatalogEditingDateId={setCatalogEditingDateId}
        accessDateByTerminalId={terminals.accessDateByTerminalId}
        setAccessDateForTerminal_={terminals.setAccessDateForTerminal}
        isoToday_={(tz) => { const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz || "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()); return `${p.find(x=>x.type==="year")?.value}-${p.find(x=>x.type==="month")?.value}-${p.find(x=>x.type==="day")?.value}`; }}
        toggleTerminalStar={terminals.toggleTerminalStar}
        starBtnClass={starBtnClass}
        addDaysISO_={addDaysISO_}
        isPastISO_={isPastISO_}
        formatMDYWithCountdown_={formatMDYWithCountdown_}
        setCatalogOpen={setCatalogOpen}
        setTermOpen={setTermOpen}
      />
    </div>
  );
}
