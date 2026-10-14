"use client";
// app/admin/FleetCardsModal.tsx
//
// Fleet Tier Section 1.3: "fleet-wide view of who's carded where, filterable
// by terminal, so dispatch doesn't send an uncarded driver." Pick a
// terminal, see every company driver's card status there -- mirrors
// AdminLoadsModal's pattern (fetch internally, own its own state, no new
// state needed on the admin page).
//
// Deliberately status-only (carded_on + computed expiry state) -- doesn't
// read/show card_number/PIN (those stay in user_terminal_cards, untouched
// here).

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { accessStateFor, DARK_EXP_COLOR } from "@/app/planner/cards/cardTheme";
import { formatMDYWithCountdown_, addDaysISO_ } from "@/app/planner/utils/dates";
import { useTerminalsCatalog } from "@/lib/queries/useTerminalsCatalog";


type TerminalOption = { terminal_id: string; terminal_name: string | null; city: string | null; state: string | null; renewal_days?: number | null };
type DriverStatus = { user_id: string; display_name: string; cardedOn: string | null; expiresISO: string | null };

type Props = {
  open: boolean;
  onClose: () => void;
  companyId: string;
};

export default function FleetCardsModal({ open, onClose, companyId }: Props) {
  const [search, setSearch] = useState("");
  // Sourced from the shared cached catalog (lib/queries/useTerminalsCatalog.ts)
  // instead of this modal's own supabase.from("terminals") fetch on every
  // open -- that shared fetch is also correctly paginated past
  // PostgREST's 1000-row cap, which this modal's own prior fetch never
  // was (the live catalog is 1,238+ terminals).
  const { data: terminals = [] } = useTerminalsCatalog();
  const [picked, setPicked] = useState<TerminalOption | null>(null);
  const [drivers, setDrivers] = useState<DriverStatus[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setPicked(null);
    setDrivers([]);
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return terminals.filter((t) => `${t.terminal_name} ${t.city ?? ""} ${t.state ?? ""}`.toLowerCase().includes(q)).slice(0, 30);
  }, [terminals, search]);

  async function pickTerminal(t: TerminalOption) {
    setPicked(t);
    setLoading(true);
    try {
      const { data: memberRows } = await supabase.from("user_companies").select("user_id").eq("company_id", companyId);
      const memberIds = (memberRows ?? []).map((m: any) => m.user_id).filter(Boolean);
      if (memberIds.length === 0) { setDrivers([]); return; }

      const [{ data: profileRows }, { data: accessRows }] = await Promise.all([
        supabase.rpc("get_display_names_full", { p_user_ids: memberIds }),
        supabase.from("terminal_access").select("user_id, carded_on").eq("terminal_id", t.terminal_id).in("user_id", memberIds),
      ]);
      const nameById = Object.fromEntries(((profileRows ?? []) as any[]).map((p) => [p.user_id, p.display_name ?? "Unknown"]));
      const accessById = Object.fromEntries(((accessRows ?? []) as any[]).map((r) => [r.user_id, r.carded_on]));
      const renewalDays = t.renewal_days ?? 90;

      const rows: DriverStatus[] = memberIds.map((uid: string) => {
        const cardedOn = accessById[uid] ?? null;
        const expiresISO = cardedOn ? addDaysISO_(cardedOn, renewalDays) : null;
        return { user_id: uid, display_name: nameById[uid] ?? "Unknown", cardedOn, expiresISO };
      }).sort((a, b) => a.display_name.localeCompare(b.display_name));
      setDrivers(rows);
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 10200, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#111518", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", width: "100%", maxWidth: 480, maxHeight: "85vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", padding: "16px 18px 12px", gap: 10, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          {picked && (
            <button type="button" onClick={() => setPicked(null)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.55)", fontSize: 13, fontWeight: 700, cursor: "pointer", padding: 0, flexShrink: 0 }}>
              ‹ Back
            </button>
          )}
          <div style={{ flex: 1, fontSize: 17, fontWeight: 900, color: "rgba(255,255,255,0.92)" }}>
            {picked ? picked.terminal_name : "Fleet Terminal Cards"}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.85)", fontSize: 20, fontWeight: 900, cursor: "pointer", lineHeight: 1, padding: "0 2px", flexShrink: 0 }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "12px 18px 18px" }}>
          {!picked ? (
            <>
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search terminal, city, or state…"
                style={{ width: "100%", borderRadius: 6, border: "1px solid rgba(255,255,255,0.16)", background: "rgba(0,0,0,0.3)", color: "#fff", fontSize: 14, padding: "9px 12px", boxSizing: "border-box", marginBottom: 10 }}
              />
              {search.trim() === "" ? (
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", textAlign: "center" as const, padding: "24px 0" }}>Search for a terminal to see who's carded there.</div>
              ) : filtered.length === 0 ? (
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", textAlign: "center" as const, padding: "24px 0" }}>No matching terminals.</div>
              ) : (
                filtered.map((t) => (
                  <div key={t.terminal_id} role="button" tabIndex={0} onClick={() => pickTerminal(t)}
                    style={{ padding: "10px 12px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", marginBottom: 6, cursor: "pointer" }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>{t.terminal_name}</div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{t.city}{t.state ? `, ${t.state}` : ""}</div>
                  </div>
                ))
              )}
            </>
          ) : loading ? (
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", textAlign: "center" as const, padding: "24px 0" }}>Loading…</div>
          ) : drivers.length === 0 ? (
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", textAlign: "center" as const, padding: "24px 0" }}>No drivers in this company.</div>
          ) : (
            drivers.map((d) => {
              const state = accessStateFor(d.expiresISO);
              return (
                <div key={d.user_id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 12px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", marginBottom: 6 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>{d.display_name}</div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: DARK_EXP_COLOR[state], textAlign: "right" as const, flexShrink: 0 }}>
                    {d.expiresISO ? formatMDYWithCountdown_(d.expiresISO) : "Not carded"}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
