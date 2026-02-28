"use client";

/**
 * EquipmentModal — v5
 *
 * Changes from v4:
 *  1. Star moved inline next to action button on coupled cards
 *  2. "Browse fleet →" link moved ABOVE uncoupled section
 *  3. Region dropdown added above truck/trailer selects
 *  4. couple_combo RPC now auto-resolves company_id (fix_couple_combo_rpc.sql)
 *  5. Fleet modal title → "Coupled Fleet"
 *  6. Fleet region filter now fetches regions from trucks table directly (not
 *     derived from combo results), so Northeast + Southeast both appear
 *  7. Main modal shows ONLY starred combos. Fleet modal shows ALL coupled combos.
 *     Star in Fleet → adds to main list. Star in main → removes from main list.
 *
 * Schema:
 *   equipment_combos: combo_id, combo_name, truck_id, trailer_id,
 *                     tare_lbs, gross_limit_lbs, buffer_lbs,
 *                     active, claimed_by, claimed_at, company_id
 *   trucks:           truck_id, truck_name, active, company_id, region
 *   trailers:         trailer_id, trailer_name, cg_max, active, company_id, region
 *   profiles:         user_id, display_name
 *   user_primary_trucks:   user_id, truck_id, created_at
 *   user_primary_trailers: user_id, trailer_id, created_at
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import DecoupleModal from "./DecoupleModal";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ComboRow = {
  combo_id: string;
  combo_name?: string | null;
  truck_id?: string | null;
  trailer_id?: string | null;
  tare_lbs?: number | null;
  gross_limit_lbs?: number | null;
  buffer_lbs?: number | null;
  active?: boolean | null;
  claimed_by?: string | null;
  claimed_at?: string | null;
  company_id?: string | null;
};

type TruckRow = {
  truck_id: string;
  truck_name: string;
  active: boolean | null;
  region?: string | null;
  status_code?: string | null;
  status_location?: string | null;
  status_notes?: string | null;
  status_updated_at?: string | null;
};

type TrailerRow = {
  trailer_id: string;
  trailer_name: string;
  active: boolean | null;
  region?: string | null;
  status_code?: string | null;
  status_location?: string | null;
  status_notes?: string | null;
  status_updated_at?: string | null;
};

type FleetCombo = ComboRow & {
  truck_name?: string | null;
  trailer_name?: string | null;
  truck_region?: string | null;
  claimed_by_name?: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  authUserId: string | null;
  combos: ComboRow[];
  combosLoading: boolean;
  combosError: string | null;
  selectedComboId: string;
  onSelectComboId: (id: string) => void;
  onRefreshCombos: () => void;
};

type View = "list" | "new_tare" | "confirm_target";

// ─── Star button ──────────────────────────────────────────────────────────────

function StarBtn({
  active,
  busy,
  onToggle,
  title,
}: {
  active: boolean;
  busy: boolean;
  onToggle: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      disabled={busy}
      title={title ?? (active ? "Remove from my equipment" : "Add to my equipment")}
      style={{
        background: "none",
        border: "none",
        padding: "2px 4px",
        color: active ? "rgba(234,179,8,0.95)" : "rgba(255,255,255,0.22)",
        fontSize: 18,
        cursor: busy ? "not-allowed" : "pointer",
        flexShrink: 0,
        transition: "color 120ms ease",
        opacity: busy ? 0.5 : 1,
        lineHeight: 1,
      }}
    >
      {active ? "★" : "☆"}
    </button>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  sectionHeader: {
    fontSize: 16,
    fontWeight: 700 as const,
    color: "rgba(255,255,255,0.35)",
    letterSpacing: 0.8,
    textTransform: "uppercase" as const,
    margin: "8px 0 4px",
  },
  sub: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 13,
    marginBottom: 14,
    lineHeight: 1.5,
  },
  err: {
    borderRadius: 16,
    padding: 14,
    background: "rgba(180,40,40,0.18)",
    border: "1px solid rgba(180,40,40,0.32)",
    color: "rgba(255,255,255,0.92)",
    fontWeight: 700,
    marginBottom: 16,
    fontSize: 13,
    lineHeight: 1.5,
  } as React.CSSProperties,
  info: {
    borderRadius: 16,
    padding: 14,
    background: "rgba(40,80,180,0.14)",
    border: "1px solid rgba(64,140,255,0.22)",
    color: "rgba(200,220,255,0.88)",
    fontSize: 14,
    lineHeight: 1.5,
    marginBottom: 16,
    fontWeight: 700 as const,
  } as React.CSSProperties,
  divider: {
    height: 1,
    background: "rgba(255,255,255,0.08)",
    margin: "20px 0",
  },
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.05)",
    boxShadow: "0 6px 16px rgba(0,0,0,0.32)",
    marginBottom: 10,
  } as React.CSSProperties,
  rowMine: {
    background: "rgba(32,88,170,0.22)",
    border: "1px solid rgba(64,140,255,0.22)",
  } as React.CSSProperties,
  rowInUse: {
    background: "rgba(80,40,10,0.22)",
    border: "1px solid rgba(180,100,30,0.28)",
  } as React.CSSProperties,
  rowName: {
    fontSize: 16,
    fontWeight: 900 as const,
    letterSpacing: 0.2,
    lineHeight: 1.2,
  },
  rowSub: {
    marginTop: 4,
    color: "rgba(255,255,255,0.50)",
    fontSize: 13,
  },
  rowMineBadge: {
    marginTop: 4,
    color: "rgba(100,200,255,0.85)",
    fontSize: 13,
    fontWeight: 700 as const,
  },
  rowInUseBadge: {
    marginTop: 4,
    color: "rgba(255,170,80,0.90)",
    fontSize: 13,
    fontWeight: 700 as const,
  },
  btn: {
    borderRadius: 10,
    padding: "8px 14px",
    fontWeight: 900 as const,
    fontSize: 13,
    letterSpacing: 0.5,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.09)",
    color: "rgba(255,255,255,0.92)",
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
    flexShrink: 0,
  } as React.CSSProperties,
  btnPrimary: {
    background: "rgba(255,255,255,0.13)",
    border: "1px solid rgba(255,255,255,0.20)",
  } as React.CSSProperties,
  btnDecouple: {
    background: "rgba(180,80,20,0.18)",
    border: "1px solid rgba(220,120,40,0.35)",
    color: "rgba(255,190,120,0.95)",
  } as React.CSSProperties,
  btnSlipSeat: {
    background: "rgba(120,60,160,0.22)",
    border: "1px solid rgba(180,100,220,0.35)",
    color: "rgba(210,160,255,0.95)",
  } as React.CSSProperties,
  select: {
    width: "100%",
    borderRadius: 14,
    padding: "12px 14px",
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(0,0,0,0.40)",
    color: "rgba(255,255,255,0.92)",
    fontSize: 16,
    outline: "none",
    marginBottom: 12,
    appearance: "none" as const,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='rgba(255,255,255,0.4)' stroke-width='1.8' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat" as const,
    backgroundPosition: "right 14px center",
    paddingRight: 36,
  } as React.CSSProperties,
  label: {
    fontSize: 13,
    fontWeight: 700 as const,
    color: "rgba(255,255,255,0.55)",
    marginBottom: 6,
    display: "block",
  },
  input: {
    width: "100%",
    borderRadius: 14,
    padding: "12px 14px",
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(0,0,0,0.28)",
    color: "rgba(255,255,255,0.92)",
    fontSize: 18,
    fontWeight: 700 as const,
    outline: "none",
    boxSizing: "border-box" as const,
  } as React.CSSProperties,
  linkBtn: {
    background: "none",
    border: "none",
    color: "rgba(100,180,255,0.85)",
    fontSize: 14,
    fontWeight: 700 as const,
    cursor: "pointer",
    padding: 0,
    textDecoration: "underline",
    textUnderlineOffset: 3,
    letterSpacing: 0.2,
  } as React.CSSProperties,
};

// ─── Shared modal shell ───────────────────────────────────────────────────────

function ModalShell({
  open, onClose, title, children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <FullscreenModal open={open} onClose={onClose} title={title} footer={null}>
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#000" }}>
        <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 8px" }}>
          {children}
        </div>
        <div style={{
          padding: "12px 16px 20px",
          borderTop: "1px solid rgba(255,255,255,0.07)",
          background: "#000",
          flexShrink: 0,
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: "100%", borderRadius: 18, padding: "15px 18px",
              fontWeight: 900, fontSize: 17,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.09)",
              color: "rgba(255,255,255,0.92)", cursor: "pointer",
            }}
          >
            Done
          </button>
        </div>
      </div>
    </FullscreenModal>
  );
}

// ─── Fleet Modal ──────────────────────────────────────────────────────────────

function FleetModal({
  open, onClose, authUserId, companyId,
  onSlipSeat, onClaim, selectedComboId,
  primaryTruckIds, primaryTrailerIds,
  onTogglePrimary, onToggleTruck, onToggleTrailer,
  uncoupledTrucks, uncoupledTrailers, coupleRegions,
  onTryCouple,
  pickRegion,    setPickRegion,
  pickTruckId,   setPickTruckId,
  pickTrailerId, setPickTrailerId,
  coupleBusy,
}: {
  open: boolean;
  onClose: () => void;
  authUserId: string | null;
  companyId: string | null;
  onSlipSeat: (comboId: string, truckId?: string, trailerId?: string) => Promise<void>;
  onClaim: (comboId: string, truckId?: string, trailerId?: string) => Promise<void>;
  selectedComboId: string;
  primaryTruckIds: Set<string>;
  primaryTrailerIds: Set<string>;
  onTogglePrimary: (c: FleetCombo) => Promise<void>;
  onToggleTruck: (truckId: string) => Promise<void>;
  onToggleTrailer: (trailerId: string) => Promise<void>;
  uncoupledTrucks: TruckRow[];
  uncoupledTrailers: TrailerRow[];
  coupleRegions: string[];
  onTryCouple: () => void;
  onCoupleDone: () => void;
  pickRegion: string;    setPickRegion: (v: string) => void;
  pickTruckId: string;   setPickTruckId: (v: string) => void;
  pickTrailerId: string; setPickTrailerId: (v: string) => void;
  coupleBusy: boolean;
}) {
  const [fleetCombos, setFleetCombos] = useState<FleetCombo[]>([]);
  const [allRegions, setAllRegions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [regionFilter, setRegionFilter] = useState("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [starBusy, setStarBusy] = useState(false);

  const loadFleet = useCallback(async () => {
    setLoading(true);
    setError(null);

    // Use passed companyId if available; otherwise resolve it directly here
    let activeCompanyId = companyId;
    if (!activeCompanyId) {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        setError("Not logged in.");
        setLoading(false);
        return;
      }
      const { data: s } = await supabase
        .from("user_settings")
        .select("active_company_id")
        .eq("user_id", u.user.id)
        .maybeSingle();
      activeCompanyId = (s?.active_company_id as string | null) ?? null;
    }

    if (!activeCompanyId) {
      setError("No active company selected. Ask your admin to assign you to a company.");
      setLoading(false);
      return;
    }

    // Fetch all active combos — manual join (no FK assumption)
    const { data: comboData, error: comboErr } = await supabase
      .from("equipment_combos")
      .select("combo_id, combo_name, truck_id, trailer_id, tare_lbs, claimed_by, claimed_at, active, company_id")
      .eq("active", true)
      .eq("company_id", activeCompanyId)
      .order("combo_name", { ascending: true });

    if (comboErr) { setError(comboErr.message); setLoading(false); return; }

    const rows = comboData ?? [];

    const truckIds   = Array.from(new Set(rows.map((r: any) => r.truck_id).filter(Boolean)));
    const trailerIds = Array.from(new Set(rows.map((r: any) => r.trailer_id).filter(Boolean)));
    const claimedIds = Array.from(new Set(rows.map((r: any) => r.claimed_by).filter(Boolean)));

    const [{ data: truckData }, { data: trailerData }, { data: profileData }] =
      await Promise.all([
        truckIds.length > 0
          ? supabase.from("trucks").select("truck_id, truck_name, region").eq("company_id", activeCompanyId).in("truck_id", truckIds)
          : Promise.resolve({ data: [] }),
        trailerIds.length > 0
          ? supabase.from("trailers").select("trailer_id, trailer_name").eq("company_id", activeCompanyId).in("trailer_id", trailerIds)
          : Promise.resolve({ data: [] }),
        claimedIds.length > 0
          ? supabase.from("profiles").select("user_id, display_name").in("user_id", claimedIds)
          : Promise.resolve({ data: [] }),
      ]);

    const truckMap: Record<string, { name: string; region: string | null }> = {};
    for (const t of truckData ?? []) {
      truckMap[String((t as any).truck_id)] = { name: (t as any).truck_name, region: (t as any).region ?? null };
    }
    const trailerMap: Record<string, string> = {};
    for (const t of trailerData ?? []) {
      trailerMap[String((t as any).trailer_id)] = (t as any).trailer_name;
    }
    const nameMap: Record<string, string> = {};
    for (const p of profileData ?? []) {
      if ((p as any).user_id) nameMap[(p as any).user_id] = (p as any).display_name ?? "Unknown";
    }

    const fleet: FleetCombo[] = rows.map((r: any) => ({
      combo_id:        String(r.combo_id),
      combo_name:      r.combo_name ?? null,
      truck_id:        r.truck_id   ?? null,
      trailer_id:      r.trailer_id ?? null,
      tare_lbs:        r.tare_lbs   ?? null,
      claimed_by:      r.claimed_by ?? null,
      claimed_at:      r.claimed_at ?? null,
      active:          r.active,
      company_id:      r.company_id ?? null,
      truck_name:      r.truck_id   ? truckMap[r.truck_id]?.name   ?? null : null,
      trailer_name:    r.trailer_id ? trailerMap[r.trailer_id]     ?? null : null,
      truck_region:    r.truck_id   ? truckMap[r.truck_id]?.region ?? null : null,
      claimed_by_name: r.claimed_by ? (nameMap[r.claimed_by] ?? "Someone") : null,
    }));

    setFleetCombos(fleet);
    setLoading(false);
  }, [companyId]);

  // Fix #6: fetch all regions directly from trucks table, not derived from combos
  const loadRegions = useCallback(async () => {
    const { data } = await supabase
      .from("trucks")
      .select("region")
      .eq("active", true)
      .not("region", "is", null);
    const vals = Array.from(
      new Set((data ?? []).map((r: any) => r.region).filter(Boolean))
    ).sort() as string[];
    setAllRegions(vals);
  }, []);

  useEffect(() => {
    if (open) {
      loadFleet();
      loadRegions();
      setRegionFilter("all");
    }
  }, [open, loadFleet, loadRegions]);

  const filtered = useMemo(() =>
    regionFilter === "all"
      ? fleetCombos
      : regionFilter === ""
      ? fleetCombos.filter((c) => !c.truck_region)
      : fleetCombos.filter((c) => c.truck_region === regionFilter),
    [fleetCombos, regionFilter]
  );

  function fleetLabel(c: FleetCombo): string {
    if (c.combo_name) return c.combo_name;
    return [c.truck_name, c.trailer_name].filter(Boolean).join(" / ") || "Unknown";
  }

  const isMine    = (c: FleetCombo) => authUserId && String(c.claimed_by ?? "") === String(authUserId);
  const isInUse   = (c: FleetCombo) => c.claimed_by && !isMine(c);
  const isStarred = (c: FleetCombo) => Boolean(c.truck_id && primaryTruckIds.has(String(c.truck_id)));

  async function handleFleetSlipSeat(c: FleetCombo) {
    const comboId = String(c.combo_id);
    setBusyId(comboId);
    try { await onSlipSeat(comboId, String(c.truck_id ?? ""), String(c.trailer_id ?? "")); await loadFleet(); }
    finally { setBusyId(null); }
  }

  async function handleToggleStar(c: FleetCombo) {
    setBusyId(String(c.combo_id));
    try { await onTogglePrimary(c); }
    finally { setBusyId(null); }
  }

  return (
    <ModalShell open={open} onClose={onClose} title="Fleet">
      {/* Region filter */}
      <div style={{ marginTop: 10, marginBottom: 4 }}>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 6 }}>
          {loading ? "Loading…" : `${filtered.length} combo${filtered.length !== 1 ? "s" : ""}${regionFilter !== "all" ? ` · ${regionFilter || "Unassigned"}` : " · All regions"}`}
        </div>
        <select
          style={{ ...S.select, marginBottom: 16 }}
          value={regionFilter}
          onChange={(e) => setRegionFilter(e.target.value)}
        >
          <option value="all">All regions</option>
          {allRegions.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
          {fleetCombos.some((c) => !c.truck_region) && (
            <option value="">Unassigned</option>
          )}
        </select>
      </div>

      <div style={S.sectionHeader}>Coupled Equipment</div>

      {loading ? (
        <div style={S.sub}>Loading fleet…</div>
      ) : error ? (
        <div style={S.err}>{error}</div>
      ) : filtered.length === 0 ? (
        <div style={S.sub}>No coupled equipment found.</div>
      ) : (
        filtered.map((c) => {
          const cid      = String(c.combo_id);
          const mine     = isMine(c);
          const inUse    = isInUse(c);
          const starred  = isStarred(c);
          const isBusy   = busyId === cid;
          const isCurrentlySelected = String(selectedComboId) === cid;

          const rowStyle = { ...(mine ? { ...S.row, ...S.rowMine } : inUse ? { ...S.row, ...S.rowInUse } : S.row), position: 'relative' as const };

          return (
            <div key={cid} style={rowStyle}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={S.rowName}>{fleetLabel(c)}</div>
                {Number(c.tare_lbs ?? 0) > 0 && (
                  <div style={S.rowSub}>Tare {Number(c.tare_lbs).toLocaleString()} lbs</div>
                )}
                {c.truck_region && (
                  <div style={{ ...S.rowSub, fontSize: 12 }}>{c.truck_region}</div>
                )}
                {mine && <div style={S.rowMineBadge}>{isCurrentlySelected ? "Selected" : "Claimed by you"}</div>}
                {inUse && <div style={S.rowInUseBadge}>In use by {c.claimed_by_name}</div>}
              </div>

              {/* Right: star top + action button below */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                <StarBtn
                  active={starred}
                  busy={isBusy}
                  onToggle={() => handleToggleStar(c)}
                  title={starred ? "Remove from my equipment" : "Add to my equipment"}
                />
                {!mine && !inUse && (
                  <button
                    type="button"
                    style={{ ...S.btn, ...S.btnPrimary, opacity: isBusy ? 0.5 : 1 }}
                    onClick={async () => { await onClaim(cid, String(c.truck_id ?? ""), String(c.trailer_id ?? "")); onClose(); }}
                    disabled={isBusy}
                  >
                    SELECT
                  </button>
                )}
                {inUse && (
                  <button
                    type="button"
                    style={{ ...S.btn, ...S.btnSlipSeat, opacity: isBusy ? 0.5 : 1 }}
                    onClick={() => handleFleetSlipSeat(c)}
                    disabled={isBusy}
                  >
                    {isBusy ? "…" : "SLIP SEAT"}
                  </button>
                )}
                {mine && !isCurrentlySelected && (
                  <button
                    type="button"
                    style={{ ...S.btn, ...S.btnPrimary, opacity: isBusy ? 0.5 : 1 }}
                    onClick={async () => { await onClaim(cid, String(c.truck_id ?? ""), String(c.trailer_id ?? "")); onClose(); }}
                    disabled={isBusy}
                  >
                    SELECT
                  </button>
                )}
              </div>
            </div>
          );
        })
      )}

      {/* ── Couple equipment ─────────────────────────────────────────────── */}
      <div style={S.divider} />
      <div style={S.sectionHeader}>Uncoupled Equipment</div>
      <div style={S.sub}>Pick a truck and trailer to couple them. If they've been paired before, the last known tare weight is restored automatically.</div>

      <div>
        <label style={S.label}>Region</label>
        <select style={S.select} value={pickRegion}
          onChange={(e) => { setPickRegion(e.target.value); setPickTruckId(""); setPickTrailerId(""); }}
          disabled={coupleBusy}>
          <option value="">All regions</option>
          {coupleRegions.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      <div>
        <label style={S.label}>Truck</label>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <select style={{ ...S.select, marginBottom: 0 }} value={pickTruckId}
              onChange={(e) => setPickTruckId(e.target.value)} disabled={coupleBusy}>
              <option value="">Select truck…</option>
              {(pickRegion ? uncoupledTrucks.filter(t => t.region === pickRegion) : uncoupledTrucks).map((t) => (
                <option key={t.truck_id} value={t.truck_id}>
                  {primaryTruckIds.has(String(t.truck_id)) ? "★ " : ""}
                  {["OOS","MAINT"].includes(t.status_code ?? "") ? "⚠ " : ""}
                  {t.truck_name}
                  {t.status_code && t.status_code !== "AVAIL" ? ` — ${t.status_code}` : ""}
                </option>
              ))}
            </select>
          </div>
          {pickTruckId && (
            <StarBtn
              active={primaryTruckIds.has(pickTruckId)}
              busy={starBusy}
              onToggle={async () => { setStarBusy(true); try { await onToggleTruck(pickTruckId); } finally { setStarBusy(false); } }}
              title={primaryTruckIds.has(pickTruckId) ? "Remove truck from my equipment" : "Star this truck"}
            />
          )}
        </div>
        {pickTruckId && (() => {
          const truck = uncoupledTrucks.find(t => t.truck_id === pickTruckId);
          if (!truck) return null;
          const code = truck.status_code ?? "AVAIL";
          const isWarn = ["OOS","MAINT"].includes(code);
          if (["AVAIL","BOBTAIL"].includes(code)) return null;
          return (
            <div style={{ padding: "10px 12px", borderRadius: 10, marginTop: 8, marginBottom: 10,
              border: isWarn ? "1px solid rgba(220,80,40,0.45)" : "1px solid rgba(255,185,0,0.25)",
              background: isWarn ? "rgba(180,50,20,0.18)" : "rgba(255,185,0,0.07)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 900, padding: "2px 7px", borderRadius: 5,
                  background: isWarn ? "rgba(220,80,40,0.25)" : "rgba(255,185,0,0.18)",
                  color: isWarn ? "#fb923c" : "#fbbf24" }}>{code}</span>
                {isWarn && <span style={{ fontSize: 12, fontWeight: 800, color: "#fb923c" }}>⚠ Do not couple until cleared</span>}
              </div>
              {truck.status_location && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 4 }}>📍 {truck.status_location}</div>}
            </div>
          );
        })()}
      </div>

      <div>
        <label style={S.label}>Trailer</label>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <select style={{ ...S.select, marginBottom: 0 }} value={pickTrailerId}
              onChange={(e) => setPickTrailerId(e.target.value)} disabled={coupleBusy}>
              <option value="">Select trailer…</option>
              {(pickRegion ? uncoupledTrailers.filter(t => t.region === pickRegion) : uncoupledTrailers).map((t) => (
                <option key={t.trailer_id} value={t.trailer_id}>
                  {primaryTrailerIds.has(String(t.trailer_id)) ? "★ " : ""}
                  {["OOS","MAINT"].includes(t.status_code ?? "") ? "⚠ " : ""}
                  {t.trailer_name}
                  {t.status_code && t.status_code !== "AVAIL" ? ` — ${t.status_code}` : ""}
                </option>
              ))}
            </select>
          </div>
          {pickTrailerId && (
            <StarBtn
              active={primaryTrailerIds.has(pickTrailerId)}
              busy={starBusy}
              onToggle={async () => { setStarBusy(true); try { await onToggleTrailer(pickTrailerId); } finally { setStarBusy(false); } }}
              title={primaryTrailerIds.has(pickTrailerId) ? "Remove trailer from my equipment" : "Star this trailer"}
            />
          )}
        </div>
        {pickTrailerId && (() => {
          const trailer = uncoupledTrailers.find(t => t.trailer_id === pickTrailerId);
          if (!trailer) return null;
          const code = trailer.status_code ?? "AVAIL";
          const isWarn = ["OOS","MAINT"].includes(code);
          if (code === "AVAIL") return null;
          return (
            <div style={{ padding: "10px 12px", borderRadius: 10, marginTop: 8, marginBottom: 10,
              border: isWarn ? "1px solid rgba(220,80,40,0.45)" : "1px solid rgba(255,185,0,0.25)",
              background: isWarn ? "rgba(180,50,20,0.18)" : "rgba(255,185,0,0.07)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 900, padding: "2px 7px", borderRadius: 5,
                  background: isWarn ? "rgba(220,80,40,0.25)" : "rgba(255,185,0,0.18)",
                  color: isWarn ? "#fb923c" : "#fbbf24" }}>{code}</span>
                {isWarn && <span style={{ fontSize: 12, fontWeight: 800, color: "#fb923c" }}>⚠ Do not couple until cleared</span>}
              </div>
              {trailer.status_location && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 4 }}>📍 {trailer.status_location}</div>}
            </div>
          );
        })()}
      </div>

      <button type="button"
        style={{ ...S.btn, ...S.btnPrimary, width: "100%", padding: "14px 18px", borderRadius: 18,
          fontSize: 17, textAlign: "center" as const, marginTop: 4,
          opacity: (coupleBusy || !pickTruckId || !pickTrailerId) ? 0.45 : 1 }}
        onClick={onTryCouple} disabled={coupleBusy || !pickTruckId || !pickTrailerId}>
        {coupleBusy ? "Working…" : "COUPLE"}
      </button>

      <div style={{ height: 16 }} />
    </ModalShell>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function EquipmentModal({
  open, onClose, authUserId,
  combos, combosLoading, combosError,
  selectedComboId, onSelectComboId, onRefreshCombos,
}: Props) {
  const [view, setView] = useState<View>("list");
  const [localErr, setLocalErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fleetOpen, setFleetOpen] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);

  // Decouple flow
  const [decoupleOpen, setDecoupleOpen]       = useState(false);
  const [decoupleComboPending, setDecoupleComboPending] = useState<{
    comboId: string; truckId: string; trailerId: string; truckName: string; trailerName: string;
  } | null>(null);

  const [trucks, setTrucks] = useState<TruckRow[]>([]);
  const [trailers, setTrailers] = useState<TrailerRow[]>([]);
  const [allRegions, setAllRegions] = useState<string[]>([]);
  const [equipLoading, setEquipLoading] = useState(false);

  const [profileNames, setProfileNames] = useState<Record<string, string>>({});

  // Primary equipment (starred)
  const [primaryTruckIds, setPrimaryTruckIds] = useState<Set<string>>(new Set());
  const [primaryTrailerIds, setPrimaryTrailerIds] = useState<Set<string>>(new Set());
  const [primaryBusy, setPrimaryBusy] = useState(false);
  // Refs so toggle callbacks always read current values without stale closures
  const primaryTruckIdsRef   = useRef<Set<string>>(new Set());
  const primaryTrailerIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => { primaryTruckIdsRef.current   = primaryTruckIds;   }, [primaryTruckIds]);
  useEffect(() => { primaryTrailerIdsRef.current = primaryTrailerIds; }, [primaryTrailerIds]);

  // Pickers
  const [pickRegion, setPickRegion] = useState("");
  const [pickTruckId, setPickTruckId] = useState("");
  const [pickTrailerId, setPickTrailerId] = useState("");
  const [newTareLbs,    setNewTareLbs]    = useState("");
  const [newTargetLbs,  setNewTargetLbs]  = useState("80000");

  // ── Loaders ────────────────────────────────────────────────────────────────

  const loadEquipment = useCallback(async () => {
    setEquipLoading(true);
    const [{ data: truckData }, { data: trailerData }, { data: regionData }] =
      await Promise.all([
        supabase.from("trucks").select("truck_id, truck_name, active, region, status_code, status_location, status_notes, status_updated_at").eq("active", true).order("truck_name"),
        supabase.from("trailers").select("trailer_id, trailer_name, active, region, status_code, status_location, status_notes, status_updated_at").eq("active", true).order("trailer_name"),
        supabase.from("trucks").select("region").eq("active", true).not("region", "is", null),
      ]);
    setTrucks((truckData ?? []) as TruckRow[]);
    setTrailers((trailerData ?? []) as TrailerRow[]);
    const regions = Array.from(new Set((regionData ?? []).map((r: any) => r.region).filter(Boolean))).sort() as string[];
    setAllRegions(regions);
    setEquipLoading(false);
  }, []);

  const loadPrimaryEquipment = useCallback(async () => {
    if (!authUserId) return;
    const [{ data: pt }, { data: ptr }] = await Promise.all([
      supabase.from("user_primary_trucks").select("truck_id").eq("user_id", authUserId),
      supabase.from("user_primary_trailers").select("trailer_id").eq("user_id", authUserId),
    ]);
    setPrimaryTruckIds(new Set((pt ?? []).map((r: any) => String(r.truck_id))));
    setPrimaryTrailerIds(new Set((ptr ?? []).map((r: any) => String(r.trailer_id))));
  }, [authUserId]);

  const loadProfileNames = useCallback(async (userIds: string[]) => {
    const unique = Array.from(new Set(userIds.filter(Boolean)));
    if (!unique.length) return;
    const { data } = await supabase.from("profiles").select("user_id, display_name").in("user_id", unique);
    const map: Record<string, string> = {};
    for (const row of data ?? []) {
      if ((row as any).user_id) map[String((row as any).user_id)] = (row as any).display_name ?? "Someone";
    }
    setProfileNames((prev) => ({ ...prev, ...map }));
  }, []);

  useEffect(() => {
    if (open) {
      setView("list");
      setLocalErr(null);
      setBusy(false);
      setPickRegion("");
      setPickTruckId("");
      setPickTrailerId("");
      setNewTareLbs("");
      // Resolve company ID once so FleetModal doesn't re-fetch user_settings independently
      (async () => {
        const { data: u } = await supabase.auth.getUser();
        if (u.user) {
          const { data: s } = await supabase
            .from("user_settings")
            .select("active_company_id")
            .eq("user_id", u.user.id)
            .maybeSingle();
          setCompanyId((s?.active_company_id as string | null) ?? null);
        }
      })();
      loadEquipment();
      loadPrimaryEquipment();
    }
  }, [open, loadEquipment, loadPrimaryEquipment]);

  useEffect(() => {
    const ids = (combos ?? []).map((c) => String(c.claimed_by ?? "")).filter((id) => id && id !== (authUserId ?? ""));
    if (ids.length) loadProfileNames(ids);
  }, [combos, authUserId, loadProfileNames]);

  // ── Primary equipment toggle (shared by main + fleet) ─────────────────────

  const togglePrimaryTruck = useCallback(async (truckId: string) => {
    if (!authUserId) return;
    const isStarred = primaryTruckIdsRef.current.has(truckId);
    setPrimaryTruckIds((prev) => { const n = new Set(prev); isStarred ? n.delete(truckId) : n.add(truckId); return n; });
    if (isStarred) {
      await supabase.from("user_primary_trucks").delete().eq("user_id", authUserId).eq("truck_id", truckId);
    } else {
      await supabase.from("user_primary_trucks").upsert({ user_id: authUserId, truck_id: truckId }, { onConflict: "user_id,truck_id" });
    }
  }, [authUserId]);

  const togglePrimaryTrailer = useCallback(async (trailerId: string) => {
    if (!authUserId) return;
    const isStarred = primaryTrailerIdsRef.current.has(trailerId);
    setPrimaryTrailerIds((prev) => { const n = new Set(prev); isStarred ? n.delete(trailerId) : n.add(trailerId); return n; });
    if (isStarred) {
      await supabase.from("user_primary_trailers").delete().eq("user_id", authUserId).eq("trailer_id", trailerId);
    } else {
      await supabase.from("user_primary_trailers").upsert({ user_id: authUserId, trailer_id: trailerId }, { onConflict: "user_id,trailer_id" });
    }
  }, [authUserId]);

  // Toggle both truck + trailer in same direction
  const toggleComboPrimary = useCallback(async (c: ComboRow | FleetCombo) => {
    setPrimaryBusy(true);
    try {
      const truckId   = String(c.truck_id   ?? "");
      const trailerId = String(c.trailer_id ?? "");
      if (truckId)   await togglePrimaryTruck(truckId);
      if (trailerId) await togglePrimaryTrailer(trailerId);
    } finally {
      setPrimaryBusy(false);
    }
  }, [togglePrimaryTruck, togglePrimaryTrailer]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const coupledCombos = useMemo(
    () => (combos ?? []).filter((c) => c.truck_id && c.trailer_id && c.active !== false),
    [combos]
  );

  // My Equipment: starred OR currently claimed by me OR actively selected
  const myEquipmentCombos = useMemo(
    () => coupledCombos.filter((c) => {
      const isStarred  = c.truck_id && primaryTruckIds.has(String(c.truck_id));
      const isMine     = authUserId && String(c.claimed_by ?? "") === String(authUserId);
      const isSelected = String(c.combo_id) === String(selectedComboId);
      return isStarred || isMine || isSelected;
    }),
    [coupledCombos, primaryTruckIds, authUserId, selectedComboId]
  );

  const coupledTruckIds = useMemo(
    () => new Set(coupledCombos.map((c) => String(c.truck_id))),
    [coupledCombos]
  );
  const coupledTrailerIds = useMemo(
    () => new Set(coupledCombos.map((c) => String(c.trailer_id))),
    [coupledCombos]
  );

  const uncoupledTrucks = useMemo(
    () => trucks.filter((t) => !coupledTruckIds.has(String(t.truck_id))),
    [trucks, coupledTruckIds]
  );
  const uncoupledTrailers = useMemo(
    () => trailers.filter((t) => !coupledTrailerIds.has(String(t.trailer_id))),
    [trailers, coupledTrailerIds]
  );

  // Filter uncoupled by selected region, then sort starred first
  const filteredUncoupledTrucks = useMemo(() => {
    const base = pickRegion ? uncoupledTrucks.filter((t) => t.region === pickRegion) : uncoupledTrucks;
    return [...base].sort((a, b) => {
      const as_ = primaryTruckIds.has(String(a.truck_id));
      const bs_ = primaryTruckIds.has(String(b.truck_id));
      if (as_ !== bs_) return as_ ? -1 : 1;
      return a.truck_name.localeCompare(b.truck_name);
    });
  }, [uncoupledTrucks, pickRegion, primaryTruckIds]);

  const filteredUncoupledTrailers = useMemo(() => {
    const base = pickRegion ? uncoupledTrailers.filter((t) => t.region === pickRegion) : uncoupledTrailers;
    return [...base].sort((a, b) => {
      const as_ = primaryTrailerIds.has(String(a.trailer_id));
      const bs_ = primaryTrailerIds.has(String(b.trailer_id));
      if (as_ !== bs_) return as_ ? -1 : 1;
      return a.trailer_name.localeCompare(b.trailer_name);
    });
  }, [uncoupledTrailers, pickRegion, primaryTrailerIds]);

  // Starred-first sorted lists for FleetModal dropdowns (no region pre-filter — FleetModal handles that)
  const sortedUncoupledTrucks = useMemo(() =>
    [...uncoupledTrucks].sort((a, b) => {
      const as_ = primaryTruckIds.has(String(a.truck_id));
      const bs_ = primaryTruckIds.has(String(b.truck_id));
      if (as_ !== bs_) return as_ ? -1 : 1;
      return a.truck_name.localeCompare(b.truck_name);
    }),
  [uncoupledTrucks, primaryTruckIds]);

  const sortedUncoupledTrailers = useMemo(() =>
    [...uncoupledTrailers].sort((a, b) => {
      const as_ = primaryTrailerIds.has(String(a.trailer_id));
      const bs_ = primaryTrailerIds.has(String(b.trailer_id));
      if (as_ !== bs_) return as_ ? -1 : 1;
      return a.trailer_name.localeCompare(b.trailer_name);
    }),
  [uncoupledTrailers, primaryTrailerIds]);

  const isMine     = (c: ComboRow) => authUserId && String(c.claimed_by ?? "") === String(authUserId);
  const isInUse    = (c: ComboRow) => c.claimed_by && !isMine(c);
  const isSelected = useCallback(
    (id: string) => String(selectedComboId || "") === String(id || ""),
    [selectedComboId]
  );

  function getClaimedByName(c: ComboRow) {
    if (!c.claimed_by) return "Someone";
    return profileNames[String(c.claimed_by)] ?? "Someone";
  }

  function comboDisplayLabel(c: ComboRow): string {
    const name = String(c.combo_name ?? "").trim();
    if (name) return name;
    const t  = trucks.find((x) => String(x.truck_id)    === String(c.truck_id))?.truck_name;
    const tr = trailers.find((x) => String(x.trailer_id) === String(c.trailer_id))?.trailer_name;
    return [t, tr].filter(Boolean).join(" / ") || "Unknown equipment";
  }

  // ── Actions ────────────────────────────────────────────────────────────────


  // Claim an unclaimed combo — server releases any previous hold atomically
  async function handleClaim(comboId: string, truckId?: string, trailerId?: string) {
    if (busy) return;
    setBusy(true); setLocalErr(null);
    try {
      const { error } = await supabase.rpc("claim_combo", { p_combo_id: comboId });
      if (error) throw error;
      onSelectComboId(comboId);
      await onRefreshCombos();
    } catch (e: any) { setLocalErr(e?.message ?? "Failed to claim equipment."); }
    finally { setBusy(false); }
  }
  function handleDecouple(comboId: string) {
    const combo = coupledCombos.find((c) => String(c.combo_id) === comboId);
    const truckId     = String(combo?.truck_id   ?? "");
    const trailerId   = String(combo?.trailer_id ?? "");
    const truckName   = trucks.find((t)   => String(t.truck_id)   === truckId)?.truck_name   ?? truckId   ?? "Truck";
    const trailerName = trailers.find((t) => String(t.trailer_id) === trailerId)?.trailer_name ?? trailerId ?? "Trailer";
    setDecoupleComboPending({ comboId, truckId, trailerId, truckName, trailerName });
    setDecoupleOpen(true);
  }

  async function handleDecoupled(newComboId?: string) {
    setDecoupleOpen(false);
    const wasSelected = isSelected(decoupleComboPending?.comboId ?? "");
    setDecoupleComboPending(null);
    await Promise.all([onRefreshCombos(), loadEquipment()]);
    if (newComboId) {
      // Swap — select the new combo after refresh
      onSelectComboId(newComboId);
    } else if (wasSelected) {
      // True decouple of the selected unit — clear selection
      onSelectComboId("");
    }
  }

  async function handleSlipSeat(comboId: string, truckId?: string, trailerId?: string) {
    if (busy) return;
    setBusy(true); setLocalErr(null);
    try {
      const { error } = await supabase.rpc("slip_seat_combo", { p_combo_id: comboId });
      if (error) throw error;
      onSelectComboId(String(comboId));
      await onRefreshCombos();
    } catch (e: any) { setLocalErr(e?.message ?? "Failed to slip seat."); }
    finally { setBusy(false); }
  }

  async function handleTryCouple() {
    setLocalErr(null);
    if (!pickTruckId || !pickTrailerId) { setLocalErr("Select both a truck and trailer first."); return; }
    setBusy(true);
    try {
      const { data: history, error: histErr } = await supabase
        .from("equipment_combos").select("combo_id")
        .eq("truck_id", pickTruckId).eq("trailer_id", pickTrailerId).eq("active", false).limit(1);
      if (histErr) throw histErr;
      if (history && history.length > 0) { setBusy(false); setView("confirm_target"); }
      else { setBusy(false); setView("new_tare"); }
    } catch (e: any) { setLocalErr(e?.message ?? "Failed."); setBusy(false); }
  }

  async function doCouple(tareLbs: number | null, targetLbs?: number) {
    setBusy(true); setLocalErr(null);
    try {
      const params: Record<string, any> = { p_truck_id: pickTruckId, p_trailer_id: pickTrailerId };
      if (tareLbs != null) params.p_tare_lbs = tareLbs;
      if (targetLbs != null && targetLbs > 0) params.p_target_weight = targetLbs;
      const { data, error } = await supabase.rpc("couple_combo", params);
      if (error) throw error;
      const comboId = String((data as any)?.combo_id ?? "");
      if (!comboId) throw new Error("No combo_id returned.");
      await Promise.all([onRefreshCombos(), loadEquipment()]);
      onSelectComboId(comboId);
      setPickRegion(""); setPickTruckId(""); setPickTrailerId(""); setNewTareLbs(""); setNewTargetLbs("80000");
      setView("list");
      setFleetOpen(false);
    } catch (e: any) { setLocalErr(e?.message ?? "Failed to couple."); }
    finally { setBusy(false); }
  }

  async function handleCreateNewCombo() {
    setLocalErr(null);
    const tare   = Number(newTareLbs);
    const target = Number(newTargetLbs) || 80000;
    if (!Number.isFinite(tare) || tare <= 0) { setLocalErr("Enter a valid tare weight (lbs)."); return; }
    await doCouple(tare, target);
  }

  const errNode = (localErr || combosError) ? (
    <div style={S.err}>
      <div style={{ fontWeight: 900, marginBottom: 4 }}>{localErr ? "Error" : "Equipment error"}</div>
      <div>{String(localErr || combosError)}</div>
    </div>
  ) : null;

  // ── View: Confirm target weight (existing combo re-couple) ─────────────────

  if (view === "confirm_target") {
    const tName  = trucks.find((t) => t.truck_id === pickTruckId)?.truck_name ?? pickTruckId;
    const trName = trailers.find((t) => t.trailer_id === pickTrailerId)?.trailer_name ?? pickTrailerId;
    const targetNum = Number(newTargetLbs) || 0;
    const tooClose  = targetNum > 0 && targetNum >= 79500;
    return (
      <ModalShell open={open} onClose={onClose} title="Equipment">
        <button type="button" style={{ ...S.btn, background: "transparent", margin: "12px 0 16px" }}
          onClick={() => { setView("list"); setLocalErr(null); }}>
          ← Back
        </button>
        <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 6 }}>Confirm Target Weight</div>
        <div style={{ ...S.sub, marginBottom: 20 }}>{tName} / {trName}</div>
        {errNode}

        <div style={{ marginBottom: 4 }}>
          <label style={S.label}>Target gross weight (lbs)</label>
          <input type="number" inputMode="numeric" placeholder="80000"
            value={newTargetLbs} onChange={(e) => setNewTargetLbs(e.target.value)}
            style={S.input} disabled={busy} autoFocus />
        </div>
        <div style={{ padding: "10px 12px", borderRadius: 10, marginBottom: 24,
          background: tooClose ? "rgba(180,50,20,0.12)" : "rgba(255,255,255,0.04)",
          border: tooClose ? "1px solid rgba(220,80,40,0.35)" : "1px solid rgba(255,255,255,0.08)" }}>
          {tooClose ? (
            <><div style={{ fontSize: 11, fontWeight: 900, color: "#fb923c", letterSpacing: 0.8, marginBottom: 4 }}>⚠ CUTTING IT CLOSE</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", lineHeight: 1.5 }}>
              You're targeting right at the legal limit. Consider a small buffer — even a few hundred pounds leaves room for an unexpected passenger, denser-than-expected load, or API variance at the meter.
            </div></>
          ) : (
            <><div style={{ fontSize: 11, fontWeight: 900, color: "rgba(255,255,255,0.35)", letterSpacing: 0.8, marginBottom: 4 }}>💡 BUFFER TIP</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.5 }}>
              Most drivers target <strong style={{ color: "rgba(255,255,255,0.65)" }}>200–500 lbs under</strong> the legal limit as a buffer for API variance and density shifts. Defaults to 80,000 lbs.
            </div></>
          )}
        </div>

        <button type="button"
          style={{ ...S.btn, ...S.btnPrimary, width: "100%", padding: "16px 18px", borderRadius: 18, fontSize: 17, textAlign: "center" as const, opacity: busy ? 0.55 : 1 }}
          onClick={() => doCouple(null, Number(newTargetLbs) || 80000)} disabled={busy}>
          {busy ? "Coupling…" : "Couple & Select"}
        </button>
      </ModalShell>
    );
  }

  // ── View: New tare ─────────────────────────────────────────────────────────

  if (view === "new_tare") {
    const tName  = trucks.find((t) => t.truck_id === pickTruckId)?.truck_name ?? pickTruckId;
    const trName = trailers.find((t) => t.trailer_id === pickTrailerId)?.trailer_name ?? pickTrailerId;
    const targetNum = Number(newTargetLbs) || 0;
    const tooClose  = targetNum > 0 && targetNum >= 79500;
    return (
      <ModalShell open={open} onClose={onClose} title="Equipment">
        <button type="button" style={{ ...S.btn, background: "transparent", margin: "12px 0 16px" }}
          onClick={() => { setView("list"); setLocalErr(null); }}>
          ← Back
        </button>
        <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 6 }}>New Pairing</div>
        <div style={{ ...S.sub, marginBottom: 16 }}>{tName} / {trName}</div>
        {errNode}

        {/* Tare weight */}
        <div style={{ marginBottom: 4 }}>
          <label style={S.label}>Tare weight (lbs) *</label>
          <input type="number" inputMode="numeric" placeholder="e.g. 34800"
            value={newTareLbs} onChange={(e) => setNewTareLbs(e.target.value)}
            style={S.input} disabled={busy} autoFocus />
        </div>
        <div style={{ padding: "10px 12px", borderRadius: 10, background: "rgba(255,185,0,0.07)", border: "1px solid rgba(255,185,0,0.18)", marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 900, color: "#fbbf24", letterSpacing: 0.8, marginBottom: 4 }}>⛽ WEIGH-IN REMINDER</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", lineHeight: 1.5 }}>
            Ensure saddle tank(s) are <strong style={{ color: "rgba(255,255,255,0.85)" }}>completely full</strong> before weighing. Enter the tare weight from a <strong style={{ color: "rgba(255,255,255,0.85)" }}>certified scale ticket</strong>.
          </div>
        </div>

        {/* Target gross weight */}
        <div style={{ marginBottom: 4 }}>
          <label style={S.label}>Target gross weight (lbs)</label>
          <input type="number" inputMode="numeric" placeholder="80000"
            value={newTargetLbs} onChange={(e) => setNewTargetLbs(e.target.value)}
            style={S.input} disabled={busy} />
        </div>
        <div style={{ padding: "10px 12px", borderRadius: 10, marginBottom: 20,
          background: tooClose ? "rgba(180,50,20,0.12)" : "rgba(255,255,255,0.04)",
          border: tooClose ? "1px solid rgba(220,80,40,0.35)" : "1px solid rgba(255,255,255,0.08)" }}>
          {tooClose ? (
            <><div style={{ fontSize: 11, fontWeight: 900, color: "#fb923c", letterSpacing: 0.8, marginBottom: 4 }}>⚠ CUTTING IT CLOSE</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", lineHeight: 1.5 }}>
              You're targeting right at the legal limit. Consider a small buffer — even a few hundred pounds leaves room for an unexpected passenger, a denser-than-expected load, or API variance at the meter.
            </div></>
          ) : (
            <><div style={{ fontSize: 11, fontWeight: 900, color: "rgba(255,255,255,0.35)", letterSpacing: 0.8, marginBottom: 4 }}>💡 BUFFER TIP</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.5 }}>
              Most drivers target <strong style={{ color: "rgba(255,255,255,0.65)" }}>200–500 lbs under</strong> the legal limit as a buffer for API variance and density shifts. Defaults to 80,000 lbs.
            </div></>
          )}
        </div>

        <button type="button"
          style={{ ...S.btn, ...S.btnPrimary, width: "100%", padding: "16px 18px", borderRadius: 18, fontSize: 17, textAlign: "center" as const, opacity: busy ? 0.55 : 1 }}
          onClick={handleCreateNewCombo} disabled={busy}>
          {busy ? "Creating…" : "Couple & Select"}
        </button>
      </ModalShell>
    );
  }

  // ── View: Main list ────────────────────────────────────────────────────────

  return (
    <>
      <ModalShell open={open} onClose={onClose} title="Equipment">
        {errNode}

        {/* ── My Equipment (starred coupled combos only) ─────────────────── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8, marginBottom: 4 }}>
          <div style={S.sectionHeader}>My Equipment</div>
          {myEquipmentCombos.length > 0 && (
            <div style={{ color: "rgba(255,255,255,0.28)", fontWeight: 700, fontSize: 13 }}>{myEquipmentCombos.length}</div>
          )}
        </div>
        <div style={S.sub}>Only coupled equipment is usable by the planner.</div>

        {combosLoading ? (
          <div style={S.sub}>Loading…</div>
        ) : myEquipmentCombos.length === 0 ? (
          <div style={{ ...S.sub, marginTop: 8 }}>
            No equipment selected. Use <em>Browse fleet & couple equipment →</em> below to find and select your rig.
          </div>
        ) : (
          <div style={{ marginTop: 6 }}>
            {myEquipmentCombos.map((c) => {
              const cid     = String(c.combo_id);
              const mine    = isMine(c);
              const inUse   = isInUse(c);
              const sel     = isSelected(cid);
              const label   = comboDisplayLabel(c);
              const tare    = Number(c.tare_lbs ?? 0);

              const rowStyle = mine ? { ...S.row, ...S.rowMine }
                : inUse ? { ...S.row, ...S.rowInUse } : S.row;

              return (
                <div key={cid} style={rowStyle}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={S.rowName}>{label}</div>
                    {tare > 0 && <div style={S.rowSub}>Tare {tare.toLocaleString()} lbs</div>}
                    {mine && sel  && <div style={S.rowMineBadge}>Selected</div>}
                    {mine && !sel && <div style={S.rowMineBadge}>Claimed by you</div>}
                    {inUse && <div style={S.rowInUseBadge}>In use by {getClaimedByName(c)}</div>}
                  </div>

                  {/* Star pinned top-right; action button below */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                    <StarBtn
                      active={true}
                      busy={primaryBusy}
                      onToggle={() => toggleComboPrimary(c)}
                      title="Remove from my equipment"
                    />
                    {inUse && (
                      <button type="button" style={{ ...S.btn, ...S.btnSlipSeat, opacity: busy ? 0.55 : 1 }} onClick={() => handleSlipSeat(cid)} disabled={busy}>
                        {busy ? "…" : "SLIP SEAT"}
                      </button>
                    )}
                    {(mine || (sel && !c.claimed_by)) && (
                      <button type="button" style={{ ...S.btn, ...S.btnDecouple, opacity: busy ? 0.55 : 1 }} onClick={() => handleDecouple(cid)} disabled={busy}>
                        {busy ? "…" : "DECOUPLE"}
                      </button>
                    )}
                    {!mine && !inUse && !(sel && !c.claimed_by) && (
                      <button type="button" style={{ ...S.btn, ...S.btnPrimary }} onClick={() => handleClaim(cid)} disabled={busy}>SELECT</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ height: 8 }} />
        <button type="button"
          style={{ ...S.btn, width: "100%", textAlign: "center" as const, padding: "11px 16px", borderRadius: 10, fontSize: 14 }}
          onClick={() => setFleetOpen(true)}>
          Browse fleet & couple equipment →
        </button>

        <div style={{ height: 16 }} />
      </ModalShell>

      <FleetModal
        open={fleetOpen}
        onClose={() => setFleetOpen(false)}
        authUserId={authUserId}
        companyId={companyId}
        onSlipSeat={handleSlipSeat}
        onClaim={handleClaim}
        selectedComboId={selectedComboId}
        primaryTruckIds={primaryTruckIds}
        primaryTrailerIds={primaryTrailerIds}
        onTogglePrimary={toggleComboPrimary}
        onToggleTruck={togglePrimaryTruck}
        onToggleTrailer={togglePrimaryTrailer}
        uncoupledTrucks={sortedUncoupledTrucks}
        uncoupledTrailers={sortedUncoupledTrailers}
        coupleRegions={allRegions}
        onTryCouple={handleTryCouple}
        onCoupleDone={() => { loadEquipment(); onRefreshCombos(); }}
        pickRegion={pickRegion}    setPickRegion={setPickRegion}
        pickTruckId={pickTruckId}  setPickTruckId={setPickTruckId}
        pickTrailerId={pickTrailerId} setPickTrailerId={setPickTrailerId}
        coupleBusy={busy}
      />

      {decoupleComboPending && (
        <DecoupleModal
          open={decoupleOpen}
          onClose={() => { setDecoupleOpen(false); setDecoupleComboPending(null); }}
          comboId={decoupleComboPending.comboId}
          truckId={decoupleComboPending.truckId}
          trailerId={decoupleComboPending.trailerId}
          truckName={decoupleComboPending.truckName}
          trailerName={decoupleComboPending.trailerName}
          uncoupledTrucks={uncoupledTrucks.map(t => ({ id: t.truck_id, name: t.truck_name }))}
          uncoupledTrailers={uncoupledTrailers.map(t => ({ id: t.trailer_id, name: t.trailer_name }))}
          onDecoupled={handleDecoupled}
        />
      )}
    </>
  );
}
