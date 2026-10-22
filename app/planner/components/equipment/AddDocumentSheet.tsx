"use client";
// app/planner/components/equipment/AddDocumentSheet.tsx
//
// The "+ Document" process, shared by the equipment pop-out and the unit's file:
//   1. The device camera opens straight from the + Document button (CameraButton).
//   2. Label it: a company's own document types, common ones, a terminal certification
//      (opens a terminal search), or a custom name.
//   3. Pick the expiration date. Leaving it blank forces an acknowledgement, because the
//      date is what drives tracking and reminders.
//   4. Save attaches the pages to the unit's file with the others and records the date.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { supabase } from "@/lib/supabase/client";
import { useTerminalsCatalog } from "@/lib/queries/useTerminalsCatalog";
import { PRIMARY_BTN, SECONDARY_BTN } from "@/lib/ui/look";
import { addMonthsIso, formatLong, isoFromDate, monthGrid } from "@/lib/equipment/calendar";

type UnitKind = "truck" | "trailer";
type PermitType = { permit_type_id: string; name: string; applies_to: "truck" | "trailer" | "both"; is_active: boolean; terminal_id: string | null };

const MUTED = "rgba(255,255,255,0.5)";
const row: React.CSSProperties = {
  display: "block", width: "100%", textAlign: "left", padding: "13px 14px", marginBottom: 8, borderRadius: 2,
  border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer",
};
const input: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "11px 12px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.04)", color: "#fff", fontSize: 16, colorScheme: "dark",
};

export const COMMON_DOCS: Record<UnitKind, string[]> = {
  truck: ["Registration", "Annual Inspection", "IFTA Permits + Decals", "PHMSA HazMat Permit", "Alliance HazMat Permit", "Fleet Insurance Cab Card", "HazMat Transportation Lic", "Inner Bridge Permit"],
  trailer: ["Trailer Registration", "Annual Inspection", "Tank V", "Tank K", "Tank L", "Tank T", "Tank I", "Tank P", "Tank UC"],
};

/** A button that opens the device camera straight away (a label around a capture input). */
export function CameraButton({ onFile, children, style, multiple = false }: {
  onFile: (files: File[]) => void; children: React.ReactNode; style?: React.CSSProperties; multiple?: boolean;
}) {
  return (
    <label style={{ cursor: "pointer", ...style }}>
      {children}
      <input type="file" accept="image/*" capture="environment" multiple={multiple} style={{ display: "none" }}
        onChange={(e) => { const f = Array.from(e.target.files ?? []); if (f.length) onFile(f); e.target.value = ""; }} />
    </label>
  );
}

// ─── Date picker ─────────────────────────────────────────────────────────────

