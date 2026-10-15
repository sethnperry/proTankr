"use client";
// app/admin/FuelSettingsModal.tsx
//
// Company Dashboard → Fuel. Admin only. Sets what drivers see at the fuel
// island: payment methods in order (RFID program, company account, fuel
// cards), each with numbered pump steps and an optional image/PDF guide, plus
// a company-wide guide (SOP, reminders), the receipt-photo rule and DEF.
// Card numbers and PINs are never stored: a label and last 4 only.

import React, { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { useFuelSetup, openGuide } from "@/lib/fuel/useFuelSetup";
import { GUIDE_BUCKET, KIND_LABEL, guidePath, type FuelMethod, type MethodKind } from "@/lib/fuel/types";

const muted = "rgba(255,255,255,0.5)";
const card: React.CSSProperties = { borderRadius: 12, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)", padding: 14, marginBottom: 14 };
const title: React.CSSProperties = { fontSize: 13, fontWeight: 800, marginBottom: 10, color: "#fff" };
const input: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)",
  background: "rgba(255,255,255,0.06)", color: "#fff", fontSize: 16, boxSizing: "border-box",
};
const btn: React.CSSProperties = {
  padding: "11px 14px", borderRadius: 10, border: "none", background: "#fff", color: "#000", fontWeight: 800, fontSize: 14, cursor: "pointer",
};
const link: React.CSSProperties = { border: "none", background: "transparent", color: "rgba(255,255,255,0.75)", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0 };

type Draft = {
  id: string | null;
  kind: MethodKind;
  name: string;
  account_number: string;
  card_last4: string;
  steps: string[];
  guide_path: string | null;
  guide_name: string | null;
  guide_mime: string | null;
  is_active: boolean;
};

const NEW_DRAFT = (kind: MethodKind): Draft => ({
  id: null, kind,
  name: kind === "rfid" ? "Love's QuickQ" : kind === "company_account" ? "Company account" : "Fuel card",
  account_number: "", card_last4: "",
  steps: kind === "rfid"
    ? ["Pull up to the pump, the RFID tag reads automatically", "Enter employee ID", "Enter truck number", "Enter PIN", "Enter odometer"]
    : kind === "company_account"
    ? ["Choose company account at the pump (or show this screen to the cashier)", "Enter account number", "Enter employee ID", "Enter truck number", "Enter PIN", "Enter odometer"]
    : ["Insert card", "Enter PIN", "Enter driver ID", "Enter truck number", "Enter odometer"],
  guide_path: null, guide_name: null, guide_mime: null, is_active: true,
});

async function uploadGuide(companyId: string, file: File) {
  const path = guidePath(companyId, file.name);
  const { error } = await supabase.storage.from(GUIDE_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return { guide_path: path, guide_name: file.name, guide_mime: file.type || null };
}

function GuideField({ name, path, onPick, onRemove, busy }: {
  name: string | null; path: string | null; onPick: (f: File) => void; onRemove: () => void; busy: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      {path ? (
        <>
          <button type="button" style={link} onClick={() => void openGuide(path).catch(() => {})}>📄 {name ?? "Guide"}</button>
          <button type="button" style={{ ...link, color: "#f87171" }} onClick={onRemove}>Remove</button>
        </>
      ) : (
        <label style={{ ...link, cursor: busy ? "default" : "pointer" }}>
          {busy ? "Uploading…" : "+ Upload image or PDF"}
          <input type="file" accept="image/*,application/pdf" hidden disabled={busy}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onPick(f); }} />
        </label>
      )}
    </div>
  );
}

