"use client";
// app/planner/modals/RackProductStatusModal.tsx
//
// The "STUD" button -- rack-level Product Status Update. Marks a product out
// (or back in) across the whole rack, and -- when API/temp are supplied --
// feeds the existing fuel-temp-bias system (update_terminal_temp_bias RPC)
// via the same predicted-temp/error computation useLoadWorkflow.ts already
// does after a load completes. No new bias-tracking path is introduced here,
// per the Terminal Tier spec.
//
// 2026-09-06: marking a product Out/Available here now also raises/clears
// the same terminal_outage_reports row (and therefore the same header
// banner) a driver's "Report Terminal Issue" flow already posts to -- see
// CLAUDE.md "STUD linked to the outage banner." Out of Product only --
// Out of Allocation is company-specific and stays untouched by STUD.
//
// Relocated here from the now-deleted app/planner/terminal/ page -- STUD (and
// Edit Terminal, its sibling) now open from MyTerminalsModal.tsx's expanded
// terminal-card view instead of a dedicated Terminal tab, per explicit
// direction ("take the whole section out of the terminal page for product
// status... put that in the location modal in the expanded view of the
// terminal card"). Behavior is otherwise unchanged from the original.

import React, { useEffect, useState } from "react";
import { isPlausibleApi } from "../utils/apiBasis";
import { useProductsCatalog } from "@/lib/queries/useProductsCatalog";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import type { TerminalRack, RackProductStatusRow, ProductLite } from "./rackProductTypes";
import { submitOutageReport, clearOutageReportsForProduct } from "../hooks/useTerminalOutageReports";

