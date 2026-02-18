"use client";

/**
 * EquipmentModal — v4
 *
 * New in this version:
 *   - Star button on coupled cards → user_primary_trucks / user_primary_trailers
 *   - Starred equipment floats to top of uncoupled dropdowns
 *   - "Browse fleet →" link opens FleetModal (all company combos, region filter)
 *   - FleetModal mirrors Get Carded pattern exactly
 *
 * Full schema used:
 *   equipment_combos: combo_id, combo_name, truck_id, trailer_id,
 *                     tare_lbs, gross_limit_lbs, buffer_lbs,
 *                     active, claimed_by, claimed_at, company_id
 *   trucks:           truck_id, truck_name, active, company_id, region
 *   trailers:         trailer_id, trailer_name, cg_max, active, company_id, region
 *   profiles:         user_id, display_name
 *   user_primary_trucks:   user_id, truck_id, created_at
 *   user_primary_trailers: user_id, trailer_id, created_at
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";

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
};

type TrailerRow = {
  trailer_id: string;
  trailer_name: string;
  active: boolean | null;
  region?: string | null;
};

// Fleet modal combo (includes claimed driver name)
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

type View = "list" | "new_tare" | "fleet";

// ─── Star button (identical appearance to My Terminals star) ──────────────────

function StarBtn({
  active,
  busy,
  onToggle,
}: {
  active: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={busy}
      style={{
        width: 36,
        height: 36,
        borderRadius: 10,
        border: active
          ? "1px solid rgba(234,179,8,0.45)"
          : "1px solid rgba(255,255,255,0.13)",
        background: active
          ? "rgba(234,179,8,0.15)"
          : "rgba(255,255,255,0.05)",
        color: active ? "rgba(234,179,8,0.95)" : "rgba(255,255,255,0.35)",
        fontSize: 17,
        cursor: busy ? "not-allowed" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        transition: "all 120ms ease",
        opacity: busy ? 0.5 : 1,
      }}
      title={active ? "Remove from primary equipment" : "Mark as primary equipment"}
    >
      ★
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
    padding: "14px 16px",
    borderRadius: 18,
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
    fontSize: 22,
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
    borderRadius: 16,
    padding: "10px 18px",
    fontWeight: 900 as const,
    fontSize: 15,
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
  doneBtn: {
    width: "100%",
    borderRadius: 18,
    padding: "15px 18px",
    fontWeight: 900,
    fontSize: 17,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.09)",
    color: "rgba(255,255,255,0.92)",
    cursor: "pointer",
    flexShrink: 0,
  } as React.CSSProperties,
  // Hyperlink-style button (matches "Get carded" pattern)
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
  open,
  onClose,
  title,
  children,
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
          <button type="button" style={{
            width: "100%", borderRadius: 18, padding: "15px 18px",
            fontWeight: 900, fontSize: 17,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(255,255,255,0.09)",
            color: "rgba(255,255,255,0.92)", cursor: "pointer",
          }} onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </FullscreenModal>
  );
}

// ─── Fleet Modal ──────────────────────────────────────────────────────────────
// All active coupled combos across the company, filterable by region.
// Mirrors the Get Carded modal pattern.

function FleetModal({
  open,
  onClose,
  authUserId,
  onSlipSeat,
  onSelect,
  selectedComboId,
}: {
  open: boolean;
  onClose: () => void;
  authUserId: string | null;
  onSlipSeat: (comboId: string) => Promise<void>;
  onSelect: (comboId: string) => void;
  selectedComboId: string;
}) {
  const [fleetCombos, setFleetCombos] = useState<FleetCombo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [regionFilter, setRegionFilter] = useState("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadFleet = useCallback(async () => {
    setLoading(true);
    setError(null);

    // Fetch all active combos with truck/trailer names joined
    const { data: comboData, error: comboErr } = await supabase
      .from("equipment_combos")
      .select(`
        combo_id, combo_name, truck_id, trailer_id,
        tare_lbs, claimed_by, claimed_at, active, company_id,
        trucks  ( truck_name, region ),
        trailers ( trailer_name )
      `)
      .eq("active", true)
      .order("combo_name", { ascending: true });

    if (comboErr) { setError(comboErr.message); setLoading(false); return; }

    const rows = (comboData ?? []) as any[];

    // Collect unique claimed_by IDs to resolve names
    const claimedIds = Array.from(
      new Set(rows.map((r) => r.claimed_by).filter(Boolean))
    ) as string[];

    let nameMap: Record<string, string> = {};
    if (claimedIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", claimedIds);
      for (const p of profiles ?? []) {
        if (p.user_id) nameMap[p.user_id] = p.display_name ?? "Unknown";
      }
    }

    const fleet: FleetCombo[] = rows.map((r) => ({
      combo_id:         String(r.combo_id),
      combo_name:       r.combo_name ?? null,
      truck_id:         r.truck_id ?? null,
      trailer_id:       r.trailer_id ?? null,
      tare_lbs:         r.tare_lbs ?? null,
      claimed_by:       r.claimed_by ?? null,
      claimed_at:       r.claimed_at ?? null,
      active:           r.active,
      company_id:       r.company_id ?? null,
      truck_name:       (r.trucks as any)?.truck_name ?? null,
      trailer_name:     (r.trailers as any)?.trailer_name ?? null,
      truck_region:     (r.trucks as any)?.region ?? null,
      claimed_by_name:  r.claimed_by ? (nameMap[r.claimed_by] ?? "Someone") : null,
    }));

    setFleetCombos(fleet);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) { loadFleet(); setRegionFilter("all"); }
  }, [open, loadFleet]);

  // Distinct regions for dropdown
  const regions = useMemo(() => {
    const vals = Array.from(
      new Set(fleetCombos.map((c) => c.truck_region).filter(Boolean))
    ).sort() as string[];
    return vals;
  }, [fleetCombos]);

  const filtered = useMemo(() =>
    regionFilter === "all"
      ? fleetCombos
      : fleetCombos.filter((c) => c.truck_region === regionFilter),
    [fleetCombos, regionFilter]
  );

  function fleetLabel(c: FleetCombo): string {
    if (c.combo_name) return c.combo_name;
    return [c.truck_name, c.trailer_name].filter(Boolean).join(" / ") || "Unknown";
  }

  async function handleFleetSlipSeat(comboId: string) {
    setBusyId(comboId);
    try { await onSlipSeat(comboId); await loadFleet(); }
    finally { setBusyId(null); }
  }

  function handleFleetSelect(comboId: string) {
    onSelect(comboId);
    onClose();
  }

  const isMine = (c: FleetCombo) =>
    authUserId && String(c.claimed_by ?? "") === String(authUserId);
  const isInUse = (c: FleetCombo) => c.claimed_by && !isMine(c);

  return (
    <ModalShell open={open} onClose={onClose} title="Fleet Equipment">
      {/* Region filter dropdown */}
      <div style={{ marginTop: 10, marginBottom: 4 }}>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 6 }}>
          Showing {filtered.length} coupled combo{filtered.length !== 1 ? "s" : ""}
          {regionFilter !== "all" ? ` in ${regionFilter}` : " company-wide"}
        </div>
        <select
          style={{ ...S.select, marginBottom: 16 }}
          value={regionFilter}
          onChange={(e) => setRegionFilter(e.target.value)}
        >
          <option value="all">All regions</option>
          {regions.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
          {/* Combos with no region tag */}
          {fleetCombos.some((c) => !c.truck_region) && (
            <option value="">Unassigned region</option>
          )}
        </select>
      </div>

      {loading ? (
        <div style={S.sub}>Loading fleet…</div>
      ) : error ? (
        <div style={S.err}>{error}</div>
      ) : filtered.length === 0 ? (
        <div style={S.sub}>No coupled equipment found.</div>
      ) : (
        filtered.map((c) => {
          const cid = String(c.combo_id);
          const mine = isMine(c);
          const inUse = isInUse(c);
          const isCurrentlySelected = String(selectedComboId) === cid;
          const isBusy = busyId === cid;

          const rowStyle = mine
            ? { ...S.row, ...S.rowMine }
            : inUse
            ? { ...S.row, ...S.rowInUse }
            : S.row;

          return (
            <div key={cid} style={rowStyle}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={S.rowName}>{fleetLabel(c)}</div>
                {c.tare_lbs && Number(c.tare_lbs) > 0 && (
                  <div style={S.rowSub}>Tare {Number(c.tare_lbs).toLocaleString()} lbs</div>
                )}
                {c.truck_region && (
                  <div style={{ ...S.rowSub, fontSize: 12 }}>{c.truck_region}</div>
                )}
                {mine && (
                  <div style={S.rowMineBadge}>
                    {isCurrentlySelected ? "Selected" : "Claimed by you"}
                  </div>
                )}
                {inUse && (
                  <div style={S.rowInUseBadge}>In use by {c.claimed_by_name}</div>
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end", flexShrink: 0 }}>
                {!mine && !inUse && (
                  <button
                    type="button"
                    style={{ ...S.btn, ...S.btnPrimary, opacity: isBusy ? 0.5 : 1 }}
                    onClick={() => handleFleetSelect(cid)}
                    disabled={isBusy}
                  >
                    SELECT
                  </button>
                )}
                {inUse && (
                  <button
                    type="button"
                    style={{ ...S.btn, ...S.btnSlipSeat, opacity: isBusy ? 0.5 : 1 }}
                    onClick={() => handleFleetSlipSeat(cid)}
                    disabled={isBusy}
                  >
                    {isBusy ? "…" : "SLIP SEAT"}
                  </button>
                )}
                {mine && !isCurrentlySelected && (
                  <button
                    type="button"
                    style={{ ...S.btn, ...S.btnPrimary, opacity: isBusy ? 0.5 : 1 }}
                    onClick={() => handleFleetSelect(cid)}
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
    </ModalShell>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function EquipmentModal({
  open,
  onClose,
  authUserId,
  combos,
  combosLoading,
  combosError,
  selectedComboId,
  onSelectComboId,
  onRefreshCombos,
}: Props) {
  const [view, setView] = useState<View>("list");
  const [localErr, setLocalErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fleetOpen, setFleetOpen] = useState(false);

  const [trucks, setTrucks] = useState<TruckRow[]>([]);
  const [trailers, setTrailers] = useState<TrailerRow[]>([]);
  const [equipLoading, setEquipLoading] = useState(false);

  const [profileNames, setProfileNames] = useState<Record<string, string>>({});

  // Primary equipment sets (starred)
  const [primaryTruckIds, setPrimaryTruckIds] = useState<Set<string>>(new Set());
  const [primaryTrailerIds, setPrimaryTrailerIds] = useState<Set<string>>(new Set());
  const [primaryBusy, setPrimaryBusy] = useState(false);

  const [pickTruckId, setPickTruckId] = useState("");
  const [pickTrailerId, setPickTrailerId] = useState("");
  const [newTareLbs, setNewTareLbs] = useState("");

  // ── Loaders ────────────────────────────────────────────────────────────────

  const loadEquipment = useCallback(async () => {
    setEquipLoading(true);
    const [{ data: truckData }, { data: trailerData }] = await Promise.all([
      supabase
        .from("trucks")
        .select("truck_id, truck_name, active, region")
        .eq("active", true)
        .order("truck_name", { ascending: true }),
      supabase
        .from("trailers")
        .select("trailer_id, trailer_name, active, region")
        .eq("active", true)
        .order("trailer_name", { ascending: true }),
    ]);
    setTrucks((truckData ?? []) as TruckRow[]);
    setTrailers((trailerData ?? []) as TrailerRow[]);
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
    if (unique.length === 0) return;
    const { data } = await supabase
      .from("profiles")
      .select("user_id, display_name")
      .in("user_id", unique);
    const map: Record<string, string> = {};
    for (const row of data ?? []) {
      if (row.user_id) map[String(row.user_id)] = row.display_name ?? "Someone";
    }
    setProfileNames((prev) => ({ ...prev, ...map }));
  }, []);

  useEffect(() => {
    if (open) {
      setView("list");
      setLocalErr(null);
      setBusy(false);
      setPickTruckId("");
      setPickTrailerId("");
      setNewTareLbs("");
      loadEquipment();
      loadPrimaryEquipment();
    }
  }, [open, loadEquipment, loadPrimaryEquipment]);

  useEffect(() => {
    const ids = (combos ?? [])
      .map((c) => String(c.claimed_by ?? ""))
      .filter((id) => id && id !== (authUserId ?? ""));
    if (ids.length > 0) loadProfileNames(ids);
  }, [combos, authUserId, loadProfileNames]);

  // ── Primary equipment toggle ───────────────────────────────────────────────

  async function togglePrimaryTruck(truckId: string) {
    if (!authUserId || primaryBusy) return;
    setPrimaryBusy(true);
    const isStarred = primaryTruckIds.has(truckId);
    // Optimistic update
    setPrimaryTruckIds((prev) => {
      const next = new Set(prev);
      isStarred ? next.delete(truckId) : next.add(truckId);
      return next;
    });
    try {
      if (isStarred) {
        await supabase.from("user_primary_trucks")
          .delete()
          .eq("user_id", authUserId)
          .eq("truck_id", truckId);
      } else {
        await supabase.from("user_primary_trucks")
          .upsert({ user_id: authUserId, truck_id: truckId }, { onConflict: "user_id,truck_id" });
      }
    } catch {
      // Revert on error
      await loadPrimaryEquipment();
    } finally {
      setPrimaryBusy(false);
    }
  }

  async function togglePrimaryTrailer(trailerId: string) {
    if (!authUserId || primaryBusy) return;
    setPrimaryBusy(true);
    const isStarred = primaryTrailerIds.has(trailerId);
    setPrimaryTrailerIds((prev) => {
      const next = new Set(prev);
      isStarred ? next.delete(trailerId) : next.add(trailerId);
      return next;
    });
    try {
      if (isStarred) {
        await supabase.from("user_primary_trailers")
          .delete()
          .eq("user_id", authUserId)
          .eq("trailer_id", trailerId);
      } else {
        await supabase.from("user_primary_trailers")
          .upsert({ user_id: authUserId, trailer_id: trailerId }, { onConflict: "user_id,trailer_id" });
      }
    } catch {
      await loadPrimaryEquipment();
    } finally {
      setPrimaryBusy(false);
    }
  }

  // Star toggle for a coupled combo — stars both the truck AND trailer
  async function toggleComboPrimary(c: ComboRow) {
    const truckId   = String(c.truck_id   ?? "");
    const trailerId = String(c.trailer_id ?? "");
    const isStarred = truckId ? primaryTruckIds.has(truckId) : false;
    if (truckId)   await togglePrimaryTruck(truckId);
    if (trailerId) {
      // Only toggle trailer in same direction as truck
      const trailerCurrentlyStarred = primaryTrailerIds.has(trailerId);
      if (isStarred !== trailerCurrentlyStarred) {
        await togglePrimaryTrailer(trailerId);
      } else {
        await togglePrimaryTrailer(trailerId);
      }
    }
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const coupledCombos = useMemo(
    () => (combos ?? []).filter((c) => c.truck_id && c.trailer_id && c.active !== false),
    [combos]
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

  // Sort: starred first, then alphabetical
  const sortedUncoupledTrucks = useMemo(() => {
    return [...uncoupledTrucks].sort((a, b) => {
      const aStarred = primaryTruckIds.has(String(a.truck_id));
      const bStarred = primaryTruckIds.has(String(b.truck_id));
      if (aStarred !== bStarred) return aStarred ? -1 : 1;
      return a.truck_name.localeCompare(b.truck_name);
    });
  }, [uncoupledTrucks, primaryTruckIds]);

  const sortedUncoupledTrailers = useMemo(() => {
    return [...uncoupledTrailers].sort((a, b) => {
      const aStarred = primaryTrailerIds.has(String(a.trailer_id));
      const bStarred = primaryTrailerIds.has(String(b.trailer_id));
      if (aStarred !== bStarred) return aStarred ? -1 : 1;
      return a.trailer_name.localeCompare(b.trailer_name);
    });
  }, [uncoupledTrailers, primaryTrailerIds]);

  const isMine = (c: ComboRow) =>
    authUserId && String(c.claimed_by ?? "") === String(authUserId);
  const isInUse = (c: ComboRow) => c.claimed_by && !isMine(c);
  const isSelected = useCallback(
    (comboId: string) => String(selectedComboId || "") === String(comboId || ""),
    [selectedComboId]
  );

  function getClaimedByName(c: ComboRow): string {
    if (!c.claimed_by) return "Someone";
    return profileNames[String(c.claimed_by)] ?? "Someone";
  }

  function comboDisplayLabel(c: ComboRow): string {
    const name = String(c.combo_name ?? "").trim();
    if (name) return name;
    const t  = trucks.find((x) => String(x.truck_id)   === String(c.truck_id))?.truck_name;
    const tr = trailers.find((x) => String(x.trailer_id) === String(c.trailer_id))?.trailer_name;
    return [t, tr].filter(Boolean).join(" / ") || "Unknown equipment";
  }

  function isComboStarred(c: ComboRow): boolean {
    return Boolean(c.truck_id && primaryTruckIds.has(String(c.truck_id)));
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  function handleSelect(comboId: string) {
    setLocalErr(null);
    onSelectComboId(String(comboId));
  }

  async function handleDecouple(comboId: string) {
    if (busy) return;
    setBusy(true);
    setLocalErr(null);
    try {
      const { error } = await supabase.rpc("decouple_combo", { p_combo_id: comboId });
      if (error) throw error;
      if (isSelected(comboId)) onSelectComboId("");
      await Promise.all([onRefreshCombos(), loadEquipment()]);
    } catch (e: any) {
      setLocalErr(e?.message ?? "Failed to decouple equipment.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSlipSeat(comboId: string) {
    if (busy) return;
    setBusy(true);
    setLocalErr(null);
    try {
      const { error } = await supabase.rpc("slip_seat_combo", { p_combo_id: comboId });
      if (error) throw error;
      onSelectComboId(String(comboId));
      await onRefreshCombos();
    } catch (e: any) {
      setLocalErr(e?.message ?? "Failed to slip seat.");
    } finally {
      setBusy(false);
    }
  }

  // Used by both main modal and fleet modal
  async function handleSlipSeatShared(comboId: string) {
    setBusy(true);
    setLocalErr(null);
    try {
      const { error } = await supabase.rpc("slip_seat_combo", { p_combo_id: comboId });
      if (error) throw error;
      onSelectComboId(String(comboId));
      await onRefreshCombos();
    } catch (e: any) {
      setLocalErr(e?.message ?? "Failed to slip seat.");
    } finally {
      setBusy(false);
    }
  }

  async function handleTryCouple() {
    setLocalErr(null);
    if (!pickTruckId || !pickTrailerId) {
      setLocalErr("Select both a truck and a trailer first.");
      return;
    }
    setBusy(true);
    try {
      const { data: history, error: histErr } = await supabase
        .from("equipment_combos")
        .select("combo_id")
        .eq("truck_id", pickTruckId)
        .eq("trailer_id", pickTrailerId)
        .eq("active", false)
        .limit(1);
      if (histErr) throw histErr;
      if (history && history.length > 0) {
        await doCouple(null);
      } else {
        setBusy(false);
        setView("new_tare");
      }
    } catch (e: any) {
      setLocalErr(e?.message ?? "Failed to check equipment history.");
      setBusy(false);
    }
  }

  async function doCouple(tareLbs: number | null) {
    setBusy(true);
    setLocalErr(null);
    try {
      const params: Record<string, any> = {
        p_truck_id:   pickTruckId,
        p_trailer_id: pickTrailerId,
      };
      if (tareLbs != null) params.p_tare_lbs = tareLbs;
      const { data, error } = await supabase.rpc("couple_combo", params);
      if (error) throw error;
      const comboId = String((data as any)?.combo_id ?? "");
      if (!comboId) throw new Error("No combo_id returned from server.");
      await Promise.all([onRefreshCombos(), loadEquipment()]);
      onSelectComboId(comboId);
      setPickTruckId("");
      setPickTrailerId("");
      setNewTareLbs("");
      setView("list");
    } catch (e: any) {
      setLocalErr(e?.message ?? "Failed to couple equipment.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateNewCombo() {
    setLocalErr(null);
    const tare = Number(newTareLbs);
    if (!Number.isFinite(tare) || tare <= 0) {
      setLocalErr("Enter a valid tare weight (lbs).");
      return;
    }
    await doCouple(tare);
  }

  // ── Error node ─────────────────────────────────────────────────────────────

  const errNode = (localErr || combosError) ? (
    <div style={S.err}>
      <div style={{ fontWeight: 900, marginBottom: 4 }}>
        {localErr ? "Error" : "Equipment error"}
      </div>
      <div>{String(localErr || combosError)}</div>
    </div>
  ) : null;

  // ── View: New tare entry ───────────────────────────────────────────────────

  if (view === "new_tare") {
    const tName  = trucks.find((t) => t.truck_id === pickTruckId)?.truck_name ?? pickTruckId;
    const trName = trailers.find((t) => t.trailer_id === pickTrailerId)?.trailer_name ?? pickTrailerId;

    return (
      <ModalShell open={open} onClose={onClose} title="Equipment">
        <button
          type="button"
          style={{ ...S.btn, background: "transparent", margin: "12px 0 16px" }}
          onClick={() => { setView("list"); setLocalErr(null); }}
        >
          ← Back
        </button>

        <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 6 }}>New Pairing</div>
        <div style={S.sub}>
          This truck and trailer have never been coupled before. Enter the tare
          weight from a certified scale ticket.
        </div>

        {errNode}
        <div style={S.info}>{tName} / {trName}</div>

        <div style={{ marginBottom: 20 }}>
          <label style={S.label}>Tare weight (lbs) *</label>
          <input
            type="number"
            inputMode="numeric"
            placeholder="e.g. 34800"
            value={newTareLbs}
            onChange={(e) => setNewTareLbs(e.target.value)}
            style={S.input}
            disabled={busy}
            autoFocus
          />
        </div>

        <button
          type="button"
          style={{
            ...S.btn, ...S.btnPrimary,
            width: "100%", padding: "16px 18px",
            borderRadius: 18, fontSize: 17,
            textAlign: "center" as const,
            opacity: busy ? 0.55 : 1,
          }}
          onClick={handleCreateNewCombo}
          disabled={busy}
        >
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

        {/* ── Coupled Equipment ───────────────────────────────────────────── */}
        <div style={{
          display: "flex", alignItems: "center",
          justifyContent: "space-between", marginTop: 8, marginBottom: 4,
        }}>
          <div style={S.sectionHeader}>Coupled Equipment</div>
          {coupledCombos.length > 0 && (
            <div style={{ color: "rgba(255,255,255,0.28)", fontWeight: 700, fontSize: 13 }}>
              {coupledCombos.length}
            </div>
          )}
        </div>
        <div style={S.sub}>Only coupled equipment is usable by the planner.</div>

        {combosLoading ? (
          <div style={S.sub}>Loading…</div>
        ) : coupledCombos.length === 0 ? (
          <div style={{ ...S.sub, marginTop: 8 }}>
            No coupled equipment. Use the section below to couple a truck and trailer.
          </div>
        ) : (
          <div style={{ marginTop: 6 }}>
            {coupledCombos.map((c) => {
              const cid      = String(c.combo_id);
              const mine     = isMine(c);
              const inUse    = isInUse(c);
              const selected = isSelected(cid);
              const label    = comboDisplayLabel(c);
              const tare     = Number(c.tare_lbs ?? 0);
              const starred  = isComboStarred(c);

              const rowStyle = mine
                ? { ...S.row, ...S.rowMine }
                : inUse
                ? { ...S.row, ...S.rowInUse }
                : S.row;

              return (
                <div key={cid} style={rowStyle}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={S.rowName}>{label}</div>
                    {tare > 0 && (
                      <div style={S.rowSub}>Tare {tare.toLocaleString()} lbs</div>
                    )}
                    {mine && selected && <div style={S.rowMineBadge}>Selected</div>}
                    {mine && !selected && <div style={S.rowMineBadge}>Claimed by you</div>}
                    {inUse && (
                      <div style={S.rowInUseBadge}>In use by {getClaimedByName(c)}</div>
                    )}
                  </div>

                  {/* Right side: star + action buttons */}
                  <div style={{
                    display: "flex", flexDirection: "column",
                    gap: 8, alignItems: "flex-end", flexShrink: 0,
                  }}>
                    {/* Star — top of button stack */}
                    <StarBtn
                      active={starred}
                      busy={primaryBusy}
                      onToggle={() => toggleComboPrimary(c)}
                    />

                    {/* Action buttons below star */}
                    {!mine && !inUse && (
                      <button
                        type="button"
                        style={{ ...S.btn, ...S.btnPrimary }}
                        onClick={() => handleSelect(cid)}
                        disabled={busy}
                      >
                        SELECT
                      </button>
                    )}
                    {inUse && (
                      <button
                        type="button"
                        style={{ ...S.btn, ...S.btnSlipSeat, opacity: busy ? 0.55 : 1 }}
                        onClick={() => handleSlipSeat(cid)}
                        disabled={busy}
                      >
                        {busy ? "…" : "SLIP SEAT"}
                      </button>
                    )}
                    {mine && (
                      <button
                        type="button"
                        style={{ ...S.btn, ...S.btnDecouple, opacity: busy ? 0.55 : 1 }}
                        onClick={() => handleDecouple(cid)}
                        disabled={busy}
                      >
                        {busy ? "…" : "DECOUPLE"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={S.divider} />

        {/* ── Uncoupled Equipment ─────────────────────────────────────────── */}
        <div style={{ ...S.sectionHeader, marginBottom: 4 }}>Uncoupled Equipment</div>
        <div style={S.sub}>
          Select a truck and trailer to couple them. If they've been paired before,
          the last known tare weight is restored automatically.
        </div>

        {equipLoading ? (
          <div style={S.sub}>Loading equipment…</div>
        ) : (
          <>
            <div>
              <label style={S.label}>Truck</label>
              <select
                style={S.select}
                value={pickTruckId}
                onChange={(e) => { setPickTruckId(e.target.value); setLocalErr(null); }}
                disabled={busy}
              >
                <option value="">Select truck…</option>
                {/* Starred trucks get ★ prefix and appear first */}
                {sortedUncoupledTrucks.map((t) => {
                  const starred = primaryTruckIds.has(String(t.truck_id));
                  return (
                    <option key={t.truck_id} value={t.truck_id}>
                      {starred ? "★ " : ""}{t.truck_name}
                    </option>
                  );
                })}
              </select>
              {uncoupledTrucks.length === 0 && (
                <div style={{ ...S.sub, marginTop: -8, marginBottom: 12, fontSize: 12 }}>
                  All trucks are currently coupled.
                </div>
              )}
            </div>

            <div>
              <label style={S.label}>Trailer</label>
              <select
                style={S.select}
                value={pickTrailerId}
                onChange={(e) => { setPickTrailerId(e.target.value); setLocalErr(null); }}
                disabled={busy}
              >
                <option value="">Select trailer…</option>
                {sortedUncoupledTrailers.map((t) => {
                  const starred = primaryTrailerIds.has(String(t.trailer_id));
                  return (
                    <option key={t.trailer_id} value={t.trailer_id}>
                      {starred ? "★ " : ""}{t.trailer_name}
                    </option>
                  );
                })}
              </select>
              {uncoupledTrailers.length === 0 && (
                <div style={{ ...S.sub, marginTop: -8, marginBottom: 12, fontSize: 12 }}>
                  All trailers are currently coupled.
                </div>
              )}
            </div>

            <button
              type="button"
              style={{
                ...S.btn, ...S.btnPrimary,
                width: "100%", padding: "14px 18px",
                borderRadius: 18, fontSize: 17,
                textAlign: "center" as const, marginTop: 4,
                opacity: (busy || !pickTruckId || !pickTrailerId) ? 0.45 : 1,
              }}
              onClick={handleTryCouple}
              disabled={busy || !pickTruckId || !pickTrailerId}
            >
              {busy ? "Working…" : "COUPLE"}
            </button>

            {/* Browse fleet link — sits just below COUPLE, above Done */}
            <div style={{ textAlign: "center", marginTop: 18 }}>
              <button
                type="button"
                style={S.linkBtn}
                onClick={() => setFleetOpen(true)}
              >
                Browse fleet →
              </button>
            </div>
          </>
        )}

        <div style={{ height: 16 }} />
      </ModalShell>

      {/* Fleet modal — rendered outside ModalShell so it layers on top */}
      <FleetModal
        open={fleetOpen}
        onClose={() => setFleetOpen(false)}
        authUserId={authUserId}
        onSlipSeat={handleSlipSeatShared}
        onSelect={(id) => { onSelectComboId(id); setFleetOpen(false); }}
        selectedComboId={selectedComboId}
      />
    </>
  );
}
