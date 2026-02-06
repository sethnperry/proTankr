"use client";

import { QuickPanel } from "./QuickPanel";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";

import { TopTiles } from "./TopTiles";

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
  status: "valid" | "expired" | "not_carded";
  starred: boolean | null;
};

type TerminalCatalogRow = {
  terminal_id: string;
  state: string | null;
  city: string | null;
  terminal_name: string | null;
  timezone: string | null;
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
};

export default function CalculatorPage() {
  const [authEmail, setAuthEmail] = useState<string>("");

const [equipOpen, setEquipOpen] = useState(false);
const [locOpen, setLocOpen] = useState(false);
const [termOpen, setTermOpen] = useState(false);

const [getCardedMode, setGetCardedMode] = useState(false);
const [getCardedBusyId, setGetCardedBusyId] = useState<string | null>(null);

const [useCustomCardedDate, setUseCustomCardedDate] = useState(false);
const [customCardedDate, setCustomCardedDate] = useState<string>(""); // YYYY-MM-DD

const [cardedOn, setCardedOn] = useState<string>(() => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`; // input[type=date] wants YYYY-MM-DD
});

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

  async function toggleTerminalStar(terminalId: string) {
    // Find current value (optimistic flip)
    const current = terminals.find((t) => String(t.terminal_id) === String(terminalId));
    const next = !Boolean(current?.starred);

    setTerminals((prev) =>
      sortMyTerminals(
        prev.map((t) =>
          String(t.terminal_id) === String(terminalId) ? { ...t, starred: next } : t
        ) as TerminalRow[]
      )
    );

    const { error } = await supabase
      .from("my_terminals")
      .update({ starred: next })
      .eq("terminal_id", terminalId);

    if (error) {
      // revert
      setTerminals((prev) =>
        sortMyTerminals(
          prev.map((t) =>
            String(t.terminal_id) === String(terminalId) ? { ...t, starred: !next } : t
          ) as TerminalRow[]
        )
      );
      setTermError(error.message);
      return;
    }

    // refresh from view (keeps status in sync too)
    await loadMyTerminals();
  }



// Terminal catalog (for Location picker only)
const [terminalCatalog, setTerminalCatalog] = useState<TerminalCatalogRow[]>([]);
const [catalogLoading, setCatalogLoading] = useState(false);
const [catalogError, setCatalogError] = useState<string | null>(null);



  // Terminal products
  const [terminalProducts, setTerminalProducts] = useState<ProductRow[]>([]);
  const [tpLoading, setTpLoading] = useState(false);
  const [tpError, setTpError] = useState<string | null>(null);

  // -----------------------
  // Planning inputs
  // -----------------------

  // Temperature (applies to all compartments for now)
  const [tempF, setTempF] = useState<number>(60);

 
  // Per-compartment planning inputs
  const [compPlan, setCompPlan] = useState<Record<number, CompPlanInput>>({});

  // Volume-bias "CG" slider
  const [cgSlider, setCgSlider] = useState<number>(0.25); // 0..1 ; 0.25 is neutral (offset zero)
  

  // -----------------------
  // Derived selections
  // -----------------------

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

const terminalCardedText = selectedTerminal?.carded_on
  ? formatMDY(selectedTerminal.carded_on)
  : undefined;

const terminalCardedClass =
  terminalCardedText
    ? (selectedTerminal?.status === "expired" ? "text-red-500" : "text-white/50")
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
      const maxGallons = Number(c.max_gallons ?? 0);
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
const CG_NEUTRAL = 0.25;     // 25% = 0 bias
const CG_FRONT_MAX = 0.75;   // 75% = +1 bias
const CG_REAR_MAX = 0.00;    // 0%  = -1 bias
const PLOW_BIAS_MAX = 2.5;   // 100% = +2.5 bias (stronger than +1)

const cgBias = useMemo(() => {
  const s = Math.max(0, Math.min(1, Number(cgSlider) || 0));

  // Rear side: [0.00 .. 0.25] -> [-1 .. 0]
  if (s < CG_NEUTRAL) {
    const t = (CG_NEUTRAL - s) / (CG_NEUTRAL - CG_REAR_MAX); // 0..1
    return -Math.max(0, Math.min(1, t));
  }

  // Front side stage 1: [0.25 .. 0.75] -> [0 .. +1]
  if (s <= CG_FRONT_MAX) {
    const t = (s - CG_NEUTRAL) / (CG_FRONT_MAX - CG_NEUTRAL); // 0..1
    return Math.max(0, Math.min(1, t));
  }

  // Front side stage 2 ("plow"): [0.75 .. 1.00] -> [+1 .. +PLOW_BIAS_MAX]
  const t2 = (s - CG_FRONT_MAX) / (1 - CG_FRONT_MAX); // 0..1
  return 1 + t2 * (PLOW_BIAS_MAX - 1);
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
      .select("terminal_id, state, city, terminal_name, carded_on, starred:is_starred")
      .order("state", { ascending: true })
      .order("city", { ascending: true })
      .order("terminal_name", { ascending: true })
      //.returns<TerminalRow[]>();

console.log("first row:", data && data[0]);

    if (error) {
      setTermError(error.message);
      setTerminals([]);
    } else {
      setTerminals(sortMyTerminals((data ?? []) as TerminalRow[]));
    }

    setTermLoading(false);
  }






  useEffect(() => {
    loadMyTerminals();
  }, []);

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
    setSelectedCity("");
    setSelectedTerminalId("");
  }, [selectedState]);

  useEffect(() => {
    setSelectedTerminalId("");
  }, [selectedCity]);


  // --- Fetch compartments when trailer changes ---
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
  const states = useMemo(() => {
  return Array.from(new Set(terminalCatalog.map((t) => (t.state ?? "").trim())))
    .filter(Boolean)
    .sort();
}, [terminalCatalog]);

const cities = useMemo(() => {
  return Array.from(
    new Set(
      terminalCatalog
        .filter((t) => (t.state ?? "").trim() === selectedState)
        .map((t) => (t.city ?? "").trim())
    )
  )
    .filter(Boolean)
    .sort();
}, [terminalCatalog, selectedState]);


  const terminalsFiltered = useMemo(() => {
    return terminals
      .filter(
        (t) => (t.state ?? "").trim() === selectedState && (t.city ?? "").trim() === selectedCity
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
      (t) => (t.state ?? "").trim() === selectedState && (t.city ?? "").trim() === selectedCity
    )
    .sort((a, b) => {
        const aStar = Boolean(a.starred);
        const bStar = Boolean(b.starred);
        if (aStar !== bStar) return aStar ? -1 : 1;
        return String(a.terminal_name ?? "").localeCompare(String(b.terminal_name ?? ""));
      });
}, [terminalCatalog, selectedState, selectedCity]);

  return (
    <div style={styles.page}>
      <h1 style={{ marginBottom: 6 }}>Calculator</h1>
<div className="my-3">
<TopTiles
  locationTitle={locationLabel ?? "City, State"}
  ambientSubtitle={locationLabel ? "67° ambient" : undefined}
  terminalTitle={terminalLabel ?? "Terminal"}
  terminalSubtitle={terminalCardedText}
  terminalSubtitleClassName={terminalCardedClass}
  onOpenLocation={() => setLocOpen(true)}
  onOpenTerminal={() => setTermOpen(true)}
  terminalEnabled={terminalEnabled}
  locationSelected={Boolean(selectedCity && selectedState)}
  terminalSelected={Boolean(selectedTerminalId)}
/>

<div style={{ fontSize: 12, opacity: 0.7, marginTop: 6, whiteSpace: "pre-wrap" }}>
  debug:
  {"\n"}selectedTerminalId={String(selectedTerminalId)}
  {"\n"}terminalsCount={String(terminals?.length ?? 0)}
  {"\n"}firstTerminal={JSON.stringify(terminals?.[0] ?? null)}
  {"\n"}carded_on={String(selectedTerminal?.carded_on)}
  {"\n"}status={String(selectedTerminal?.status)}
  {"\n"}starred={String(selectedTerminal?.starred)}
</div>


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
      {`${t.starred ? "★ " : ""}${t.terminal_name ?? "(unnamed terminal)"}${t.status === "expired" ? " — EXPIRED" : t.status === "not_carded" ? " — NOT CARDED" : ""}`}
    </option>
  );
})}

            </select>
          </div>
        </div>

        {selectedTerminal && (
          <div style={styles.help}>
            Selected: <strong>{selectedTerminal.terminal_name}</strong>
            {selectedTerminal.timezone ? ` • ${selectedTerminal.timezone}` : ""}
          </div>
        )}
      </section>

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

<div style={{ ...styles.row, marginTop: 10 }}>
   <div>
    <label style={styles.label}>Temp (°F)</label>
    <input
      type="number"
      value={tempF}
      onChange={(e) => setTempF(Number(e.target.value))}
      style={{ ...styles.input, width: 140 }}
      disabled={!selectedTerminalId}
    />
  </div>
</div>

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
      <label style={styles.label}>
        CG slider (volume bias) — rear ⟵ | ⟶ front
      </label>

      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={cgSlider}
        onChange={(e) => setCgSlider(Number(e.target.value))}
        style={{ width: "100%" }}
        disabled={!selectedCombo}
      />

      <div style={{ ...styles.help, display: "flex", justifyContent: "space-between" }}>
        <span>Rear</span>
        <span>
          Neutral @ {Math.round(CG_NEUTRAL * 100)}% • Current: {Math.round(cgSlider * 100)}% • Bias:{" "}
          {cgBias.toFixed(2)}
        </span>
        <span>Front</span>
      </div>

      {unstableLoad && (
        <div style={{ ...styles.error, marginTop: 8 }}>
          ⚠️ Unstable load (rear of neutral)
        </div>
      )}
    </div>
  </div>
)}


        {terminalProducts.length > 0 && (
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

        {selectedTrailerId && !compLoading && !compError && compartments.length === 0 && (
          <div style={styles.help}>No compartments found for this trailer.</div>
        )}

        {compartments.length > 0 && (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Comp #</th>
<th style={styles.th}>Max Gallons</th>
<th style={styles.th}>Position</th>
<th style={styles.th}>Empty</th>
<th style={styles.th}>Product</th>

              </tr>
            </thead>
            <tbody>
              {compartments.map((c) => (
                <tr key={c.comp_number}>
                  <td style={styles.td}>{c.comp_number}</td>
                  <td style={styles.td}>{c.max_gallons}</td>
                  <td style={styles.td}>{c.position}</td>
<td style={styles.td}>
  <input
    type="checkbox"
    checked={!!compPlan[c.comp_number]?.empty}
    onChange={(e) => {
      const checked = e.target.checked;
      setCompPlan((prev) => ({
        ...prev,
        [c.comp_number]: {
          empty: checked,
          productId: checked ? "" : (prev[c.comp_number]?.productId ?? ""),
        },
      }));
    }}
  />
</td>

<td style={styles.td}>
  <select
    value={compPlan[c.comp_number]?.productId ?? ""}
    onChange={(e) => {
      const value = e.target.value;
      setCompPlan((prev) => ({
        ...prev,
        [c.comp_number]: {
          empty: prev[c.comp_number]?.empty ?? false,
          productId: value,
        },
      }));
    }}
    style={{ ...styles.select, width: 240 }}
    disabled={!!compPlan[c.comp_number]?.empty || terminalProducts.length === 0}
  >
    <option value="">Select…</option>
    {terminalProducts.map((p) => (
      <option key={p.product_id} value={p.product_id}>
        {p.product_name ?? "(unnamed product)"}
      </option>
    ))}
  </select>
</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Plan (Phase 5.5) */}
<section style={styles.section}>
  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
    <h2 style={{ margin: 0 }}>Plan</h2>
    <span style={styles.badge}>
      {planRows.length === 0 ? "No plan yet" : `${planRows.length} rows`}
    </span>
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
>
  <div className="space-y-4">
  <div className="text-sm text-white/70">
    Choose your loading city.
  </div>

  {/* STATE */}
  <div>
    <div className="mb-2 text-xs uppercase tracking-wide text-white/50">State</div>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {states.map((s) => {
        const active = s === selectedState;
        return (
          <button
            key={s}
            onClick={() => setSelectedState(s)}
            className={[
              "rounded-2xl border px-3 py-3 text-left",
              active ? "border-white/30 bg-white/5" : "border-white/10 hover:bg-white/5",
            ].join(" ")}
          >
            <div className="text-sm font-semibold">{s}</div>
          </button>
        );
      })}
    </div>
  </div>

  {/* CITY */}
  <div>
    <div className="mb-2 text-xs uppercase tracking-wide text-white/50">City</div>

    {!selectedState ? (
      <div className="text-sm text-white/50">Select a state first.</div>
    ) : (
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {cities.map((c) => {
          const active = c === selectedCity;
          return (
            <button
              key={c}
              onClick={() => {
                setSelectedCity(c);
                setLocOpen(false); // close after city pick
              }}
              className={[
                "rounded-2xl border px-4 py-3 text-left",
                active ? "border-white/30 bg-white/5" : "border-white/10 hover:bg-white/5",
              ].join(" ")}
            >
              <div className="text-sm font-semibold">{c}</div>
            </button>
          );
        })}
      </div>
    )}
  </div>
</div>

</FullscreenModal>

<FullscreenModal
  open={termOpen}
  title="Select Terminal"
  onClose={() => {
    setGetCardedMode(false);
    setTermOpen(false);
  }}
>
  {!selectedState || !selectedCity ? (
    <div className="text-sm text-white/60">Select a city first.</div>
  ) : getCardedMode ? (
    /* ================= GET CARDED MODE ================= */

    
    <div className="space-y-3">
      <div className="text-sm text-white/70">
        Get carded in{" "}
        <span className="text-white">
          {selectedCity}, {selectedState}
        </span>
      </div>

      {termError ? <div className="text-sm text-red-400">{termError}</div> : null}
<div className="rounded-2xl border border-white/10 bg-white/5 p-3">
  <div className="flex items-center justify-between gap-3">
    <div>
      <div className="text-sm font-semibold text-white">Carded date</div>
      <div className="text-xs text-white/50">
        Leave off for today’s date. Use this if the driver forgot to enter it.
      </div>
    </div>

    <button
      type="button"
      onClick={() => {
        setUseCustomCardedDate((v) => !v);
        // When turning ON, default to today if empty
        if (!useCustomCardedDate && !customCardedDate) {
          const d = new Date();
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, "0");
          const dd = String(d.getDate()).padStart(2, "0");
          setCustomCardedDate(`${yyyy}-${mm}-${dd}`);
        }
      }}
      className={[
        "rounded-xl border px-3 py-2 text-xs transition",
        useCustomCardedDate
          ? "border-white/25 bg-black text-white"
          : "border-white/10 bg-transparent text-white/70 hover:bg-white/5",
      ].join(" ")}
    >
      {useCustomCardedDate ? "Custom" : "Today"}
    </button>
  </div>

  {useCustomCardedDate ? (
    <div className="mt-3">
      <input
        type="date"
        value={customCardedDate}
        onChange={(e) => setCustomCardedDate(e.target.value)}
        className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
      />
      <div className="mt-1 text-[11px] text-white/40">
        Selected: <span className="tabular-nums">{customCardedDate || "(none)"}</span>
      </div>
    </div>
  ) : null}
</div>

      {catalogTerminalsInCity.length === 0 ? (
        <div className="text-sm text-white/60">
          No terminals in the catalog for this city.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          {catalogTerminalsInCity.map((t, idx) => {
            const busy = getCardedBusyId === String(t.terminal_id);

            return (
              <button
                key={t.terminal_id ? String(t.terminal_id) : `term-btn-${t.terminal_name ?? "unknown"}-${idx}`}
                type="button"
                disabled={busy}
                onClick={async () => {
                  try {
                    setTermError(null);
                    setGetCardedBusyId(String(t.terminal_id));

                  const todayISO = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

const cardedOnISO =
  useCustomCardedDate && customCardedDate
    ? customCardedDate
    : todayISO;

const { error: rpcError } = await supabase.rpc("get_carded", {
  p_terminal_id: t.terminal_id,
  p_carded_on: cardedOnISO,
});




                    if (rpcError) {
                      setTermError(rpcError.message);
                      return;
                    }

                    const { data: fresh, error: freshErr } = await supabase
  .from("my_terminals_with_status")
  .select("*")
  .limit(5);
console.log("my_terminals_with_status first row:", fresh?.[0]);
console.log("my_terminals_with_status keys:", fresh?.[0] ? Object.keys(fresh[0]) : []);


                    console.log("my_terminals_with_status first row:", fresh?.[0]);


                    setTerminals(sortMyTerminals(fresh ?? []));
                    setSelectedTerminalId(String(t.terminal_id));
                    setGetCardedMode(false);
                    setTermOpen(false);
                  } catch (e: any) {
                    setTermError(e?.message ?? String(e));
                  } finally {
                    setGetCardedBusyId(null);
                  }
                }}
                className={[
                  "rounded-2xl border px-4 py-3 text-left transition",
                  busy ? "opacity-60 pointer-events-none" : "border-white/10 hover:bg-white/5",
                ].join(" ")}
              >
                <div className="text-sm font-semibold text-white">
                  {`${t.starred ? "★ " : ""}${t.terminal_name ?? "(unnamed terminal)"}${t.status === "expired" ? " — EXPIRED" : t.status === "not_carded" ? " — NOT CARDED" : ""}`}
                  {busy ? <span className="ml-2 text-xs text-white/50">Adding…</span> : null}
                </div>

                <div className="mt-1 text-xs text-white/50">
                  {t.city ?? ""}
                  {t.city ? ", " : ""}
                  {t.state ?? ""}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={() => setGetCardedMode(false)}
        className="pt-2 text-xs text-white/50 hover:text-white"
      >
        ← Back
      </button>
    </div>
  ) : (
    /* ================= NORMAL MODE ================= */
<div className="space-y-3">
  <div className="text-sm text-white/70">
    Showing terminals in{" "}
    <span className="text-white">
      {selectedCity}, {selectedState}
    </span>
  </div>

  {terminalsFiltered.length === 0 ? (
    <div className="text-sm text-white/60">No terminals saved for this city.</div>
  ) : (
    <div className="grid grid-cols-1 gap-2">
      {terminalsFiltered.map((t, idx) => {
        const active = String(t.terminal_id) === String(selectedTerminalId);

        const selectTerminal = () => {
          setSelectedTerminalId(String(t.terminal_id));
          setTermOpen(false);
        };

        return (
          <div
            key={t.terminal_id ? String(t.terminal_id) : `term-btn-${idx}`}
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
              "rounded-2xl border px-4 py-3 text-left transition cursor-pointer select-none",
              active ? "border-white/30 bg-white/5" : "border-white/10 hover:bg-white/5",
            ].join(" ")}
          >
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleTerminalStar(String(t.terminal_id));
                }}
                className={[
                  "rounded-lg px-2 py-1 text-sm transition",
                  t.starred ? "text-yellow-300/90 hover:text-yellow-200" : "text-white/50 hover:text-white",
                ].join(" ")}
                aria-label={t.starred ? "Unstar terminal" : "Star terminal"}
                title={t.starred ? "Starred" : "Star"}
              >
                {t.starred ? "★" : "☆"}
              </button>

              <div className="text-sm font-semibold text-white">
                {t.terminal_name ?? "(unnamed terminal)"}
              </div>

              <div className="ml-auto flex items-center gap-2">
                <span
                  className={[
                    "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                    t.status === "valid"
                      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
                      : t.status === "expired"
                      ? "border-red-400/20 bg-red-400/10 text-red-200"
                      : "border-white/10 bg-white/5 text-white/60",
                  ].join(" ")}
                >
                  {t.status === "valid" ? "Valid" : t.status === "expired" ? "Expired" : "Not carded"}
                </span>

                {t.carded_on ? (
                  <div
                    className={[
                      "text-xs tabular-nums",
                      t.status === "expired" ? "text-red-500" : "text-white/70",
                    ].join(" ")}
                  >
                    {formatMDY(t.carded_on)}
                  </div>
                ) : null}
              </div>
            </div>

            {t.status !== "valid" ? (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setGetCardedMode(true);
                  }}
                  className={[
                    "rounded-xl border px-3 py-2 text-xs transition",
                    t.status === "expired"
                      ? "border-red-400/20 bg-red-400/10 text-red-200 hover:bg-red-400/15"
                      : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10",
                  ].join(" ")}
                >
                  {t.status === "expired" ? "Update carded date" : "Get carded"}
                </button>
              </div>
            ) : null}

            <div className="mt-1 text-xs text-white/50">
              {t.city ?? ""}
              {t.city ? ", " : ""}
              {t.state ?? ""}
            </div>
          </div>
        );
      })}
    </div>
  )}

  {/* Get Carded link (always available) */}
  <button
    type="button"
    onClick={() => setGetCardedMode(true)}
    className="pt-2 text-xs text-white/50 hover:text-white"
  >
    + Get Carded
  </button>
</div>

  )}
</FullscreenModal>


    </div>
  );
}
