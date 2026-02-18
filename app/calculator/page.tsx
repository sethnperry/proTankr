"use client";

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
import { supabase } from "@/lib/supabase/client";

// ── Hooks ──────────────────────────────────────────────────────────────────────
import { useEquipment } from "./hooks/useEquipment";
import { useLocation } from "./hooks/useLocation";
import { useTerminals } from "./hooks/useTerminals";
import { usePlanSlots } from "./hooks/usePlanSlots";
import { useLoadWorkflow } from "./hooks/useLoadWorkflow";
import { usePlanRows } from "./hooks/usePlanRows";
import { useTerminalFilters } from "./hooks/useTerminalFilters";

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
import ProductTempModal from "./modals/ProductTempModal";
import TempDialModal from "./modals/TempDialModal";

// ── UI ─────────────────────────────────────────────────────────────────────────
import { styles } from "./ui/styles";
import { QuickPanel } from "./QuickPanel";
import { TopTiles } from "./TopTiles";

// ── Utils ──────────────────────────────────────────────────────────────────────
import { addDaysISO_, formatMDYWithCountdown_, isPastISO_ } from "./utils/dates";
import { normCity, normState } from "./utils/normalize";
import { cgSliderToBias, lbsPerGallonAtTemp, planForGallons, CG_NEUTRAL } from "./utils/planMath";

// ── Types ──────────────────────────────────────────────────────────────────────
import type { ActiveComp, CompPlanInput, CompRow, ProductRow, TerminalProductMetaRow } from "./types";

// ─── Local UI helpers ─────────────────────────────────────────────────────────

