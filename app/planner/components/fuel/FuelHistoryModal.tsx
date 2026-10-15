"use client";
// app/planner/components/fuel/FuelHistoryModal.tsx
//
// One truck's fuel stops, shared with everyone in the company (equipment
// history). Amounts and receipts show only where RLS allows: company-paid to
// the company, out of pocket to the driver and admins. Fill-to-fill MPG on top.

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { openStoredFile } from "@/lib/fuel/useFuelSetup";
import { fillToFillMpg } from "@/lib/fuel/fuelFlow";
import { KIND_LABEL, RECEIPT_BUCKET, minutesBetween, type FuelPayment, type FuelPurchase, fmtStamp, fmtTime } from "@/lib/fuel/types";

const muted = "rgba(255,255,255,0.5)";
const hair = "rgba(255,255,255,0.08)";

export default function FuelHistoryModal({ open, onClose, truckId, truckName }: {
  open: boolean; onClose: () => void; truckId: string | null; truckName: string | null;
}) {
  const [rows, setRows] = useState<FuelPurchase[]>([]);
  const [pay, setPay] = useState<Record<string, FuelPayment>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !truckId) return;
    let alive = true;
    setLoading(true);
    (async () => {
      const { data } = await supabase.from("fuel_purchases").select("*").eq("truck_id", truckId)
        .eq("status", "complete").order("started_at", { ascending: false }).limit(100);
      const list = ((data ?? []) as FuelPurchase[]).map((r) => ({ ...r, attempts: r.attempts ?? [] }));
      const ids = list.map((r) => r.id);
      const [p, n] = await Promise.all([
        ids.length ? supabase.from("fuel_purchase_payments").select("*").in("purchase_id", ids) : Promise.resolve({ data: [] }),
        supabase.rpc("get_display_names_full", { p_user_ids: [...new Set(list.map((r) => r.driver_id))] }),
      ]);
      if (!alive) return;
      setRows(list);
      setPay(Object.fromEntries(((p.data ?? []) as FuelPayment[]).map((x) => [x.purchase_id, x])));
      setNames(Object.fromEntries(((n.data ?? []) as { user_id: string; display_name: string | null }[]).map((x) => [x.user_id, x.display_name ?? ""])));
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [open, truckId]);

  const mpg = useMemo(() => fillToFillMpg(rows), [rows]);

  return (
    <FullscreenModal open={open} title={`Fuel · ${truckName ? `Truck ${truckName}` : "Truck"}`} onClose={onClose}>
      {!truckId && <div style={{ color: muted }}>Select a truck first.</div>}
      {truckId && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: hair, border: `1px solid ${hair}`, marginBottom: 14 }}>
          <div style={{ background: "#0f0f10", padding: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", color: muted }}>MPG (FILL TO FILL)</div>
            <div className="dash-num" style={{ fontSize: 26, fontWeight: 900, marginTop: 4 }}>{mpg.average ?? "—"}</div>
          </div>
          <div style={{ background: "#0f0f10", padding: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", color: muted }}>STOPS</div>
            <div className="dash-num" style={{ fontSize: 26, fontWeight: 900, marginTop: 4 }}>{rows.length}</div>
          </div>
        </div>
      )}
      {truckId && mpg.average == null && rows.length > 0 && (
        <div style={{ fontSize: 12, color: muted, marginBottom: 12 }}>MPG needs two fills marked “Filled to full” with odometer readings.</div>
      )}
      {loading && <div style={{ color: muted }}>Loading…</div>}
      {!loading && truckId && rows.length === 0 && <div style={{ color: muted }}>No fuel stops yet.</div>}
      {rows.map((r) => {
        const p = pay[r.id];
        const mins = minutesBetween(r.started_at, r.finished_at);
        const isOpen = openId === r.id;
        return (
          <div key={r.id} style={{ borderTop: `1px solid ${hair}` }}>
            <button type="button" onClick={() => setOpenId(isOpen ? null : r.id)}
              style={{ width: "100%", display: "flex", gap: 10, alignItems: "baseline", padding: "12px 0", background: "none", border: "none", color: "#fff", textAlign: "left", cursor: "pointer" }}>
              <span style={{ fontSize: 12, color: muted, width: 58, flexShrink: 0, lineHeight: 1.3 }}>
                {new Date(r.started_at).toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}<br />{fmtTime(r.finished_at ?? r.started_at)}
              </span>
              <span style={{ flex: 1, minWidth: 0, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.store_name ?? "Fuel"}{r.store_number ? ` #${r.store_number}` : ""}
                <span style={{ color: muted, fontWeight: 500 }}>{r.city ? ` · ${r.city}${r.state ? `, ${r.state}` : ""}` : ""}</span>
              </span>
              <span className="dash-num" style={{ fontWeight: 800, flexShrink: 0 }}>{r.diesel_gallons != null ? `${Number(r.diesel_gallons).toFixed(1)} gal` : "—"}</span>
            </button>
            {isOpen && (
              <div style={{ fontSize: 13, paddingBottom: 12, display: "grid", gap: 4 }}>
                <div><span style={{ color: muted }}>Driver </span>{names[r.driver_id] || "—"}</div>
                <div><span style={{ color: muted }}>Started </span>{fmtStamp(r.started_at)}<span style={{ color: muted }}> · Finished </span>{fmtTime(r.finished_at)}</div>
                <div><span style={{ color: muted }}>Odometer </span>{r.odometer != null ? Number(r.odometer).toLocaleString("en-US") : "—"}{mpg.byId[r.id] ? ` · ${mpg.byId[r.id]} mpg` : ""}</div>
                {r.def_gallons != null && <div><span style={{ color: muted }}>DEF </span>{Number(r.def_gallons).toFixed(1)} gal</div>}
                <div><span style={{ color: muted }}>Paid </span>{r.pay_kind ? KIND_LABEL[r.pay_kind] : "—"}{r.pump_number ? ` · pump ${r.pump_number}` : ""}{r.filled_to_full ? " · filled to full" : ""}</div>
                {mins != null && <div><span style={{ color: muted }}>At the pump </span>{mins} min</div>}
                {r.attempts.length > 0 && (
                  <div style={{ color: "#fbbf24" }}>
                    {r.attempts.map((a, i) => (
                      <div key={i}>✕ {fmtTime(a.at)} · {a.label}{a.pump_number ? ` · pump ${a.pump_number}` : ""}{a.issue ? ` · ${a.issue}` : ""}{a.store_name ? ` · ${a.store_name}` : ""}</div>
                    ))}
                  </div>
                )}
                {p?.total_amount != null && <div><span style={{ color: muted }}>Total </span>${Number(p.total_amount).toFixed(2)}{p.price_per_gallon != null ? ` · $${Number(p.price_per_gallon).toFixed(3)}/gal` : ""}</div>}
                {p?.receipt_path && (
                  <button type="button" onClick={() => void openStoredFile(RECEIPT_BUCKET, p.receipt_path!).catch(() => {})}
                    style={{ justifySelf: "start", border: "none", background: "none", color: "#fff", padding: 0, fontWeight: 700, cursor: "pointer" }}>
                    📄 Receipt
                  </button>
                )}
                {r.notes && <div style={{ color: muted }}>“{r.notes}”</div>}
              </div>
            )}
          </div>
        );
      })}
    </FullscreenModal>
  );
}
