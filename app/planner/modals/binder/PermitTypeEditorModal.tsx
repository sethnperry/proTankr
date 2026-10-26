"use client";
// app/planner/modals/binder/PermitTypeEditorModal.tsx
//
// Part of the Binder (equipment file) dialog.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { CustomSelect } from "@/lib/ui/CustomSelect";
import { useTerminalsCatalog } from "@/lib/queries/useTerminalsCatalog";

import type { PermitType, UnitKind } from "./types";
import { inputStyle, labelStyle, saveBtnStyle, cancelBtnStyle, dangerBtnStyle } from "./styles";

export function PermitTypeEditorModal({
  open,
  onClose,
  companyId,
  mode,
  type,
  unit,
  initialName,
  onSaved,
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string;
  mode: "new" | "edit";
  type: PermitType | null;
  unit: UnitKind;
  initialName?: string;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState("");
  const [appliesTo, setAppliesTo] = useState<PermitType["applies_to"]>("both");
  const [terminalId, setTerminalId] = useState<string | null>(null);
  const [termQuery, setTermQuery] = useState("");
  const { data: terminalCatalog } = useTerminalsCatalog();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setConfirmingDelete(false);
    setErr(null);
    if (mode === "edit" && type) {
      setName(type.name);
      setAppliesTo(type.applies_to);
      setTerminalId(type.terminal_id ?? null);
    } else {
      setName(initialName ?? "");
      setAppliesTo(unit);
      setTerminalId(null);
    }
    setTermQuery("");
  }, [open, mode, type, unit, initialName]);

  async function save() {
    if (!name.trim()) {
      setErr("Enter a permit name.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      if (mode === "edit" && type) {
        const { error } = await supabase
          .from("permit_types")
          .update({ name: name.trim(), applies_to: appliesTo, terminal_id: appliesTo === "truck" ? null : terminalId })
          .eq("permit_type_id", type.permit_type_id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("permit_types")
          .insert({
            company_id: companyId,
            name: name.trim(),
            applies_to: appliesTo,
            terminal_id: appliesTo === "truck" ? null : terminalId,
          });
        if (error) throw error;
      }
      onSaved();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to save permit type.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!type) return;
    setBusy(true);
    setErr(null);
    try {
      const { error } = await supabase.from("permit_types").update({ is_active: false }).eq("permit_type_id", type.permit_type_id);
      if (error) throw error;
      onDeleted();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to delete permit type.");
      setBusy(false);
    }
  }

  return (
    <FullscreenModal open={open} onClose={onClose} title={mode === "edit" ? "Edit Permit Type" : "New Permit Type"} footer={null}>
      <div style={{ display: "grid", gap: 14 }}>
        {err && <div style={{ color: "#fca5a5", fontSize: 13 }}>{err}</div>}

        {!confirmingDelete ? (
          <>
            <div>
              <label style={labelStyle}>Permit name</label>
              <input
                placeholder="e.g. Registration, IFTA, Tank V"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Applies to</label>
              <CustomSelect
                value={appliesTo}
                onChange={(v) => setAppliesTo(v as any)}
                options={[
                  { value: "both", label: "Truck & Trailer" },
                  { value: "truck", label: "Truck only" },
                  { value: "trailer", label: "Trailer only" },
                ]}
              />
            </div>

            {appliesTo !== "truck" && (
              <div>
                <label style={labelStyle}>Only needed at one terminal (optional)</label>
                {terminalId ? (
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ ...inputStyle, flex: 1 }}>
                      {terminalCatalog.find((t) => String(t.terminal_id) === terminalId)?.terminal_name ?? "Terminal"}
                    </div>
                    <button type="button" onClick={() => setTerminalId(null)} style={cancelBtnStyle}>
                      Clear
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      placeholder="Search terminals"
                      value={termQuery}
                      onChange={(e) => setTermQuery(e.target.value)}
                      style={inputStyle}
                    />
                    {termQuery.trim() &&
                      terminalCatalog
                        .filter((t) => `${t.terminal_name ?? ""} ${t.city ?? ""}`.toLowerCase().includes(termQuery.trim().toLowerCase()))
                        .slice(0, 6)
                        .map((t) => (
                          <button
                            key={String(t.terminal_id)}
                            type="button"
                            onClick={() => {
                              setTerminalId(String(t.terminal_id));
                              setTermQuery("");
                              if (!name.trim()) setName(`${t.terminal_name} certification`);
                            }}
                            style={{ ...cancelBtnStyle, width: "100%", textAlign: "left" as const, marginTop: 6 }}
                          >
                            {t.terminal_name}
                            {t.city ? ` · ${t.city}${t.state ? `, ${t.state}` : ""}` : ""}
                          </button>
                        ))}
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 6, lineHeight: 1.5 }}>
                      Dispatch checks this on the trailer before sending a driver to that terminal. Add the certificate image in the
                      permit's documents.
                    </div>
                  </>
                )}
              </div>
            )}

            <button aria-busy={!!busy} type="button" onClick={save} disabled={busy} style={saveBtnStyle}>
              {busy ? "Saving…" : "Save"}
            </button>

            {mode === "edit" && (
              <button type="button" onClick={() => setConfirmingDelete(true)} disabled={busy} style={{ ...dangerBtnStyle, width: "100%" }}>
                Delete permit type
              </button>
            )}
          </>
        ) : (
          <>
            <div style={{ fontWeight: 900, fontSize: 16 }}>Delete &quot;{type?.name}&quot;?</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>
              This only affects future entries -- it stops showing up as an option going forward. Existing dates and documents already
              recorded under it are unaffected.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" onClick={() => setConfirmingDelete(false)} disabled={busy} style={cancelBtnStyle}>
                Cancel
              </button>
              <button aria-busy={!!busy} type="button" onClick={confirmDelete} disabled={busy} style={{ ...dangerBtnStyle, flex: 1 }}>
                {busy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </>
        )}
      </div>
    </FullscreenModal>
  );
}

// ─── Add-permit picker (pick a common name, or add a custom one) ───────────
// Sits in front of PermitTypeEditorModal -- picking a suggestion just
// pre-fills that modal's name field (still goes through the same save/
// applies_to/validation path); "+ Add custom" opens it blank, same as
// "+ Add permit type" always did before this existed.