export default function FuelSettingsModal({ open, onClose, companyId }: { open: boolean; onClose: () => void; companyId: string }) {
  const { settings, methods, reload } = useFuelSetup(open ? companyId : null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const saveSettings = async (patch: Record<string, unknown>) => {
    setBusy(true); setMsg(null);
    const { error } = await supabase.from("fuel_settings").upsert({ company_id: companyId, ...settings, ...patch, updated_at: new Date().toISOString() });
    setBusy(false);
    if (error) setMsg(error.message); else void reload();
  };

  const move = async (m: FuelMethod, dir: -1 | 1) => {
    const list = [...methods];
    const i = list.findIndex((x) => x.id === m.id);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    setBusy(true);
    await Promise.all(list.map((x, k) => supabase.from("fuel_payment_methods").update({ sort: k }).eq("id", x.id)));
    setBusy(false);
    void reload();
  };

  const saveDraft = async () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) { setMsg("Give it a name."); return; }
    const last4 = draft.card_last4.replace(/\D/g, "").slice(-4);
    const row = {
      company_id: companyId,
      kind: draft.kind,
      name,
      account_number: draft.kind === "company_account" ? draft.account_number.trim() || null : null,
      card_last4: draft.kind === "fuel_card" ? last4 || null : null,
      steps: draft.steps.map((s) => s.trim()).filter(Boolean),
      guide_path: draft.guide_path, guide_name: draft.guide_name, guide_mime: draft.guide_mime,
      is_active: true,
      updated_at: new Date().toISOString(),
    };
    setBusy(true); setMsg(null);
    const res = draft.id
      ? await supabase.from("fuel_payment_methods").update(row).eq("id", draft.id)
      : await supabase.from("fuel_payment_methods").insert({ ...row, sort: methods.length });
    setBusy(false);
    if (res.error) { setMsg(res.error.message); return; }
    setDraft(null);
    void reload();
  };

  const deleteDraft = async () => {
    if (!draft?.id) return;
    setConfirmDelete(false);
    setBusy(true);
    const { error } = await supabase.from("fuel_payment_methods").delete().eq("id", draft.id);
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    setDraft(null);
    void reload();
  };

  const pickGuide = async (f: File, target: "company" | "draft") => {
    setBusy(true); setMsg(null);
    try {
      const g = await uploadGuide(companyId, f);
      if (target === "company") await saveSettings(g);
      else setDraft((d) => (d ? { ...d, ...g } : d));
    } catch (e: any) {
      setMsg(e?.message ?? "Upload failed");
    }
    setBusy(false);
  };

  // ── Method editor ──────────────────────────────────────────────────────────
  if (draft) {
    const set = (p: Partial<Draft>) => setDraft({ ...draft, ...p });
    return (
      <FullscreenModal open={open} title={draft.id ? "Edit Payment Method" : "New Payment Method"} onClose={() => { setConfirmDelete(false); setDraft(null); }} footer={null}>
        {msg && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 10 }}>{msg}</div>}
        <div style={card}>
          <div style={title}>Type</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(["rfid", "company_account", "fuel_card"] as MethodKind[]).map((k) => (
              <button key={k} type="button" onClick={() => set(draft.id ? { kind: k } : NEW_DRAFT(k))}
                style={{ ...btn, padding: "8px 12px", background: draft.kind === k ? "#fff" : "rgba(255,255,255,0.08)", color: draft.kind === k ? "#000" : "#fff" }}>
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 13, color: muted, margin: "14px 0 6px" }}>Name drivers see</div>
          <input style={input} value={draft.name} onChange={(e) => set({ name: e.target.value })} />
          {draft.kind === "company_account" && (
            <>
              <div style={{ fontSize: 13, color: muted, margin: "14px 0 6px" }}>Account number (shown to the driver and the cashier)</div>
              <input style={input} value={draft.account_number} onChange={(e) => set({ account_number: e.target.value })} />
            </>
          )}
          {draft.kind === "fuel_card" && (
            <>
              <div style={{ fontSize: 13, color: muted, margin: "14px 0 6px" }}>Last 4 digits (optional; never the full number)</div>
              <input style={input} inputMode="numeric" maxLength={4} value={draft.card_last4} onChange={(e) => set({ card_last4: e.target.value.replace(/\D/g, "") })} />
            </>
          )}
        </div>

        <div style={card}>
          <div style={title}>Pump steps</div>
          <div style={{ fontSize: 12, color: muted, marginBottom: 10 }}>Shown to the driver as a numbered list, with their driver ID and truck number.</div>
          {draft.steps.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ width: 22, textAlign: "right", color: muted, fontWeight: 800 }}>{i + 1}.</span>
              <input style={{ ...input, flex: 1 }} value={s} onChange={(e) => set({ steps: draft.steps.map((x, k) => (k === i ? e.target.value : x)) })} />
              <button type="button" style={link} disabled={i === 0} onClick={() => { const a = [...draft.steps]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; set({ steps: a }); }}>↑</button>
              <button type="button" style={{ ...link, color: "#f87171" }} onClick={() => set({ steps: draft.steps.filter((_, k) => k !== i) })}>✕</button>
            </div>
          ))}
          <button type="button" style={link} onClick={() => set({ steps: [...draft.steps, ""] })}>+ Add step</button>
        </div>

        <div style={card}>
          <div style={title}>Detailed guide</div>
          <div style={{ fontSize: 12, color: muted, marginBottom: 10 }}>Optional picture or PDF the driver can open from the pump screen.</div>
          <GuideField name={draft.guide_name} path={draft.guide_path} busy={busy}
            onPick={(f) => void pickGuide(f, "draft")}
            onRemove={() => set({ guide_path: null, guide_name: null, guide_mime: null })} />
        </div>

        <button type="button" style={{ ...btn, width: "100%", opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => void saveDraft()}>
          {busy ? "Saving…" : "Save"}
        </button>
        {draft.id && (confirmDelete ? (
          <div style={{ ...card, marginTop: 16, borderColor: "rgba(248,113,113,0.45)" }}>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>Delete {draft.name}?</div>
            <div style={{ fontSize: 12, color: muted, marginBottom: 12 }}>Drivers won&apos;t see it anymore. Past fuel stops keep their record.</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button type="button" style={{ ...btn, background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,0.3)" }} onClick={() => setConfirmDelete(false)}>Keep</button>
              <button type="button" style={{ ...btn, background: "#f87171" }} disabled={busy} onClick={() => void deleteDraft()}>Delete</button>
            </div>
          </div>
        ) : (
          <button type="button" style={{ ...link, color: "#f87171", display: "block", margin: "16px auto 0" }} onClick={() => setConfirmDelete(true)}>
            Delete this method
          </button>
        ))}
      </FullscreenModal>
    );
  }

  // ── Overview ───────────────────────────────────────────────────────────────
  return (
    <FullscreenModal open={open} title="Fuel" onClose={onClose} footer={null}>
      {msg && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 10 }}>{msg}</div>}

      <div style={card}>
        <div style={title}>Payment methods</div>
        <div style={{ fontSize: 12, color: muted, marginBottom: 10 }}>
          Shown to drivers in this order at the fuel island. My card and Cash are always offered after these.
        </div>
        {methods.length === 0 && <div style={{ fontSize: 14, color: muted, marginBottom: 10 }}>None yet.</div>}
        {methods.map((m, i) => (
          <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: i ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
            <button type="button" onClick={() => setDraft({ ...m, account_number: m.account_number ?? "", card_last4: m.card_last4 ?? "", steps: m.steps ?? [] })}
              style={{ flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, opacity: m.is_active ? 1 : 0.45 }}>
                {m.name}{m.card_last4 ? ` ••${m.card_last4}` : ""}
              </div>
              <div style={{ fontSize: 12, color: muted }}>
                {KIND_LABEL[m.kind]} · {m.steps.length} step{m.steps.length === 1 ? "" : "s"}{m.guide_path ? " · guide" : ""}{m.is_active ? "" : " · hidden"}
              </div>
            </button>
            <button type="button" style={link} disabled={busy || i === 0} onClick={() => void move(m, -1)}>↑</button>
            <button type="button" style={link} disabled={busy || i === methods.length - 1} onClick={() => void move(m, 1)}>↓</button>
          </div>
        ))}
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 10 }}>
          <button type="button" style={link} onClick={() => setDraft(NEW_DRAFT("rfid"))}>+ RFID</button>
          <button type="button" style={link} onClick={() => setDraft(NEW_DRAFT("company_account"))}>+ Company account</button>
          <button type="button" style={link} onClick={() => setDraft(NEW_DRAFT("fuel_card"))}>+ Fuel card</button>
        </div>
      </div>

      <div style={card}>
        <div style={title}>Company guide</div>
        <div style={{ fontSize: 12, color: muted, marginBottom: 10 }}>SOP or reminders (receipts, DEF, where to fuel). Drivers can open it from the fuel screen.</div>
        <GuideField name={settings?.guide_name ?? null} path={settings?.guide_path ?? null} busy={busy}
          onPick={(f) => void pickGuide(f, "company")}
          onRemove={() => void saveSettings({ guide_path: null, guide_name: null, guide_mime: null })} />
      </div>

      <div style={card}>
        <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, cursor: "pointer" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Receipt photo required</div>
            <div style={{ fontSize: 12, color: muted }}>For fuel cards and out-of-pocket. RFID and company account stops only ask for the odometer.</div>
          </div>
          <input type="checkbox" checked={!!settings?.require_receipt} disabled={busy}
            onChange={(e) => void saveSettings({ require_receipt: e.target.checked })} style={{ width: 22, height: 22 }} />
        </label>
      </div>
    </FullscreenModal>
  );
}