const clampNum = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function svgToDataUri(svg: string) {
  const encoded = encodeURIComponent(svg).replace(/'/g, "%27").replace(/"/g, "%22");
  return `data:image/svg+xml,${encoded}`;
}

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

  const selectedTerminalTimeZone = useMemo(() => {
    const tid = String(location.selectedTerminalId ?? "");
    if (!tid) return null;
    return (terminals.terminals as any[])?.find((x) => String(x.terminal_id) === tid)?.timezone ?? null;
    // Note: forward ref resolved below via renamed variable
  }, []); // placeholder — resolved after terminals hook

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
    return (terminals.terminals as any[])?.find((x) => String(x.terminal_id) === tid)?.timezone ?? null;
  }, [location.selectedTerminalId, terminals.terminals]);

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

  useEffect(() => {
    if (!location.selectedTerminalId) { setTerminalProducts([]); return; }
    (async () => {
      const { data, error } = await supabase
        .from("terminal_products")
        .select(`active, last_api, last_api_updated_at, last_temp_f, last_loaded_at,
          products (product_id, product_name, display_name, description, product_code, button_code, hex_code, api_60, alpha_per_f)`)
        .eq("terminal_id", location.selectedTerminalId);
      if (error) { setTerminalProducts([]); return; }
      const products = (data ?? []).filter((row: any) => row.active !== false)
        .map((row: any) => row.products ? { ...row.products, last_api: row.last_api ?? null, last_api_updated_at: row.last_api_updated_at ?? null, last_temp_f: row.last_temp_f ?? null, last_loaded_at: row.last_loaded_at ?? null } : null)
        .filter(Boolean);
      setTerminalProducts(products as ProductRow[]);
    })();
  }, [location.selectedTerminalId]);

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
  const [compHeadspacePct, setCompHeadspacePct] = useState<Record<number, number>>({});
  const [productInputs, setProductInputs] = useState<Record<string, { api?: string; tempF?: number }>>({});

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
    return lbsPerGallonAtTemp(Number(p.api_60), Number(p.alpha_per_f), tempF);
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
  const gross = Number(equipment.selectedCombo?.gross_limit_lbs ?? 0);
  const tare = Number(equipment.selectedCombo?.tare_lbs ?? 0);
  const buffer = Number((equipment.selectedCombo as any)?.buffer_lbs ?? 0);
  const allowedLbs = Math.max(0, gross - tare - buffer);

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

  // ── Load workflow ──────────────────────────────────────────────────────────
  const productNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of terminalProducts) { if (p.product_id) m.set(p.product_id, p.product_name ?? p.product_id); }
    return m;
  }, [terminalProducts]);

  const loadWorkflow = useLoadWorkflow({
    selectedComboId: equipment.selectedComboId,
    selectedTerminalId: location.selectedTerminalId,
    selectedState: location.selectedState,
    selectedCity: location.selectedCity,
    selectedCityId: location.selectedCityId,
    tare, buffer, cgBias,
    ambientTempF: location.ambientTempF,
    tempF, planRows, plannedGallonsTotal, plannedWeightLbs,
    terminalProducts, productNameById,
    productInputs, setProductInputs,
  });

  // ── Plan slots ─────────────────────────────────────────────────────────────
  const planSlots = usePlanSlots({
    authUserId, selectedTerminalId: location.selectedTerminalId, selectedComboId: equipment.selectedComboId,
    tempF, cgSlider, compPlan, setTempF, setCgSlider, setCompPlan,
    compartmentsLoaded: compartments.length > 0,
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
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Plan slots</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {planSlots.PLAN_SLOTS.map((n) => {
          const has = !!planSlots.slotHas[n];
          const disabled = !location.selectedTerminalId;
          return (
            <button key={n} type="button" disabled={disabled}
              onClick={(e) => { if (e.shiftKey || !has) planSlots.saveToSlot(n); else planSlots.loadFromSlot(n); }}
              style={{ borderRadius: 12, padding: "8px 12px", border: "1px solid rgba(255,255,255,0.12)", background: has ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)", color: "white", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, minWidth: 44 }}
              title={!location.selectedTerminalId ? "Select a terminal first" : has ? "Tap to load. Shift+Tap to overwrite." : "Tap to save current plan"}
            >{n}</button>
          );
        })}
      </div>
      <div style={{ marginTop: 6, fontSize: 12, opacity: 0.6 }}>
        Tip: Tap an empty number to save. Tap a filled number to load. Hold <strong>Shift</strong> to overwrite.
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
    : loadWorkflow.loadReport ? "LOADED"
    : loadWorkflow.activeLoadId ? "Load started"
    : "LOAD";

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={styles.page}>
      {/* Equipment header button */}
      <div style={{ marginBottom: 6 }}>
        <button type="button" onClick={() => setEquipOpen(true)}
          style={{ background: "transparent", border: "none", padding: 0, margin: 0, cursor: "pointer", textAlign: "left", color: equipment.selectedCombo ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.45)", fontWeight: 900, fontSize: "clamp(18px, 2.8vw, 28px)", letterSpacing: 0.2, textDecoration: "underline", textUnderlineOffset: 6 }}
          aria-label="Select equipment"
        >
          {equipment.equipmentLabel ?? "Select Equipment"}
        </button>
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
        authEmail={authEmail}
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
              <label style={styles.label}>Product Temp (°F)</label>
              <style jsx global>{`
                input.tempRange, input.cgRange { -webkit-appearance: none; appearance: none; background: transparent; }
                input.tempRange { height: 40px; }
                input.cgRange { height: 72px; }
                input.tempRange:focus, input.cgRange:focus { outline: none; }
                input.tempRange::-webkit-slider-runnable-track { height: 10px; border-radius: 999px; background: linear-gradient(90deg, rgba(0,194,216,0.26) 0%, rgba(0,194,216,0.26) 45%, rgba(231,70,70,0.24) 55%, rgba(231,70,70,0.24) 100%); border: 1px solid rgba(255,255,255,0.10); }
                input.tempRange::-webkit-slider-thumb { -webkit-appearance: none; width: 68px; height: 68px; margin-top: -29px; background: transparent; border: none; }
                input.tempRange::-moz-range-track { height: 10px; border-radius: 999px; background: linear-gradient(90deg, rgba(0,194,216,0.26) 0%, rgba(0,194,216,0.26) 45%, rgba(231,70,70,0.24) 55%, rgba(231,70,70,0.24) 100%); }
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
                <button type="button" onClick={() => setTempDialOpen(true)} style={styles.smallBtn}>{Math.round(tempF)}°F</button>
              </div>
              <ProductTempModal open={tempDialOpen} onClose={() => setTempDialOpen(false)} styles={styles} selectedCity={location.selectedCity} selectedState={location.selectedState} ambientTempLoading={location.ambientTempLoading} ambientTempF={location.ambientTempF} tempF={tempF} setTempF={setTempF} TempDial={TempDial} />
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

        const cardBase: CSSProperties = { borderRadius: 20, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)", boxShadow: "0 14px 34px rgba(0,0,0,0.40)", padding: 18, minHeight: 132, display: "flex", flexDirection: "column", justifyContent: "center" };
        const labelStyle: CSSProperties = { color: "rgba(255,255,255,0.55)", fontWeight: 900, fontSize: "clamp(14px, 1.8vw, 18px)" };
        const bigNum: CSSProperties = { color: "rgba(255,255,255,0.92)", fontWeight: 1000, fontSize: "clamp(22px, 3.8vw, 44px)", lineHeight: 1.05, paddingBottom: 6 };
        const medNum: CSSProperties = { ...bigNum, fontSize: "clamp(18px, 3.2vw, 40px)" };
        const row = (label: string, text: string, numStyle = medNum) => (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
            <div style={labelStyle}>{label}</div>
            <div style={numStyle}>{text}</div>
          </div>
        );

        return (
          <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {/* LOAD button */}
            <button type="button" onClick={loadWorkflow.beginLoadToSupabase} disabled={loadDisabled}
              style={{ ...cardBase, cursor: loadDisabled ? "not-allowed" : "pointer", alignItems: "center", justifyContent: "center", transition: "transform 120ms ease, filter 120ms ease", filter: loadDisabled ? "grayscale(0.2) brightness(0.9)" : "none" }}
              onMouseDown={(e) => { if (!(e.currentTarget as HTMLButtonElement).disabled) (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.985)"; }}
              onMouseUp={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}
            >
              <div style={{ fontWeight: 1000, letterSpacing: 0.6, fontSize: "clamp(34px, 6.2vw, 70px)", lineHeight: 1.05, paddingBottom: 6, color: loadReport ? "#67e8f9" : "rgba(255,255,255,0.92)" }}>
                {loadLabel}
              </div>
            </button>

            {/* Planned / Target / Actual */}
            <div style={{ ...cardBase, gap: 10 }}>
              {row("Planned", plannedGalText, bigNum)}
              <div style={{ display: "grid", gap: 8 }}>
                {row("Target", targetText)}
                {row("Actual", actualText)}
              </div>
            </div>

            {/* Placard (placeholder) */}
            <div style={{ ...cardBase, alignItems: "center", justifyContent: "center" }}>
              <div style={{ color: "rgba(255,255,255,0.45)", fontWeight: 900, letterSpacing: 0.4 }}>Placard</div>
            </div>

            {/* Over/Under */}
            <div style={{ ...cardBase, gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                <div style={labelStyle}>Over/Under</div>
                <div style={{ color: diffColor, fontWeight: 1100, fontSize: "clamp(26px, 4.8vw, 56px)", lineHeight: 1.05, paddingBottom: 6, textAlign: "right", marginLeft: "auto" }}>{diffText}</div>
              </div>
            </div>
          </div>
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