export default function RackProductStatusModal({
  open,
  onClose,
  rack,
  terminalCity,
  terminalState,
  rackProducts,
  productsById,
  authUserId,
  companyId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  rack: TerminalRack;
  terminalCity: string;
  terminalState: string;
  rackProducts: RackProductStatusRow[];
  productsById: Record<string, ProductLite>;
  authUserId: string;
  // Links STUD to the same terminal-outage banner "Report Terminal Issue"
  // already posts to -- see CLAUDE.md "STUD linked to the outage banner"
  // (2026-09-06). Required for the outage-report insert/clear below (the
  // row's own company_id column), same as page.tsx's handleSubmitOutageReport
  // already requires it.
  companyId: string | null;
  onSaved: () => void;
}) {
  const [productId, setProductId] = useState("");
  const [isOut, setIsOut] = useState(true);
  const [api, setApi] = useState("");
  const [tempF, setTempF] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setProductId(rackProducts[0]?.product_id ?? "");
    setError(null);
  }, [open, rackProducts]);

  // Prefills from this product's own last reading -- per explicit user
  // direction, the STUD form should start from the current known state,
  // not blank, since most updates are a small correction not a fresh entry.
  useEffect(() => {
    if (!open || !productId) return;
    const row = rackProducts.find((r) => r.product_id === productId);
    setIsOut(row?.is_out ?? true);
    setApi(row?.last_api != null ? String(row.last_api) : "");
    setTempF(row?.last_temp_f != null ? String(row.last_temp_f) : "");
  }, [productId, open, rackProducts]);

  const { data: catalog } = useProductsCatalog();
  async function save() {
    if (!productId) return;
    setSaving(true);
    setError(null);

    const apiNum = api.trim() ? Number(api) : null;
    const tempNum = tempF.trim() ? Number(tempF) : null;
    const refApi = catalog.find((p) => p.product_id === productId)?.api_60;
    if (apiNum != null && !isPlausibleApi(apiNum, refApi)) {
      setError(`${apiNum} API doesn't look right for this product${refApi != null ? ` (about ${Math.round(Number(refApi))})` : ""}. Check the reading.`);
      setSaving(false);
      return;
    }

    const { error: upsertErr } = await supabase.from("rack_product_status").upsert(
      {
        rack_id: rack.rack_id,
        product_id: productId,
        is_out: isOut,
        last_api: apiNum,
        last_temp_f: tempNum,
        updated_at: new Date().toISOString(),
        updated_by: authUserId || null,
        active: true,
      },
      { onConflict: "rack_id,product_id" }
    );
    if (upsertErr) {
      setError(upsertErr.message);
      setSaving(false);
      return;
    }

    // Propagate to canonical-group siblings ON THIS SAME RACK (e.g. D2 <->
    // its dyed variant) -- see CLAUDE.md "rack-aware loading, unified".
    // Physically the same tank/feed at the point of loading, so this STUD
    // reading is also true for its sibling. Replaces the old write-through
    // to terminal_products (a separate terminal-wide table this codebase no
    // longer reads at all) -- update-only, matching useLoadWorkflow.ts's own
    // rule: a sibling only gets the new reading if it already has a real row
    // on this rack, never auto-curating a product nobody assigned here.
    // Same API+temp-both-supplied gate as the temp-bias call below, so a
    // partial STUD (say, API only) never blanks out a sibling's previously-
    // good value in the other column.
    if (apiNum != null && tempNum != null) {
      const canonicalRootByProductId = new Map(
        rackProducts.map((r) => [r.product_id, productsById[r.product_id]?.canonical_product_id || r.product_id])
      );
      const root = canonicalRootByProductId.get(productId) ?? productId;
      const siblingIds = rackProducts
        .map((r) => r.product_id)
        .filter((pid) => pid !== productId && (canonicalRootByProductId.get(pid) ?? pid) === root);
      const nowIso = new Date().toISOString();
      for (const siblingId of siblingIds) {
        const { error: siblingErr } = await supabase
          .from("rack_product_status")
          .update({ last_api: apiNum, last_temp_f: tempNum, updated_at: nowIso, updated_by: authUserId || null })
          .eq("rack_id", rack.rack_id)
          .eq("product_id", siblingId);
        if (siblingErr) console.warn("rack_product_status sibling propagation failed (non-fatal):", siblingErr);
      }
    }

    // Feed the existing temp-bias system, same pattern as useLoadWorkflow.ts.
    if (apiNum != null && tempNum != null && terminalCity && terminalState) {
      try {
        const res = await fetch("/api/fuel-temp", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ city: terminalCity, state: terminalState, terminalId: rack.terminal_id }),
        });
        const json: any = await res.json().catch(() => ({}));
        const predicted = Number(json?.predictedFuelTempF);
        if (res.ok && Number.isFinite(predicted)) {
          const observedError = tempNum - predicted;
          if (Math.abs(observedError) < 25) {
            const now = new Date();
            const hourUtc = Math.floor(now.getUTCHours() / 3) * 3;
            const monthOfYear = now.getUTCMonth() + 1;
            await supabase.rpc("update_terminal_temp_bias", {
              p_terminal_id: rack.terminal_id,
              p_hour_of_day: hourUtc,
              p_month_of_year: monthOfYear,
              p_error: observedError,
            });
          }
        }
      } catch {
        // Non-fatal -- the rack_product_status write above already succeeded.
      }
    }

    // Link to the same terminal-outage banner "Report Terminal Issue"
    // already posts to -- STUD marking a product Out is the same real-world
    // fact ("this product is physically out at this terminal") a driver's
    // outage report describes, so it should raise/clear the identical
    // banner rather than a second, disconnected notion of "out." Never
    // blocks the save above on failure -- the rack_product_status write is
    // the source of truth this modal exists for; the banner link is a
    // best-effort side effect. submitOutageReport's own rack_product_status
    // upsert (is_out only, no api/temp) is redundant with the fuller one
    // above but harmless -- reusing it here (rather than inserting into
    // terminal_outage_reports directly) keeps this in the ONE place that
    // knows how to shape that row correctly.
    try {
      if (isOut) {
        const { error: outageErr } = await submitOutageReport({
          terminalId: rack.terminal_id,
          selectedRackId: rack.rack_id,
          productIds: [productId],
          reportType: "out_of_product",
          companyId: companyId || "",
          userId: authUserId,
          truckLabel: "",
        });
        if (outageErr) console.warn("STUD->outage-report link failed (non-fatal):", outageErr);
      } else {
        // Marking Available clears ANY active out_of_product report for
        // this terminal+product, not just one this same user may have
        // filed -- STUD represents the terminal's own current status, not
        // a personal claim, so it should be able to clear a peer driver's
        // report too (see clearOutageReportsForProduct's own comment and
        // the 20260906000000 migration this depends on).
        const { error: clearErr } = await clearOutageReportsForProduct(rack.terminal_id, productId, "out_of_product");
        if (clearErr) console.warn("STUD->outage-report clear failed (non-fatal):", clearErr);
      }
    } catch (err) {
      console.warn("STUD->outage-report link/clear threw (non-fatal):", err);
    }

    setSaving(false);
    onSaved();
    onClose();
  }

  const product = productId ? productsById[productId] : null;

  return (
    <FullscreenModal
      open={open}
      title="Product Status Update"
      onClose={onClose}
      footer={null}
    >
      <div style={{ display: "grid", gap: 14 }}>
        {error && <div style={{ color: "#f87171", fontSize: 12 }}>{error}</div>}

        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", marginBottom: 6, textTransform: "uppercase" as const }}>Product</div>
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            style={{
              width: "100%", boxSizing: "border-box" as const, padding: "10px 12px", borderRadius: 2,
              border: "1px solid rgba(255,255,255,0.12)", background: "#111", color: "white", fontSize: 14,
            }}
          >
            {rackProducts.length === 0 && <option value="">No products configured for this rack</option>}
            {rackProducts.map((r) => {
              const p = productsById[r.product_id];
              return (
                <option key={r.product_id} value={r.product_id}>
                  {p ? (p.product_name ?? p.display_name ?? "Product") : r.product_id}
                </option>
              );
            })}
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderRadius: 2, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)", padding: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>
            Status: {isOut ? "Product Out" : "Available"}
            {product && <span style={{ color: "rgba(255,255,255,0.4)", fontWeight: 400 }}> · {rack.rack_name} Only</span>}
          </span>
          <button
            type="button"
            onClick={() => setIsOut((v) => !v)}
            style={{
              padding: "6px 12px", borderRadius: 2, fontSize: 12, fontWeight: 800, cursor: "pointer",
              border: "1px solid rgba(255,255,255,0.15)",
              background: isOut ? "rgba(239,68,68,0.18)" : "rgba(34,197,94,0.15)",
              color: isOut ? "#f87171" : "#4ade80",
            }}
          >
            {isOut ? "Mark Available" : "Mark Out"}
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", marginBottom: 6, textTransform: "uppercase" as const }}>API</div>
            <div style={{ position: "relative" }}>
              <input
                type="text" inputMode="decimal" value={api} onChange={(e) => setApi(e.target.value.replace(/[^0-9.\-]/g, ""))}
                onFocus={(e) => e.currentTarget.select()}
                placeholder="50.6"
                style={{ width: "100%", boxSizing: "border-box" as const, padding: "10px 40px 10px 12px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", color: "white", fontSize: 14 }}
              />
              <button type="button" aria-label="Toggle minus sign" onMouseDown={(e) => e.preventDefault()}
                onClick={() => setApi((v) => (v.startsWith("-") ? v.slice(1) : `-${v}`))}
                style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", width: 30, height: 28, borderRadius: 2, border: "1px solid rgba(255,255,255,0.2)", background: "transparent", color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>±</button>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", marginBottom: 6, textTransform: "uppercase" as const }}>Temp (°F)</div>
            <input
              type="text" inputMode="decimal" value={tempF} onChange={(e) => setTempF(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              placeholder="75.6"
              style={{ width: "100%", boxSizing: "border-box" as const, padding: "10px 12px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", color: "white", fontSize: 14 }}
            />
          </div>
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", lineHeight: 1.5 }}>
          API and temp are optional — supplying both updates this product's known reading for {rack.rack_name}, visible to any driver in any company, the same way completing a real load at this rack does.
        </div>

        <button aria-busy={!!(saving)}
          onClick={save}
          disabled={saving || !productId}
          className="w-full rounded-[2px] bg-[#111] px-4 py-3 font-semibold text-white border border-white/15 hover:bg-[#151515]"
          style={{ opacity: saving || !productId ? 0.6 : 1 }}
        >
          {saving ? "Saving…" : "Done"}
        </button>
      </div>
    </FullscreenModal>
  );
}
