"use client";
// app/planner/modals/editTerminal/RacksView.tsx
//
// Part of EditTerminalModal.tsx.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { TerminalRack } from "../rackProductTypes";



export function RacksView({
  terminalName, racks, loading, error, newRackName, setNewRackName, onAddRack, saving,
  onEditProducts, onRenamed, onDeleteRack,
  renewalDays, onSaveRenewalDays, gauging, onSaveGauging,
}: {
  terminalName?: string;
  racks: TerminalRack[];
  loading: boolean;
  error: string | null;
  newRackName: string;
  setNewRackName: (v: string) => void;
  onAddRack: () => void;
  saving: boolean;
  onEditProducts: (rackId: string) => void;
  onRenamed: () => void;
  onDeleteRack: (rackId: string) => void;
  renewalDays: number | null;
  onSaveRenewalDays: (days: number) => void;
  gauging: { cutoff: string | null; minutes: number | null };
  onSaveGauging: (next: { cutoff: string | null; minutes: number | null }) => void;
}) {
  const [gMinDraft, setGMinDraft] = useState(gauging.minutes == null ? "" : String(gauging.minutes));
  useEffect(() => { setGMinDraft(gauging.minutes == null ? "" : String(gauging.minutes)); }, [gauging.minutes]);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [renewalDraft, setRenewalDraft] = useState(String(renewalDays ?? 90));
  useEffect(() => { setRenewalDraft(String(renewalDays ?? 90)); }, [renewalDays]);

  async function saveRename(rackId: string) {
    const name = renameValue.trim();
    if (!name) { setRenamingId(null); return; }
    await supabase.from("terminal_racks").update({ rack_name: name }).eq("rack_id", rackId);
    setRenamingId(null);
    onRenamed();
  }

  function commitRenewalDays() {
    const n = parseInt(renewalDraft, 10);
    if (Number.isFinite(n) && n > 0) onSaveRenewalDays(n);
    else setRenewalDraft(String(renewalDays ?? 90));
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
        Racks{terminalName ? <> at <span style={{ color: "rgba(255,255,255,0.75)", fontWeight: 700 }}>{terminalName}</span></> : ""}. Hidden from drivers — lead/dispatch/admin only.
      </div>

      <div style={{ borderRadius: 2, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)", padding: 12, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>Access Renewal Period</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
            Days after a driver's last visit before their card here needs renewal — drives the expiration warnings for every driver's card at this terminal.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <input
            type="text" inputMode="numeric" value={renewalDraft}
            onChange={(e) => setRenewalDraft(e.target.value.replace(/[^0-9]/g, ""))}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={commitRenewalDays}
            style={{
              width: 52, padding: "6px 4px", borderRadius: 2, textAlign: "center" as const,
              border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.05)", color: "#fff",
              fontSize: 14, fontWeight: 800, boxSizing: "border-box" as const,
            }}
          />
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>days</span>
        </div>
      </div>

      <div style={{ borderRadius: 2, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)", padding: 12, display: "grid", gap: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>Gauging</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
            When this terminal shuts down to gauge (terminal time) and for how long. Dispatch uses it to flag late arrivals. Blank = company default.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <input
            type="time" value={gauging.cutoff ?? ""}
            onChange={(e) => onSaveGauging({ cutoff: e.target.value || null, minutes: gauging.minutes })}
            style={{ padding: "6px 6px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.05)", color: "#fff", fontSize: 14, colorScheme: "dark" }}
          />
          <input
            type="text" inputMode="numeric" placeholder="min" value={gMinDraft}
            onChange={(e) => setGMinDraft(e.target.value.replace(/[^0-9]/g, ""))}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={() => {
              const n = gMinDraft === "" ? null : Math.min(720, parseInt(gMinDraft, 10));
              onSaveGauging({ cutoff: gauging.cutoff, minutes: n });
            }}
            style={{ width: 56, padding: "6px 4px", borderRadius: 2, textAlign: "center" as const, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.05)", color: "#fff", fontSize: 14, fontWeight: 800, boxSizing: "border-box" as const }}
          />
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>min</span>
          {(gauging.cutoff || gauging.minutes != null) && (
            <button onClick={() => onSaveGauging({ cutoff: null, minutes: null })} style={{ fontSize: 12, fontWeight: 700, padding: "6px 10px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "rgba(255,255,255,0.7)", cursor: "pointer" }}>Use default</button>
          )}
        </div>
      </div>

      {error && <div style={{ color: "#f87171", fontSize: 12 }}>{error}</div>}
      {loading && <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 13 }}>Loading…</div>}

      {!loading && racks.length === 0 && (
        <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 13 }}>No racks yet — add the first one below.</div>
      )}

      {racks.map((r) => (
        <div key={r.rack_id} style={{ borderRadius: 2, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)", padding: 12, display: "grid", gap: 8 }}>
          {renamingId === r.rack_id ? (
            <div style={{ display: "flex", gap: 6 }}>
              <input
                autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
                style={{ flex: 1, padding: "6px 10px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", color: "white", fontSize: 13 }}
              />
              <button onClick={() => saveRename(r.rack_id)} style={{ fontSize: 12, fontWeight: 700, padding: "6px 10px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)", color: "#fff", cursor: "pointer" }}>Save</button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{r.rack_name}</span>
              <button
                type="button"
                onClick={() => { setRenamingId(r.rack_id); setRenameValue(r.rack_name); }}
                style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", background: "none", border: "none", cursor: "pointer" }}
              >
                Rename
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => onEditProducts(r.rack_id)}
            style={{ width: "100%", fontSize: 12, fontWeight: 700, padding: "8px 10px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.04)", color: "#fff", cursor: "pointer" }}
          >
            Edit Product List
          </button>

          {confirmDeleteId === r.rack_id ? (
            <div style={{ borderRadius: 2, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)", padding: 10, display: "grid", gap: 8 }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
                Delete <strong>{r.rack_name}</strong>? This removes its lanes, arms, and product list — cannot be undone.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button" onClick={() => { onDeleteRack(r.rack_id); setConfirmDeleteId(null); }}
                  style={{ flex: 1, fontSize: 12, fontWeight: 800, padding: "8px 10px", borderRadius: 2, border: "1px solid rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.18)", color: "#f87171", cursor: "pointer" }}
                >
                  Yes, delete
                </button>
                <button
                  type="button" onClick={() => setConfirmDeleteId(null)}
                  style={{ flex: 1, fontSize: 12, fontWeight: 700, padding: "8px 10px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.04)", color: "#fff", cursor: "pointer" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDeleteId(r.rack_id)}
              style={{ width: "100%", fontSize: 11, fontWeight: 600, padding: "6px 10px", borderRadius: 2, border: "none", background: "none", color: "rgba(239,68,68,0.6)", cursor: "pointer" }}
            >
              Delete Rack
            </button>
          )}
        </div>
      ))}

      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <input
          type="text" value={newRackName} onChange={(e) => setNewRackName(e.target.value)}
          placeholder="New rack name (e.g. North Rack)"
          style={{ flex: 1, padding: "10px 12px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", color: "white", fontSize: 13 }}
        />
        <button
          type="button" onClick={onAddRack} disabled={saving || !newRackName.trim()}
          style={{ fontSize: 13, fontWeight: 700, padding: "10px 14px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)", color: "#fff", cursor: "pointer", opacity: saving || !newRackName.trim() ? 0.5 : 1 }}
        >
          + Add
        </button>
      </div>
    </div>
  );
}