function DatePickerSheet({ open, onClose, initial, onPick }: { open: boolean; onClose: () => void; initial: string | null; onPick: (iso: string | null) => void }) {
  const today = isoFromDate(new Date());
  const start = initial ?? addMonthsIso(today, 12);
  const [sel, setSel] = useState<string | null>(initial);
  const [view, setView] = useState<{ y: number; m: number }>(() => { const [y, m] = start.split("-").map(Number); return { y, m: m - 1 }; });
  useEffect(() => {
    if (!open) return;
    setSel(initial);
    const [y, m] = (initial ?? addMonthsIso(isoFromDate(new Date()), 12)).split("-").map(Number);
    setView({ y, m: m - 1 });
  }, [open, initial]);
  if (!open) return null;

  const grid = monthGrid(view.y, view.m);
  const step = (n: number) => setView((v) => { const t = v.y * 12 + v.m + n; return { y: Math.floor(t / 12), m: t % 12 }; });
  const jump = (months: number) => { const iso = addMonthsIso(today, months); setSel(iso); const [y, m] = iso.split("-").map(Number); setView({ y, m: m - 1 }); };
  const monthName = new Date(view.y, view.m, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const nav: React.CSSProperties = { background: "none", border: "1px solid rgba(255,255,255,0.18)", color: "#fff", width: 40, height: 40, fontSize: 18, cursor: "pointer", borderRadius: 2 };

  return (
    <FullscreenModal open onClose={onClose} title="Expiration date" footer={null}>
      <div style={{ textAlign: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: MUTED }}>Expires</div>
        <div style={{ fontSize: 24, fontWeight: 900, marginTop: 4 }}>{sel ? formatLong(sel) : "Pick a date"}</div>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", marginBottom: 14 }}>
        {[{ l: "6 months", m: 6 }, { l: "1 year", m: 12 }, { l: "2 years", m: 24 }, { l: "3 years", m: 36 }, { l: "5 years", m: 60 }].map((c) => (
          <button key={c.m} type="button" onClick={() => jump(c.m)}
            style={{ padding: "8px 12px", border: "1px solid rgba(255,255,255,0.25)", background: "transparent", color: "#fff", fontWeight: 800, fontSize: 12, cursor: "pointer", borderRadius: 2 }}>
            {c.l}
          </button>
        ))}
      </div>
      <div style={{ border: "1px solid rgba(255,255,255,0.14)", padding: 12, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" aria-label="Previous year" onClick={() => step(-12)} style={nav}>«</button>
            <button type="button" aria-label="Previous month" onClick={() => step(-1)} style={nav}>‹</button>
          </div>
          <div style={{ fontWeight: 900, fontSize: 16 }}>{monthName}</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" aria-label="Next month" onClick={() => step(1)} style={nav}>›</button>
            <button type="button" aria-label="Next year" onClick={() => step(12)} style={nav}>»</button>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, textAlign: "center", fontSize: 11, color: MUTED, marginBottom: 4 }}>
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <div key={i}>{d}</div>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
          {grid.flat().map((c) => {
            const on = c.iso === sel;
            return (
              <button key={c.iso} type="button" onClick={() => setSel(c.iso)}
                style={{
                  aspectRatio: "1", border: c.iso === today ? "1px solid rgba(255,255,255,0.5)" : "1px solid transparent", borderRadius: 2, cursor: "pointer", fontSize: 14, fontWeight: 700,
                  background: on ? "#fff" : "transparent", color: on ? "#000" : c.inMonth ? "#fff" : "rgba(255,255,255,0.25)",
                }}>
                {c.day}
              </button>
            );
          })}
        </div>
      </div>
      <button type="button" disabled={!sel} onClick={() => onPick(sel)} style={{ ...PRIMARY_BTN, opacity: sel ? 1 : 0.4 }}>Set date</button>
      <button type="button" onClick={() => onPick(null)} style={{ ...SECONDARY_BTN, marginTop: 10 }}>No expiration date</button>
    </FullscreenModal>
  );
}

// ─── Terminal search ─────────────────────────────────────────────────────────

function TerminalSearchSheet({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (t: { id: string; name: string }) => void }) {
  const { data: catalog } = useTerminalsCatalog();
  const [q, setQ] = useState("");
  useEffect(() => { if (open) setQ(""); }, [open]);
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    return catalog.filter((t) => `${t.terminal_name ?? ""} ${t.city ?? ""} ${t.state ?? ""}`.toLowerCase().includes(s)).slice(0, 40);
  }, [catalog, q]);
  if (!open) return null;
  return (
    <FullscreenModal open onClose={onClose} title="Terminal certification" footer={null}>
      <div style={{ fontSize: 13, color: MUTED, marginBottom: 10, lineHeight: 1.5 }}>
        Which terminal is this certification for? Dispatch checks it on the trailer before sending a driver there.
      </div>
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Terminal or city" style={{ ...input, marginBottom: 12 }} />
      {q.trim().length >= 2 && hits.length === 0 && <div style={{ fontSize: 13, color: MUTED }}>No terminal matches.</div>}
      {hits.map((t) => (
        <button key={String(t.terminal_id)} type="button" style={row} onClick={() => onPick({ id: String(t.terminal_id), name: String(t.terminal_name ?? "Terminal") })}>
          {t.terminal_name}
          <div style={{ fontSize: 12, fontWeight: 600, color: MUTED, marginTop: 2 }}>{[t.city, t.state].filter(Boolean).join(", ")}</div>
        </button>
      ))}
    </FullscreenModal>
  );
}

// ─── The flow ────────────────────────────────────────────────────────────────

type Label = { permitTypeId: string | null; name: string; create?: { name: string; appliesTo: PermitType["applies_to"]; terminalId?: string | null } };

