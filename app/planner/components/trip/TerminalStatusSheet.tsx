"use client";
// app/planner/components/trip/TerminalStatusSheet.tsx
//
// Update a terminal's status from the Driver Dashboard: mark a product out
// or back available at the rack, report or clear a long line / terminal
// issue, clear an allocation report you filed. Every write goes through the
// same paths the rest of the app uses (submitOutageReport,
// clearOutageReportsForProduct, clearOutageReport), so the header ticker and
// the Terminal card agree.

import React, { useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { supabase } from "@/lib/supabase/client";
import {
  clearOutageReport,
  clearOutageReportsForProduct,
  submitOutageReport,
  type ComposedOutageReport,
} from "../../hooks/useTerminalOutageReports";
import type { TerminalProductStatus } from "../../hooks/useDashboardCards";

const muted = "rgba(255,255,255,0.5)";
const red = "#f87171";

function ago(ms: number): string {
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

const rowBox: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 10, padding: "12px 12px",
  borderRadius: 2, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)",
};

function pill(active: boolean, danger = false): React.CSSProperties {
  return {
    padding: "7px 12px", borderRadius: 2, fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0,
    border: `1px solid ${active ? (danger ? red : "#fff") : "rgba(255,255,255,0.2)"}`,
    background: active ? (danger ? "rgba(248,113,113,0.15)" : "rgba(255,255,255,0.12)") : "transparent",
    color: active ? (danger ? red : "#fff") : "rgba(255,255,255,0.75)",
  };
}

export function TerminalStatusSheet({
  open, onClose, terminalId, terminalName, rackId, rackName, products, reports,
  companyId, userId, truckLabel, onChanged,
}: {
  open: boolean;
  onClose: () => void;
  terminalId: string | null;
  terminalName: string | null;
  rackId: string | null;
  rackName: string | null;
  products: TerminalProductStatus[];
  reports: ComposedOutageReport[];
  companyId: string | null;
  userId: string | null;
  truckLabel: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ready = !!terminalId && !!companyId && !!userId;

  async function run(key: string, fn: () => Promise<{ error: string | null }>) {
    setBusy(key);
    setError(null);
    try {
      const r = await fn();
      if (r.error) setError(r.error);
      onChanged();
    } catch (e: any) {
      setError(e?.message ?? "Couldn't save.");
    } finally {
      setBusy(null);
    }
  }

  const setProductOut = (p: TerminalProductStatus, out: boolean) =>
    run(`p:${p.productId}`, async () => {
      if (out) {
        return submitOutageReport({
          terminalId: terminalId!, selectedRackId: rackId, productIds: [p.productId],
          reportType: "out_of_product", companyId: companyId!, userId: userId!, truckLabel,
        });
      }
      if (rackId) {
        const { error } = await supabase
          .from("rack_product_status")
          .update({ is_out: false, updated_by: userId })
          .eq("rack_id", rackId)
          .eq("product_id", p.productId);
        if (error) return { error: error.message };
      }
      return clearOutageReportsForProduct(terminalId!, p.productId, "out_of_product");
    });

  const wide = (type: "long_line" | "terminal_issue", label: string) => {
    const active = reports.filter((r) => r.reportType === type);
    const on = active.length > 0;
    return (
      <div style={rowBox}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: on ? red : "#fff" }}>{label}</div>
          <div style={{ fontSize: 12, color: muted }}>
            {on ? `Reported ${ago(active[0].createdAtMs)} · ${active[0].personLabel}` : "None reported"}
          </div>
        </div>
        {on ? (
          <button aria-busy={!!(busy === type)}
            type="button"
            disabled={!!busy || !active.every((r) => r.canClear)}
            onClick={() => run(type, async () => {
              for (const r of active) {
                const res = await clearOutageReport(r.reportId);
                if (res.error) return res;
              }
              return { error: null };
            })}
            style={pill(false)}
          >
            {busy === type ? "…" : "Clear"}
          </button>
        ) : (
          <button aria-busy={!!(busy === type)}
            type="button"
            disabled={!!busy || !ready}
            onClick={() => run(type, () => submitOutageReport({
              terminalId: terminalId!, selectedRackId: rackId, productIds: [],
              reportType: type, companyId: companyId!, userId: userId!, truckLabel,
            }))}
            style={pill(false, true)}
          >
            {busy === type ? "…" : "Report"}
          </button>
        )}
      </div>
    );
  };

  const allocation = reports.filter((r) => r.reportType === "out_of_allocation");

  return (
    <FullscreenModal open={open} title={terminalName ? `${terminalName} status` : "Terminal status"} onClose={onClose} footer={null}>
      {error && <div style={{ color: red, fontSize: 13, marginBottom: 10 }}>{error}</div>}
      {!ready && <div style={{ color: muted, fontSize: 13, marginBottom: 10 }}>Still signing you in.</div>}

      <div style={{ fontSize: 12, fontWeight: 700, color: muted, letterSpacing: 0.4, margin: "4px 0 8px" }}>
        PRODUCTS{rackName ? ` · ${rackName.toUpperCase()}` : ""}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {products.length === 0 && <div style={{ color: muted, fontSize: 14 }}>No products on file for this rack.</div>}
        {products.map((p) => (
          <div key={p.productId} style={rowBox}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: p.isOut ? "line-through" : undefined, color: p.isOut ? muted : "#fff" }}>
              {p.name}
            </span>
            <button type="button" disabled={!!busy || !ready || !p.isOut} onClick={() => void setProductOut(p, false)} style={pill(!p.isOut)}>
              Available
            </button>
            <button type="button" disabled={!!busy || !ready || p.isOut} onClick={() => void setProductOut(p, true)} style={pill(p.isOut, true)}>
              {busy === `p:${p.productId}` ? "…" : "Out"}
            </button>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, color: muted, letterSpacing: 0.4, margin: "18px 0 8px" }}>TERMINAL</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {wide("long_line", "Long Line")}
        {wide("terminal_issue", "Terminal Issue")}
      </div>

      {allocation.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, color: muted, letterSpacing: 0.4, margin: "18px 0 8px" }}>YOUR COMPANY</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {allocation.map((r) => (
              <div key={r.reportId} style={rowBox}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: red }}>Out of Allocation · {r.productName}</div>
                  <div style={{ fontSize: 12, color: muted }}>{r.personLabel} · {ago(r.createdAtMs)}</div>
                </div>
                {r.canClear && (
                  <button aria-busy={!!(busy === r.reportId)} type="button" disabled={!!busy} onClick={() => run(r.reportId, () => clearOutageReport(r.reportId))} style={pill(false)}>
                    {busy === r.reportId ? "…" : "Clear"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ fontSize: 12, color: muted, marginTop: 18, lineHeight: 1.5 }}>
        Out of Product, Long Line and Terminal Issue show to every driver headed here. A product comes back
        automatically when anyone loads it here.
      </div>
    </FullscreenModal>
  );
}
