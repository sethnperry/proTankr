"use client";
// app/planner/modals/loading/TunePanel.tsx
//
// The "Load basis" panel in Plan Review.

import { useState } from "react";
import { useProductsCatalog } from "@/lib/queries/useProductsCatalog";
import { apiRangeProblem } from "../../utils/apiBasis";
import ValueEntryOverlay from "../../components/ValueEntryOverlay";
import { CARD_BG, CARD_BORDER, CARD_SHADOW } from "../../cards/cardTheme";

import type { TuneRow } from "./types";

// The Tune panel: shows the density basis (code · temp · API · lbs/gal · date)
// per product and lets the driver correct it with a fresh gauge/BOL reading.
// Tapping a row opens the same numeric overlay used to update temp/api
// elsewhere, with current ambient + the last real API reading shown as
// context (this is a basis adjustment BEFORE loading, not the post-load BOL
// entry -- hence the caution copy rather than "from your gauge or BOL"); a correction recomputes the planned gallons live (page.tsx's
// onTuneProduct feeds the density). Temp keeps its confidence color.
//
// Review-mode only -- the Load Report's own basis listing (further down)
// is a deliberately non-interactive sibling, not this component reused.
export function TunePanel({
  rows,
  tempColor,
  onTune,
  ambientTempF,
  cityLabel,
}: {
  rows: TuneRow[];
  tempColor: string;
  onTune: (productId: string, api: number, tempF: number) => void;
  ambientTempF?: number | null;
  cityLabel?: string | null;
}) {
  const [editing, setEditing] = useState<TuneRow | null>(null);
  const [apiStr, setApiStr] = useState("");
  const [tempStr, setTempStr] = useState("");
  const [tuneErr, setTuneErr] = useState<string | null>(null);
  const catalog = useProductsCatalog().data;

  if (!rows || rows.length === 0) return null;

  function openEdit(r: TuneRow) {
    setTempStr(String(Math.round(r.tempF * 10) / 10));
    setApiStr(r.api != null ? String(Math.round(r.api * 10) / 10) : "");
    setTuneErr(null);
    setEditing(r);
  }
  function commit() {
    if (!editing) return;
    const api = Number(apiStr);
    const t = Number(tempStr);
    const prod = catalog.find((p) => p.product_id === editing.productId);
    const rangeMsg = Number.isFinite(api) ? apiRangeProblem(api, prod?.api_min, prod?.api_max) : null;
    if (rangeMsg) { setTuneErr(rangeMsg); return; }
    if (Number.isFinite(api) && api > -10 && apiStr.trim() !== "" && apiStr.trim() !== "-" && Number.isFinite(t)) {
      onTune(editing.productId, Math.round(api * 10) / 10, Math.round(t * 10) / 10);
    }
    setEditing(null);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontWeight: 800, fontSize: 13, letterSpacing: 0.2, opacity: 0.7, textTransform: "uppercase" }}>
        Load basis · tap to tune
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {rows.map((r) => (
          <button
            key={r.productId}
            type="button"
            onClick={() => openEdit(r)}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              padding: "9px 12px",
              borderRadius: 2,
              border: CARD_BORDER,
              background: CARD_BG,
              boxShadow: CARD_SHADOW,
              cursor: "pointer",
              width: "100%",
              textAlign: "left" as const,
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: r.dotColor, flexShrink: 0, alignSelf: "center" }} />
              <span style={{ fontSize: 14, fontWeight: 800, color: "#fff", flexShrink: 0 }}>{r.code}</span>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 12,
                  marginLeft: "auto",
                  flexWrap: "wrap",
                  justifyContent: "flex-end",
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 800, color: tempColor }}>{r.tempF.toFixed(1)}°F</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: r.apiColor }}>
                  {r.api != null ? `${r.api.toFixed(1)} API` : "— API"}
                </span>
                <span style={{ fontSize: 14, fontWeight: 800, color: "rgba(255,255,255,0.9)" }}>
                  {r.lbsPerGal != null ? `${r.lbsPerGal.toFixed(2)} lb/gal` : "—"}
                </span>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: r.tuned ? "#4ade80" : "rgba(255,255,255,0.4)" }}>
                {r.tuned ? "edited · just now" : r.dateLabel}
              </span>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>tune ›</span>
            </div>
          </button>
        ))}
      </div>

      <ValueEntryOverlay
        open={!!editing}
        error={tuneErr}
        title={editing ? `Tune ${editing.code}` : "Tune"}
        dotColor={editing?.dotColor}
        fields={[
          { key: "temp", label: "Temp °F", value: tempStr, onChange: setTempStr, decimal: true, suffix: "°F" },
          { key: "api", label: "API", value: apiStr, onChange: setApiStr, decimal: true, signed: true, suffix: "API" },
        ]}
        hint={
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, textAlign: "center" as const }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
              {ambientTempF != null && Number.isFinite(ambientTempF) && (
                <span>
                  Ambient <b style={{ color: "#fff" }}>{Math.round(ambientTempF)}°F</b>
                  {cityLabel ? ` · ${cityLabel}` : ""}
                </span>
              )}
              <span>
                Last API{" "}
                {editing?.lastApi != null ? (
                  <>
                    <b style={{ color: "#fff" }}>{editing.lastApi.toFixed(1)}</b>
                    {editing.lastApiDateLabel ? ` · ${editing.lastApiDateLabel}` : ""}
                  </>
                ) : (
                  "— no reading"
                )}
              </span>
            </div>
            <span>Adjust basis for known product condition. Adjust with caution.</span>
          </div>
        }
        onCancel={() => setEditing(null)}
        onSubmit={commit}
        submitLabel="Set"
      />
    </div>
  );
}
