"use client";

import { QuickPanel } from "./QuickPanel";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { beginLoad } from "@/lib/supabase/load";


// UI theme constants (keep local + simple)
const TEMP_TRACK_BLUE = "rgba(0,194,216,0.26)";
const TEMP_TRACK_RED  = "rgba(231,70,70,0.24)";
import { supabase } from "@/lib/supabase/client";

import { TopTiles } from "./TopTiles";

// --- UI helpers (localized; keep calculator logic intact) ---
const clampNum = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function svgToDataUri(svg: string) {
  // Inline SVG for range thumb. Keep tiny + dependency-free.
  const encoded = encodeURIComponent(svg)
    .replace(/'/g, "%27")
    .replace(/"/g, "%22");
  return `data:image/svg+xml,${encoded}`;
}

const THERMOMETER_THUMB_URI = svgToDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#00c2d8"/>
      <stop offset="1" stop-color="#e74646"/>
    </linearGradient>
  </defs>
  <!-- outer -->
  <path d="M28 10a10 10 0 0 1 20 0v24.5a16 16 0 1 1-20 0V10z" fill="#0b1b22" opacity="0.85"/>
  <!-- inner tube -->
  <path d="M31.5 12a6.5 6.5 0 0 1 13 0v25.7a12 12 0 1 1-13 0V12z" fill="url(#g)"/>
  <!-- bulb highlight -->
  <circle cx="38" cy="46" r="6.5" fill="#fff" opacity="0.18"/>
</svg>
`);

type TempDialProps = {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
};

/**
 * Big, touch-friendly dial for precise temperature adjustment.
 * - No dependencies
 * - Pointer-event driven (mouse + touch)
 * - 270° sweep (-135°..+135°)
 */
function TempDial({ value, min, max, step, onChange }: TempDialProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const sweepStart = -135; // degrees
  const sweepEnd = 135;
  const sweep = sweepEnd - sweepStart;

  const valueToAngle = useCallback(
    (v: number) => {
      // Anchor 60°F at the top of the dial so the knob aligns with the label.
      const anchorValue = 60;
      const anchorAngle = -90; // top
      const degPerUnit = sweep / (max - min || 1);
      const a = anchorAngle + (clampNum(v, min, max) - anchorValue) * degPerUnit;
      return clampNum(a, sweepStart, sweepEnd);
    },
    [min, max]
  );

  const angleToValue = useCallback(
    (deg: number) => {
      const anchorValue = 60;
      const anchorAngle = -90; // top
      const degPerUnit = sweep / (max - min || 1);
      const raw = anchorValue + (clampNum(deg, sweepStart, sweepEnd) - anchorAngle) / (degPerUnit || 1);
      // snap to step
      const snapped = Math.round(raw / step) * step;
      // avoid float jitter
      const clean = Math.round(snapped * 10) / 10;
      return clampNum(clean, min, max);
    },
    [min, max, step]
  );

  const setFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = clientX - cx;
      const dy = clientY - cy;
      // angle: 0deg at +x, increasing clockwise (we want that feel)
      const rad = Math.atan2(dy, dx);
      let deg = (rad * 180) / Math.PI;
      // clamp to sweep arc
      deg = clampNum(deg, sweepStart, sweepEnd);
      onChange(angleToValue(deg));
    },
    [angleToValue, onChange]
  );

  const angle = valueToAngle(value);
  const rad = (angle * Math.PI) / 180;
  const knobR = 92;
  const knobX = 120 + Math.cos(rad) * knobR;
  const knobY = 120 + Math.sin(rad) * knobR;

  return (
    <div
      ref={ref}
      style={{
        width: "100%",
        maxWidth: 420,
        margin: "0 auto",
        aspectRatio: "1 / 1",
        borderRadius: 24,
        background: "transparent",
        border: "none",
        boxShadow: "none",
        position: "relative",
        touchAction: "none",
      }}
      onPointerDown={(e) => {
        (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
        setDragging(true);
        setFromPointer(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (!dragging) return;
        setFromPointer(e.clientX, e.clientY);
      }}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
      aria-label="Temperature dial"
    >
      <svg viewBox="0 0 240 240" style={{ width: "100%", height: "100%" }}>
        {/* clean ring */}
        <circle cx="120" cy="120" r="106" fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="2" />
        <circle cx="120" cy="120" r="100" fill="none" stroke="rgb(0,194,216)" strokeWidth="2" />

        {/* subtle sweep track */}
        <path
          d={describeArc(120, 120, 92, sweepStart, sweepEnd)}
          fill="none"
          stroke="rgba(255,255,255,0.10)"
          strokeWidth="10"
          strokeLinecap="round"
        />

        {/* ticks */}

        {/* knob */}
        <circle cx={knobX} cy={knobY} r="9" fill="rgba(255,255,255,0.88)" />
        <circle cx={knobX} cy={knobY} r="4" fill="rgb(0,194,216)" />
      </svg>

      <div
        style={{
          position: "absolute",
          top: 14,
          left: 0,
          right: 0,
          textAlign: "center",
          fontWeight: 900,
          fontSize: 14,
          color: "rgba(255,255,255,0.72)",
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        60°F
      </div>

      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          textAlign: "center",
          pointerEvents: "none",
        }}
      >
        <div>
          <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: -0.6 }}>
            {value.toFixed(1)}°F
          </div>
</div>
      </div>
    </div>
  );
}

// SVG arc helpers (small + dependency-free)
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

type CompPlanInput = {
  empty: boolean;
  productId: string; // "" means none selected
};



type PlanRow = {
  comp_number: number;
  max_gallons: number;
  planned_gallons: number;

  // extra fields for mixed-product math + display
  productId?: string;
  lbsPerGal?: number;
  position?: number;
};


type ComboRow = {
  combo_id: string;
  combo_name: string | null;
  truck_id: string | null;
  trailer_id: string | null;
  tare_lbs: number | null;
  gross_limit_lbs: number | null;
  buffer_lbs: number | null;
  active: boolean | null;
};

type TerminalRow = {
  terminal_id: string;
  state: string | null;
  city: string | null;
  terminal_name: string | null;
  carded_on: string | null; // "YYYY-MM-DD" (null if not carded)
  // Optional: view may expose an expiration date; if present we use it for display
  expires_on?: string | null;
  status: "valid" | "expired" | "not_carded";
  starred: boolean | null;
};

type TerminalCatalogRow = {
  terminal_id: string;
  state: string | null;
  city: string | null;
  terminal_name: string | null;
  timezone?: string | null;
  active: boolean | null;
};

type StateRow = {
  state_code: string;
  state_name: string | null;
  active: boolean | null;
};




type CityRow = {
  city_id: string;
  state_code: string | null;
  city_name: string | null;
  active: boolean | null;
};

type CompRow = {
  trailer_id: string;
  comp_number: number;
  max_gallons: number | null;
  position: number | null;
  active: boolean | null;
};

type ProductRow = {
  product_id: string;
  product_name: string | null;
  display_name?: string | null;
  description?: string | null;
  product_code?: string | null;
  button_code?: string | null;
  hex_code?: string | null;
  api_60: number | null;
  alpha_per_f: number | null;
};

const styles = {
  page: {
    padding: 16,
    maxWidth: 1100,
    margin: "0 auto",
  } as React.CSSProperties,

  section: {
    marginTop: 18,
    padding: 14,
    border: "1px solid #333",
    borderRadius: 10,
    background: "#0b0b0b",
  } as React.CSSProperties,

  row: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    alignItems: "end",
  } as React.CSSProperties,

  label: {
    display: "block",
    marginBottom: 6,
    opacity: 0.9,
  } as React.CSSProperties,

  input: {
    padding: 10,
    borderRadius: 8,
    border: "1px solid #444",
    background: "#111",
    color: "#fff",
    outline: "none",
  } as React.CSSProperties,

  select: {
    padding: 10,
    borderRadius: 8,
    border: "1px solid #444",
    background: "#111",
    color: "#fff",
    outline: "none",
  } as React.CSSProperties,

  help: {
    marginTop: 8,
    opacity: 0.85,
    fontSize: 14,
  } as React.CSSProperties,

  error: {
    color: "#ff6b6b",
    marginTop: 8,
    fontSize: 14,
  } as React.CSSProperties,

  table: {
    width: "100%",
    borderCollapse: "collapse",
    marginTop: 10,
  } as React.CSSProperties,

  th: {
    textAlign: "left",
    padding: 10,
    borderBottom: "1px solid #333",
    fontSize: 14,
    opacity: 0.9,
  } as React.CSSProperties,

  td: {
    padding: 10,
    borderBottom: "1px solid #222",
    fontSize: 14,
  } as React.CSSProperties,

  badge: {
    display: "inline-block",
    padding: "4px 8px",
    borderRadius: 999,
    border: "1px solid #444",
    background: "#111",
    fontSize: 12,
    opacity: 0.9,
  } as React.CSSProperties,

  smallBtn: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    color: "white",
    cursor: "pointer",
    fontSize: 13,
    lineHeight: 1.1,
    whiteSpace: "nowrap",
  } as React.CSSProperties,

  doneBtn: {
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(0,0,0,0.55)",
    color: "rgba(255,255,255,0.92)",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 800,
    letterSpacing: 0.2,
  } as React.CSSProperties,


};

const PLAN_SNAPSHOT_VERSION = 1;


export default function CalculatorPage() {
  const [authEmail, setAuthEmail] = useState<string>("");
const [authUserId, setAuthUserId] = useState<string>("");

const [equipOpen, setEquipOpen] = useState(false);
const [locOpen, setLocOpen] = useState(false);
const [termOpen, setTermOpen] = useState(false);
const [catalogOpen, setCatalogOpen] = useState(false);

const [cardingBusyId, setCardingBusyId] = useState<string | null>(null);
const [catalogExpandedId, setCatalogExpandedId] = useState<string | null>(null);
const [myTerminalIds, setMyTerminalIds] = useState<Set<string>>(new Set());



  function normState(s: string) {
    return String(s || "").trim().toUpperCase();
  }
  function normCity(s: string) {
    return String(s || "").trim();
  }

  const starBtnClass = (active: boolean) =>
    [
      "h-8 w-8 flex items-center justify-center rounded-lg border transition",
      active
        ? "border-yellow-400/40 text-yellow-300 hover:bg-yellow-400/10"
        : "border-white/10 text-white/40 hover:bg-white/5 hover:text-white/80",
    ].join(" ");




const CITY_STARS_KEY_PREFIX = "protankr_city_stars_v1::";

function getCityStarsKey() {
  // per-user if logged in, otherwise anon
  return `${CITY_STARS_KEY_PREFIX}${authUserId || "anon"}`;
}

function cityKey(state: string, city: string) {
  return `${normState(state)}||${normCity(city)}`;
}

// Keep starred cities in React state so the UI updates immediately.
// Persist to localStorage so it survives refresh.
const [starredCitySet, setStarredCitySet] = useState<Set<string>>(new Set());

useEffect(() => {
  try {
    const raw = localStorage.getItem(getCityStarsKey());
    const parsed = raw ? JSON.parse(raw) : [];
    const keys = Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
    setStarredCitySet(new Set(keys));
  } catch {
    setStarredCitySet(new Set());
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [authUserId]); // reload if user changes

function persistStarredCitySet(next: Set<string>) {
  try {
    localStorage.setItem(getCityStarsKey(), JSON.stringify(Array.from(next)));
  } catch {
    // ignore
  }
}

function isCityStarred(state: string, city: string) {
  return starredCitySet.has(cityKey(state, city));
}

function toggleCityStar(state: string, city: string) {
  const key = cityKey(state, city);
  setStarredCitySet((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    persistStarredCitySet(next);
    return next;
  });
}

  
  // -----------------------
  // Data (from Supabase)
  // -----------------------

  // Equipment combos
  const [combos, setCombos] = useState<ComboRow[]>([]);
  const [combosLoading, setCombosLoading] = useState(true);
  const [combosError, setCombosError] = useState<string | null>(null);
  const [selectedComboId, setSelectedComboId] = useState("");

  // Compartments
  const [compartments, setCompartments] = useState<CompRow[]>([]);
  const [compLoading, setCompLoading] = useState(false);
  const [compError, setCompError] = useState<string | null>(null);

  // Terminals + selectors
  const [terminals, setTerminals] = useState<TerminalRow[]>([]);
  const [termLoading, setTermLoading] = useState(false);
  const [termError, setTermError] = useState<string | null>(null);

  const [selectedState, setSelectedState] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [selectedTerminalId, setSelectedTerminalId] = useState("");

  // Ambient temp reference (cached)
  const [ambientTempF, setAmbientTempF] = useState<number | null>(null);
  const [ambientTempLoading, setAmbientTempLoading] = useState(false);


  // States catalog (source of truth for showing all 50 states)
  const [statesCatalog, setStatesCatalog] = useState<StateRow[]>([]);
  const [statesLoading, setStatesLoading] = useState(false);
  const [statesError, setStatesError] = useState<string | null>(null);


  const [citiesCatalog, setCitiesCatalog] = useState<CityRow[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [citiesError, setCitiesError] = useState<string | null>(null);

  // Location modal UX
  const [statePickerOpen, setStatePickerOpen] = useState(false);

// =======================
// Load (begin_load RPC)
// =======================
const [activeLoadId, setActiveLoadId] = useState<string | null>(null);
const [beginLoadBusy, setBeginLoadBusy] = useState(false);

// Derive city_id from citiesCatalog using selectedState + selectedCity
const selectedCityId = useMemo<string | null>(() => {
  if (!selectedState || !selectedCity) return null;
  const st = normState(selectedState);
  const ct = normCity(selectedCity);
  const row = (citiesCatalog as any[]).find(
    (c) => normState(String(c?.state_code ?? "")) === st && normCity(String(c?.city_name ?? "")) === ct
  );
  return row?.city_id ? String(row.city_id) : null;
}, [citiesCatalog, selectedState, selectedCity]);


// Persistence (localStorage; per-user when logged in, anon fallback if not)
const skipResetRef = useRef(false);
const locationHydratingRef = useRef(false);
const locationHydratedOnceRef = useRef(false);
const locationUserTouchedRef = useRef(false);


  // =======================
  // Step 5: Equipment persistence (selectedComboId)
  // =======================
  const equipHydratingRef = useRef(false);
  const equipHydratedForKeyRef = useRef<string>("");

  function getEquipStorageKey(userId: string) {
    return `protankr_equip_v1:${userId || "anon"}`;
  }

  function readPersistedEquip(key: string): { comboId: string } | null {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const comboId = String((parsed as any)?.comboId || "");
      return comboId ? { comboId } : null;
    } catch {
      return null;
    }
  }

  function writePersistedEquip(key: string, comboId: string) {
    try {
      localStorage.setItem(key, JSON.stringify({ comboId }));
    } catch {
      // ignore
    }
  }


function getLocationStorageKey(userId: string) {
  return `protankr_location_v2:${userId || "anon"}`;
}

const locationStorageKey = useMemo(() => getLocationStorageKey(authUserId), [authUserId]);

  const anonEquipKey = useMemo(() => getEquipStorageKey("anon"), []);
  const userEquipKey = useMemo(() => getEquipStorageKey(authUserId), [authUserId]);
  const effectiveEquipKey = authUserId ? userEquipKey : anonEquipKey;


const [expandedTerminalId, setExpandedTerminalId] = useState<string | null>(null);

useEffect(() => {
  // terminals = rows from my_terminals_with_status
  setMyTerminalIds(new Set(terminals.map((t: any) => String(t.terminal_id))));
}, [terminals]);


  async function toggleTerminalStar(terminalId: string, currentlyStarred: boolean) {
  // Ensure we have the current user id (needed for INSERT policies)
  let uid = authUserId;
  if (!uid) {
    const { data } = await supabase.auth.getUser();
    uid = data.user?.id ?? "";
    if (uid) setAuthUserId(uid);
  }

  if (!uid) {
    setTermError("Not logged in.");
    return;
  }

  // Optimistic UI update (unstar removes row from My Terminals list)
  setTerminals((prev) =>
    prev.filter((t) => String(t.terminal_id) !== String(terminalId) || currentlyStarred)
  );

  if (currentlyStarred) {
    const { error } = await supabase
      .from("my_terminals")
      .delete()
      .eq("user_id", uid)
      .eq("terminal_id", terminalId);

    if (error) {
      setTermError(error.message);
      await loadMyTerminals();
    }
    return;
  }

  const { error } = await supabase
    .from("my_terminals")
    .upsert({ user_id: uid, terminal_id: terminalId, is_starred: true }, { onConflict: "user_id,terminal_id" });

  if (error) {
    setTermError(error.message);
    await loadMyTerminals();
    return;
  }

  await loadMyTerminals();
}




async function setAccessDateForTerminal_(terminalId: string, isoDate: string) {
  if (!authUserId) return;
  const tid = String(terminalId);
  // optimistic
  setAccessDateByTerminalId((prev) => ({ ...prev, [tid]: isoDate }));

  // guard: must be YYYY-MM-DD
if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return;

const uid = authUserId; // local alias for clarity

const res = await supabase
  .from("terminal_access")
  .upsert(
    { user_id: uid, terminal_id: tid, carded_on: isoDate },
    { onConflict: "user_id,terminal_id" }
  )
  .select();


if (res.error) {
  console.error("setAccessDateForTerminal_ error:", res.error);
  console.error("setAccessDateForTerminal_ debug:", { isoDate, uid, tid });
  return;
}

await loadMyTerminals();


    // leave optimistic state; next refresh will correct
  }
async function loadMyTerminalsMembership() {
  setTermError(null);
  setTermLoading(true);

  const uid = authUserId;
  if (!uid) {
    setTermLoading(false);
    return;
  }

  const { data, error } = await supabase
    .from("my_terminals")
    .select(`
      terminal_id,
      is_starred,
      terminals:terminals (
        terminal_id,
        terminal_name,
        city,
        state,
        renewal_days
      )
    `)
    .eq("user_id", uid);

  if (error) {
    setTermError(error.message);
    setTermLoading(false);
    return;
  }

  // Flatten into the same shape your UI expects
  const rows =
    (data ?? []).map((r: any) => ({
      terminal_id: r.terminal_id,
      terminal_name: r.terminals?.terminal_name,
      city: r.terminals?.city,
      state: r.terminals?.state,
      renewal_days: r.terminals?.renewal_days,
      // these will be filled by access map / status logic below
      carded_on: null,
      status: "not_carded",
      expires_on: null,
    })) ?? [];

  setTerminals(rows as any);
  setTermLoading(false);
}

async function doGetCardedForTerminal(terminalId: string) {
  try {
    setTermError(null);
    setCardingBusyId(String(terminalId));

    const cardedOnISO = new Date().toISOString().slice(0, 10);

    const { error: rpcError } = await supabase.rpc("get_carded", {
      p_terminal_id: terminalId,
      p_carded_on: cardedOnISO,
    });

    if (rpcError) {
      setTermError(rpcError.message);
      return;
    }

    await loadMyTerminals();
    setSelectedTerminalId(String(terminalId));
    setTermOpen(false);
  } finally {
    setCardingBusyId(null);
  }
}

// Terminal catalog (for Location picker only)
const [terminalCatalog, setTerminalCatalog] = useState<TerminalCatalogRow[]>([]);
const [catalogLoading, setCatalogLoading] = useState(false);
const [catalogError, setCatalogError] = useState<string | null>(null);
const [accessDateByTerminalId, setAccessDateByTerminalId] = useState<Record<string, string>>({});
const [catalogEditingDateId, setCatalogEditingDateId] = useState<string | null>(null);



  // Terminal products
  const [terminalProducts, setTerminalProducts] = useState<ProductRow[]>([]);
  const [tpLoading, setTpLoading] = useState(false);
  const [tpError, setTpError] = useState<string | null>(null);

  // -----------------------
  // Planning inputs
  // -----------------------

  // Temperature (applies to all compartments for now)
  const [tempF, setTempF] = useState<number>(60);
  const [tempDialOpen, setTempDialOpen] = useState(false);

 
  // Per-compartment planning inputs
  const [compPlan, setCompPlan] = useState<Record<number, CompPlanInput>>({});


  // Per-compartment headspace override (0..0.30). Does NOT change true max_gallons; used for planning.
  const [compHeadspacePct, setCompHeadspacePct] = useState<Record<number, number>>({});

  // Compartment modal
  const [compModalOpen, setCompModalOpen] = useState(false);
  const [compModalComp, setCompModalComp] = useState<number | null>(null);

  // Volume-bias "CG" slider
  const [cgSlider, setCgSlider] = useState<number>(0.5); // 0..1 ; 0.5 is neutral (center)
  
  // SNAPSHOT SYSTEM (DO NOT REFACTOR CASUALLY)
// - localStorage = hot cache
// - Supabase = background sync
// - payload versioned
// - scoped by user + terminal + combo

  
  /************************************************************
   * Step 6a — Local Snapshot Slots (foundation)
   * - Autosave "last" plan per terminal (slot 0) to localStorage
   * - 1..5 quick slots: tap loads if exists; if empty, tap saves current plan
   * - Right-click / long-press behavior can be added later (for now: Shift+Click overwrites)
   ************************************************************/
  type PlanSnapshot = {
    v: 1;
    savedAt: number;
    terminalId: string;
    tempF: number;
    cgSlider: number;
    compPlan: Record<number, CompPlanInput>;
  };

  const PLAN_SLOTS = [1, 2, 3, 4, 5] as const;

  const planScopeKey = useMemo(() => {
    // per user if logged in, else anon
    const who = authUserId ? `u:${authUserId}` : "anon";
    const term = selectedTerminalId ? `t:${selectedTerminalId}` : "t:none";
    return `proTankr:${who}:${term}`;
  
    const cid = String(selectedComboId || "");
}, [authUserId, selectedTerminalId, selectedComboId]);

  const [slotBump, setSlotBump] = useState(0);


  const planStoreKey = useCallback(
    (slot: number) => `${planScopeKey}:plan:slot:${slot}`,
    [planScopeKey]
  );

  

function parsePlanPayload(raw: string | null) {
  if (!raw) return null;
  try {
    const obj: any = JSON.parse(raw);
    // Back-compat: older payloads were just { tempF, cgSlider, compPlan }
    if (obj && typeof obj === "object" && obj.version == null) {
      return {
        version: 0,
        savedAtISO: "",
        terminalId: String(selectedTerminalId || ""),
        comboId: String(selectedComboId || ""),
        tempF: typeof obj.tempF === "number" ? obj.tempF : undefined,
        cgSlider: typeof obj.cgSlider === "number" ? obj.cgSlider : undefined,
        compPlan: obj.compPlan ?? undefined,
      };
    }


// =======================
// Step 7: Supabase sync for plan slots (cross-device), while keeping localStorage as hot cache
// =======================
const serverSyncEnabled = Boolean(authUserId); // only when logged in

const serverSyncInFlightRef = useRef(false);
const serverLastPulledScopeRef = useRef<string>(""); // to avoid repeated pulls
const serverWriteDebounceRef = useRef<any>(null);

async function serverFetchSlots_(): Promise<Record<number, any>> {
  if (!authUserId || !selectedTerminalId || !selectedComboId) return {};
  const { data, error } = await supabase
    .from("user_plan_slots")
    .select("slot,payload,updated_at")
    .eq("user_id", authUserId)
    .eq("terminal_id", String(selectedTerminalId))
    .eq("combo_id", String(selectedComboId))
    .in("slot", [0, 1, 2, 3, 4, 5]);

  if (error) {
    console.warn("serverFetchSlots error:", error.message);
    return {};
  }
  const out: Record<number, any> = {};
  (data || []).forEach((r: any) => {
    out[Number(r.slot)] = r.payload ?? null;
  });
  return out;
}

async function serverUpsertSlot_(slot: number, payload: any) {
  if (!authUserId || !selectedTerminalId || !selectedComboId) return;
  const row = {
    user_id: authUserId,
    terminal_id: String(selectedTerminalId),
    combo_id: String(selectedComboId),
    slot,
    payload,
  };
  const { error } = await supabase.from("user_plan_slots").upsert(row, {
    onConflict: "user_id,terminal_id,combo_id,slot",
  });
  if (error) console.warn("serverUpsertSlot error:", error.message);
}

async function serverDeleteSlot_(slot: number) {
  if (!authUserId || !selectedTerminalId || !selectedComboId) return;
  const { error } = await supabase
    .from("user_plan_slots")
    .delete()
    .eq("user_id", authUserId)
    .eq("terminal_id", String(selectedTerminalId))
    .eq("combo_id", String(selectedComboId))
    .eq("slot", slot);
  if (error) console.warn("serverDeleteSlot error:", error.message);
}

function compareSavedAt_(a: any, b: any) {
  const aISO = String(a?.savedAtISO || "");
  const bISO = String(b?.savedAtISO || "");
  const at = aISO ? Date.parse(aISO) : 0;
  const bt = bISO ? Date.parse(bISO) : 0;
  return at - bt; // >0 means a newer
}

// Pull server slots once per scope; merge into localStorage (server wins if newer)
useEffect(() => {
  if (!serverSyncEnabled) return;
  if (!planScopeKey) return;
  if (!selectedTerminalId || !selectedComboId) return;
  if (serverSyncInFlightRef.current) return;
  if (serverLastPulledScopeRef.current === planScopeKey) return;

  serverSyncInFlightRef.current = true;

  (async () => {
    try {
      const server = await serverFetchSlots_();

      for (const s of [0, 1, 2, 3, 4, 5]) {
        const sp = server[s];
        if (!sp) continue;

        const localRaw = typeof window !== "undefined" ? localStorage.getItem(planStoreKey(s)) : null;
        const lp = parsePlanPayload(localRaw);

        if (!lp || compareSavedAt_(sp, lp) > 0) {
          try {
            localStorage.setItem(planStoreKey(s), JSON.stringify(sp));
            setSlotBump((v) => v + 1);
          } catch {}
        }
      }

      // After merging slot0, apply it if it's safe
      const local0 = parsePlanPayload(typeof window !== "undefined" ? localStorage.getItem(planStoreKey(0)) : null);
      if (local0 && compartments?.length) {
        const safeToApply =
          !planDirtyRef.current ||
          Object.keys(compPlan || {}).length === 0 ||
          (lastAppliedScopeRef.current !== planScopeKey);

        if (safeToApply) {
          if (typeof local0.tempF === "number") setTempF(local0.tempF);
          if (typeof local0.cgSlider === "number") setCgSlider(local0.cgSlider);
          if (local0.compPlan && typeof local0.compPlan === "object") setCompPlan(local0.compPlan);
          planDirtyRef.current = false;
          lastAppliedScopeRef.current = planScopeKey;
        }
      }

      serverLastPulledScopeRef.current = planScopeKey;
    } finally {
      serverSyncInFlightRef.current = false;
    }
  })();
}, [serverSyncEnabled, planScopeKey, selectedTerminalId, selectedComboId, compartments, slotBump]);

async function syncSlotToServer_(slot: number) {
  if (!serverSyncEnabled) return;
  const payload = parsePlanPayload(typeof window !== "undefined" ? localStorage.getItem(planStoreKey(slot)) : null);
  if (!payload) return;
  await serverUpsertSlot_(slot, payload);
}

async function afterLocalSlotWrite_(slot: number) {
  if (!serverSyncEnabled) return;
  if (slot === 0) {
    if (serverWriteDebounceRef.current) clearTimeout(serverWriteDebounceRef.current);
    serverWriteDebounceRef.current = setTimeout(() => {
      syncSlotToServer_(0);
    }, 1200);
    return;
  }
  await syncSlotToServer_(slot);
}

async function afterLocalSlotDelete_(slot: number) {
  if (!serverSyncEnabled) return;
  await serverDeleteSlot_(slot);
}
    return obj;
  } catch {
    return null;
  }
}
const safeReadJSON_ = useCallback((key: string) => {
    try {
      if (typeof window === "undefined") return null;
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }, []);

  const safeWriteJSON_ = useCallback((key: string, value: any) => {
    try {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore
    }
  }, []);

  const [slotHas, setSlotHas] = useState<Record<number, boolean>>({});

  const refreshSlotHas_ = useCallback(() => {
    if (!selectedTerminalId) {
      setSlotHas({});
      return;
    }
    const next: Record<number, boolean> = {};
    for (const s of PLAN_SLOTS) next[s] = !!safeReadJSON_(planStoreKey(s));
    setSlotHas(next);
  }, [PLAN_SLOTS, planStoreKey, safeReadJSON_, selectedTerminalId]);

  const planRestoreReadyRef = useRef<string | null>(null);
  const planDirtyRef = useRef<boolean>(false);
  const autosaveTimerRef = useRef<any>(null);
const lastAppliedScopeRef = useRef<string>("");

  const buildSnapshot_ = useCallback(
    (terminalId: string): PlanSnapshot => ({
      v: 1,
      savedAt: Date.now(),
      terminalId,
      tempF: Number(tempF) || 60,
      cgSlider: Number(cgSlider) || 0.25,
      compPlan,
    }),
    [tempF, cgSlider, compPlan]
  );

  const applySnapshot_ = useCallback(
    (snap: PlanSnapshot) => {
      setTempF(Number(snap.tempF) || 60);
      setCgSlider(Number(snap.cgSlider) || 0.25);
      setCompPlan(snap.compPlan || {});
    },
    [setTempF, setCgSlider, setCompPlan]
  );

  // Restore slot 0 ("last") whenever terminal changes.
  useEffect(() => {
    if (!selectedTerminalId) return;

    const key = planStoreKey(0);
    const raw = safeReadJSON_(key) as PlanSnapshot | null;
    planRestoreReadyRef.current = planScopeKey;

    if (raw && raw.v === 1 && String(raw.terminalId) === String(selectedTerminalId)) {
      applySnapshot_(raw);
    }

    // allow autosave after initial restore
    queueMicrotask(() => {
      if (planRestoreReadyRef.current === planScopeKey) planRestoreReadyRef.current = null;
    });

    refreshSlotHas_();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTerminalId, planScopeKey]);

  // Mark dirty when plan inputs change (after restore is complete)
  useEffect(() => {
    if (!selectedTerminalId) return;
    if (planRestoreReadyRef.current) return; // still restoring
    planDirtyRef.current = true;
  }, [selectedTerminalId, tempF, cgSlider, compPlan]);

  // Debounced autosave of slot 0 ("last")
  useEffect(() => {
    if (!selectedTerminalId) return;
    if (planRestoreReadyRef.current) return;

    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      if (!selectedTerminalId) return;
      if (!planDirtyRef.current) return;
      const snap = buildSnapshot_(String(selectedTerminalId));
      safeWriteJSON_(planStoreKey(0), snap);
      planDirtyRef.current = false;
      refreshSlotHas_();
    }, 350);

    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [selectedTerminalId, tempF, cgSlider, compPlan, buildSnapshot_, planStoreKey, safeWriteJSON_, refreshSlotHas_]);

  const saveToSlot_ = useCallback(
    (slot: number) => {
      if (!selectedTerminalId) return;
      const snap = buildSnapshot_(String(selectedTerminalId));
      safeWriteJSON_(planStoreKey(slot), snap);
      refreshSlotHas_();
    },
    [selectedTerminalId, buildSnapshot_, safeWriteJSON_, planStoreKey, refreshSlotHas_]
  );

  const loadFromSlot_ = useCallback(
    (slot: number) => {
      if (!selectedTerminalId) return;
      const raw = safeReadJSON_(planStoreKey(slot)) as PlanSnapshot | null;
      if (!raw || raw.v !== 1) return;
      if (String(raw.terminalId) !== String(selectedTerminalId)) return;
      planRestoreReadyRef.current = planScopeKey;
      applySnapshot_(raw);
      queueMicrotask(() => {
        if (planRestoreReadyRef.current === planScopeKey) planRestoreReadyRef.current = null;
      });
    },
    [selectedTerminalId, planStoreKey, safeReadJSON_, applySnapshot_, planScopeKey]
  );

  const SnapshotSlots = (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Plan slots</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {PLAN_SLOTS.map((n) => {
          const has = !!slotHas[n];
          const disabled = !selectedTerminalId;
          return (
            <button
              key={n}
              type="button"
              disabled={disabled}
              onClick={(e) => {
                // If empty -> save. If exists -> load.
                // Hold Shift to overwrite/save even if it exists.
                if (e.shiftKey || !has) saveToSlot_(n);
                else loadFromSlot_(n);
              }}
              style={{
                borderRadius: 12,
                padding: "8px 12px",
                border: "1px solid rgba(255,255,255,0.12)",
                background: has ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
                color: "white",
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.5 : 1,
                minWidth: 44,
              }}
              title={
                !selectedTerminalId
                  ? "Select a terminal first"
                  : has
                  ? "Tap to load. Shift+Tap to overwrite."
                  : "Tap to save current plan"
              }
            >
              {n}
            </button>
          );
        })}
      </div>
      <div style={{ marginTop: 6, fontSize: 12, opacity: 0.6 }}>
        Tip: Tap an empty number to save. Tap a filled number to load. Hold <strong>Shift</strong> to overwrite.
      </div>
    </div>
  );
  

  // -----------------------
  // Derived selections
  // -----------------------
const myTerminalIdSet = useMemo(
  () => new Set((terminals ?? []).map((x) => String(x.terminal_id))),
  [terminals]
);


  const selectedCombo = useMemo(
    () => combos.find((c) => String(c.combo_id) === String(selectedComboId)) ?? null,
    [combos, selectedComboId]
  );

  const selectedTrailerId = selectedCombo?.trailer_id ?? null;

  const selectedTerminal = useMemo(
    () => terminals.find((t) => String(t.terminal_id) === String(selectedTerminalId)) ?? null,
    [terminals, selectedTerminalId]
  );

const equipmentLabel =
  selectedCombo?.combo_name ??
  (selectedCombo
    ? `Truck ${selectedCombo.truck_id ?? "?"} + Trailer ${selectedCombo.trailer_id ?? "?"}`
    : undefined);

const locationLabel =
  selectedCity && selectedState ? `${selectedCity}, ${selectedState}` : undefined;

const terminalLabel =
  selectedTerminal?.terminal_name
    ? String(selectedTerminal.terminal_name)
    : selectedTerminalId
? "Terminal"
: undefined;


const terminalEnabled = Boolean(locationLabel);

const terminalDisplayISO = (() => {
  if (!selectedTerminal) return null;

  const tid = String(selectedTerminalId);

  const cat =
    terminalCatalog.find((x) => String(x.terminal_id) === tid) ?? null;

  const activationISO =
    accessDateByTerminalId[tid] ||
    (selectedTerminal as any)?.carded_on ||
    (selectedTerminal as any)?.added_on ||
    "";

  const expiresISO =
    (selectedTerminal as any)?.expires_on ||
    (selectedTerminal as any)?.expires ||
    (selectedTerminal as any)?.expires_at ||
    "";

  const renewalDays = Number(
    (selectedTerminal as any)?.renewal_days ??
      (selectedTerminal as any)?.renewalDays ??
      (cat as any)?.renewal_days ??
      90
  ) || 90;

  const computedExpiresISO =
    activationISO && /^\d{4}-\d{2}-\d{2}$/.test(activationISO)
      ? addDaysISO_(activationISO, renewalDays)
      : "";

  return expiresISO || computedExpiresISO || terminalDisplayDate_(selectedTerminal);
})();

const terminalCardedText = terminalDisplayISO ? formatMDYWithCountdown_(terminalDisplayISO) : undefined;
const terminalCardedClass = terminalCardedText
  ? (isPastISO_(terminalDisplayISO) ? "text-red-500" : "text-white/50")
  : undefined;




  
function sortMyTerminals(rows: TerminalRow[]) {
  const statusRank = (s: TerminalRow["status"]) => {
    if (s === "valid") return 0;
    if (s === "expired") return 1;
    return 2; // not_carded
  };

  return [...rows].sort((a, b) => {
    const aStar = Boolean(a.starred);
    const bStar = Boolean(b.starred);
    if (aStar !== bStar) return aStar ? -1 : 1;

    const sr = statusRank(a.status) - statusRank(b.status);
    if (sr !== 0) return sr;

    const an = String(a.terminal_name ?? "");
    const bn = String(b.terminal_name ?? "");
    return an.localeCompare(bn);
  });
}

// -----------------------
  // Helpers
  // -----------------------

function todayYMD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function toLocalMidnight(dateLike: string) {
  // Accepts "YYYY-MM-DD" OR "YYYY-MM-DDTHH:mm:ss..." and normalizes to local midnight
  const ymd = dateLike.slice(0, 10);
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
}

function todayLocalMidnight() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate(), 0, 0, 0, 0);
}



function formatMDY(dateLike: string) {
  const ymd = dateLike.slice(0, 10);
  const [y, m, d] = ymd.split("-");
  return `${m}-${d}-${y}`;
}


function isoToday_() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function addDaysISO_(iso: string, days: number) {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-").map((v) => Number(v));
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + (Number(days) || 0));
  return dt.toISOString().slice(0, 10);
}

function daysUntilISO_(iso: string | null | undefined) {
  if (!iso) return null;
  const todayISO = isoToday_();
  const [ty, tm, td] = todayISO.slice(0, 10).split("-").map((v) => Number(v));
  const [y, m, d] = iso.slice(0, 10).split("-").map((v) => Number(v));
  const a = new Date(ty, (tm || 1) - 1, td || 1);
  const b = new Date(y, (m || 1) - 1, d || 1);
  const ms = b.getTime() - a.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function formatMDYWithCountdown_(iso: string) {
  const mdy = formatMDY(iso);
  const d = daysUntilISO_(iso);
  if (d === null) return mdy;
  return `${mdy} (${d} days)`;
}

function isPastISO_(iso: string | null | undefined) {
  if (!iso) return false;
  // Lexicographic compare works for YYYY-MM-DD
  return iso < isoToday_();
}

function normalizeStatus_(raw: any): "valid" | "expired" | "not_carded" {
  const s =
    raw?.status ??
    raw?.card_status ??
    raw?.access_status ??
    raw?.carded_status ??
    raw?.terminal_status ??
    raw?.my_terminal_status;

  if (s === "valid" || s === "expired" || s === "not_carded") return s;

  // Fallback: if we have any date, assume valid (we'll still color red if date is past)
  return raw?.carded_on ? "valid" : "not_carded";
}

function normalizeTerminalRow_(raw: any): TerminalRow {
  const expires =
    raw?.expires_on ?? raw?.expires_at ?? raw?.expiration_on ?? raw?.expiration_date ?? raw?.expiry_on ?? null;

  return {
    terminal_id: String(raw?.terminal_id ?? ""),
    state: raw?.state ?? null,
    city: raw?.city ?? null,
    terminal_name: raw?.terminal_name ?? raw?.name ?? null,
    carded_on: raw?.carded_on ?? null,
    expires_on: expires,
    status: normalizeStatus_(raw),
    starred: raw?.starred ?? raw?.is_starred ?? null,
  };
}

function terminalDisplayDate_(t: TerminalRow) {
  // Prefer expires_on if present, else fall back to carded_on
  return (t.expires_on ?? t.carded_on) || null;
}




const productNameById = useMemo(() => {
  const m = new Map<string, string>();
  for (const p of terminalProducts) {
    if (p.product_id) m.set(p.product_id, p.product_name ?? p.product_id);
  }
  return m;
}, [terminalProducts]);



  function lbsPerGallonAtTemp(api60: number, alphaPerF: number, tempF: number) {
    const sg60 = 141.5 / (api60 + 131.5);
    const rho60 = sg60 * 8.345404;
    const rhoT = rho60 / (1 + alphaPerF * (tempF - 60));
    return rhoT;
  }

  function lbsPerGalForProductId(productId: string): number | null {
    const p = terminalProducts.find((x) => x.product_id === productId);
    if (!p || p.api_60 == null || p.alpha_per_f == null) return null;
    return lbsPerGallonAtTemp(Number(p.api_60), Number(p.alpha_per_f), Number(tempF));
  }

  // -----------------------
  // Phase 5.2: allowed lbs
  // (We keep allowed lbs now; max gallons from weight will be handled once distribution is in place.)
  // -----------------------

  const gross = Number(selectedCombo?.gross_limit_lbs ?? 0);
  const tare = Number(selectedCombo?.tare_lbs ?? 0);
  const buffer = Number(selectedCombo?.buffer_lbs ?? 0);

  const allowedLbs = Math.max(0, gross - tare - buffer);
  const allowedLbsText = allowedLbs.toLocaleString();

  // -----------------------
  // Phase 5.3: trailer capacity
  // -----------------------

  const trailerCapacityGallons = useMemo(() => {
    return compartments.reduce((sum, c) => sum + Number(c.max_gallons ?? 0), 0);
  }, [compartments]);

  const trailerCapacityGallonsText = trailerCapacityGallons.toLocaleString();

 
  // -----------------------
  // Active compartments (non-empty with a chosen product and valid lbs/gal)
  // -----------------------

  
  const headspacePctForComp = useCallback(
    (compNumber: number) => {
      const raw = Number(compHeadspacePct[compNumber] ?? 0);
      if (!Number.isFinite(raw)) return 0;
      return Math.max(0, Math.min(0.3, raw));
    },
    [compHeadspacePct]
  );

  const effectiveMaxGallonsForComp = useCallback(
    (compNumber: number, trueMaxGallons: number) => {
      const pct = headspacePctForComp(compNumber);
      const eff = trueMaxGallons * (1 - pct);
      // Keep it stable & display-friendly
      return Math.max(0, Math.floor(eff));
    },
    [headspacePctForComp]
  );

type ActiveComp = {
    compNumber: number;
    maxGallons: number;
    position: number;
    productId: string;
    lbsPerGal: number;
  };

  const activeComps = useMemo<ActiveComp[]>(() => {
    if (!selectedTrailerId) return [];
    if (compartments.length === 0) return [];
    if (terminalProducts.length === 0) return [];

    const out: ActiveComp[] = [];

    for (const c of compartments) {
      const compNumber = Number(c.comp_number);
      const trueMaxGallons = Number(c.max_gallons ?? 0);
      const maxGallons = effectiveMaxGallonsForComp(compNumber, trueMaxGallons);
      // We want +position = FRONT, -position = REAR.
// If your DB currently has +position = REAR, flip it here.
const positionRaw = Number(c.position ?? 0);
const position = -positionRaw;


      if (!Number.isFinite(compNumber) || maxGallons <= 0) continue;

      const sel = compPlan[compNumber];
      if (!sel) continue;
      if (sel.empty) continue;
      if (!sel.productId) continue;

      const lbsPerGal = lbsPerGalForProductId(sel.productId);
      if (lbsPerGal == null || !(lbsPerGal > 0)) continue;

      out.push({
        compNumber,
        maxGallons,
        position: Number.isFinite(position) ? position : 0,
        productId: sel.productId,
        lbsPerGal,
      });
    }

    // Rear -> front by position (stable, not allocating yet)
    out.sort((a, b) => a.position - b.position);

    return out;
  }, [selectedTrailerId, compartments, terminalProducts, compPlan, tempF]);
// -----------------------
// Slider -> bias + unstable warning
// -----------------------
// Goal: zero bias at center, and gentler sensitivity so the slider travel is actually usable.
const CG_NEUTRAL = 0.5;      // 50% = 0 bias (center)
const CG_FRONT_MAX = 0.9;    // stage 1 ends at 90% (bias +1)
const CG_REAR_MAX = 0.0;     // 0%  = -1 bias
const PLOW_BIAS_MAX = 2.5;   // 100% = +2.5 bias (stronger than +1)
const CG_CURVE = 1.8;        // >1 = less sensitive near center

const cgBias = useMemo(() => {
  const s = Math.max(0, Math.min(1, Number(cgSlider) || 0));

  // Rear side: [0.00 .. 0.50] -> [-1 .. 0] with curve
  if (s < CG_NEUTRAL) {
    const t = (CG_NEUTRAL - s) / (CG_NEUTRAL - CG_REAR_MAX); // 0..1
    const curved = Math.pow(Math.max(0, Math.min(1, t)), CG_CURVE);
    return -curved;
  }

  // Front side stage 1: [0.50 .. 0.90] -> [0 .. +1] with curve
  if (s <= CG_FRONT_MAX) {
    const t = (s - CG_NEUTRAL) / (CG_FRONT_MAX - CG_NEUTRAL); // 0..1
    const curved = Math.pow(Math.max(0, Math.min(1, t)), CG_CURVE);
    return curved;
  }

  // Front side stage 2 ("plow"): [0.90 .. 1.00] -> [+1 .. +PLOW_BIAS_MAX] with curve
  const t2 = (s - CG_FRONT_MAX) / (1 - CG_FRONT_MAX); // 0..1
  const curved2 = Math.pow(Math.max(0, Math.min(1, t2)), CG_CURVE);
  return 1 + curved2 * (PLOW_BIAS_MAX - 1);
}, [cgSlider]);

const unstableLoad = cgSlider < CG_NEUTRAL;

 // -----------------------
// Phase 5.6: slider-based plan that respects:
// - per-compartment max gallons
// - equal "height" at neutral (same fill %)
// - CG slider shifts volume by position
// - total weight <= allowedLbs
// -----------------------

const TILT_GAIN = 0.85;

type PlanCalcRow = PlanRow & { lbsPerGal: number; position: number };

function allocateWithCaps(
  totalGallons: number,
  comps: {
    compNumber: number;
    maxGallons: number;
    position: number;
    lbsPerGal: number;
    productId: string;   // ✅ ADD THIS
    weight: number;
  }[]
) {
  // Water-fill style allocation:
  // target is g_i proportional to weight_i, capped at maxGallons.
  let remaining = Math.max(0, totalGallons);

  const rows = comps.map((c) => ({
  comp_number: c.compNumber,
  max_gallons: c.maxGallons,
  planned_gallons: 0,
  lbsPerGal: c.lbsPerGal,
  position: c.position,
  productId: c.productId,   // ✅ add this
  weight: c.weight,
}));


  let active = rows.filter((r) => r.max_gallons > 0);

  // safety
  for (let guard = 0; guard < 20; guard++) {
    if (remaining <= 1e-6) break;
    if (active.length === 0) break;

    const denom = active.reduce((s, r) => s + r.weight, 0);
    if (!(denom > 0)) break;

    const k = remaining / denom;

    let anyCapped = false;

    for (const r of active) {
      const want = k * r.weight;
      const room = r.max_gallons - r.planned_gallons;
      const add = Math.max(0, Math.min(room, want));
      r.planned_gallons += add;
    }

    const plannedNow = rows.reduce((s, r) => s + r.planned_gallons, 0);
    remaining = Math.max(0, totalGallons - plannedNow);

    // Remove any rows that are fully capped
    const nextActive = active.filter((r) => r.planned_gallons < r.max_gallons - 1e-6);
    anyCapped = nextActive.length !== active.length;
    active = nextActive;

    if (!anyCapped) break;
  }

  return rows;
}

function planForGallons(
  totalGallons: number,
  comps: { compNumber: number; maxGallons: number; position: number; lbsPerGal: number; productId: string }[], // ✅ ADD productId
  bias: number
): PlanCalcRow[] {
  const PLOW_BIAS_MAX = 2.5; // must match your slider mapping
  const b = Math.max(-1, Math.min(PLOW_BIAS_MAX, Number(bias) || 0));

  const withWeights = comps.map((c) => {
    const raw = 1 + b * c.position * TILT_GAIN;
    const shape = Math.max(0.05, raw);
    return { ...c, weight: shape * c.maxGallons };
  });

  const rows = allocateWithCaps(totalGallons, withWeights);
  rows.sort((a, b) => a.comp_number - b.comp_number);
  return rows;
}


const capacityGallonsActive = useMemo(() => {
  return activeComps.reduce((s, c) => s + Number(c.maxGallons || 0), 0);
}, [activeComps]);

const plannedResult = useMemo(() => {
  // no plan unless we have active comps + allowed lbs
  if (!selectedTrailerId) return { planRows: [] as PlanRow[], effectiveMaxGallons: 0 };

  if (activeComps.length === 0) {
    return { planRows: [] as PlanRow[], effectiveMaxGallons: 0 };
  }

  const cap = Math.max(0, capacityGallonsActive);
  if (!(cap > 0)) {
    return { planRows: [] as PlanRow[], effectiveMaxGallons: 0 };
  }


  // Binary search max gallons that keeps weight <= allowedLbs
  let lo = 0;
  let hi = cap;

  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    const rows = planForGallons(mid, activeComps, cgBias);
    const lbs = rows.reduce((s, r) => s + r.planned_gallons * r.lbsPerGal, 0);
    if (lbs <= allowedLbs + 1e-6) lo = mid;
    else hi = mid;
  }

  const effectiveMaxGallons = lo;

  // Decide target gallons 
  const requested = effectiveMaxGallons;

  const finalRows = planForGallons(requested, activeComps, cgBias);

  return { planRows: finalRows, effectiveMaxGallons };
}, [selectedTrailerId, activeComps, allowedLbs, cgBias, capacityGallonsActive]);

const planRows = plannedResult.planRows;

const plannedGallonsByComp = useMemo<Record<number, number>>(() => {
  const m: Record<number, number> = {};
  for (const r of planRows as any[]) {
    const n = Number((r as any).comp_number ?? (r as any).compNumber ?? 0);
    const g = Number((r as any).planned_gallons ?? (r as any).plannedGallons ?? 0);
    if (Number.isFinite(n)) m[n] = g;
  }
  return m;
}, [planRows]);


const plannedWeightLbs = useMemo(() => {
  return planRows.reduce((sum, r: any) => {
    const g = Number(r.planned_gallons ?? 0);
    const lpg = Number(r.lbsPerGal ?? 0);
    return sum + g * lpg;
  }, 0);
}, [planRows]);

const plannedWeightText = plannedWeightLbs.toFixed(0);
const weightMarginText = (allowedLbs - plannedWeightLbs).toFixed(0);


const effectiveMaxGallons = plannedResult.effectiveMaxGallons;
const effectiveMaxGallonsText = effectiveMaxGallons > 0 ? effectiveMaxGallons.toFixed(0) : "";

const targetGallons = planRows.reduce((s, r) => s + r.planned_gallons, 0);
const targetGallonsText = targetGallons > 0 ? targetGallons.toFixed(0) : "";
const targetGallonsRoundedText = targetGallonsText;

const plannedGallonsTotal = targetGallons;
const remainingGallons = 0;

const plannedGallonsTotalText = plannedGallonsTotal.toFixed(0);
const remainingGallonsText = remainingGallons.toFixed(0);

  
useEffect(() => {
  (async () => {
    const { data } = await supabase.auth.getUser();
    setAuthEmail(data.user?.email ?? "");
    setAuthUserId(data.user?.id ?? "");
  })();
}, []);


  // --- Fetch combos once ---
  useEffect(() => {
    (async () => {
      setCombosLoading(true);
      setCombosError(null);

      const { data, error } = await supabase
        .from("equipment_combos")
        .select("combo_id, combo_name, truck_id, trailer_id, tare_lbs, gross_limit_lbs, buffer_lbs, active")
        .order("combo_name", { ascending: true })
        .order("combo_id", { ascending: true })
        .limit(200);

      if (error) {
        setCombosError(error.message);
        setCombos([]);
      } else {
        setCombos((data ?? []).filter((r: any) => r.active !== false) as ComboRow[]);
      }

      setCombosLoading(false);
    })();
  }, []);

  // --- Fetch terminals once ---
  async function loadMyTerminals() {
    setTermError(null);
    setTermLoading(true);

    const { data, error } = await supabase
      .from("my_terminals_with_status")
      .select("*")
      .order("state", { ascending: true })
      .order("city", { ascending: true })
      .order("terminal_name", { ascending: true });

    if (error) {
      setTermError(error.message);
      setTerminals([]);
    } else {
      setTerminals(sortMyTerminals((data ?? []).map(normalizeTerminalRow_)));
}

    setTermLoading(false);
  }






  useEffect(() => {
    loadMyTerminals();
  }, []);


  // --- Fetch states catalog (for Location modal + dropdown) ---
  useEffect(() => {
    (async () => {
      setStatesError(null);
      setStatesLoading(true);

      const { data, error } = await supabase
        .from("states")
        .select("state_code, state_name, active")
        .order("state_code", { ascending: true })
        .returns<StateRow[]>();

      if (error) {
        setStatesError(error.message);
        setStatesCatalog([]);
      } else {
        setStatesCatalog((data ?? []).filter((r) => r.active !== false));
      }

      setStatesLoading(false);
    })();
  }, []);




  // --- Fetch cities for selected state from public.cities (source of truth for city list) ---
  useEffect(() => {
    (async () => {
      setCitiesError(null);
      if (!selectedState) {
        setCitiesCatalog([]);
        return;
      }
      setCitiesLoading(true);

      const { data, error } = await supabase
        .from("cities")
        .select("city_id, state_code, city_name, active")
        .eq("state_code", normState(selectedState))
        .neq("active", false)
        .order("city_name", { ascending: true })
        .returns<CityRow[]>();

      if (error) {
        setCitiesError(error.message);
        setCitiesCatalog([]);
      } else {
        setCitiesCatalog((data ?? []).filter((r) => r.city_name));
      }
      setCitiesLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedState]);

// --- Fetch terminal catalog once (for Location modal state/city pickers) ---
useEffect(() => {
  (async () => {
    setCatalogError(null);
    setCatalogLoading(true);

    const { data, error } = await supabase
      .from("terminals")
      .select("terminal_id, state, city, terminal_name, timezone, active")
      .order("state", { ascending: true })
      .order("city", { ascending: true })
      .order("terminal_name", { ascending: true })
      .returns<TerminalCatalogRow[]>();

    if (error) {
      setCatalogError(error.message);
      setTerminalCatalog([]);
    } else {
      setTerminalCatalog((data ?? []).filter((t) => t.active !== false));
    }

    setCatalogLoading(false);
  })();
}, []);

  // Reset city/terminal when state changes; reset terminal when city changes
  useEffect(() => {
    if (skipResetRef.current) return;
    setSelectedCity("");
    setSelectedTerminalId("");
  }, [selectedState]);

  useEffect(() => {
    if (skipResetRef.current) return;
    setSelectedTerminalId("");
  }, [selectedCity]);

function readPersistedLocation(key: string): { state: string; city: string; terminalId: string } | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    const st = normState((parsed as any).state || "");
    const ct = normCity((parsed as any).city || "");
    const tid = String((parsed as any).terminalId || "");

    if (!st) return null;
    return { state: st, city: ct, terminalId: tid };
  } catch {
    return null;
  }
}

function writePersistedLocation(key: string, state: string, city: string, terminalId: string) {
  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        state: normState(state),
        city: normCity(city),
        terminalId: String(terminalId || ""),
      })
    );
  } catch {
    // ignore
  }
}

// =======================
// Ambient temp (OpenWeather) — light in-memory cache w/ TTL
// =======================

// Module-scope cache (per dev-server session / tab session)
const AMBIENT_MEM_CACHE = new Map<string, { ts: number; tempF: number }>();

function ambientMemKey(state: string, city: string) {
  return `${normState(state)}|${normCity(city)}`;
}

function readAmbientMem(state: string, city: string) {
  const k = ambientMemKey(state, city);
  const v = AMBIENT_MEM_CACHE.get(k);
  return v ?? null;
}

function writeAmbientMem(state: string, city: string, tempF: number) {
  const k = ambientMemKey(state, city);
  AMBIENT_MEM_CACHE.set(k, { ts: Date.now(), tempF });
}

async function fetchAmbientTempF(args: {
  state: string;
  city: string;
  key: string;
  signal: AbortSignal;
}): Promise<number | null> {
  const { state, city, key, signal } = args;
  const qCity = String(city || "").trim();
  const qState = String(state || "").trim();
  if (!qCity || !qState) return null;

  // 1) Best-effort: direct city/state query
  try {
    const url =
      `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(qCity)},${encodeURIComponent(
        qState
      )},US&units=imperial&appid=${encodeURIComponent(key)}`;
    const res = await fetch(url, { signal, cache: "no-store" });
    if (res.ok) {
      const json: any = await res.json();
      const temp = Number(json?.main?.temp);
      if (Number.isFinite(temp)) return temp;
    }
  } catch {
    // fall through
  }

  // 2) Fallback: geocode then weather by lat/lon
  try {
    const geoUrl =
      `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(qCity)},${encodeURIComponent(
        qState
      )},US&limit=1&appid=${encodeURIComponent(key)}`;
    const geoRes = await fetch(geoUrl, { signal, cache: "no-store" });
    if (!geoRes.ok) return null;
    const geoJson: any = await geoRes.json();
    const item = Array.isArray(geoJson) ? geoJson[0] : null;
    const lat = Number(item?.lat);
    const lon = Number(item?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

    const wUrl =
      `https://api.openweathermap.org/data/2.5/weather?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(
        String(lon)
      )}&units=imperial&appid=${encodeURIComponent(key)}`;
    const wRes = await fetch(wUrl, { signal, cache: "no-store" });
    if (!wRes.ok) return null;
    const wJson: any = await wRes.json();
    const temp2 = Number(wJson?.main?.temp);
    return Number.isFinite(temp2) ? temp2 : null;
  } catch {
    return null;
  }
}
// --- Persistence helpers (per-user when logged in; anon fallback) ---
const ANON_LOCATION_KEY = "protankr_location_v2:anon";
const LEGACY_LOCATION_KEY = "protankr_location_v1";
const userLocationKey = authUserId ? getLocationStorageKey(authUserId) : "";
const effectiveLocationKey = authUserId ? userLocationKey : ANON_LOCATION_KEY;

// Prevent clobber during boot/auth flip:
// - we only persist AFTER we've hydrated for the current effective key
const hydratedForKeyRef = useRef<string>("");
const citiesLoadedForStateRef = useRef<string>("");
const terminalCatalogLoadedRef = useRef<boolean>(false);

// Mark terminal catalog loaded once
useEffect(() => {
  if (!catalogLoading && terminalCatalog.length > 0) {
    terminalCatalogLoadedRef.current = true;
  }
}, [catalogLoading, terminalCatalog]);

// Track that cities were loaded for the currently selected state
useEffect(() => {
  if (!selectedState) return;
  if (citiesLoading) return;
  // even if there are 0 cities returned, we consider it "loaded" for validation
  citiesLoadedForStateRef.current = normState(selectedState);
}, [selectedState, citiesLoading, citiesCatalog]);

// --- Restore persisted location (runs on mount and when auth resolves) ---
useEffect(() => {
  // If the user already interacted with location in this tab/session, do not override.
  if (locationUserTouchedRef.current) return;

  // If we're already hydrated for this key, don't re-run.
  if (hydratedForKeyRef.current === effectiveLocationKey) return;

  const fromUser = authUserId ? readPersistedLocation(userLocationKey) : null;
  const fromAnon = readPersistedLocation(ANON_LOCATION_KEY);
  const fromLegacy = readPersistedLocation(LEGACY_LOCATION_KEY);

  const loc = fromUser || (authUserId ? fromAnon : null) || fromAnon || fromLegacy;

  locationHydratingRef.current = true;
  skipResetRef.current = true;

  if (loc?.state) {
    setSelectedState(loc.state);
    setSelectedCity(loc.city || "");
    setSelectedTerminalId(loc.terminalId || "");
  }

  // If logged in and user key is missing but anon exists, migrate anon -> user
  if (authUserId && !fromUser && fromAnon) {
    writePersistedLocation(userLocationKey, fromAnon.state, fromAnon.city, fromAnon.terminalId);
  }

  // Mark hydration complete for this key AFTER React applies the queued state updates
  // (Do not release skipResetRef too early or the [selectedState] effect will clear city/terminal)
  setTimeout(() => {
    skipResetRef.current = false;
    locationHydratingRef.current = false;
    locationHydratedOnceRef.current = true;
    hydratedForKeyRef.current = effectiveLocationKey;
  }, 50);
}, [authUserId, effectiveLocationKey, userLocationKey]);

// Mark that the user has manually changed location so we stop auto-restoring over them.
useEffect(() => {
  if (!locationHydratedOnceRef.current) return;
  if (locationHydratingRef.current) return;
  if (skipResetRef.current) return;
  locationUserTouchedRef.current = true;
}, [selectedState, selectedCity, selectedTerminalId]);

// Validate saved selections:
// - If saved city no longer valid for the state => clear city + terminal
// - If saved terminal no longer valid for the city => clear terminal only
useEffect(() => {
  if (!locationHydratedOnceRef.current) return;
  if (locationHydratingRef.current) return;

  const st = normState(selectedState);
  const ct = normCity(selectedCity);
  const tid = String(selectedTerminalId || "");

  if (!st) {
    if (ct || tid) {
      skipResetRef.current = true;
      setSelectedCity("");
      setSelectedTerminalId("");
      setTimeout(() => {
        skipResetRef.current = false;
      }, 0);
    }
    return;
  }

  // City validation ONLY after we've loaded cities for this state at least once
  if (ct && !citiesLoading && citiesLoadedForStateRef.current === st) {
    const validCities = new Set(
      citiesCatalog
        .filter((c) => normState(c.state_code ?? "") === st && c.active !== false)
        .map((c) => normCity(c.city_name ?? ""))
        .filter(Boolean)
    );

    if (!validCities.has(ct)) {
      skipResetRef.current = true;
      setSelectedCity("");
      setSelectedTerminalId("");
      setTimeout(() => {
        skipResetRef.current = false;
      }, 0);
      return;
    }
  }

  // Terminal validation ONLY after terminal catalog has loaded at least once
  if (tid && ct && !catalogLoading && terminalCatalogLoadedRef.current) {
    const t = terminalCatalog.find((x) => String(x.terminal_id) === tid);
    const ok = !!t && normState(t.state ?? "") === st && normCity(t.city ?? "") === ct && t.active !== false;

    if (!ok) {
      skipResetRef.current = true;
      setSelectedTerminalId("");
      setTimeout(() => {
        skipResetRef.current = false;
      }, 0);
    }
  }
}, [selectedState, selectedCity, selectedTerminalId, citiesCatalog, citiesLoading, catalogLoading, terminalCatalog]);

// --- Persist location whenever it changes ---
useEffect(() => {
  // Do not persist until we have hydrated for the current effective key
  if (hydratedForKeyRef.current !== effectiveLocationKey) return;
  if (locationHydratingRef.current) return;

  // Always persist to anon (so auth flip never loses city/terminal)
  writePersistedLocation(ANON_LOCATION_KEY, selectedState, selectedCity, selectedTerminalId);

  // Persist to user key when logged in
  if (authUserId && userLocationKey) {
    writePersistedLocation(userLocationKey, selectedState, selectedCity, selectedTerminalId);
  }
}, [authUserId, effectiveLocationKey, userLocationKey, selectedState, selectedCity, selectedTerminalId]);


// Fetch/cached ambient temp when location changes.
// - Uses NEXT_PUBLIC_OPENWEATHER_KEY
// - Light in-memory cache per city/state (15 min TTL)
useEffect(() => {
  if (!selectedState || !selectedCity) {
    setAmbientTempF(null);
    setAmbientTempLoading(false);
    return;
  }

  const key = (process.env.NEXT_PUBLIC_OPENWEATHER_KEY || "").trim();
  if (!key) {
    setAmbientTempF(null);
    setAmbientTempLoading(false);
    return;
  }

  const TTL_MS = 15 * 60 * 1000;

  const cached = readAmbientMem(selectedState, selectedCity);
  if (cached && Date.now() - cached.ts < TTL_MS) {
    setAmbientTempF(cached.tempF);
    setAmbientTempLoading(false);
    return;
  }

  const ac = new AbortController();
  setAmbientTempLoading(true);

  (async () => {
    try {
      const temp = await fetchAmbientTempF({
        state: selectedState,
        city: selectedCity,
        key,
        signal: ac.signal,
      });

      if (typeof temp === "number" && Number.isFinite(temp)) {
        setAmbientTempF(temp);
        writeAmbientMem(selectedState, selectedCity, temp);
      } else {
        setAmbientTempF(null);
      }
    } catch {
      setAmbientTempF(null);
    } finally {
      setAmbientTempLoading(false);
    }
  })();

  return () => ac.abort();
}, [selectedState, selectedCity]);



// --- Step 5: Restore equipment combo (after combos load) ---
useEffect(() => {
  if (combosLoading) return;

  // Run once per effective key
  if (equipHydratedForKeyRef.current === effectiveEquipKey) return;

  equipHydratingRef.current = true;

  const fromUser = authUserId ? readPersistedEquip(userEquipKey) : null;
  const fromAnon = readPersistedEquip(anonEquipKey);
  const saved = fromUser ?? fromAnon;

  if (saved?.comboId) {
    const exists = combos.some(
      (c) => String(c.combo_id) === String(saved.comboId) && c.active !== false
    );
    setSelectedComboId(exists ? String(saved.comboId) : "");

    // Migrate anon -> user if needed
    if (authUserId && !fromUser && fromAnon) {
      writePersistedEquip(userEquipKey, fromAnon.comboId);
    }
  }

  equipHydratedForKeyRef.current = effectiveEquipKey;
  equipHydratingRef.current = false;
}, [authUserId, effectiveEquipKey, userEquipKey, anonEquipKey, combosLoading, combos]);

// --- Step 5: Persist equipment combo whenever it changes ---
useEffect(() => {
  if (equipHydratedForKeyRef.current !== effectiveEquipKey) return;
  if (equipHydratingRef.current) return;

  // Always write anon to survive auth timing
  writePersistedEquip(anonEquipKey, selectedComboId);
  if (authUserId) writePersistedEquip(userEquipKey, selectedComboId);
}, [authUserId, effectiveEquipKey, userEquipKey, anonEquipKey, selectedComboId]);


// --- Fetch compartments when trailer changes --- when trailer changes ---
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

      if (error) {
        setCompError(error.message);
        setCompartments([]);
      } else {
        setCompartments(((data ?? []) as CompRow[]).filter((c) => c.active !== false));
      }

      setCompLoading(false);
    })();
  }, [selectedTrailerId]);

useEffect(() => {
  // Initialize entries for current compartments, but don't wipe user choices if already set
  setCompPlan((prev) => {
    const next: Record<number, CompPlanInput> = { ...prev };

    for (const c of compartments) {
      const n = Number(c.comp_number);
      if (!Number.isFinite(n)) continue;

      if (!next[n]) {
        next[n] = { empty: false, productId: "" };
      }
    }

    // Optional: remove entries for compartments no longer present
    for (const key of Object.keys(next)) {
      const n = Number(key);
      if (!compartments.some((c) => Number(c.comp_number) === n)) {
        delete next[n];
      }
    }

    return next;
  });
}, [compartments]);



  // --- Fetch terminal products when terminal changes ---
  useEffect(() => {
    (async () => {
      setTpError(null);
      setTerminalProducts([]);

      if (!selectedTerminalId) return;

      setTpLoading(true);

      const { data, error } = await supabase
        .from("terminal_products")
        .select(
          `
          active,
          products (
            product_id,
            product_name,
            display_name,
            description,
            product_code,
            button_code,
            hex_code,
            api_60,
            alpha_per_f
          )
        `
        )
        .eq("terminal_id", selectedTerminalId);

      if (error) {
        setTpError(error.message);
        setTerminalProducts([]);
      } else {
        const products = (data ?? [])
          .filter((row: any) => row.active !== false)
          .map((row: any) => row.products)
          .filter(Boolean);

        setTerminalProducts(products as ProductRow[]);
      }

      setTpLoading(false);
    })();
  }, [selectedTerminalId]);

  // --- Option lists for state/city/terminal ---
  const stateOptions = useMemo(() => {
    // Preferred: states table (shows all 50)
    if (statesCatalog.length > 0) {
      return statesCatalog
        .map((r) => ({
          code: normState(r.state_code),
          name: String(r.state_name || "").trim(),
        }))
        .filter((r) => r.code);
    }

    // Fallback: derive from terminals table (won't show missing states)
    const codes = Array.from(new Set(terminalCatalog.map((t) => normState(t.state ?? "")))).filter(
      Boolean
    );
    return codes.map((code) => ({ code, name: code }));
  }, [statesCatalog, terminalCatalog]);

  const stateNameByCode = useMemo(() => {
    const m = new Map<string, string>();
    stateOptions.forEach((s) => m.set(s.code, s.name || s.code));
    return m;
  }, [stateOptions]);

  const states = useMemo(() => stateOptions.map((s) => s.code), [stateOptions]);

  const selectedStateLabel = useMemo(() => {
    if (!selectedState) return "";
    const code = normState(selectedState);
    const name = stateNameByCode.get(code) || code;
    return `${code} — ${name}`;
  }, [selectedState, stateNameByCode]);

  const cities = useMemo(() => {
    const st = normState(selectedState);
    return Array.from(
      new Set(
        citiesCatalog
          .filter((c) => normState(c.state_code ?? "") === st && c.active !== false)
          .map((c) => normCity(c.city_name ?? ""))
      )
    )
      .filter(Boolean)
      .sort();
  }, [citiesCatalog, selectedState]);


const topCities = useMemo(() => {
  if (!selectedState || cities.length === 0) return [];
  const st = normState(selectedState);

  // Manual: starred cities are "Top Cities"
  const out = cities.filter((c) => starredCitySet.has(cityKey(st, c)));
  out.sort();
  return out;
}, [selectedState, cities, starredCitySet]);

const allCities = useMemo(() => {
  if (!selectedState) return cities;
  const st = normState(selectedState);
  return cities.filter((c) => !starredCitySet.has(cityKey(st, c)));
}, [selectedState, cities, starredCitySet]);



  const terminalsFiltered = useMemo(() => {
    return terminals
      .filter(
        (t) => normState(t.state ?? "") === normState(selectedState) && normCity(t.city ?? "") === normCity(selectedCity)
      )
      .sort((a, b) => {
        const aStar = Boolean(a.starred);
        const bStar = Boolean(b.starred);
        if (aStar !== bStar) return aStar ? -1 : 1;
        return String(a.terminal_name ?? "").localeCompare(String(b.terminal_name ?? ""));
      });
  }, [terminals, selectedState, selectedCity]);

  const catalogTerminalsInCity = useMemo(() => {
  return terminalCatalog
    .filter(
      (t) => normState(t.state ?? "") === normState(selectedState) && normCity(t.city ?? "") === normCity(selectedCity)
    )
    .sort((a, b) => {
  const aInMy = myTerminalIdSet.has(String(a.terminal_id));
  const bInMy = myTerminalIdSet.has(String(b.terminal_id));
  if (aInMy !== bInMy) return aInMy ? -1 : 1;
  return String(a.terminal_name ?? "").localeCompare(String(b.terminal_name ?? ""));
})

}, [terminalCatalog, selectedState, selectedCity, myTerminalIdSet]);

useEffect(() => {
  (async () => {
    if (!authUserId) return;
    if (!selectedState || !selectedCity) return;
    const ids = catalogTerminalsInCity.map((t) => String(t.terminal_id));
    if (ids.length === 0) {
      setAccessDateByTerminalId({});
      return;
    }
    const { data, error } = await supabase
      .from("terminal_access")
      .select("terminal_id, carded_on")
      .eq("user_id", authUserId)
      .in("terminal_id", ids);
    if (error) {
      console.error(error);
      return;
    }
    const map: Record<string, string> = {};
    (data ?? []).forEach((r: any) => {
      if (r?.terminal_id && r?.carded_on) map[String(r.terminal_id)] = String(r.carded_on);
    });
    setAccessDateByTerminalId(map);
  })();
}, [authUserId, selectedState, selectedCity, catalogTerminalsInCity]);

// =======================
// begin_load → Supabase
// =======================
async function beginLoadToSupabase() {
  if (beginLoadBusy) return;

  try {
    setBeginLoadBusy(true);

    if (!selectedComboId) throw new Error("Select equipment first.");
    if (!selectedTerminalId) throw new Error("Select terminal first.");
    if (!selectedState || !selectedCity) throw new Error("Select location first.");
    if (!selectedCityId) throw new Error("City ID not found.");
    if (!planRows || planRows.length === 0) throw new Error("No plan to load.");

    const lines = (planRows as any[])
      .filter((r) => r.productId && Number(r.planned_gallons ?? 0) > 0)
      .map((r) => {
        const gallons = Number(r.planned_gallons ?? 0);
        const lpg = Number(r.lbsPerGal ?? 0);
        const lbs = gallons * lpg;

        return {
          comp_number: Number(r.comp_number),
          product_id: String(r.productId),
          planned_gallons: Number.isFinite(gallons) ? gallons : null,
          planned_lbs: Number.isFinite(lbs) ? lbs : null,
          temp_f: tempF ?? null,
        };
      });

    if (lines.length === 0) throw new Error("No filled compartments.");

    const planned_total_gal = Number.isFinite(Number(plannedGallonsTotal)) ? Number(plannedGallonsTotal) : null;
    const planned_total_lbs = Number.isFinite(Number(plannedWeightLbs)) ? Number(plannedWeightLbs) : null;

    const planned_gross_lbs =
      Number.isFinite(Number(tare)) &&
      Number.isFinite(Number(buffer)) &&
      Number.isFinite(Number(plannedWeightLbs))
        ? Number(tare) + Number(buffer) + Number(plannedWeightLbs)
        : null;

    const payload = {
      combo_id: selectedComboId,
      terminal_id: selectedTerminalId,
      state_code: selectedState,
      city_id: selectedCityId,

      cg_bias: Number.isFinite(Number(cgBias)) ? Number(cgBias) : null,
      ambient_temp_f: ambientTempF ?? null,
      product_temp_f: tempF ?? null,

      planned_totals: {
        planned_total_gal,
        planned_total_lbs,
        planned_gross_lbs,
      },

      planned_snapshot: {
        v: PLAN_SNAPSHOT_VERSION,
        created_at: new Date().toISOString(),
        totals: { planned_total_gal, planned_total_lbs, planned_gross_lbs },
        lines,
      },

      lines,
    };

    const result = await beginLoad(payload);

    setActiveLoadId(result.load_id);
    alert(`Load started.\nLoad ID:\n${result.load_id}`);
  } catch (err: any) {
    console.error(err);
    alert(err?.message ?? "Failed to begin load.");
  } finally {
    setBeginLoadBusy(false);
  }
}


  return (
    <div style={styles.page}>
      <h1 style={{ marginBottom: 6 }}>Calculator</h1>
<div className="my-3">
<TopTiles
  locationTitle={locationLabel ?? "City, State"}
  ambientSubtitle={locationLabel ? `${ambientTempLoading ? "…" : ambientTempF == null ? "—" : Math.round(ambientTempF)}° ambient` : undefined}
  terminalTitle={terminalLabel ?? "Terminal"}
  terminalSubtitle={terminalCardedText}
  terminalSubtitleClassName={terminalCardedClass}
  onOpenLocation={() => setLocOpen(true)}
  onOpenTerminal={() => setTermOpen(true)}
  terminalEnabled={terminalEnabled}
  locationSelected={Boolean(selectedCity && selectedState)}
  terminalSelected={Boolean(selectedTerminalId)}
/>
        {SnapshotSlots}






</div>



<div style={{ ...styles.help, marginTop: 6 }}>
  Auth: {authEmail ? `Logged in as ${authEmail}` : "NOT logged in"}
</div>

      {/* Equipment */}
      <section style={styles.section}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0 }}>Equipment</h2>
          <span style={styles.badge}>
            {combosLoading ? "Loading…" : `${combos.length} combos`}
          </span>
        </div>

        {combosError && <div style={styles.error}>Error loading equipment: {combosError}</div>}

        <div style={{ marginTop: 10 }}>
          <label style={styles.label}>Truck + Trailer</label>
          <select
            value={selectedComboId}
            onChange={(e) => setSelectedComboId(e.target.value)}
            style={{ ...styles.select, width: 420, maxWidth: "100%" }}
            disabled={combosLoading || combos.length === 0}
          >
            <option value="">Select…</option>
            {combos.map((c) => (
              <option key={c.combo_id} value={c.combo_id}>
                {c.combo_name
                  ? c.combo_name
                  : `Truck ${c.truck_id ?? "?"} + Trailer ${c.trailer_id ?? "?"}`}
              </option>
            ))}
          </select>

          {selectedCombo && (
            <div style={styles.help}>
              Selected:{" "}
              <strong>
                Truck {selectedCombo.truck_id ?? "?"} + Trailer {selectedCombo.trailer_id ?? "?"}
              </strong>
            </div>
          )}
        </div>
      </section>

      {/* Terminal */}
      {false && (
      <section style={styles.section}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0 }}>Terminal</h2>
          <span style={styles.badge}>
            {termLoading ? "Loading…" : `${terminals.length} terminals`}
          </span>
        </div>

        {termError && <div style={styles.error}>Error loading terminals: {termError}</div>}

        <div style={{ ...styles.row, marginTop: 10 }}>
          <div>
            <label style={styles.label}>State</label>
            <select
              value={selectedState}
              onChange={(e) => setSelectedState(e.target.value)}
              style={{ ...styles.select, width: 140 }}
              disabled={termLoading || states.length === 0}
            >
              <option value="">Select…</option>
              {states.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={styles.label}>City</label>
            <select
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              style={{ ...styles.select, width: 220 }}
              disabled={!selectedState}
            >
              <option value="">Select…</option>
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={styles.label}>Terminal</label>
            <select
              value={selectedTerminalId}
              onChange={(e) => setSelectedTerminalId(e.target.value)}
              style={{ ...styles.select, width: 420, maxWidth: "100%" }}
              disabled={!selectedState || !selectedCity}
            >
              <option value="">Select…</option>
              {terminalsFiltered.map((t, idx) => {
  const k = t.terminal_id ? String(t.terminal_id) : `term-${idx}`;
  return (
    <option key={k} value={t.terminal_id ?? ""}>
      {t.terminal_name ?? "(unnamed terminal)"}
    </option>
  );
})}

            </select>
          </div>
        </div>

        
          {selectedTerminal && (
  <div style={styles.help}>
    {(() => {
      const cat =
        terminalCatalog.find((x) => String(x.terminal_id) === String(selectedTerminalId)) ?? null;

      const activationISO =
        (selectedTerminal as any)?.carded_on ||
        (selectedTerminal as any)?.added_on ||
        "";

      const expiresISO =
        (selectedTerminal as any)?.expires_on ||
        (selectedTerminal as any)?.expires ||
        (selectedTerminal as any)?.expires_at ||
        "";

      const renewalDays = Number(
        (selectedTerminal as any)?.renewal_days ??
          (selectedTerminal as any)?.renewalDays ??
          (cat as any)?.renewal_days ??
          90
      ) || 90;

      const computedExpiresISO =
        activationISO && /^\d{4}-\d{2}-\d{2}$/.test(activationISO)
          ? addDaysISO_(activationISO, renewalDays)
          : "";

      const displayISO = expiresISO || computedExpiresISO;

console.log("MAIN selectedTerminal", {
  id: selectedTerminalId,
  name: selectedTerminal.terminal_name,
  activationISO,
  expiresISO,
  computedExpiresISO,
  displayISO,
  renewalDays,
  rawSelectedTerminal: selectedTerminal,
});

      const tz = (cat as any)?.timezone ?? "";

      return (
        <>
          Selected: <strong>{selectedTerminal.terminal_name}</strong>
          {tz ? ` • ${tz}` : ""}
          {displayISO ? (
            <span>
              {" "}
              •{" "}
              <span style={{ color: isPastISO_(displayISO) ? "#f87171" : "rgba(255,255,255,0.75)" }}>

                {formatMDYWithCountdown_(displayISO)}
              </span>
            </span>
          ) : (
            <span style={{ color: "rgba(255,255,255,0.5)" }}> • Set Activation Date</span>
          )}
        </>
      );
    })()}
  </div>
)}

  


      </section>
      )}

      {/* Products */}
      <section style={styles.section}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0 }}>Products</h2>
          <span style={styles.badge}>
            {!selectedTerminalId
              ? "Select terminal"
              : tpLoading
              ? "Loading…"
              : `${terminalProducts.length} products`}
          </span>
        </div>

        {!selectedTerminalId && <div style={styles.help}>Select a terminal to load products.</div>}
        {tpError && <div style={styles.error}>Error loading products: {tpError}</div>}

        {selectedTerminalId && !tpLoading && !tpError && terminalProducts.length === 0 && (
          <div style={styles.help}>No products found for this terminal.</div>
        )}

{/* Temp (°F) input removed; use the Product Temp slider below. */}



{selectedTerminalId && (
  <div
    style={{
      marginTop: 10,
      padding: 12,
      border: "1px solid #333",
      borderRadius: 10,
      background: "#0f0f0f",
    }}
  >
    <div style={{ marginBottom: 6 }}>
      <strong>Planning conditions</strong>     
    </div>


<div>
  <strong>Planned weight (lbs):</strong> {planRows.length ? plannedWeightText : ""}
</div>
<div>
  <strong>Margin (allowed - planned):</strong> {planRows.length ? weightMarginText : ""}
</div>


    <div style={{ ...styles.help, marginTop: 8 }}>
      Active comps: <strong>{activeComps.length}</strong>
    </div>

    <div style={{ marginTop: 8, fontSize: 14, opacity: 0.95 }}>
      <div>
        <strong>Temp (°F):</strong> {tempF}
      </div>

      <div>
        <strong>Allowed lbs:</strong> {selectedCombo ? allowedLbsText : "Select equipment"}
      </div>

      <div>
        <strong>Trailer capacity (gal):</strong>{" "}
        {selectedTrailerId ? trailerCapacityGallonsText : "Select equipment"}
      </div>

      <div>
        <strong>Effective max gallons:</strong>{" "}
        {selectedTrailerId ? effectiveMaxGallonsText : ""}
      </div>
    </div>

    <div
      style={{
        marginTop: 10,
        display: "flex",
        gap: 12,
        alignItems: "end",
        flexWrap: "wrap",
      }}
    >
    </div>

    <div style={{ marginTop: 10, fontSize: 16 }}>
      <strong>Maximum legal gallons:</strong> {targetGallonsText}
    </div>

    
<div style={{ marginTop: 12 }}>
  {unstableLoad && (
    <div style={{ ...styles.error, marginTop: 0, marginBottom: 10, textAlign: "center" }}>
      ⚠️ Unstable load (rear of neutral)
    </div>
  )}

  
    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
    <div style={{ position: "relative", width: "100%", flex: 1 }}>
      <input
        type="range"
        className="cgRange"
        min={0}
        max={1}
        step={0.005}
        value={cgSlider}
        onChange={(e) => setCgSlider(Number(e.target.value))}
        style={{ width: "100%" }}
        disabled={!selectedCombo}
      />

      {/* CG thumb overlay */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: `${Math.max(0, Math.min(1, cgSlider)) * 100}%`,
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: 48,
          height: 48,
          display: "grid",
          placeItems: "center",
          pointerEvents: "none",
          userSelect: "none",
          fontWeight: 800,
          fontSize: 18,
          letterSpacing: 0.3,
          color: "rgba(255,255,255,0.88)",
          textShadow: "0 2px 10px rgba(0,0,0,0.55)",
        }}
      >
        CG
      </div>
    </div>

    <button
      type="button"
      onClick={() => setCgSlider(CG_NEUTRAL)}
      style={styles.smallBtn}
      title="Tap to snap CG back to neutral"
      disabled={!selectedCombo}
    >
      {cgBias >= 0 ? "+" : ""}
      {cgBias.toFixed(2)}
    </button>
  </div>
  {/* Product temperature */}
  <div style={{ marginTop: 14 }}>
    <label style={styles.label}>Product Temp (°F)</label>
    <style jsx global>{`
      /* Shared */
      input.tempRange{
        -webkit-appearance: none;
        appearance: none;
        background: transparent;
        height: 40px;
      }
      input.cgRange{
        -webkit-appearance: none;
        appearance: none;
        background: transparent;
        height: 72px;
      }
      input.cgRange:focus,
      input.tempRange:focus{ outline: none; }

      /* ---------- Product Temp ---------- */
      input.tempRange::-webkit-slider-runnable-track{
        height: 10px;
        border-radius: 999px;
        background: linear-gradient(90deg,
          rgba(0,194,216,0.26) 0%,
          rgba(0,194,216,0.26) 45%,
          rgba(231,70,70,0.24) 55%,
          rgba(231,70,70,0.24) 100%
        );
        border: 1px solid rgba(255,255,255,0.10);
      }
      input.tempRange::-webkit-slider-thumb{
        -webkit-appearance: none;
        appearance: none;
        width: 68px;
        height: 68px;
        margin-top: -29px; /* center on 10px track */
        background: transparent;
        border: none;
        box-shadow: none;
      }

      /* Firefox temp */
      input.tempRange::-moz-range-track{
        height: 10px;
        border-radius: 999px;
        background: linear-gradient(90deg,
          rgba(0,194,216,0.26) 0%,
          rgba(0,194,216,0.26) 45%,
          rgba(231,70,70,0.24) 55%,
          rgba(231,70,70,0.24) 100%
        );
        border: 1px solid rgba(255,255,255,0.10);
      }
      input.tempRange::-moz-range-progress{
        height: 10px;
        border-radius: 999px;
        background: linear-gradient(90deg,
          rgba(0,194,216,0.26) 0%,
          rgba(0,194,216,0.26) 45%,
          rgba(231,70,70,0.24) 55%,
          rgba(231,70,70,0.24) 100%
        );
      }
      input.tempRange::-moz-range-thumb{
        width: 34px;
        height: 34px;
        background: transparent;
        border: none;
        box-shadow: none;
      }

      /* ---------- CG slider (uniform track, no trail) ---------- */
      input.cgRange::-webkit-slider-runnable-track{
        height: 10px;
        border-radius: 999px;
        background: rgba(255,255,255,0.10);
        border: 1px solid rgba(255,255,255,0.12);
      }
      input.cgRange::-webkit-slider-thumb{
        -webkit-appearance: none;
        appearance: none;
        width: 32px;
        height: 32px;
        margin-top: -11px; /* center on 10px track */
        background: transparent;
        border: none;
        box-shadow: none;
        opacity: 0; /* hide circle; use text overlay only */
      }

      /* Firefox cg */
      input.cgRange::-moz-range-track{
        height: 10px;
        border-radius: 999px;
        background: rgba(255,255,255,0.10);
        border: 1px solid rgba(255,255,255,0.12);
      }
      input.cgRange::-moz-range-progress{
        height: 10px;
        border-radius: 999px;
        background: rgba(255,255,255,0.10);
      }
      input.cgRange::-moz-range-thumb{
        width: 32px;
        height: 32px;
        background: transparent;
        border: none;
        box-shadow: none;
        opacity: 0; /* hide circle; use text overlay only */
      }
    `}</style>


        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
      <div style={{ position: "relative", width: "100%", flex: 1 }}>
        <input
          type="range"
          className="tempRange"
          min={-20}
          max={140}
          step={1}
          value={tempF}
          onChange={(e) => setTempF(Number(e.target.value))}
          style={{
            width: "100%",
            flex: 1,
          }}
        />

        {/* Thermometer overlay (no box) */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: `${Math.max(0, Math.min(1, (tempF + 20) / 160)) * 100}%`,
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: 28,
            height: 28,
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          <svg viewBox="0 0 64 64" width="28" height="28">
            <defs>
              <linearGradient id="tAqua" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#00c2d8" stopOpacity="0.95" />
                <stop offset="1" stopColor="#00a9bd" stopOpacity="0.95" />
              </linearGradient>
            </defs>
            <path
              d="M28 8a10 10 0 0 1 20 0v24.7a18 18 0 1 1-20 0V8z"
              fill="rgba(0,0,0,0.35)"
              stroke="rgba(255,255,255,0.22)"
              strokeWidth="2.5"
            />
            <path
              d="M31 10.5a7 7 0 0 1 14 0v25.9l1.1.8a13.7 13.7 0 1 1-16.2 0l1.1-.8V10.5z"
              fill="url(#tAqua)"
              opacity="0.98"
            />
            <circle cx="38" cy="48" r="9.5" fill="rgba(231,70,70,0.92)" />
            <rect x="36.2" y="16" width="3.6" height="30" rx="1.8" fill="rgba(231,70,70,0.92)" />
          </svg>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setTempDialOpen(true)}
        style={styles.smallBtn}
        title="Tap for fine tuning"
      >
        {Math.round(tempF)}°F
      </button>
    </div>
    <FullscreenModal open={tempDialOpen} title="Product Temp" onClose={() => setTempDialOpen(false)}>
      <div style={{ display: "grid", gap: 16 }}>
        <div
          style={{
            textAlign: "center",
            fontWeight: 800,
            letterSpacing: 0.2,
            userSelect: "none",
          }}
        >
          <span style={{ color: "white" }}>
            {selectedCity && selectedState ? `${selectedCity}, ${selectedState}` : "City, ST"}
          </span>
          <span style={{ color: "rgba(255,255,255,0.50)" }}>{" "} - {" "}</span>
          <span style={{ color: "rgb(0,194,216)" }}>
            {ambientTempLoading ? "Loading…" : ambientTempF == null ? "—" : `${Math.round(ambientTempF)}°F`}
          </span>
        </div>

        <TempDial value={tempF} min={-20} max={140} step={0.1} onChange={(v) => setTempF(v)} />

        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            style={styles.smallBtn}
            onClick={() => setTempF((v) => Math.round((Number(v) - 0.5) * 10) / 10)}
          >
            −0.5
          </button>
          <button
            type="button"
            style={styles.smallBtn}
            onClick={() => setTempF((v) => Math.round((Number(v) - 0.1) * 10) / 10)}
          >
            −0.1
          </button>
          <button type="button" style={styles.smallBtn} onClick={() => setTempF(60)} title="Snap back to 60°F">
            60°
          </button>
          <button
            type="button"
            style={styles.smallBtn}
            onClick={() => setTempF((v) => Math.round((Number(v) + 0.1) * 10) / 10)}
          >
            +0.1
          </button>
          <button
            type="button"
            style={styles.smallBtn}
            onClick={() => setTempF((v) => Math.round((Number(v) + 0.5) * 10) / 10)}
          >
            +0.5
          </button>
        </div>
      

        {/* Quick reference (time-of-day guidance) */}
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ fontWeight: 800, letterSpacing: 0.2 }}>Quick reference</div>

          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
            <div
              style={{
                padding: 12,
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.04)",
              }}
            >
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Daylight (sun / warm tanks)</div>
              <div style={{ ...styles.help, marginTop: 0 }}>
                Start near <strong>Ambient + 5°F</strong>. If you’re loading mid‑afternoon in full sun,{" "}
                <strong>+8–10°F</strong> is often a better proxy.
              </div>
            </div>

            <div
              style={{
                padding: 12,
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.04)",
              }}
            >
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Night (cooldown / shaded)</div>
              <div style={{ ...styles.help, marginTop: 0 }}>
                Start near <strong>Ambient − 2°F</strong> (or simply Ambient). If tanks are cold‑soaked,{" "}
                <strong>−3–5°F</strong> can be reasonable.
              </div>
            </div>
          </div>

          <div style={{ ...styles.help, marginTop: 0 }}>
            If unsure: use <strong>Ambient</strong>, then adjust based on how the product has been stored (sun vs shade,
            recent loading cycles, etc.).
          </div>
        </div>

        </div>
    </FullscreenModal>
  </div>
</div>

  </div>
)}


        {false && terminalProducts.length > 0 && (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Product</th>
                <th style={styles.th}>API @ 60</th>
                <th style={styles.th}>Alpha / °F</th>
              </tr>
            </thead>
            <tbody>
              {terminalProducts.map((p) => (
                <tr key={p.product_id}>
                  <td style={styles.td}>{p.product_name}</td>
                  <td style={styles.td}>{p.api_60}</td>
                  <td style={styles.td}>{p.alpha_per_f}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Compartments */}
      <section style={styles.section}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0 }}>Compartments</h2>
          <span style={styles.badge}>
            {!selectedTrailerId
              ? "Select equipment"
              : compLoading
              ? "Loading…"
              : `${compartments.length} compartments`}
          </span>
        </div>

        {!selectedTrailerId && <div style={styles.help}>Select equipment to load compartments.</div>}
        {compError && <div style={styles.error}>Error loading compartments: {compError}</div>}


        {/* Driver compartment strip (primary interface) */}
        {selectedTrailerId && !compLoading && !compError && compartments.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: compartments.length >= 5 ? 10 : 18,
                flexWrap: "nowrap",
              }}
            >
              {(() => {
                const n = compartments.length;
                const baseW = n === 1 ? 220 : 160;
                const w = n >= 5 ? 132 : baseW;
                const h = 330;
                const ordered = [...compartments].slice().sort((a,b)=>Number(a.comp_number)-Number(b.comp_number)).reverse();
                return ordered.map((c) => {
                  const compNumber = Number(c.comp_number);
                  const trueMax = Number(c.max_gallons ?? 0);
                  const headPct = headspacePctForComp(compNumber);
                  const effMax = effectiveMaxGallonsForComp(compNumber, trueMax);
                  const planned = plannedGallonsByComp[compNumber] ?? 0;
                  const plannedPct = trueMax > 0 ? Math.max(0, Math.min(1, planned / trueMax)) : 0;
                  const capPct = trueMax > 0 ? Math.max(0, Math.min(1, effMax / trueMax)) : 0;
                  const visualTopGap = 0.08; // keeps a bit of visible headspace even when full
                  const fillPct = Math.max(0, Math.min(1, Math.min(plannedPct, capPct) * (1 - visualTopGap)));

                  const sel = compPlan[compNumber];
                  const isEmpty = !!sel?.empty || !sel?.productId;
                  const prod = !isEmpty ? terminalProducts.find((p) => p.product_id === sel?.productId) : null;

                  const productName = isEmpty
                    ? ""
                    : ((prod?.display_name ?? prod?.product_name ?? "").trim() || "Product");

                  const code = isEmpty
                    ? "MT"
                    : String(prod?.button_code ?? prod?.product_code ?? (productName.split(/\s+/)[0] || "PRD"))
                        .trim()
                        .toUpperCase();

                  const codeColor = isEmpty
                    ? "rgba(180,220,255,0.9)"
                    : (typeof prod?.hex_code === "string" && prod.hex_code.trim()
                        ? prod.hex_code.trim()
                        : "rgba(255,255,255,0.9)");

                  const atMax = headPct <= 0.000001;

                  return (
                    <div
                      key={String(c.comp_number)}
                      onClick={() => {
                        setCompModalComp(compNumber);
                        setCompModalOpen(true);
                      }}
                      style={{
                        width: w,
                        height: h,
                        borderRadius: 18,
                        background: "rgba(255,255,255,0.06)",
                        border: "1px solid rgba(255,255,255,0.14)",
                        padding: 14,
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        userSelect: "none",
                      }}
                      title={`Comp ${compNumber}`}
                    >
                      {/* Comp number label (amber when at max) */}
                      <div
                        style={{
                          fontSize: 22,
                          fontWeight: 800,
                          letterSpacing: 0.2,
                          marginBottom: 10,
                          color: atMax ? "#ffb020" : "rgba(255,255,255,0.72)",
                        }}
                      >
                        {compNumber}
                      </div>


                      {/* Tank */}
                      <div
                        style={{
                          width: "100%",
                          flex: 1,
                          borderRadius: 16,
                          background: "rgba(255,255,255,0.08)",
                          position: "relative",
                          overflow: "hidden",
                        }}
                      >
                        {/* Capped headspace tint (no line) */}
                        {headPct > 0 && (
                          <div
                            style={{
                              position: "absolute",
                              left: 0,
                              right: 0,
                              top: 0,
                              height: `${Math.max(0, Math.min(1, headPct)) * 100}%`,
                              background: "rgba(0,0,0,0.16)",
                            }}
                          />
                        )}
{/* Fluid */}
                        <div
                          style={{
                            position: "absolute",
                            left: 0,
                            right: 0,
                            bottom: 0,
                            height: `${fillPct * 100}%`,
                            background: "rgba(185,245,250,0.85)",
                          }}
                        />

                        {/* Wavy surface line */}
                        {fillPct > 0 && (
                          <svg
                            width="100%"
                            height="16"
                            viewBox="0 0 100 16"
                            preserveAspectRatio="none"
                            style={{
                              position: "absolute",
                              left: 0,
                              right: 0,
                              bottom: `calc(${fillPct * 100}% - 8px)`,
                              opacity: 0.9,
                            }}
                          >
                            <path
                              d="M0,8 C10,2 20,14 30,8 C40,2 50,14 60,8 C70,2 80,14 90,8 C95,6 98,6 100,8"
                              fill="none"
                              stroke="rgba(120,210,220,0.95)"
                              strokeWidth="2"
                            />
                          </svg>
                        )}
                      </div>

                      {/* Product button */}
                      <div
                        style={{
                          marginTop: 12,
                          width: 78,
                          height: 52,
                          borderRadius: 14,
                          backgroundColor: "transparent",
                          border: `2px solid ${isEmpty ? "rgba(180,220,255,0.55)" : codeColor}`,
                          boxShadow: "none",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 800,
                          fontSize: 20,
                          color: isEmpty ? "rgba(180,220,255,0.92)" : codeColor,
                        }}
                      >
                        {code}
                      </div>

                      {/* Planned gallons */}
                      <div style={{ marginTop: 8, fontSize: 16, color: "rgba(220,220,220,0.85)" }}>
                        {planned > 0 ? Math.round(planned).toString() : ""}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {selectedTrailerId && !compLoading && !compError && compartments.length === 0 && (
          <div style={styles.help}>No compartments found for this trailer.</div>
        )}

        {compartments.length > 0 && (
          <>
            {/* (UI) removed compartments detail table */}
          </>

        )}
      
        <FullscreenModal
          open={compModalOpen}
          title={compModalComp != null ? `Compartment ${compModalComp}` : "Compartment"}
          onClose={() => {
            setCompModalOpen(false);
            setCompModalComp(null);
          }}
        >
          {compModalComp == null ? null : (() => {
            const compNumber = compModalComp;
            const c = compartments.find((x) => Number(x.comp_number) === compNumber);
            const trueMax = Number(c?.max_gallons ?? 0);
            const headPct = headspacePctForComp(compNumber);
            const effMax = effectiveMaxGallonsForComp(compNumber, trueMax);
            const sel = compPlan[compNumber];
            const isEmpty = !!sel?.empty || !sel?.productId;

            return (
              <div style={{ display: "grid", gap: 16 }}>
                <div style={{ ...styles.help }}>
                  Adjust headspace to stay safely below the top probe and set the product for compartment{" "}
                  <strong>{compNumber}</strong>.
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr",
                    gap: 14,
                  }}
                >
                  {/* Zoomed compartment + vertical slider */}
                  <div style={{ display: "flex", gap: 18, alignItems: "stretch", flexWrap: "wrap" }}>
                    {/* Comp visual */}
                    <div
                      style={{
                        width: 240,
                        maxWidth: "100%",
                        borderRadius: 18,
                        background: "rgba(255,255,255,0.06)",
                        border: "1px solid rgba(255,255,255,0.14)",
                        padding: 14,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: 10,
                        }}
                      >
                        <div style={{ fontWeight: 700, opacity: 0.9 }}>Max Volume</div>
                        <div style={{ fontWeight: 800 }}>{Math.round(trueMax)} gal</div>
                      </div>

                      <div
                        style={{
                          height: 280,
                          borderRadius: 16,
                          background: "rgba(255,255,255,0.08)",
                          position: "relative",
                          overflow: "hidden",
                        }}
                      >
                        {/* Capped headspace tint */}
                        {headPct > 0 && (
                          <div
                            style={{
                              position: "absolute",
                              left: 0,
                              right: 0,
                              top: 0,
                              height: `${Math.max(0, Math.min(1, headPct)) * 100}%`,
                              background: "rgba(0,0,0,0.16)",
                            }}
                          />
                        )}

                        {/* Visual fill based on planned/true max, capped */}
                        {(() => {
                          const planned = plannedGallonsByComp[compNumber] ?? 0;
                          const plannedPct = trueMax > 0 ? Math.max(0, Math.min(1, planned / trueMax)) : 0;
                          const capPct = trueMax > 0 ? Math.max(0, Math.min(1, effMax / trueMax)) : 0;
                          const visualTopGap = 0.08;
                          const fillPct = Math.max(0, Math.min(1, Math.min(plannedPct, capPct) * (1 - visualTopGap)));

                          return (
                            <>
                              <div
                                style={{
                                  position: "absolute",
                                  left: 0,
                                  right: 0,
                                  bottom: 0,
                                  height: `${fillPct * 100}%`,
                                  background: "rgba(185,245,250,0.85)",
                                }}
                              />
                              {fillPct > 0 && (
                                <svg
                                  width="100%"
                                  height="16"
                                  viewBox="0 0 100 16"
                                  preserveAspectRatio="none"
                                  style={{
                                    position: "absolute",
                                    left: 0,
                                    right: 0,
                                    bottom: `calc(${fillPct * 100}% - 8px)`,
                                    opacity: 0.9,
                                  }}
                                >
                                  <path
                                    d="M0,8 C10,2 20,14 30,8 C40,2 50,14 60,8 C70,2 80,14 90,8 C95,6 98,6 100,8"
                                    fill="none"
                                    stroke="rgba(120,210,220,0.95)"
                                    strokeWidth="2"
                                  />
                                </svg>
                              )}
                            </>
                          );
                        })()}
                      </div>

                      {/* Capped at input + return button */}
                      <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ fontWeight: 700, opacity: 0.9 }}>Capped at</div>
                        </div>

                        <input
                          type="number"
                          inputMode="numeric"
                          value={Math.round(effMax)}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            if (!Number.isFinite(v) || trueMax <= 0) return;
                            const capped = Math.max(0, Math.min(trueMax, v));
                            const pct = Math.max(0, Math.min(0.95, 1 - capped / trueMax));
                            setCompHeadspacePct((prev) => ({ ...prev, [compNumber]: pct }));
                          }}
                          style={{ ...styles.input, width: "100%" }}
                        />

                        <button
                          style={{ ...styles.smallBtn, width: "100%" }}
                          onClick={() => setCompHeadspacePct((prev) => ({ ...prev, [compNumber]: 0 }))}
                        >
                          Return to max
                        </button>
                      </div>
                    </div>

                    {/* Vertical slider (headspace %) */}
                    <div
                      style={{
                        display: "grid",
                        alignContent: "start",
                        justifyItems: "center",
                        paddingTop: 10,
                        minWidth: 90,
                      }}
                    >
                      <div style={{ opacity: 0.85, fontSize: 13, marginBottom: 10 }}>Headspace</div>
                      <input
                        type="range"
                        min={0}
                        max={30}
                        step={1}
                        value={Math.round(headPct * 100)}
                        onChange={(e) => {
                          const pct = Number(e.target.value) / 100;
                          setCompHeadspacePct((prev) => ({ ...prev, [compNumber]: pct }));
                        }}
                        style={{
                          height: 280,
                          width: 28,
                          WebkitAppearance: "slider-vertical" as any,
                          writingMode: "bt-lr" as any,
                        }}
                      />
                      <div style={{ ...styles.badge, marginTop: 10 }}>{Math.round(headPct * 100)}%</div>
                    </div>
                  </div>

                  {/* Product selection */}
                  <div style={{ display: "grid", gap: 10 }}>
                    <strong>Product</strong>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                        gap: 12,
                      }}
                    >
                      {/* MT / Empty */}
                      <button
                        style={{
                          textAlign: "left",
                          padding: 14,
                          borderRadius: 16,
                          border: "1px solid rgba(255,255,255,0.14)",
                          background: isEmpty ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)",
                          color: "white",
                          cursor: "pointer",
                        }}
                        onClick={() => {
                          setCompPlan((prev) => ({
                            ...prev,
                            [compNumber]: { empty: true, productId: "" },
                          }));
                          setCompModalOpen(false);
                          setCompModalComp(null);
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <div
                            style={{
                              width: 54,
                              height: 44,
                              borderRadius: 12,
                              border: "1px solid rgba(180,220,255,0.9)",
                              background: "rgba(0,0,0,0.35)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontWeight: 900,
                              letterSpacing: 0.5,
                              color: "rgba(180,220,255,0.9)",
                              flex: "0 0 auto",
                            }}
                          >
                            MT
                          </div>
                          <div style={{ display: "grid", gap: 2 }}>
                            <div style={{ fontWeight: 800 }}>MT (Empty)</div>
                            <div style={{ opacity: 0.7, fontSize: 13 }}>Leave this compartment empty</div>
                          </div>
                        </div>
                      </button>

                      {terminalProducts.map((p) => {
                        const selected = !isEmpty && sel?.productId === p.product_id;
                        const btnCode = ((p.button_code ?? p.product_code ?? "").trim() || "PRD").toUpperCase();
                        const btnColor = (p.hex_code ?? "").trim() || "rgba(255,255,255,0.85)";
                        const name = (p.product_name ?? p.display_name ?? "").trim() || "Product";
                        const sub = (p.description ?? "").trim();

                        return (
                          <button
                            key={p.product_id}
                            style={{
                              textAlign: "left",
                              padding: 14,
                              borderRadius: 16,
                              border: "1px solid rgba(255,255,255,0.14)",
                              background: selected ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.06)",
                              color: "white",
                              cursor: "pointer",
                            }}
                            onClick={() => {
                              setCompPlan((prev) => ({
                                ...prev,
                                [compNumber]: { empty: false, productId: p.product_id },
                              }));
                              setCompModalOpen(false);
                              setCompModalComp(null);
                            }}
                            title={name}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                              <div
                                style={{
                                  width: 54,
                                  height: 44,
                                  borderRadius: 12,
                                  backgroundColor: "transparent",
                                  border: `2px solid ${btnColor}`,
                                  boxShadow: "none",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontWeight: 900,
                                  letterSpacing: 0.5,
                                  color: btnColor,
                                  flex: "0 0 auto",
                                }}
                              >
                                {btnCode.toUpperCase()}
                              </div>
                              <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
                                <div
                                  style={{
                                    fontWeight: 800,
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                  }}
                                >
                                  {name}
                                </div>
                                <div style={{ opacity: 0.7, fontSize: 13, lineHeight: 1.25 }}>
                                  {sub || "\u00A0"}
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
})()}
        </FullscreenModal>

</section>

      {/* Plan (Phase 5.5) */}
<section style={styles.section}>
  <div
  style={{
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    alignItems: "center",
  }}
>
  <h2 style={{ margin: 0 }}>Plan</h2>

  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
    <span style={styles.badge}>
      {planRows.length === 0 ? "No plan yet" : `${planRows.length} rows`}
    </span>

    <button
      type="button"
      onClick={beginLoadToSupabase}
      disabled={
        beginLoadBusy ||
        !selectedComboId ||
        !selectedTerminalId ||
        !selectedState ||
        !selectedCity ||
        !selectedCityId ||
        planRows.length === 0
      }
      style={{
        ...(styles as any).button,
        padding: "10px 14px",
        opacity:
          beginLoadBusy ||
          !selectedComboId ||
          !selectedTerminalId ||
          !selectedState ||
          !selectedCity ||
          !selectedCityId ||
          planRows.length === 0
            ? 0.55
            : 1,
      }}
    >
      {beginLoadBusy ? "Loading…" : activeLoadId ? "Load started" : "Load"}
    </button>
  </div>
</div>


  <div style={styles.help}>
    Target: <strong>{targetGallonsRoundedText || targetGallonsText}</strong> gal
    {" • "}
    Planned: <strong>{planRows.length ? plannedGallonsTotalText : ""}</strong> gal
    {" • "}
    Remaining: <strong>{planRows.length ? remainingGallonsText : ""}</strong> gal
  </div>

  {planRows.length === 0 ? (
    <div style={styles.help}>
      Select equipment + product, then choose “Fill to max” or enter a custom target.
    </div>
  ) : (
    <table style={styles.table}>
      <thead>
        <tr>
  <th style={styles.th}>Comp #</th>
  <th style={styles.th}>Max Gallons</th>
  <th style={styles.th}>Planned Gallons</th>
  <th style={styles.th}>Product</th>
  <th style={styles.th}>lbs/gal</th>
  <th style={styles.th}>Planned lbs</th>
</tr>

      </thead>
      <tbody>
       {planRows.map((r: any) => {
  const g = Number(r.planned_gallons ?? 0);
  const lpg = Number(r.lbsPerGal ?? 0);
  const plannedLbs = g * lpg;

  
  return (
    <tr key={r.comp_number}>
      <td style={styles.td}>{r.comp_number}</td>
      <td style={styles.td}>{r.max_gallons}</td>
      <td style={styles.td}>
        <strong>{g.toFixed(0)}</strong>
      </td>
      <td style={styles.td}>
        {r.productId ? (productNameById.get(r.productId) ?? r.productId) : ""}
      </td>
      <td style={styles.td}>{lpg ? lpg.toFixed(4) : ""}</td>
      <td style={styles.td}>{plannedLbs ? plannedLbs.toFixed(0) : ""}</td>
    </tr>
  );
})}

      </tbody>
    </table>
  )}
</section>
<FullscreenModal
  open={equipOpen}
  title="Select Equipment"
  onClose={() => setEquipOpen(false)}
>
  <div className="text-sm opacity-70">
    Placeholder: equipment selector goes here (modal list).
  </div>
</FullscreenModal>

<FullscreenModal
  open={locOpen}
  title="Select Location"
  onClose={() => setLocOpen(false)}
 footer={null}>
  <div className="space-y-4">
    <div className="text-sm text-white/70">Choose your loading city.</div>

    {/* STATE (compact / set-and-forget) */}
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-white/50">State</div>
          <div className="mt-1 text-sm font-semibold">
            {selectedState ? selectedStateLabel : "Select a state"}
          </div>
          {statesError ? <div className="mt-1 text-xs text-red-400">{statesError}</div> : null}
        </div>

        <button
          onClick={() => setStatePickerOpen((v) => !v)}
          className="rounded-xl border border-white/10 px-3 py-2 text-sm hover:bg-white/5"
        >
          {statePickerOpen ? "Close" : "Change"}
        </button>
      </div>

      {statePickerOpen ? (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {statesLoading ? (
            <div className="col-span-2 sm:col-span-3 text-sm text-white/60">Loading states…</div>
          ) : (
            stateOptions.map((s) => {
              const active = normState(s.code) === normState(selectedState);
              return (
                <button
                  key={s.code}
                  onClick={() => {
                    setSelectedState(s.code);
                    setStatePickerOpen(false);
                  }}
                  className={[
                    "rounded-2xl border px-3 py-3 text-left",
                    active ? "border-white/30 bg-white/5" : "border-white/10 hover:bg-white/5",
                  ].join(" ")}
                >
                  <div className="text-sm font-semibold">
                    {s.code} — {s.name || s.code}
                  </div>
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>

    {/* CITY (cards) */}
    <div>

      {!selectedState ? (
        <div className="text-sm text-white/50">Select a state first.</div>
      ) : citiesLoading ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/60">
          Loading cities…
        </div>
      ) : citiesError ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-red-400">
          {citiesError}
        </div>
      ) : cities.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/60">
          No cities available yet.
        </div>
      ) : (
        
  <div className="space-y-3">
    {/* Top Cities (manual starred) */}
    {topCities.length ? (
      <div>
        <div className="mb-2 text-xs uppercase tracking-wide text-white/50">Top Cities</div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {topCities.map((c) => {
            const active = c === selectedCity;
            return (
              <div
                key={`top-${c}`}
                role="button"
                tabIndex={0}
                onClick={() => {
                  setSelectedCity(c);
                  setLocOpen(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedCity(c);
                    setLocOpen(false);
                  }
                }}
                className={[
                  "rounded-2xl border px-4 py-3 text-left cursor-pointer select-none",
                  active ? "border-white/30 bg-white/5" : "border-white/10 hover:bg-white/5",
                ].join(" ")}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold">{c}</div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleCityStar(selectedState, c);
                    }}
                    aria-label="Unstar city"
                    className={starBtnClass(true)}
                  >
                    ★
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    ) : null}

    {/* Ghost divider */}
    {topCities.length ? <div className="h-px w-full bg-white/10" /> : null}

    {/* All Cities (non-starred only) */}
    <div>
      <div className="mb-2 text-xs uppercase tracking-wide text-white/50">All Cities</div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {allCities.map((c) => {
          const active = c === selectedCity;
          const starred = isCityStarred(selectedState, c);

          return (
            <div
              key={c}
              role="button"
              tabIndex={0}
              onClick={() => {
                setSelectedCity(c);
                setLocOpen(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelectedCity(c);
                  setLocOpen(false);
                }
              }}
              className={[
                "rounded-2xl border px-4 py-3 text-left cursor-pointer select-none",
                active ? "border-white/30 bg-white/5" : "border-white/10 hover:bg-white/5",
              ].join(" ")}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold">{c}</div>

                <button
                  type="button"
                  onClick={(e) => {
                      e.stopPropagation();
                      toggleCityStar(selectedState, c);
                  }}
                  aria-label={starred ? "Unstar city" : "Star city"}
                  className={starBtnClass(starred)}
                >
                  {starred ? "★" : "☆"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  </div>
)}
    </div>

    </div>
</FullscreenModal>

<FullscreenModal
  open={termOpen}
  title="My Terminals"
  onClose={() => setTermOpen(false)}
>
  {!selectedState || !selectedCity ? (
    <div className="text-sm text-white/60">Select a city first.</div>
  ) : (
    <div className="space-y-3">
      <div className="text-sm text-white/70">
        Showing terminals in{" "}
        <span className="text-white">
          {selectedCity}, {selectedState}
        </span>
      </div>

      {termError ? <div className="text-sm text-red-400">{termError}</div> : null}

      {terminalsFiltered.filter((t) => t.status !== "not_carded").length === 0 ? (
        <div className="text-sm text-white/60">No terminals saved for this city.</div>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          {terminalsFiltered
            .filter((t) => t.status !== "not_carded")
            .map((t, idx) => {
              const active = String(t.terminal_id) === String(selectedTerminalId);
              const expiresISO =
  (t as any).expires_on ||
  (t as any).expires ||
  (t as any).expires_at ||
  ""; // fallback

const activationISO =
  (t as any).carded_on ||
  (t as any).added_on ||
  "";

const renewalDays = Number(
  (t as any).renewal_days ??
  (t as any).renewalDays ??
  (t as any).renewal ??
  90
) || 90;


const computedExpiresISO =
  activationISO && /^\d{4}-\d{2}-\d{2}$/.test(activationISO)
    ? addDaysISO_(activationISO, renewalDays)
    : "";

const displayISO = expiresISO || computedExpiresISO;

const expired = displayISO ? isPastISO_(displayISO) : false;

              const isExpanded = expandedTerminalId === String(t.terminal_id);
              const busy = String(cardingBusyId) === String(t.terminal_id);

              const selectTerminal = () => {
                setSelectedTerminalId(String(t.terminal_id));
                setTermOpen(false);
              };

              return (
                <div
                  key={t.terminal_id ? String(t.terminal_id) : `my-${idx}`}
                  role="button"
                  tabIndex={0}
                  onClick={selectTerminal}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      selectTerminal();
                    }
                  }}
                  className={[
                    "rounded-2xl border transition cursor-pointer select-none px-3 py-3",
                    active ? "border-white/30 bg-white/5" : "border-white/10 hover:bg-white/5",
                  ].join(" ")}
                >
                  <div className="flex items-start gap-3">
                    {/* icon well (match top tiles vibe) */}
                    <div className="shrink-0 p-1">
                      <div
                        className={[
                          "h-14 w-14 rounded-xl border flex items-center justify-center text-xs",
                          active ? "border-white/20 bg-black text-orange-400" : "border-white/10 bg-[#2a2a2a] text-white/50",
                        ].join(" ")}
                        aria-hidden="true"
                      >
                        Img
                      </div>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-white truncate">
                        {t.terminal_name ?? "(unnamed terminal)"}
                      </div>

                      {displayISO ? (
  <div className={["mt-1 text-xs tabular-nums", expired ? "text-red-400" : "text-white/50"].join(" ")}>
    {formatMDYWithCountdown_(displayISO)}
  </div>
) : null}

                    </div>

                    {/* right controls: star + view (side-by-side) */}
                    <div className="flex items-center gap-2">
                      <button
  type="button"
  onClick={(e) => {
    e.stopPropagation();
 const tid = String(t.terminal_id);

toggleTerminalStar(tid, true); // TRUE = currently starred => DELETE

// optimistic remove from UI
setMyTerminalIds((prev) => {
  const s = new Set(prev);
  s.delete(tid);
  return s;
});
setTerminals((prev: any) => prev.filter((x: any) => String(x.terminal_id) !== tid));


  }}
  className={starBtnClass(myTerminalIds.has(String(t.terminal_id)))}
  aria-label={myTerminalIds.has(String(t.terminal_id)) ? "Remove from My Terminals" : "Add to My Terminals"}
  title={myTerminalIds.has(String(t.terminal_id)) ? "Remove from My Terminals" : "Add to My Terminals"}
>
  {myTerminalIds.has(String(t.terminal_id)) ? "★" : "☆"}
</button>


                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedTerminalId(isExpanded ? null : String(t.terminal_id));
                        }}
                        className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
                        aria-label="View terminal details"
                        title="View"
                      >
                        View
                      </button>
                    </div>
                  </div>

                  {expired ? (
                    <div className="mt-3">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={(e) => {
                          e.stopPropagation();
                          doGetCardedForTerminal(String(t.terminal_id));
                        }}
                        className={[
                          "w-full rounded-xl border px-3 py-2 text-sm",
                          busy
                            ? "border-red-400/10 bg-red-400/10 text-red-200/60"
                            : "border-red-400/20 bg-red-400/10 text-red-200 hover:bg-red-400/15",
                        ].join(" ")}
                      >
                        {busy ? "Getting carded…" : "Get carded"}
                      </button>
                    </div>
                  ) : null}

                  {isExpanded ? (
                    <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/70">
                      <div className="text-white/80 font-semibold">Terminal details</div>
                      <div className="mt-1">Business-card placeholder.</div>
                    </div>
                  ) : null}
                </div>
              );
            })}
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          setTermOpen(false);
          setCatalogExpandedId(null);
          setCatalogOpen(true);
        }}
        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm text-white/80 hover:bg-white/10"
      >
        + Get carded
      </button>
    </div>
  )}
</FullscreenModal>

<FullscreenModal
  open={catalogOpen}
  title="Get Carded"
  onClose={() => {
    setCatalogOpen(false);
    setTermOpen(true);
  }}
>
  {!selectedState || !selectedCity ? (
    <div className="text-sm text-white/60">Select a city first.</div>
  ) : (
    <div className="space-y-3">
      <div className="text-sm text-white/70">
        Terminal catalog for{" "}
        <span className="text-white">
          {selectedCity}, {selectedState}
        </span>
      </div>

      {termError ? <div className="text-sm text-red-400">{termError}</div> : null}
      {catalogError ? <div className="text-sm text-red-400">{catalogError}</div> : null}

      {catalogTerminalsInCity.length === 0 ? (
        <div className="text-sm text-white/60">No terminals found for this city.</div>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          {catalogTerminalsInCity.map((t, idx) => {
            const id = String(t.terminal_id);
            const isInMy = myTerminalIds.has(id);

            const isExpanded = catalogExpandedId === id;

            return (
              <div
                key={t.terminal_id ? id : `cat-${idx}`}
                role="button"
                tabIndex={0}
                onClick={() => setCatalogExpandedId(isExpanded ? null : id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setCatalogExpandedId(isExpanded ? null : id);
                  }
                }}
                className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 hover:bg-white/10 cursor-pointer select-none"
              >
                <div className="flex items-start gap-3">
                  <div className="shrink-0 p-1">
                    <div className="h-14 w-14 rounded-xl border border-white/10 bg-[#2a2a2a] flex items-center justify-center text-xs text-white/50">
                      Img
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-white truncate">
                      {t.terminal_name ?? "(unnamed terminal)"}
                    </div>
                    {(() => {
                      const tid = String(t.terminal_id);
                      const activationISO = accessDateByTerminalId[tid] ?? "";
                      const renewalDays = Number((t as any).renewal_days ?? 90);
                      const expiresISO = activationISO ? addDaysISO_(activationISO, renewalDays) : "";
                      const expiresExpired = expiresISO ? isPastISO_(expiresISO) : false;
                      const expiresLabel = expiresISO ? formatMDYWithCountdown_(expiresISO) : "Set Activation Date";

                      const isEditing = catalogEditingDateId === tid;

                      return (
                        <div className="mt-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setCatalogEditingDateId(isEditing ? null : tid);
                            }}
                            className={[
                              "text-xs tabular-nums underline-offset-2 hover:underline",
                              expiresISO ? (expiresExpired ? "text-red-400" : "text-white/50") : "text-white/60",
                            ].join(" ")}
                            title="Set activation date"
                          >
                            {expiresLabel}
                          </button>

                          {isEditing ? (
                            <div
                              className="mt-2 rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-white/70"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="text-white/80 font-semibold">Set Activation Date</div>
                              <div className="mt-2 flex items-center gap-2">
                                <input
                                  type="date"
                                  value={activationISO}
                                  onChange={(e) => setAccessDateForTerminal_(tid, e.target.value)}
                                  className="rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-xs text-white"
                                />
                                <button
                                  type="button"
                                  onClick={() => setAccessDateForTerminal_(tid, isoToday_())}
                                  className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
                                >
                                  Today
                                </button>
                              </div>

                              <div className="mt-2 text-white/60">
                                Expires: {expiresISO ? formatMDYWithCountdown_(expiresISO) : "—"}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })()}
                  </div>

                  {/* multi-select star (membership) */}
                  <div className="flex items-center">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleTerminalStar(id, isInMy);

const next = !isInMy;
setMyTerminalIds((prev) => {
  const s = new Set(prev);
  if (next) s.add(id);
  else s.delete(id);
  return s;
});

                        if (!isInMy && !accessDateByTerminalId[id]) {
                          setAccessDateForTerminal_(id, isoToday_());
                        }

                      }}
                      className={starBtnClass(isInMy)}
                      aria-label={isInMy ? "Remove from My Terminals" : "Add to My Terminals"}
                      title={isInMy ? "Remove from My Terminals" : "Add to My Terminals"}
                    >
                      {isInMy ? "★" : "☆"}
                    </button>
                  </div>
                </div>

                {isExpanded ? (
                  <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white/70">
                    <div className="text-white/80 font-semibold">Terminal details</div>
                    <div className="mt-1">Business-card placeholder.</div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

    
    </div>
  )}
</FullscreenModal>



    </div>
  );
}
