// lib/ui/driver/editors.tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { T, css, fmtDate, expiryColor, expiryLabel } from "./tokens";
import { Banner, SubSectionTitle } from "./primitives";
import type { PortId, TerminalAccess } from "./types";

// ─── Port ID Editor ───────────────────────────────────────────

export function PortIdEditor({ portIds, onChange }: {
  portIds: PortId[];
  onChange: (p: PortId[]) => void;
}) {
  function update(i: number, field: keyof PortId, val: string) {
    onChange(portIds.map((p, idx) => idx === i ? { ...p, [field]: val } : p));
  }
  function add() { onChange([...portIds, { port_name: "", expiration_date: "" }]); }
  function remove(i: number) { onChange(portIds.filter((_, idx) => idx !== i)); }

  return (
    <div style={{ marginBottom: 8 }}>
      {portIds.length === 0 && (
        <div style={{ fontSize: 12, color: T.muted, marginBottom: 8 }}>No port IDs on file.</div>
      )}
      {portIds.map((p, i) => {
        const days = daysUntilLocal(p.expiration_date || null);
        const color = expiryColor(days);
        return (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 8, flexWrap: "wrap" as const }}>
            <div style={{ flex: 1, minWidth: 130 }}>
              {i === 0 && <label style={css.label}>Port Name</label>}
              <input value={p.port_name} onChange={e => update(i, "port_name", e.target.value)}
                style={css.input} placeholder="e.g. Port of Tampa" />
            </div>
            <div style={{ flex: 1, minWidth: 130 }}>
              {i === 0 && <label style={css.label}>Expiration Date</label>}
              <input type="date" value={p.expiration_date} onChange={e => update(i, "expiration_date", e.target.value)}
                style={{ ...css.input, color: p.expiration_date ? color : undefined }} />
            </div>
            <button type="button" onClick={() => remove(i)} title="Remove"
              style={{ width: 28, height: 28, borderRadius: "50%", border: `1px solid ${T.danger}55`, background: `${T.danger}15`, color: T.danger, fontSize: 16, lineHeight: 1, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 1 }}>
              −
            </button>
          </div>
        );
      })}
      <button type="button" onClick={add}
        style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: T.info, fontSize: 12, fontWeight: 600, padding: "2px 0" }}>
        <span style={{ width: 22, height: 22, borderRadius: "50%", border: `1px solid ${T.info}55`, background: `${T.info}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, lineHeight: 1 }}>+</span>
        Add Port ID
      </button>
    </div>
  );
}

// ─── Terminal Access Editor ───────────────────────────────────

type AllTerminal = { terminal_id: string; terminal_name: string; city: string | null; state: string | null };

export function TerminalAccessEditor({ userId, companyId, existing, onReload }: {
  userId: string;
  companyId: string;
  existing: TerminalAccess[];
  onReload: () => void;
}) {
  const [allTerminals,  setAllTerminals]  = useState<AllTerminal[]>([]);
  const [addTerminalId, setAddTerminalId] = useState("");
  const [addCardedOn,   setAddCardedOn]   = useState(new Date().toISOString().split("T")[0]);
  const [saving,        setSaving]        = useState(false);
  const [err,           setErr]           = useState<string | null>(null);

  useEffect(() => {
    supabase.from("terminals").select("terminal_id, terminal_name, city, state")
      .eq("active", true).order("terminal_name")
      .then(({ data }) => {
        setAllTerminals((data ?? []) as AllTerminal[]);
        const first = (data ?? [])[0] as any;
        if (first && !addTerminalId) setAddTerminalId(first.terminal_id);
      });
  }, []);

  const existingIds = new Set(existing.map(t => t.terminal_id));
  const available   = allTerminals.filter(t => !existingIds.has(t.terminal_id));

  async function addAccess() {
    if (!addTerminalId) return;
    setSaving(true); setErr(null);
    const { error } = await supabase.rpc("admin_get_carded", {
      p_user_id: userId, p_terminal_id: addTerminalId,
      p_carded_on: addCardedOn, p_company_id: companyId,
    });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onReload();
    const next = available.find(t => t.terminal_id !== addTerminalId);
    if (next) setAddTerminalId(next.terminal_id);
  }

  async function removeAccess(terminalId: string) {
    setSaving(true); setErr(null);
    const { error } = await supabase.rpc("admin_remove_terminal_access", {
      p_user_id: userId, p_terminal_id: terminalId, p_company_id: companyId,
    });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onReload();
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <SubSectionTitle>Terminal Access ({existing.length})</SubSectionTitle>
      {err && <Banner msg={err} type="error" />}

      {existing.length === 0 ? (
        <div style={{ fontSize: 12, color: T.muted, marginBottom: 12 }}>No terminal cards on file.</div>
      ) : (
        <div style={{ marginBottom: 14 }}>
          {existing.map(t => {
            const color = expiryColor(t.days_until_expiry);
            return (
              <div key={t.terminal_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${T.border}`, gap: 8 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{t.terminal_name}</div>
                  <div style={{ fontSize: 11, color: T.muted }}>{[t.city, t.state].filter(Boolean).join(", ")}</div>
                </div>
                <div style={{ textAlign: "right" as const, flexShrink: 0 }}>
                  <div style={{ fontSize: 12, color }}>{t.is_expired ? "EXPIRED" : expiryLabel(t.days_until_expiry)}</div>
                  <div style={{ fontSize: 11, color: T.muted }}>Carded {fmtDate(t.carded_on)}</div>
                </div>
                <button onClick={() => removeAccess(t.terminal_id)} disabled={saving}
                  style={{ ...css.btn("ghost"), padding: "4px 8px", color: T.danger, borderColor: `${T.danger}33`, fontSize: 11, flexShrink: 0 }}>
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      )}

      {available.length > 0 && (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" as const }}>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label style={css.label}>Add Terminal</label>
            <select value={addTerminalId} onChange={e => setAddTerminalId(e.target.value)}
              style={{ ...css.select, width: "100%" }}>
              {available.map(t => (
                <option key={t.terminal_id} value={t.terminal_id}>
                  {t.terminal_name}{t.city ? ` — ${t.city}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div style={{ width: 140 }}>
            <label style={css.label}>Carded On</label>
            <input type="date" value={addCardedOn} onChange={e => setAddCardedOn(e.target.value)} style={css.input} />
          </div>
          <button onClick={addAccess} disabled={saving || !addTerminalId}
            style={{ ...css.btn("primary"), marginBottom: 1 }}>
            {saving ? "Adding…" : "Add"}
          </button>
        </div>
      )}
    </div>
  );
}

// local helper — avoids circular import with tokens
function daysUntilLocal(dateStr: string | null): number | null {
  if (!dateStr) return null;
  try {
    const exp = new Date(dateStr + "T00:00:00");
    const now = new Date(); now.setHours(0, 0, 0, 0);
    return Math.floor((exp.getTime() - now.getTime()) / 86400000);
  } catch { return null; }
}
