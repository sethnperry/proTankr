"use client";
// app/planner/modals/serviceTypes/ServiceTypeListModal.tsx
//
// Part of ServiceTypeManager.tsx.

import React, { useEffect, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";

import type { ServiceType } from "./types";
import { fetchServiceTypes } from "./helpers";
import { ServiceTypeEditorModal } from "./ServiceTypeEditorModal";

export function ServiceTypeListModal({
  open, onClose, companyId, unit,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string;
  unit: "truck" | "trailer";
}) {
  const [types, setTypes] = useState<ServiceType[]>([]);
  const [typeEditor, setTypeEditor] = useState<{ mode: "new" | "edit"; type: ServiceType | null } | null>(null);

  async function reload() {
    setTypes(await fetchServiceTypes(companyId));
  }
  useEffect(() => { if (open && companyId) void reload(); }, [open, companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const applicable = types.filter((t) => t.is_active && (t.applies_to === "both" || t.applies_to === unit));

  const rowStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
    padding: "12px 14px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.03)", cursor: "pointer",
  };

  return (
    <FullscreenModal open={open} onClose={onClose} title="Service Schedule" footer={null}>
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 4 }}>
          Types and intervals used to calculate when this {unit} is next due for service.
        </div>
        {applicable.length === 0 && (
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", padding: "8px 0" }}>No service types yet.</div>
        )}
        {applicable.map((t) => (
          <div key={t.service_type_id} style={rowStyle} onClick={() => setTypeEditor({ mode: "edit", type: t })}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{t.name}</span>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
              {t.interval_kind === "none" ? "No interval" : `Every ${t.interval_value} ${t.interval_kind}`}
            </span>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setTypeEditor({ mode: "new", type: null })}
          style={{
            textAlign: "left" as const, padding: "12px 14px", borderRadius: 2,
            border: "1px dashed rgba(255,255,255,0.18)", background: "transparent",
            color: "rgba(255,255,255,0.55)", fontSize: 14, fontWeight: 700, cursor: "pointer",
          }}
        >
          + New type
        </button>
      </div>

      <ServiceTypeEditorModal
        open={!!typeEditor}
        onClose={() => setTypeEditor(null)}
        companyId={companyId}
        mode={typeEditor?.mode ?? "new"}
        type={typeEditor?.type ?? null}
        unit={unit}
        onSaved={(fresh) => { setTypes(fresh); setTypeEditor(null); }}
        onDeleted={(fresh) => { setTypes(fresh); setTypeEditor(null); }}
      />
    </FullscreenModal>
  );
}

// ─── Service type dropdown (adds a minus-to-edit affordance per option) ─────
// Can't reuse the generic CustomSelect here -- it needs a second interactive
// target (the minus button) inside each option row, which the generic
// component's plain {value,label} options don't support.