export function AddDocumentSheet({ open, onClose, companyId, unitKind, unitId, unitName, initialFiles, onSaved }: {
  open: boolean; onClose: () => void; companyId: string; unitKind: UnitKind; unitId: string; unitName: string;
  initialFiles: File[]; onSaved: () => void;
}) {
  const [pages, setPages] = useState<File[]>(initialFiles);
  const [step, setStep] = useState<"label" | "date">("label");
  const [types, setTypes] = useState<PermitType[]>([]);
  const [label, setLabel] = useState<Label | null>(null);
  const [custom, setCustom] = useState("");
  const [customOpen, setCustomOpen] = useState(false);
  const [termOpen, setTermOpen] = useState(false);
  const [date, setDate] = useState<string | null>(null);
  const [pickOpen, setPickOpen] = useState(false);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const seeded = useRef<File[] | null>(null);

  useEffect(() => {
    if (!open) { seeded.current = null; return; }
    if (seeded.current === initialFiles) return;
    seeded.current = initialFiles;
    setPages(initialFiles); setStep("label"); setLabel(null); setCustom(""); setCustomOpen(false);
    setDate(null); setAck(false); setErr(null); setBusy(false);
    void (async () => {
      const { data } = await supabase.from("permit_types").select("permit_type_id, name, applies_to, is_active, terminal_id").eq("company_id", companyId).eq("is_active", true).order("name");
      setTypes((data ?? []) as PermitType[]);
    })();
  }, [open, initialFiles, companyId]);

  const urls = useMemo(() => pages.map((f) => URL.createObjectURL(f)), [pages]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);

  const mine = types.filter((t) => (t.applies_to === unitKind || t.applies_to === "both") && !t.terminal_id);
  const existingNames = new Set(types.map((t) => t.name.trim().toLowerCase()));
  const common = COMMON_DOCS[unitKind].filter((n) => !existingNames.has(n.toLowerCase()));

  async function resolveTerminal(t: { id: string; name: string }) {
    setTermOpen(false);
    const found = types.find((x) => x.terminal_id === t.id && (x.applies_to === "trailer" || x.applies_to === "both"));
    setLabel(found
      ? { permitTypeId: found.permit_type_id, name: found.name }
      : { permitTypeId: null, name: `${t.name} certification`, create: { name: `${t.name} certification`, appliesTo: "trailer", terminalId: t.id } });
    setStep("date");
  }

  async function save() {
    if (!label) return;
    setBusy(true); setErr(null);
    const uploaded: string[] = [];
    try {
      let typeId = label.permitTypeId;
      if (!typeId && label.create) {
        const { data, error } = await supabase.from("permit_types")
          .insert({ company_id: companyId, name: label.create.name, applies_to: label.create.appliesTo, terminal_id: label.create.terminalId ?? null })
          .select("permit_type_id").single();
        if (error) throw error;
        typeId = (data as { permit_type_id: string }).permit_type_id;
      }
      if (!typeId) throw new Error("Pick what this document is first.");
      const col = unitKind === "truck" ? "truck_id" : "trailer_id";
      const { data: user } = await supabase.auth.getUser();
      const { data: existing } = await supabase.from("equipment_attachments").select("page_order")
        .eq("company_id", companyId).eq("equipment_type", unitKind).eq("equipment_id", unitId).eq("permit_type_id", typeId);
      let order = ((existing ?? []) as { page_order: number }[]).reduce((m, r) => Math.max(m, Number(r.page_order) + 1), 0);
      for (const file of pages) {
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
        const newId = crypto.randomUUID();
        const path = `${companyId}/${unitKind}/${unitId}/permit_${typeId}/${newId}.${ext}`;
        const up = await supabase.storage.from("equipment-docs").upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
        if (up.error) throw up.error;
        uploaded.push(path);
        const ins = await supabase.from("equipment_attachments").insert({
          id: newId, company_id: companyId, equipment_type: unitKind, equipment_id: unitId,
          category: typeId, category_label: label.name, permit_type_id: typeId,
          file_path: path, original_name: file.name || `${label.name}.${ext}`, mime_type: file.type || "image/jpeg", page_order: order++,
          uploaded_by: user.user?.id ?? null,
        });
        if (ins.error) throw ins.error;
      }
      // The date goes on the unit's record for this document type.
      const { data: rec } = await supabase.from("equipment_permits").select("equipment_permit_id").eq(col, unitId).eq("permit_type_id", typeId).maybeSingle();
      if (rec) {
        if (date) {
          const u = await supabase.from("equipment_permits").update({ expiration_date: date }).eq("equipment_permit_id", (rec as { equipment_permit_id: string }).equipment_permit_id);
          if (u.error) throw u.error;
        }
      } else {
        const i = await supabase.from("equipment_permits").insert({
          company_id: companyId, permit_type_id: typeId, expiration_date: date, enforcement_date: null,
          truck_id: unitKind === "truck" ? unitId : null, trailer_id: unitKind === "trailer" ? unitId : null,
        });
        if (i.error) throw i.error;
      }
      onSaved();
      onClose();
    } catch (e: any) {
      for (const p of uploaded) await supabase.storage.from("equipment-docs").remove([p]);
      setErr(e?.message ?? "Couldn't save the document.");
    } finally { setBusy(false); }
  }

  if (!open) return null;
  const canSave = !!label && (!!date || ack);

  return (
    <>
      <FullscreenModal open onClose={onClose} title={`New document · ${unitName}`} footer={null}>
        {err && <div style={{ color: "#fca5a5", fontSize: 13, marginBottom: 10 }}>{err}</div>}

        <div style={{ display: "flex", gap: 8, overflowX: "auto", marginBottom: 6 }}>
          {urls.map((u, i) => (
            <div key={u} style={{ position: "relative", flex: "0 0 auto" }}>
              <img src={u} alt={`Page ${i + 1}`} style={{ height: 120, width: "auto", border: "1px solid rgba(255,255,255,0.2)", display: "block" }} />
              {pages.length > 1 && (
                <button type="button" aria-label="Remove page" onClick={() => setPages((p) => p.filter((_, j) => j !== i))}
                  style={{ position: "absolute", top: 4, right: 4, width: 24, height: 24, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.75)", color: "#fff", cursor: "pointer" }}>✕</button>
              )}
            </div>
          ))}
          <CameraButton onFile={(f) => setPages((p) => [...p, ...f])}
            style={{ flex: "0 0 auto", width: 90, height: 120, border: "1px dashed rgba(255,255,255,0.3)", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontSize: 12, fontWeight: 800, color: MUTED }}>
            + Page
          </CameraButton>
        </div>
        <div style={{ fontSize: 12, color: MUTED, marginBottom: 14 }}>{pages.length} {pages.length === 1 ? "page" : "pages"}. Add more for the back or extra sheets.</div>

        {step === "label" ? (
          <>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: MUTED, marginBottom: 8 }}>What is it?</div>
            {unitKind === "trailer" && (
              <button type="button" style={{ ...row, borderColor: "rgba(255,255,255,0.5)" }} onClick={() => setTermOpen(true)}>Terminal certification ›</button>
            )}
            {mine.map((t) => (
              <button key={t.permit_type_id} type="button" style={row} onClick={() => { setLabel({ permitTypeId: t.permit_type_id, name: t.name }); setStep("date"); }}>{t.name}</button>
            ))}
            {common.map((n) => (
              <button key={n} type="button" style={row} onClick={() => { setLabel({ permitTypeId: null, name: n, create: { name: n, appliesTo: unitKind } }); setStep("date"); }}>{n}</button>
            ))}
            {customOpen ? (
              <div style={{ display: "flex", gap: 8 }}>
                <input autoFocus value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Name this document" style={{ ...input, flex: 1 }} />
                <button type="button" disabled={!custom.trim()} style={{ ...PRIMARY_BTN, width: "auto", padding: "0 18px", opacity: custom.trim() ? 1 : 0.4 }}
                  onClick={() => { const n = custom.trim(); setLabel({ permitTypeId: null, name: n, create: { name: n, appliesTo: unitKind } }); setStep("date"); }}>Next</button>
              </div>
            ) : (
              <button type="button" style={{ ...row, border: "1px dashed rgba(255,255,255,0.25)", background: "transparent", color: MUTED }} onClick={() => setCustomOpen(true)}>+ Something else</button>
            )}
          </>
        ) : (
          <>
            <div style={{ border: "1px solid rgba(255,255,255,0.14)", padding: 14, marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: MUTED }}>Document</div>
              <div style={{ fontSize: 18, fontWeight: 900, marginTop: 4 }}>{label?.name}</div>
              <button type="button" onClick={() => { setStep("label"); setLabel(null); }} style={{ background: "none", border: "none", padding: "6px 0 0", color: "#93c5fd", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>Change</button>
            </div>
            <button type="button" onClick={() => setPickOpen(true)} style={{ ...row, textAlign: "center", fontSize: 17 }}>
              {date ? `Expires ${formatLong(date)}` : "Set expiration date"}
            </button>
            {!date && (
              <label style={{ display: "flex", gap: 10, alignItems: "flex-start", border: "1px solid rgba(251,146,60,0.6)", background: "rgba(251,146,60,0.08)", padding: 12, margin: "4px 0 14px", cursor: "pointer" }}>
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} style={{ marginTop: 3, width: 18, height: 18 }} />
                <span style={{ fontSize: 13, lineHeight: 1.5 }}>
                  <b>No expiration date set.</b> The date is how ProTankr tracks this document and warns you and dispatch before it expires. Without one, it won't be tracked and no reminders will be sent. I understand and want to save it without a date.
                </span>
              </label>
            )}
            <button type="button" disabled={!canSave || busy} aria-busy={busy} onClick={() => void save()} style={{ ...PRIMARY_BTN, opacity: canSave ? 1 : 0.4 }}>
              {busy ? "Saving…" : "Save to file"}
            </button>
          </>
        )}
        <button type="button" onClick={onClose} style={{ ...SECONDARY_BTN, marginTop: 10 }}>Cancel</button>
      </FullscreenModal>

      <TerminalSearchSheet open={termOpen} onClose={() => setTermOpen(false)} onPick={(t) => void resolveTerminal(t)} />
      <DatePickerSheet open={pickOpen} onClose={() => setPickOpen(false)} initial={date} onPick={(iso) => { setDate(iso); setPickOpen(false); if (iso) setAck(false); }} />
    </>
  );
}
